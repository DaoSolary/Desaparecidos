import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { pushAlert } from '../services/notification-service.js';

export const router = Router();

router.post(
  '/subscribe',
  requireAuth(),
  [
    body('province').optional().isString(),
    body('municipality').optional().isString(),
    body('radiusKm').optional().isInt({ min: 5, max: 500 }),
    body('deviceToken').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const subscription = await prisma.alertSubscription.upsert({
      where: { userId: req.userId! },
      update: { ...req.body },
      create: {
        userId: req.userId!,
        province: req.body.province,
        municipality: req.body.municipality,
        radiusKm: req.body.radiusKm,
        deviceToken: req.body.deviceToken,
      },
    });

    res.json({ subscription });
  },
);

router.get('/history', requireAuth(), async (_req, res) => {
  const items = await prisma.alertLog.findMany({
    include: {
      missingPerson: {
        select: {
          id: true,
          fullName: true,
          province: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  res.json({ items });
});

router.post(
  '/broadcast',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    body('missingPersonId').isString(),
    body('channels').isArray({ min: 1 }),
    body('message').isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { missingPersonId, channels, message } = req.body;

    const missingPerson = await prisma.missingPerson.findUnique({ where: { id: missingPersonId } });
    if (!missingPerson) {
      return res.status(404).json({ message: 'Caso não encontrado' });
    }

    const subs = await prisma.alertSubscription.findMany({
      where: {
        province: missingPerson.province,
      },
    });

    await Promise.all(
      subs.map((sub) =>
        pushAlert({
          type: 'PUSH',
          deviceToken: sub.deviceToken,
          title: 'Alerta de desaparecimento',
          message,
          data: { missingPersonId },
        }),
      ),
    );

    await prisma.alertLog.create({
      data: {
        missingPersonId,
        type: 'PUSH',
        payload: { message, channels },
      },
    });

    res.json({ delivered: subs.length });
  },
);

