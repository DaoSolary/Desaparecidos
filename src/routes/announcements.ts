import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { emitNotification } from '../lib/socket.js';

export const router = Router();

// Listar comunicados (público, mas filtrado por ativos)
router.get(
  '/',
  [
    query('type').optional().isIn(['NOTICIA', 'ALERTA_URGENTE', 'INSTRUCAO', 'MANUTENCAO', 'OUTRO']),
    query('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    query('activeOnly').optional().isBoolean(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, priority, activeOnly = true } = req.query;
      const userRole = req.userRole;

      const whereClause: any = {
        ...(activeOnly === 'true' || activeOnly === true ? { isActive: true } : {}),
        ...(type ? { type: type as any } : {}),
        ...(priority ? { priority: priority as any } : {}),
      };

      // Filtrar por expiração
      whereClause.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];

      const announcements = await prisma.globalAnnouncement.findMany({
        where: whereClause,
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 50,
      });

      // Filtrar por roles se necessário (apenas para usuários autenticados)
      let filteredAnnouncements = announcements;
      if (userRole) {
        filteredAnnouncements = announcements.filter((announcement) => {
          if (!announcement.targetRoles) return true; // Se não tem targetRoles, é para todos
          const targetRoles = announcement.targetRoles as string[];
          return targetRoles.includes(userRole);
        });
      }

      res.json({ announcements: filteredAnnouncements });
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar comunicados',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Criar comunicado (apenas ADMIN)
router.post(
  '/',
  requireAuth(['ADMIN']),
  [
    body('type').isIn(['NOTICIA', 'ALERTA_URGENTE', 'INSTRUCAO', 'MANUTENCAO', 'OUTRO']),
    body('title').isString().notEmpty(),
    body('content').isString().notEmpty(),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    body('targetRoles').optional().isArray(),
    body('expiresAt').optional().isISO8601(),
  ],
  auditLog('CREATE_ANNOUNCEMENT', 'ANNOUNCEMENT'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, title, content, priority = 'NORMAL', targetRoles, expiresAt } = req.body;

      const announcement = await prisma.globalAnnouncement.create({
        data: {
          type: type as any,
          title,
          content,
          priority: priority as any,
          targetRoles: targetRoles || null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          createdBy: req.userId,
        },
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
        },
      });

      // Enviar notificação em tempo real para todos os usuários (ou roles específicos)
      const notificationTargets = targetRoles || ['CIDADAO', 'FAMILIAR', 'VOLUNTARIO', 'MODERADOR', 'ADMIN', 'AUTORIDADE'];
      
      for (const role of notificationTargets) {
        emitNotification({
          userId: null,
          userRole: role,
          type: 'global_announcement',
          title: title,
          message: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          metadata: {
            announcementId: announcement.id,
            type: type,
            priority: priority,
          },
        });
      }

      res.status(201).json({ announcement });
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS] Erro ao criar:', error);
      res.status(500).json({
        message: 'Erro ao criar comunicado',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar comunicado (apenas ADMIN)
router.put(
  '/:id',
  requireAuth(['ADMIN']),
  [
    param('id').isString(),
    body('title').optional().isString().notEmpty(),
    body('content').optional().isString().notEmpty(),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
    body('isActive').optional().isBoolean(),
    body('expiresAt').optional().isISO8601(),
  ],
  auditLog('UPDATE_ANNOUNCEMENT', 'ANNOUNCEMENT'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { title, content, priority, isActive, expiresAt } = req.body;

      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (priority !== undefined) updateData.priority = priority;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

      const updated = await prisma.globalAnnouncement.update({
        where: { id },
        data: updateData,
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
        },
      });

      res.json({ announcement: updated });
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS] Erro ao atualizar:', error);
      res.status(500).json({
        message: 'Erro ao atualizar comunicado',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Deletar comunicado (apenas ADMIN)
router.delete(
  '/:id',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  auditLog('DELETE_ANNOUNCEMENT', 'ANNOUNCEMENT'),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      await prisma.globalAnnouncement.delete({
        where: { id },
      });

      res.json({ message: 'Comunicado deletado com sucesso' });
    } catch (error: any) {
      console.error('[ANNOUNCEMENTS] Erro ao deletar:', error);
      res.status(500).json({
        message: 'Erro ao deletar comunicado',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

