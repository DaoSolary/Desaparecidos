import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Todas as rotas requerem ADMIN
router.use(requireAuth(['ADMIN']));

// Estatísticas gerais
router.get('/stats', async (_req, res) => {
  try {
    const [totalUsers, totalCases, resolvedCases, casesByProvince, casesByMonth] = await Promise.all([
      prisma.user.count(),
      prisma.missingPerson.count(),
      prisma.missingPerson.count({
        where: { status: { in: ['ENCONTRADO', 'ENCERRADO'] } },
      }),
      prisma.missingPerson.groupBy({
        by: ['province'],
        _count: { _all: true },
      }),
      // Casos por mês (últimos 12 meses)
      prisma.$queryRaw`
        SELECT 
          TO_CHAR("createdAt", 'YYYY-MM') as month,
          COUNT(*)::int as count
        FROM "MissingPerson"
        WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month
      `,
    ]);

    const provinceMap: Record<string, number> = {};
    casesByProvince.forEach((item) => {
      provinceMap[item.province] = item._count._all;
    });

    // Casos pendentes
    const pendingCases = await prisma.missingPerson.count({
      where: { approved: false, rejectionReason: null },
    });

    // Casos rejeitados
    const rejectedCases = await prisma.missingPerson.count({
      where: { rejectionReason: { not: null } },
    });

    // Casos por status
    const casesByStatus = await prisma.missingPerson.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const statusMap: Record<string, number> = {};
    casesByStatus.forEach((item) => {
      statusMap[item.status] = item._count._all;
    });

    res.json({
      totalUsers,
      totalCases,
      resolvedCases,
      pendingCases,
      rejectedCases,
      casesByProvince: provinceMap,
      casesByStatus: statusMap,
      casesByMonth: (casesByMonth as any[]).map((item) => ({
        month: item.month,
        count: Number(item.count),
      })),
    });
  } catch (error) {
    console.error('[admin:stats] Erro:', error);
    res.status(500).json({ message: 'Erro ao carregar estatísticas' });
  }
});

