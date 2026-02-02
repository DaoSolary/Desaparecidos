import { Router } from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

export const adminUsersRouter = Router();

// Listar todos os usuários (apenas admin)
adminUsersRouter.get(
  '/',
  requireAuth(['ADMIN']),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('role').optional().isString(),
    query('province').optional().isString(),
    query('search').optional().isString(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const pageNumber = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const pageSize = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const skip = (pageNumber - 1) * pageSize;

      const whereClause: any = {};

      if (req.query.role) {
        whereClause.role = String(req.query.role);
      }

      if (req.query.province) {
        whereClause.province = String(req.query.province);
      }

      if (req.query.search) {
        whereClause.OR = [
          { fullName: { contains: String(req.query.search), mode: 'insensitive' } },
          { email: { contains: String(req.query.search), mode: 'insensitive' } },
        ];
      }

      const total = await prisma.user.count({ where: whereClause });

      const users = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          province: true,
          municipality: true,
          verifiedAt: true,
          isBlocked: true,
          blockedAt: true,
          blockedBy: true,
          blockedReason: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              missingPeople: true,
            },
          },
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
      console.error('[USERS] Erro ao listar usuários:', error);
      res.status(500).json({
        message: 'Erro ao listar usuários',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Obter usuário específico
adminUsersRouter.get(
  '/:id',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          province: true,
          municipality: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
          missingPeople: {
            select: {
              id: true,
              fullName: true,
              status: true,
              approved: true,
              createdAt: true,
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: {
              missingPeople: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      res.json({ user });
    } catch (error: any) {
      console.error('[USERS] Erro ao buscar usuário:', error);
      res.status(500).json({
        message: 'Erro ao buscar usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Criar usuário
adminUsersRouter.post(
  '/',
  requireAuth(['ADMIN']),
  [
    body('fullName').isString().isLength({ min: 3 }),
    body('email').isEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['CIDADAO', 'FAMILIAR', 'VOLUNTARIO', 'MODERADOR', 'AUTORIDADE', 'ADMIN']),
    body('phone').isString(),
    body('province').optional().isString(),
    body('municipality').optional().isString(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { fullName, email, password, role, phone, province, municipality } = req.body;

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return res.status(409).json({ message: 'Email já cadastrado' });
      }

      const hashed = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          fullName,
          email,
          password: hashed,
          role,
          phone,
          province,
          municipality,
          verifiedAt: new Date(),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          phone: true,
          province: true,
          municipality: true,
          verifiedAt: true,
          createdAt: true,
        },
      });

      res.status(201).json({ user });
    } catch (error: any) {
      console.error('[USERS] Erro ao criar usuário:', error);
      res.status(500).json({
        message: 'Erro ao criar usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Atualizar usuário
adminUsersRouter.put(
  '/:id',
  requireAuth(['ADMIN']),
  [
    param('id').isString(),
    body('fullName').optional().isString().isLength({ min: 3 }),
    body('email').optional().isEmail(),
    body('role').optional().isIn(['CIDADAO', 'FAMILIAR', 'VOLUNTARIO', 'MODERADOR', 'AUTORIDADE', 'ADMIN']),
    body('phone').optional().isString(),
    body('province').optional().isString(),
    body('municipality').optional().isString(),
    body('verifiedAt').optional().isISO8601(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { fullName, email, role, phone, province, municipality, verifiedAt } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({ where: { email } });
        if (emailExists) {
          return res.status(409).json({ message: 'Email já está em uso' });
        }
      }

      const updateData: any = {};
      if (fullName) updateData.fullName = fullName;
      if (email) updateData.email = email;
      if (role) updateData.role = role;
      if (phone !== undefined) updateData.phone = phone;
      if (province !== undefined) updateData.province = province;
      if (municipality !== undefined) updateData.municipality = municipality;
      if (verifiedAt !== undefined) {
        updateData.verifiedAt = verifiedAt ? new Date(verifiedAt) : null;
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          phone: true,
          province: true,
          municipality: true,
          verifiedAt: true,
          updatedAt: true,
        },
      });

      res.json({ user });
    } catch (error: any) {
      console.error('[USERS] Erro ao atualizar usuário:', error);
      res.status(500).json({
        message: 'Erro ao atualizar usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Bloquear usuário
adminUsersRouter.patch(
  '/:id/block',
  requireAuth(['ADMIN']),
  [param('id').isString(), body('reason').optional().isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { reason } = req.body;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      // Não permitir bloquear admins
      if (user.role === 'ADMIN') {
        return res.status(403).json({ message: 'Não é possível bloquear um administrador' });
      }

      // Bloquear usuário
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          isBlocked: true,
          blockedAt: new Date(),
          blockedBy: req.userId,
          blockedReason: reason || 'Bloqueado pelo administrador',
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isBlocked: true,
          blockedAt: true,
          blockedReason: true,
        },
      });

      // Criar log de auditoria
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.userId!,
            action: 'BLOCK_USER',
            entityType: 'USER',
            entityId: id,
            details: `Usuário ${user.fullName} bloqueado`,
            metadata: {
              blockedUserId: id,
              reason: reason || 'Bloqueado pelo administrador',
            },
          },
        });
      } catch (error) {
        console.error('Erro ao criar log de auditoria:', error);
      }

      res.json({ user: updatedUser, message: 'Usuário bloqueado com sucesso' });
    } catch (error: any) {
      console.error('[USERS_ADMIN] Erro ao bloquear usuário:', error);
      res.status(500).json({
        message: 'Erro ao bloquear usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Desbloquear usuário
adminUsersRouter.patch(
  '/:id/unblock',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      // Desbloquear usuário
      const updatedUser = await prisma.user.update({
        where: { id },
        data: {
          isBlocked: false,
          blockedAt: null,
          blockedBy: null,
          blockedReason: null,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isBlocked: true,
        },
      });

      // Criar log de auditoria
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.userId!,
            action: 'UNBLOCK_USER',
            entityType: 'USER',
            entityId: id,
            details: `Usuário ${user.fullName} desbloqueado`,
            metadata: {
              unblockedUserId: id,
            },
          },
        });
      } catch (error) {
        console.error('Erro ao criar log de auditoria:', error);
      }

      res.json({ user: updatedUser, message: 'Usuário desbloqueado com sucesso' });
    } catch (error: any) {
      console.error('[USERS_ADMIN] Erro ao desbloquear usuário:', error);
      res.status(500).json({
        message: 'Erro ao desbloquear usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Alterar senha de usuário
adminUsersRouter.patch(
  '/:id/password',
  requireAuth(['ADMIN']),
  [
    param('id').isString(),
    body('password').isLength({ min: 6 }),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { password } = req.body;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      const hashed = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id },
        data: { password: hashed },
      });

      res.json({ message: 'Senha alterada com sucesso' });
    } catch (error: any) {
      console.error('[USERS] Erro ao alterar senha:', error);
      res.status(500).json({
        message: 'Erro ao alterar senha',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Deletar usuário
adminUsersRouter.delete(
  '/:id',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;

      if (id === req.userId) {
        return res.status(400).json({ message: 'Não é possível deletar sua própria conta' });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ message: 'Usuário não encontrado' });
      }

      await prisma.user.update({
        where: { id },
        data: {
          email: `deleted_${Date.now()}_${user.email}`,
          fullName: 'Usuário Deletado',
        },
      });

      res.json({ message: 'Usuário deletado com sucesso' });
    } catch (error: any) {
      console.error('[USERS] Erro ao deletar usuário:', error);
      res.status(500).json({
        message: 'Erro ao deletar usuário',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Estatísticas de usuários
adminUsersRouter.get(
  '/stats/overview',
  requireAuth(['ADMIN']),
  async (req: any, res: any) => {
    try {
      const totalUsers = await prisma.user.count();
      
      const usersByRole = await prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      });

      const byRole: Record<string, number> = {};
      usersByRole.forEach((item) => {
        byRole[item.role] = item._count.role;
      });

      const verifiedUsers = await prisma.user.count({
        where: { verifiedAt: { not: null } },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newUsersToday = await prisma.user.count({
        where: { createdAt: { gte: today } },
      });

      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const newUsersLastWeek = await prisma.user.count({
        where: { createdAt: { gte: lastWeek } },
      });

      const usersWithCases = await prisma.user.count({
        where: {
          missingPeople: {
            some: {},
          },
        },
      });

      res.json({
        totalUsers,
        byRole,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        newUsersToday,
        newUsersLastWeek,
        usersWithCases,
        usersWithoutCases: totalUsers - usersWithCases,
      });
    } catch (error: any) {
      console.error('[USERS] Erro ao buscar estatísticas:', error);
      res.status(500).json({
        message: 'Erro ao buscar estatísticas',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

