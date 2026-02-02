import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Listar logs de atividade (apenas admin)
router.get(
  '/',
  requireAuth(['ADMIN']),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('type').optional().isString(),
    query('date').optional().isISO8601(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const pageNumber = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const pageSize = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const skip = (pageNumber - 1) * pageSize;

      const whereClause: any = {};

      if (req.query.type) {
        // Mapear tipos de ação para padrões de busca
        const typePatterns: Record<string, string> = {
          'create': 'criado',
          'update': 'atualizado',
          'delete': 'deletado',
          'approve': 'aprovado',
          'reject': 'rejeitado',
        };
        if (typePatterns[req.query.type as string]) {
          whereClause.action = { contains: typePatterns[req.query.type as string], mode: 'insensitive' };
        }
      }

      if (req.query.date) {
        const date = new Date(req.query.date as string);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        whereClause.createdAt = {
          gte: date,
          lt: nextDay,
        };
      }

      const total = await prisma.auditLog.count({ where: whereClause });

      const logs = await prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      const totalPages = Math.ceil(total / pageSize);

      res.json({
        logs: logs.map((log) => {
          // Formatar detalhes de forma legível
          let details = log.action;
          if (log.payload) {
            const payload = log.payload as any;
            // Para ações de aprovação/rejeição, mostrar informações relevantes
            if (payload.action === 'approved' || payload.action === 'rejected') {
              details = `Caso: ${payload.caseName || 'N/A'}`;
              if (payload.rejectionReason) {
                details += ` | Motivo: ${payload.rejectionReason}`;
              }
            } else {
              // Para outras ações, usar a ação como detalhe
              details = log.action;
            }
          }

          return {
            id: log.id,
            action: log.action,
            user: log.user ? {
              name: log.user.fullName,
              email: log.user.email,
              role: log.user.role,
            } : null,
            timestamp: log.createdAt,
            details: details,
            type: log.action.toLowerCase().includes('criado') ? 'create' :
                  log.action.toLowerCase().includes('atualizado') ? 'update' :
                  log.action.toLowerCase().includes('deletado') ? 'delete' :
                  log.action.toLowerCase().includes('aprovado') ? 'approve' :
                  log.action.toLowerCase().includes('rejeitado') ? 'reject' : 'other',
          };
        }),
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1,
        },
      });
    } catch (error: any) {
      console.error('[LOGS] Erro ao buscar logs:', error);
      res.status(500).json({
        message: 'Erro ao buscar logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

