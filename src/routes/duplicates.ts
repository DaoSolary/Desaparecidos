import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Detectar casos duplicados automaticamente
router.post(
  '/detect',
  requireAuth(['MODERADOR', 'ADMIN']),
  auditLog('DETECT_DUPLICATES', 'CASE'),
  async (req: any, res: any) => {
    try {
      const { threshold = 0.7 } = req.body; // Threshold de similaridade (0-1)

      // Buscar todos os casos aprovados
      const cases = await prisma.missingPerson.findMany({
        where: { approved: true },
        include: {
          photos: true,
          reporter: {
            select: { fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const duplicates: Array<{
        originalCaseId: string;
        duplicateCaseId: string;
        similarityScore: number;
      }> = [];

      // Algoritmo de detecção de duplicados baseado em:
      // 1. Nome similar (Levenshtein distance)
      // 2. Data de desaparecimento próxima
      // 3. Localização similar
      // 4. Idade similar
      for (let i = 0; i < cases.length; i++) {
        for (let j = i + 1; j < cases.length; j++) {
          const case1 = cases[i];
          const case2 = cases[j];

          let score = 0;
          let factors = 0;

          // Comparar nome (peso: 40%)
          if (case1.fullName && case2.fullName) {
            const nameSimilarity = calculateSimilarity(case1.fullName.toLowerCase(), case2.fullName.toLowerCase());
            score += nameSimilarity * 0.4;
            factors += 0.4;
          }

          // Comparar data de desaparecimento (peso: 20%)
          if (case1.missingDate && case2.missingDate) {
            const dateDiff = Math.abs(case1.missingDate.getTime() - case2.missingDate.getTime());
            const daysDiff = dateDiff / (1000 * 60 * 60 * 24);
            const dateSimilarity = daysDiff <= 30 ? 1 - daysDiff / 30 : 0;
            score += dateSimilarity * 0.2;
            factors += 0.2;
          }

          // Comparar localização (peso: 20%)
          if (case1.province && case2.province) {
            const locationSimilarity = case1.province === case2.province ? 1 : 0;
            score += locationSimilarity * 0.2;
            factors += 0.2;
          }

          // Comparar idade (peso: 20%)
          if (case1.age && case2.age) {
            const ageDiff = Math.abs(case1.age - case2.age);
            const ageSimilarity = ageDiff <= 5 ? 1 - ageDiff / 5 : 0;
            score += ageSimilarity * 0.2;
            factors += 0.2;
          }

          const finalScore = factors > 0 ? score / factors : 0;

          if (finalScore >= threshold) {
            duplicates.push({
              originalCaseId: case1.id,
              duplicateCaseId: case2.id,
              similarityScore: finalScore,
            });
          }
        }
      }

      // Criar registros de duplicados
      const createdDuplicates = [];
      for (const dup of duplicates) {
        // Verificar se já existe
        const existing = await prisma.duplicateCase.findUnique({
          where: {
            originalCaseId_duplicateCaseId: {
              originalCaseId: dup.originalCaseId,
              duplicateCaseId: dup.duplicateCaseId,
            },
          },
        });

        if (!existing) {
          const duplicate = await prisma.duplicateCase.create({
            data: {
              originalCaseId: dup.originalCaseId,
              duplicateCaseId: dup.duplicateCaseId,
              similarityScore: dup.similarityScore,
              detectedBy: req.userId,
            },
            include: {
              originalCase: {
                select: { id: true, fullName: true, missingDate: true, province: true },
              },
              duplicateCase: {
                select: { id: true, fullName: true, missingDate: true, province: true },
              },
            },
          });
          createdDuplicates.push(duplicate);
        }
      }

      res.json({
        message: `Detectados ${createdDuplicates.length} casos duplicados`,
        duplicates: createdDuplicates,
        total: createdDuplicates.length,
      });
    } catch (error: any) {
      console.error('[DUPLICATES] Erro ao detectar duplicados:', error);
      res.status(500).json({
        message: 'Erro ao detectar casos duplicados',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Listar casos duplicados
router.get(
  '/',
  requireAuth(['MODERADOR', 'ADMIN']),
  [query('status').optional().isIn(['PENDENTE', 'CONFIRMADO', 'REJEITADO', 'RESOLVIDO'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { status } = req.query;

      const duplicates = await prisma.duplicateCase.findMany({
        where: status ? { status: status as any } : undefined,
        include: {
          originalCase: {
            select: {
              id: true,
              fullName: true,
              age: true,
              missingDate: true,
              province: true,
              municipality: true,
              photos: { take: 1 },
              reporter: {
                select: { fullName: true, email: true },
              },
            },
          },
          duplicateCase: {
            select: {
              id: true,
              fullName: true,
              age: true,
              missingDate: true,
              province: true,
              municipality: true,
              photos: { take: 1 },
              reporter: {
                select: { fullName: true, email: true },
              },
            },
          },
        },
        orderBy: { similarityScore: 'desc' },
      });

      res.json({ duplicates });
    } catch (error: any) {
      console.error('[DUPLICATES] Erro ao listar duplicados:', error);
      res.status(500).json({
        message: 'Erro ao listar casos duplicados',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Resolver caso duplicado (confirmar, rejeitar ou marcar como resolvido)
router.patch(
  '/:id/resolve',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    param('id').isString(),
    body('status').isIn(['CONFIRMADO', 'REJEITADO', 'RESOLVIDO']),
    body('resolutionNotes').optional().isString(),
    body('deleteDuplicate').optional().isBoolean(),
  ],
  auditLog('RESOLVE_DUPLICATE', 'CASE'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { status, resolutionNotes, deleteDuplicate } = req.body;

      const duplicate = await prisma.duplicateCase.findUnique({
        where: { id },
        include: {
          duplicateCase: true,
        },
      });

      if (!duplicate) {
        return res.status(404).json({ message: 'Caso duplicado não encontrado' });
      }

      // Atualizar status
      const updated = await prisma.duplicateCase.update({
        where: { id },
        data: {
          status: status as any,
          resolvedBy: req.userId,
          resolvedAt: new Date(),
          resolutionNotes,
        },
      });

      // Se confirmado como duplicado e deleteDuplicate for true, deletar o caso duplicado
      if (status === 'CONFIRMADO' && deleteDuplicate) {
        await prisma.missingPerson.delete({
          where: { id: duplicate.duplicateCaseId },
        });

        // Criar log de auditoria
        await prisma.auditLog.create({
          data: {
            userId: req.userId,
            action: 'DELETE_DUPLICATE_CASE',
            entityType: 'CASE',
            entityId: duplicate.duplicateCaseId,
            details: `Caso duplicado deletado: ${duplicate.duplicateCase.fullName}`,
            metadata: {
              originalCaseId: duplicate.originalCaseId,
              duplicateCaseId: duplicate.duplicateCaseId,
              similarityScore: duplicate.similarityScore,
            },
          },
        });
      }

      res.json({
        duplicate: updated,
        message: status === 'CONFIRMADO' && deleteDuplicate ? 'Caso duplicado confirmado e removido' : 'Status atualizado',
      });
    } catch (error: any) {
      console.error('[DUPLICATES] Erro ao resolver duplicado:', error);
      res.status(500).json({
        message: 'Erro ao resolver caso duplicado',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Função auxiliar para calcular similaridade entre strings (Levenshtein)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}


