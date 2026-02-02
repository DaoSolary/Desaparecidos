import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Obter histórico completo do usuário
router.get('/', requireAuth(), async (req: any, res: any) => {
  try {
    const userId = req.userId!;

    const [cases, sightings, favorites, reports, badges, chats] = await Promise.all([
      // Casos reportados
      prisma.missingPerson.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          fullName: true,
          status: true,
          approved: true,
          createdAt: true,
          photos: { take: 1, select: { url: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Avistamentos reportados
      prisma.sighting.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          missingPerson: {
            select: {
              id: true,
              fullName: true,
            },
          },
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Casos favoritados
      prisma.favoriteCase.findMany({
        where: { userId },
        include: {
          missingPerson: {
            select: {
              id: true,
              fullName: true,
              status: true,
              photos: { take: 1, select: { url: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Casos denunciados
      prisma.caseReport.findMany({
        where: { reporterId: userId },
        include: {
          missingPerson: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Badges/Conquistas
      prisma.userBadge.findMany({
        where: { userId },
        orderBy: { earnedAt: 'desc' },
      }),
      // Chats com autoridades
      prisma.authorityChat.findMany({
        where: { userId },
        include: {
          authority: {
            select: {
              fullName: true,
              role: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    // Calcular estatísticas
    const stats = {
      totalCases: cases.length,
      approvedCases: cases.filter(c => c.approved).length,
      pendingCases: cases.filter(c => !c.approved).length,
      totalSightings: sightings.length,
      totalFavorites: favorites.length,
      totalReports: reports.length,
      totalBadges: badges.length,
      totalChats: chats.length,
    };

    res.json({
      cases,
      sightings,
      favorites,
      reports,
      badges,
      chats,
      stats,
    });
  } catch (error: any) {
    console.error('[HISTORY] Erro ao buscar histórico:', error);
    res.status(500).json({
      message: 'Erro ao buscar histórico',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

