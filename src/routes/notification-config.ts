import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Listar configurações de notificações
router.get(
  '/',
  requireAuth(['ADMIN']),
  async (req: any, res: any) => {
    try {
      const configs = await prisma.notificationConfig.findMany({
        orderBy: { eventType: 'asc' },
      });

      // Se não houver configurações, criar padrões
      if (configs.length === 0) {
        const defaultConfigs = [
          { eventType: 'new_case', enabled: true, template: 'Novo caso reportado: {caseName}', targetRoles: ['MODERADOR', 'ADMIN'] },
          { eventType: 'case_approved', enabled: true, template: 'Seu caso "{caseName}" foi aprovado', targetRoles: null },
          { eventType: 'case_rejected', enabled: true, template: 'Seu caso "{caseName}" foi rejeitado. Motivo: {reason}', targetRoles: null },
          { eventType: 'new_sighting', enabled: true, template: 'Novo avistamento reportado para o caso "{caseName}"', targetRoles: null },
          { eventType: 'case_status_changed', enabled: true, template: 'Status do caso "{caseName}" alterado para: {status}', targetRoles: null },
          { eventType: 'new_chat_message', enabled: true, template: 'Nova mensagem no chat do caso "{caseName}"', targetRoles: null },
          { eventType: 'new_authority_chat', enabled: true, template: 'Nova conversa iniciada com autoridade', targetRoles: ['ADMIN', 'AUTORIDADE'] },
          { eventType: 'global_announcement', enabled: true, template: null, targetRoles: null },
        ];

        for (const config of defaultConfigs) {
          await prisma.notificationConfig.create({
            data: {
              eventType: config.eventType,
              enabled: config.enabled,
              template: config.template,
              targetRoles: config.targetRoles,
            },
          });
        }

        const refreshed = await prisma.notificationConfig.findMany({
          orderBy: { eventType: 'asc' },
        });
        return res.json({ configs: refreshed });
      }

      res.json({ configs });
    } catch (error: any) {
      console.error('[NOTIFICATION_CONFIG] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar configurações de notificações',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar configuração de notificação
router.put(
  '/:eventType',
  requireAuth(['ADMIN']),
  [
    param('eventType').isString(),
    body('enabled').optional().isBoolean(),
    body('template').optional().isString(),
    body('targetRoles').optional().isArray(),
  ],
  auditLog('UPDATE_NOTIFICATION_CONFIG', 'CONFIG'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { eventType } = req.params;
      const { enabled, template, targetRoles } = req.body;

      const config = await prisma.notificationConfig.upsert({
        where: { eventType },
        update: {
          ...(enabled !== undefined ? { enabled } : {}),
          ...(template !== undefined ? { template } : {}),
          ...(targetRoles !== undefined ? { targetRoles } : {}),
          updatedBy: req.userId,
        },
        create: {
          eventType,
          enabled: enabled !== undefined ? enabled : true,
          template: template || null,
          targetRoles: targetRoles || null,
          updatedBy: req.userId,
        },
      });

      res.json({ config });
    } catch (error: any) {
      console.error('[NOTIFICATION_CONFIG] Erro ao atualizar:', error);
      res.status(500).json({
        message: 'Erro ao atualizar configuração de notificação',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Obter configuração específica
router.get(
  '/:eventType',
  requireAuth(['ADMIN']),
  [param('eventType').isString()],
  async (req: any, res: any) => {
    try {
      const { eventType } = req.params;

      const config = await prisma.notificationConfig.findUnique({
        where: { eventType },
      });

      if (!config) {
        return res.status(404).json({ message: 'Configuração não encontrada' });
      }

      res.json({ config });
    } catch (error: any) {
      console.error('[NOTIFICATION_CONFIG] Erro ao buscar:', error);
      res.status(500).json({
        message: 'Erro ao buscar configuração',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);








