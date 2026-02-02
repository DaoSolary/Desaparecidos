import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

router.get('/summary', async (_req, res) => {
  const [totalCases, activeCases, resolvedCases, byProvince, byGender] = await Promise.all([
    prisma.missingPerson.count(),
    prisma.missingPerson.count({ where: { status: { in: ['ABERTO', 'EM_INVESTIGACAO'] } } }),
    prisma.missingPerson.count({ where: { status: { in: ['ENCONTRADO', 'ENCERRADO'] } } }),
    prisma.missingPerson.groupBy({
      by: ['province'],
      _count: { _all: true },
    }),
    prisma.missingPerson.groupBy({
      by: ['gender'],
      _count: { _all: true },
    }),
  ]);

  res.json({
    totalCases,
    activeCases,
    resolvedCases,
    hotspots: byProvince,
    demographics: byGender,
  });
});

// Estatísticas para autoridades
router.get('/authorities', requireAuth(['AUTORIDADE', 'ADMIN']), async (_req, res) => {
  try {
    const [total, byProvince, byStatus] = await Promise.all([
      prisma.missingPerson.count({ where: { approved: true } }),
      prisma.missingPerson.groupBy({
        by: ['province'],
        where: { approved: true },
        _count: { _all: true },
      }),
      prisma.missingPerson.groupBy({
        by: ['status'],
        where: { approved: true },
        _count: { _all: true },
      }),
    ]);

    const provinceMap: Record<string, number> = {};
    byProvince.forEach((item) => {
      provinceMap[item.province] = item._count._all;
    });

    const statusMap: Record<string, number> = {};
    byStatus.forEach((item) => {
      statusMap[item.status] = item._count._all;
    });

    res.json({
      total,
      porProvincia: provinceMap,
      porStatus: statusMap,
    });
  } catch (error) {
    console.error('[stats:authorities] Erro:', error);
    res.status(500).json({ message: 'Erro ao carregar estatísticas' });
  }
});


