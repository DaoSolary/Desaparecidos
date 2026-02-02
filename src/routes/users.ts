import { Router } from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

export const router = Router();

// Estatísticas da rede colaborativa
router.get(
  '/network/stats',
  optionalAuth(),
  async (req: any, res: any) => {
    try {
      // Total de usuários
      const totalUsers = await prisma.user.count();

      // Usuários verificados
      const verifiedUsers = await prisma.user.count({
        where: { verifiedAt: { not: null } },
      });

      // Usuários ativos hoje (criaram conta hoje ou atualizaram perfil hoje)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const activeToday = await prisma.user.count({
        where: {
          OR: [
            { createdAt: { gte: today } },
            { updatedAt: { gte: today } },
          ],
        },
      });

      // Usuários por role
      const usersByRole = await prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      });

      const byRole: Record<string, number> = {};
      usersByRole.forEach((item) => {
        byRole[item.role] = item._count.role;
      });

      // Total de autoridades (AUTORIDADE + ADMIN)
      const authorities = (byRole.AUTORIDADE || 0) + (byRole.ADMIN || 0);

      res.json({
        totalUsers,
        verifiedUsers,
        activeToday,
        authorities,
        byRole,
      });
    } catch (error: any) {
      console.error('[USERS] Erro ao buscar estatísticas da rede:', error);
      res.status(500).json({
        message: 'Erro ao buscar estatísticas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Listar usuários da rede (com paginação)
router.get(
  '/network',
  optionalAuth(),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isString(),
    query('province').optional().isString(),
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

      if (req.query.role) {
        whereClause.role = String(req.query.role);
      }

      if (req.query.province) {
        whereClause.province = String(req.query.province);
      }

      // Contar total
      const total = await prisma.user.count({ where: whereClause });

      // Buscar usuários
      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          fullName: true,
          role: true,
          province: true,
          municipality: true,
          verifiedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      const totalPages = Math.ceil(total / pageSize);

      res.json({
        users,
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
      console.error('[USERS] Erro ao buscar usuários da rede:', error);
      res.status(500).json({
        message: 'Erro ao buscar usuários',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Buscar casos de um usuário específico
router.get(
  '/:userId/cases',
  optionalAuth(),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId } = req.params;
      const pageNumber = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const pageSize = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
      const skip = (pageNumber - 1) * pageSize;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      // Contar casos do usuário
      const total = await prisma.missingPerson.count({
        where: { reporterId: userId },
      });

      // Buscar casos do usuário
      const cases = await prisma.missingPerson.findMany({
        where: { reporterId: userId },
        include: {
          photos: true,
          reporter: {
            select: { fullName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      const totalPages = Math.ceil(total / pageSize);

      res.json({
        user: {
          id: user.id,
          fullName: user.fullName,
        },
        cases,
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
      console.error('[USERS] Erro ao buscar casos do usuário:', error);
      res.status(500).json({
        message: 'Erro ao buscar casos',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

