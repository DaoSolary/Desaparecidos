import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import fs from 'fs';
import path from 'path';

export const router = Router();

// Analisar imagem (detecção de manipulação)
router.post(
  '/analyze/:photoId',
  requireAuth(['MODERADOR', 'ADMIN']),
  [param('photoId').isString(), body('analysisType').optional().isIn(['METADATA', 'MANIPULATION_DETECTION', 'QUALITY_CHECK', 'FULL_ANALYSIS'])],
  auditLog('ANALYZE_IMAGE', 'IMAGE'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { photoId } = req.params;
      const { analysisType = 'FULL_ANALYSIS' } = req.body;

      const photo = await prisma.missingPersonPhoto.findUnique({
        where: { id: photoId },
        include: {
          missingPerson: {
            select: { id: true, fullName: true },
          },
        },
      });

      if (!photo) {
        return res.status(404).json({ message: 'Foto não encontrada' });
      }

      // Análise básica de metadados e detecção de manipulação
      const analysisResult = await analyzeImage(photo.url, analysisType);

      // Criar registro de análise
      const analysis = await prisma.imageAnalysis.create({
        data: {
          photoId,
          analysisType: analysisType as any,
          result: analysisResult,
          confidence: analysisResult.confidence || 0.5,
          isManipulated: analysisResult.isManipulated || false,
          manipulationDetails: analysisResult.manipulationDetails,
          analyzedBy: req.userId,
        },
        include: {
          photo: {
            include: {
              missingPerson: {
                select: { id: true, fullName: true },
              },
            },
          },
        },
      });

      res.json({ analysis });
    } catch (error: any) {
      console.error('[IMAGE_ANALYSIS] Erro ao analisar imagem:', error);
      res.status(500).json({
        message: 'Erro ao analisar imagem',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Listar análises de imagens
router.get(
  '/',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    query('photoId').optional().isString(),
    query('isManipulated').optional().isBoolean(),
    query('analysisType').optional().isIn(['METADATA', 'MANIPULATION_DETECTION', 'QUALITY_CHECK', 'FULL_ANALYSIS']),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { photoId, isManipulated, analysisType } = req.query;

      const analyses = await prisma.imageAnalysis.findMany({
        where: {
          ...(photoId ? { photoId: String(photoId) } : {}),
          ...(isManipulated !== undefined ? { isManipulated: isManipulated === 'true' } : {}),
          ...(analysisType ? { analysisType: analysisType as any } : {}),
        },
        include: {
          photo: {
            include: {
              missingPerson: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
            },
          },
        },
        orderBy: { analyzedAt: 'desc' },
      });

      res.json({ analyses });
    } catch (error: any) {
      console.error('[IMAGE_ANALYSIS] Erro ao listar análises:', error);
      res.status(500).json({
        message: 'Erro ao listar análises',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Analisar todas as imagens de um caso
router.post(
  '/case/:caseId/analyze-all',
  requireAuth(['MODERADOR', 'ADMIN']),
  [param('caseId').isString()],
  auditLog('ANALYZE_CASE_IMAGES', 'CASE'),
  async (req: any, res: any) => {
    try {
      const { caseId } = req.params;

      const missingPerson = await prisma.missingPerson.findUnique({
        where: { id: caseId },
        include: {
          photos: true,
        },
      });

      if (!missingPerson) {
        return res.status(404).json({ message: 'Caso não encontrado' });
      }

      const analyses = [];
      for (const photo of missingPerson.photos) {
        try {
          const analysisResult = await analyzeImage(photo.url, 'FULL_ANALYSIS');

          const analysis = await prisma.imageAnalysis.create({
            data: {
              photoId: photo.id,
              analysisType: 'FULL_ANALYSIS',
              result: analysisResult,
              confidence: analysisResult.confidence || 0.5,
              isManipulated: analysisResult.isManipulated || false,
              manipulationDetails: analysisResult.manipulationDetails,
              analyzedBy: req.userId,
            },
          });

          analyses.push(analysis);
        } catch (error) {
          console.error(`[IMAGE_ANALYSIS] Erro ao analisar foto ${photo.id}:`, error);
        }
      }

      res.json({
        message: `Análise concluída para ${analyses.length} foto(s)`,
        analyses,
      });
    } catch (error: any) {
      console.error('[IMAGE_ANALYSIS] Erro ao analisar imagens do caso:', error);
      res.status(500).json({
        message: 'Erro ao analisar imagens do caso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Função auxiliar para analisar imagem
async function analyzeImage(imageUrl: string, analysisType: string): Promise<any> {
  // Esta é uma implementação básica
  // Em produção, você pode usar bibliotecas como:
  // - sharp para análise de metadados
  // - jimp para processamento de imagem
  // - APIs de ML para detecção de manipulação (Google Cloud Vision, AWS Rekognition, etc.)

  const result: any = {
    analysisType,
    timestamp: new Date().toISOString(),
    metadata: {},
    isManipulated: false,
    confidence: 0.5,
  };

  try {
    // Verificar se o arquivo existe (para imagens locais)
    if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('./uploads/')) {
      const filePath = path.resolve(process.env.FILE_STORAGE_PATH || './uploads', imageUrl.replace('/uploads/', ''));
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        result.metadata = {
          fileSize: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
        };

        // Análise básica: verificar extensão e tamanho
        const ext = path.extname(filePath).toLowerCase();
        result.metadata.extension = ext;
        result.metadata.isValidImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);

        // Detecção básica de manipulação:
        // - Arquivos muito pequenos podem ser suspeitos
        // - Arquivos muito grandes podem indicar compressão excessiva
        if (stats.size < 1000) {
          result.isManipulated = true;
          result.manipulationDetails = 'Arquivo muito pequeno, possivelmente corrompido ou manipulado';
          result.confidence = 0.7;
        } else if (stats.size > 10 * 1024 * 1024) {
          result.manipulationDetails = 'Arquivo muito grande, pode indicar manipulação';
          result.confidence = 0.3;
        }
      }
    }

    // Para URLs externas, você pode fazer requisições HTTP para análise
    // ou usar serviços de terceiros

    return result;
  } catch (error) {
    console.error('[IMAGE_ANALYSIS] Erro na análise:', error);
    return {
      ...result,
      error: 'Erro ao analisar imagem',
      confidence: 0,
    };
  }
}








