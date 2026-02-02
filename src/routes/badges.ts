import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Obter badges do usuário
router.get('/', requireAuth(), async (req: any, res: any) => {
  try {
    const userId = req.userId;

    const badges = await prisma.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });

    res.json({ badges });
  } catch (error: any) {
    console.error('[BADGES] Erro ao buscar badges:', error);
    res.status(500).json({
      message: 'Erro ao buscar badges',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Verificar e atribuir badges automaticamente
export async function checkAndAwardBadges(userId: string) {
  try {
    const [casesCount, sightingsCount, favoritesCount] = await Promise.all([
      prisma.missingPerson.count({ where: { reporterId: userId } }),
      prisma.sighting.count({ where: { reporterId: userId } }),
      prisma.favoriteCase.count({ where: { userId } }),
    ]);

    const badgesToAward: string[] = [];

      // FIRST_CASE - Primeiro caso reportado
      if (casesCount >= 1) {
        const hasFirstCase = await prisma.userBadge.findFirst({
          where: { userId, badgeType: 'FIRST_CASE' },
        });
        if (!hasFirstCase) {
          badgesToAward.push('FIRST_CASE');
        }
      }

      // ACTIVE_CONTRIBUTOR - 5 casos ou 10 avistamentos
      if (casesCount >= 5 || sightingsCount >= 10) {
        const hasActive = await prisma.userBadge.findFirst({
          where: { userId, badgeType: 'ACTIVE_CONTRIBUTOR' },
        });
        if (!hasActive) {
          badgesToAward.push('ACTIVE_CONTRIBUTOR');
        }
      }

      // HELPER - 3 avistamentos
      if (sightingsCount >= 3) {
        const hasHelper = await prisma.userBadge.findFirst({
          where: { userId, badgeType: 'HELPER' },
        });
        if (!hasHelper) {
          badgesToAward.push('HELPER');
        }
      }

      // TOP_REPORTER - 10 casos
      if (casesCount >= 10) {
        const hasTopReporter = await prisma.userBadge.findFirst({
          where: { userId, badgeType: 'TOP_REPORTER' },
        });
        if (!hasTopReporter) {
          badgesToAward.push('TOP_REPORTER');
        }
      }

      // COMMUNITY_HERO - 20 casos ou 30 avistamentos
      if (casesCount >= 20 || sightingsCount >= 30) {
        const hasHero = await prisma.userBadge.findFirst({
          where: { userId, badgeType: 'COMMUNITY_HERO' },
        });
        if (!hasHero) {
          badgesToAward.push('COMMUNITY_HERO');
        }
      }

    // Criar badges
    for (const badgeType of badgesToAward) {
      await prisma.userBadge.create({
        data: {
          userId,
          badgeType: badgeType as any,
          description: getBadgeDescription(badgeType),
        },
      });
    }

    return badgesToAward;
  } catch (error) {
    console.error('[BADGES] Erro ao verificar badges:', error);
    return [];
  }
}

function getBadgeDescription(badgeType: string): string {
  const descriptions: Record<string, string> = {
    FIRST_CASE: 'Reportou seu primeiro caso de desaparecimento',
    ACTIVE_CONTRIBUTOR: 'Contribuidor ativo da comunidade',
    HELPER: 'Ajudou com avistamentos',
    VERIFIED: 'Usuário verificado',
    TOP_REPORTER: 'Top reporter de casos',
    COMMUNITY_HERO: 'Herói da comunidade',
  };
  return descriptions[badgeType] || '';
}

// Admin: Listar usuários com estatísticas para outorgar badges
router.get('/admin/users-stats', requireAuth(['ADMIN']), async (req: any, res: any) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          in: ['CIDADAO', 'FAMILIAR', 'VOLUNTARIO'],
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            missingPeople: true,
            sightings: true,
            favorites: true,
            badges: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Adicionar estatísticas detalhadas
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [casesCount, sightingsCount, favoritesCount, badges] = await Promise.all([
          prisma.missingPerson.count({ where: { reporterId: user.id } }),
          prisma.sighting.count({ where: { reporterId: user.id } }),
          prisma.favoriteCase.count({ where: { userId: user.id } }),
          prisma.userBadge.findMany({
            where: { userId: user.id },
            select: { badgeType: true },
          }),
        ]);

        return {
          ...user,
          stats: {
            casesCount,
            sightingsCount,
            favoritesCount,
            badgesCount: badges.length,
            badges: badges.map((b) => b.badgeType),
          },
        };
      })
    );

    res.json({ users: usersWithStats });
  } catch (error: any) {
    console.error('[BADGES] Erro ao buscar usuários:', error);
    res.status(500).json({
      message: 'Erro ao buscar usuários',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Admin: Outorgar badge manualmente
router.post(
  '/admin/award',
  requireAuth(['ADMIN']),
  [body('userId').isString(), body('badgeType').isIn(['FIRST_CASE', 'ACTIVE_CONTRIBUTOR', 'HELPER', 'VERIFIED', 'TOP_REPORTER', 'COMMUNITY_HERO'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, badgeType } = req.body;

      // Verificar se o usuário já possui o badge
      const existingBadge = await prisma.userBadge.findUnique({
        where: {
          userId_badgeType: {
            userId,
            badgeType,
          },
        },
      });

      if (existingBadge) {
        return res.status(400).json({ message: 'Usuário já possui este badge' });
      }

      // Criar badge
      const badge = await prisma.userBadge.create({
        data: {
          userId,
          badgeType,
          description: getBadgeDescription(badgeType),
        },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      });

      res.status(201).json({ badge, message: 'Badge outorgado com sucesso' });
    } catch (error: any) {
      console.error('[BADGES] Erro ao outorgar badge:', error);
      res.status(500).json({
        message: 'Erro ao outorgar badge',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Admin: Verificar e outorgar badges automaticamente para um usuário
router.post(
  '/admin/check-and-award/:userId',
  requireAuth(['ADMIN']),
  [param('userId').isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId } = req.params;
      const awardedBadges = await checkAndAwardBadges(userId);

      res.json({
        message: 'Verificação concluída',
        awardedBadges,
        count: awardedBadges.length,
      });
    } catch (error: any) {
      console.error('[BADGES] Erro ao verificar badges:', error);
      res.status(500).json({
        message: 'Erro ao verificar badges',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Admin: Verificar e outorgar badges para todos os usuários
router.post('/admin/check-all', requireAuth(['ADMIN']), async (req: any, res: any) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          in: ['CIDADAO', 'FAMILIAR', 'VOLUNTARIO'],
        },
      },
      select: {
        id: true,
      },
    });

    const results = await Promise.all(
      users.map(async (user) => {
        const awardedBadges = await checkAndAwardBadges(user.id);
        return {
          userId: user.id,
          awardedBadges,
          count: awardedBadges.length,
        };
      })
    );

    const totalAwarded = results.reduce((sum, r) => sum + r.count, 0);

    res.json({
      message: 'Verificação concluída para todos os usuários',
      totalUsers: users.length,
      totalBadgesAwarded: totalAwarded,
      results,
    });
  } catch (error: any) {
    console.error('[BADGES] Erro ao verificar badges para todos:', error);
    res.status(500).json({
      message: 'Erro ao verificar badges',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Admin: Remover badge de um usuário
router.delete(
  '/admin/remove/:userId/:badgeType',
  requireAuth(['ADMIN']),
  [param('userId').isString(), param('badgeType').isIn(['FIRST_CASE', 'ACTIVE_CONTRIBUTOR', 'HELPER', 'VERIFIED', 'TOP_REPORTER', 'COMMUNITY_HERO'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { userId, badgeType } = req.params;

      await prisma.userBadge.delete({
        where: {
          userId_badgeType: {
            userId,
            badgeType: badgeType as any,
          },
        },
      });

      res.json({ message: 'Badge removido com sucesso' });
    } catch (error: any) {
      console.error('[BADGES] Erro ao remover badge:', error);
      res.status(500).json({
        message: 'Erro ao remover badge',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

