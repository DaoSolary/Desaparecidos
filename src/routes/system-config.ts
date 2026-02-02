import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Listar configurações
router.get(
  '/',
  requireAuth(['ADMIN']),
  [query('category').optional().isIn(['GENERAL', 'LIMITES_USO', 'BACKUP', 'SEGURANCA', 'NOTIFICACOES'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { category } = req.query;

      const configs = await prisma.systemConfig.findMany({
        where: category ? { category: category as any } : undefined,
        include: {
          updatedByUser: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { key: 'asc' },
      });

      res.json({ configs });
    } catch (error: any) {
      console.error('[SYSTEM_CONFIG] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar configurações',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Obter configuração específica
router.get(
  '/:key',
  requireAuth(['ADMIN']),
  [param('key').isString()],
  async (req: any, res: any) => {
    try {
      const { key } = req.params;

      const config = await prisma.systemConfig.findUnique({
        where: { key },
      });

      if (!config) {
        return res.status(404).json({ message: 'Configuração não encontrada' });
      }

      res.json({ config });
    } catch (error: any) {
      console.error('[SYSTEM_CONFIG] Erro ao buscar:', error);
      res.status(500).json({
        message: 'Erro ao buscar configuração',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Criar ou atualizar configuração
router.put(
  '/:key',
  requireAuth(['ADMIN']),
  [
    param('key').isString(),
    body('value').notEmpty(),
    body('description').optional().isString(),
    body('category').optional().isIn(['GENERAL', 'LIMITES_USO', 'BACKUP', 'SEGURANCA', 'NOTIFICACOES']),
  ],
  auditLog('UPDATE_SYSTEM_CONFIG', 'CONFIG'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { key } = req.params;
      const { value, description, category } = req.body;

      const config = await prisma.systemConfig.upsert({
        where: { key },
        update: {
          value,
          ...(description !== undefined ? { description } : {}),
          ...(category !== undefined ? { category: category as any } : {}),
          updatedBy: req.userId,
        },
        create: {
          key,
          value,
          description,
          category: category || 'GENERAL',
          updatedBy: req.userId,
        },
        include: {
          updatedByUser: {
            select: { id: true, fullName: true },
          },
        },
      });

      res.json({ config });
    } catch (error: any) {
      console.error('[SYSTEM_CONFIG] Erro ao salvar:', error);
      res.status(500).json({
        message: 'Erro ao salvar configuração',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Obter limites de uso configurados
router.get(
  '/limits/daily',
  requireAuth(['ADMIN']),
  async (req: any, res: any) => {
    try {
      const limits = await prisma.systemConfig.findMany({
        where: { category: 'LIMITES_USO' },
      });

      // Valores padrão
      const defaultLimits = {
        maxCasesPerDay: 10,
        maxReportsPerDay: 5,
        maxSightingsPerDay: 20,
        maxChatMessagesPerDay: 100,
        rateLimitRequests: 1000,
        rateLimitWindow: 3600, // 1 hora em segundos
      };

      const limitsMap: any = { ...defaultLimits };
      limits.forEach((config) => {
        if (config.value && typeof config.value === 'object') {
          Object.assign(limitsMap, config.value);
        }
      });

      res.json({ limits: limitsMap });
    } catch (error: any) {
      console.error('[SYSTEM_CONFIG] Erro ao buscar limites:', error);
      res.status(500).json({
        message: 'Erro ao buscar limites de uso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar limites de uso
router.put(
  '/limits/daily',
  requireAuth(['ADMIN']),
  [
    body('maxCasesPerDay').optional().isInt({ min: 1 }),
    body('maxReportsPerDay').optional().isInt({ min: 1 }),
    body('maxSightingsPerDay').optional().isInt({ min: 1 }),
    body('maxChatMessagesPerDay').optional().isInt({ min: 1 }),
    body('rateLimitRequests').optional().isInt({ min: 1 }),
    body('rateLimitWindow').optional().isInt({ min: 1 }),
  ],
  auditLog('UPDATE_USAGE_LIMITS', 'CONFIG'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const limits = req.body;

      await prisma.systemConfig.upsert({
        where: { key: 'daily_usage_limits' },
        update: {
          value: limits,
          category: 'LIMITES_USO',
          description: 'Limites de uso diário da plataforma',
          updatedBy: req.userId,
        },
        create: {
          key: 'daily_usage_limits',
          value: limits,
          category: 'LIMITES_USO',
          description: 'Limites de uso diário da plataforma',
          updatedBy: req.userId,
        },
      });

      res.json({ message: 'Limites atualizados com sucesso', limits });
    } catch (error: any) {
      console.error('[SYSTEM_CONFIG] Erro ao atualizar limites:', error);
      res.status(500).json({
        message: 'Erro ao atualizar limites de uso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);








