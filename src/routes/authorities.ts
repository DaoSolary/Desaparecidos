import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Listar autoridades disponíveis para chat
router.get('/', requireAuth(), async (req: any, res: any) => {
  try {
    const authorities = await prisma.user.findMany({
      where: {
        role: { in: ['AUTORIDADE', 'ADMIN', 'MODERADOR'] },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        province: true,
        verifiedAt: true,
      },
      orderBy: { fullName: 'asc' },
    });

    res.json({ authorities });
  } catch (error: any) {
    console.error('[AUTHORITIES] Erro ao buscar autoridades:', error);
    res.status(500).json({
      message: 'Erro ao buscar autoridades',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});


