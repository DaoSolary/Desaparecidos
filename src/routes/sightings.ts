import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router({ mergeParams: true });

router.post(
  '/:missingPersonId',
  requireAuth(),
  [
    param('missingPersonId').isString(),
    body('reporterName').optional().isString(),
    body('reporterContact').optional().isString(),
    body('description').isString().notEmpty().withMessage('Descrição é obrigatória'),
    body('province').isString().notEmpty().withMessage('Província é obrigatória'),
    body('municipality').isString().notEmpty().withMessage('Município é obrigatório'),
    body('location').isString().notEmpty().withMessage('Localização é obrigatória'),
    body('latitude').isFloat().withMessage('Latitude é obrigatória'),
    body('longitude').isFloat().withMessage('Longitude é obrigatória'),
    body('evidenceUrl').isString().notEmpty().withMessage('Foto de evidência é obrigatória'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Buscar informações do usuário logado
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { fullName: true, phone: true },
    });

    const { missingPersonId } = req.params;
    const sighting = await prisma.sighting.create({
      data: {
        missingPersonId,
        reporterId: req.userId!,
        reporterName: req.body.reporterName || user?.fullName || 'Anônimo',
        reporterContact: req.body.reporterContact || user?.phone || '',
        description: req.body.description,
        province: req.body.province,
        municipality: req.body.municipality,
        location: req.body.location,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        evidenceUrl: req.body.evidenceUrl,
      },
      include: {
        missingPerson: {
          select: {
            id: true,
            reporterId: true,
            fullName: true,
          },
        },
      },
    });

    // Notificar o reporter do caso sobre novo avistamento
    try {
      const { emitNotification } = await import('../lib/socket.js');
      if (sighting.missingPerson.reporterId) {
        emitNotification(sighting.missingPerson.reporterId, {
          type: 'new_sighting',
          title: 'Novo avistamento reportado',
          message: `Alguém reportou um avistamento sobre o caso "${sighting.missingPerson.fullName || 'que você publicou'}" com foto de evidência.`,
          caseId: missingPersonId,
        });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }

    // Verificar e atribuir badges
    try {
      const { checkAndAwardBadges } = await import('./badges.js');
      await checkAndAwardBadges(req.userId!);
    } catch (error) {
      console.error('[SIGHTINGS] Erro ao verificar badges:', error);
    }

    res.status(201).json({ sighting });
  },
);

router.patch(
  '/:sightingId/status',
  requireAuth(['MODERADOR', 'ADMIN']),
  [param('sightingId').isString(), body('status').isIn(['PENDENTE', 'VALIDADO', 'DESCARTADO'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sighting = await prisma.sighting.update({
      where: { id: req.params.sightingId },
      data: { status: req.body.status },
    });

    res.json({ sighting });
  },
);

// Remover/deletar sighting (comentário) - Admin e Moderador
router.delete(
  '/:sightingId',
  requireAuth(['MODERADOR', 'ADMIN']),
  [param('sightingId').isString()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { sightingId } = req.params;

      // Verificar se o sighting existe
      const sighting = await prisma.sighting.findUnique({
        where: { id: sightingId },
        include: {
          missingPerson: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      if (!sighting) {
        return res.status(404).json({ message: 'Avistamento não encontrado' });
      }

      // Deletar o sighting
      await prisma.sighting.delete({
        where: { id: sightingId },
      });

      // Criar log de auditoria
      try {
        await prisma.auditLog.create({
          data: {
            userId: req.userId!,
            action: 'DELETE_SIGHTING',
            entityType: 'SIGHTING',
            entityId: sightingId,
            details: `Avistamento removido do caso "${sighting.missingPerson.fullName}"`,
            metadata: {
              caseId: sighting.missingPersonId,
              reporterName: sighting.reporterName,
            },
          },
        });
      } catch (error) {
        console.error('Erro ao criar log de auditoria:', error);
      }

      res.json({ message: 'Avistamento removido com sucesso' });
    } catch (error: any) {
      console.error('[SIGHTINGS] Erro ao remover avistamento:', error);
      res.status(500).json({
        message: 'Erro ao remover avistamento',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);


