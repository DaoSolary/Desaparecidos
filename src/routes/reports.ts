import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Criar denúncia
router.post(
  '/',
  requireAuth(),
  [
    body('missingPersonId').isString().notEmpty(),
    body('reason').isString().isLength({ min: 10 }),
    body('description').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { missingPersonId, reason, description } = req.body;

      // Verificar se o caso existe
      const missingPerson = await prisma.missingPerson.findUnique({
        where: { id: missingPersonId },
      });

      if (!missingPerson) {
        return res.status(404).json({ message: 'Caso não encontrado' });
      }

      // Verificar se já denunciou
      const existingReport = await prisma.caseReport.findFirst({
        where: {
          missingPersonId,
          reporterId: req.userId!,
          status: 'PENDENTE',
        },
      });

      if (existingReport) {
        return res.status(400).json({ message: 'Você já denunciou este caso' });
      }

      const report = await prisma.caseReport.create({
        data: {
          missingPersonId,
          reporterId: req.userId!,
          reason,
          description,
        },
      });

      res.status(201).json({ report });
    } catch (error) {
      console.error('[reports:create] Erro:', error);
      res.status(500).json({ message: 'Erro ao criar denúncia' });
    }
  }
);

// Listar denúncias (apenas moderadores/admin)
router.get('/', requireAuth(['MODERADOR', 'ADMIN']), async (req, res) => {
  try {
    const { status } = req.query;

    const reports = await prisma.caseReport.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        missingPerson: {
          include: {
            photos: true,
            reporter: {
              select: { fullName: true, email: true },
            },
          },
        },
        reporter: {
          select: { fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ reports });
  } catch (error) {
    console.error('[reports:list] Erro:', error);
    res.status(500).json({ message: 'Erro ao listar denúncias' });
  }
});

// Atualizar status da denúncia
router.patch(
  '/:id/status',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    param('id').isString(),
    body('status').isIn(['PENDENTE', 'EM_ANALISE', 'ACEITE', 'REJEITADO']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { status } = req.body;

      const report = await prisma.caseReport.update({
        where: { id },
        data: {
          status,
          reviewedById: req.userId,
          reviewedAt: new Date(),
        },
      });

      res.json({ report });
    } catch (error) {
      console.error('[reports:update] Erro:', error);
      res.status(500).json({ message: 'Erro ao atualizar denúncia' });
    }
  }
);

// Fluxo de denúncias por dia (estatísticas)
router.get(
  '/daily-flow',
  requireAuth(['MODERADOR', 'ADMIN']),
  [query('days').optional().isInt({ min: 1, max: 365 })],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const days = req.query.days ? parseInt(String(req.query.days), 10) : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Denúncias por dia
      const dailyReports = await prisma.$queryRaw`
        SELECT 
          DATE("createdAt") as date,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'PENDENTE')::int as pending,
          COUNT(*) FILTER (WHERE status = 'EM_ANALISE')::int as in_analysis,
          COUNT(*) FILTER (WHERE status = 'ACEITE')::int as accepted,
          COUNT(*) FILTER (WHERE status = 'REJEITADO')::int as rejected
        FROM "CaseReport"
        WHERE "createdAt" >= ${startDate}
        GROUP BY DATE("createdAt")
        ORDER BY date DESC
      `;

      // Estatísticas gerais
      const totalReports = await prisma.caseReport.count({
        where: {
          createdAt: { gte: startDate },
        },
      });

      const byStatus = await prisma.caseReport.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: startDate },
        },
        _count: { _all: true },
      });

      const statusMap: Record<string, number> = {};
      byStatus.forEach((item) => {
        statusMap[item.status] = item._count._all;
      });

      // Top casos mais denunciados
      const topReported = await prisma.caseReport.groupBy({
        by: ['missingPersonId'],
        where: {
          createdAt: { gte: startDate },
        },
        _count: { _all: true },
        orderBy: {
          _count: {
            missingPersonId: 'desc',
          },
        },
        take: 10,
      });

      const topReportedWithDetails = await Promise.all(
        topReported.map(async (item) => {
          const case_ = await prisma.missingPerson.findUnique({
            where: { id: item.missingPersonId },
            select: {
              id: true,
              fullName: true,
              province: true,
            },
          });
          return {
            caseId: item.missingPersonId,
            case: case_,
            reportCount: item._count._all,
          };
        })
      );

      res.json({
        period: {
          startDate,
          endDate: new Date(),
          days,
        },
        totalReports,
        byStatus: statusMap,
        dailyFlow: dailyReports,
        topReported: topReportedWithDetails,
      });
    } catch (error: any) {
      console.error('[REPORTS] Erro ao buscar fluxo de denúncias:', error);
      res.status(500).json({
        message: 'Erro ao buscar fluxo de denúncias',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

