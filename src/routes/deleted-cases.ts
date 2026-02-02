import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Listar casos deletados
router.get(
  '/',
  requireAuth(['ADMIN']),
  [query('restored').optional().isBoolean()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { restored } = req.query;

      const deletedCases = await prisma.deletedCase.findMany({
        where: restored !== undefined ? { restoredAt: restored === 'true' ? { not: null } : null } : undefined,
        include: {
          deletedByUser: {
            select: { id: true, fullName: true, role: true },
          },
          restoredByUser: {
            select: { id: true, fullName: true, role: true },
          },
        },
        orderBy: { deletedAt: 'desc' },
      });

      res.json({ deletedCases });
    } catch (error: any) {
      console.error('[DELETED_CASES] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar casos deletados',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Restaurar caso deletado
router.post(
  '/:id/restore',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  auditLog('RESTORE_DELETED_CASE', 'CASE'),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      const deletedCase = await prisma.deletedCase.findUnique({
        where: { id },
      });

      if (!deletedCase) {
        return res.status(404).json({ message: 'Registro de caso deletado não encontrado' });
      }

      if (deletedCase.restoredAt) {
        return res.status(400).json({ message: 'Este caso já foi restaurado' });
      }

      // Verificar se o caso ainda existe (não deveria, mas vamos verificar)
      const existingCase = await prisma.missingPerson.findUnique({
        where: { id: deletedCase.caseId },
      });

      if (existingCase) {
        return res.status(400).json({ message: 'O caso já existe no sistema' });
      }

      // Restaurar o caso a partir dos dados salvos
      const caseData = deletedCase.caseData as any;
      
      const restoredCase = await prisma.missingPerson.create({
        data: {
          id: deletedCase.caseId, // Manter o ID original
          fullName: caseData.fullName,
          age: caseData.age,
          gender: caseData.gender,
          missingDate: new Date(caseData.missingDate),
          lastSeenLocation: caseData.lastSeenLocation,
          province: caseData.province,
          municipality: caseData.municipality,
          description: caseData.description,
          circumstances: caseData.circumstances,
          healthConditions: caseData.healthConditions,
          priority: caseData.priority,
          status: caseData.status,
          approved: caseData.approved,
          reporterId: caseData.reporterId,
          // Não restaurar deletedAt e isDeleted
        },
      });

      // Marcar como restaurado
      await prisma.deletedCase.update({
        where: { id },
        data: {
          restoredAt: new Date(),
          restoredBy: req.userId,
        },
      });

      // Restaurar fotos se houver
      if (caseData.photos && Array.isArray(caseData.photos)) {
        for (const photo of caseData.photos) {
          try {
            await prisma.missingPersonPhoto.create({
              data: {
                url: photo.url,
                storageProvider: photo.storageProvider || 'local',
                missingPersonId: restoredCase.id,
              },
            });
          } catch (error) {
            console.warn('[DELETED_CASES] Erro ao restaurar foto:', error);
          }
        }
      }

      res.json({
        message: 'Caso restaurado com sucesso',
        case: restoredCase,
      });
    } catch (error: any) {
      console.error('[DELETED_CASES] Erro ao restaurar:', error);
      res.status(500).json({
        message: 'Erro ao restaurar caso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);








