import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

router.get('/missions', requireAuth(), async (_req, res) => {
  const missions = await prisma.volunteerMission.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: missions });
});

router.post(
  '/missions',
  requireAuth(['VOLUNTARIO', 'MODERADOR', 'ADMIN']),
  [
    body('title').isString(),
    body('province').isString(),
    body('description').optional().isString(),
    body('municipality').optional().isString(),
    body('startsAt').optional().isISO8601(),
    body('endsAt').optional().isISO8601(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const mission = await prisma.volunteerMission.create({
      data: {
        title: req.body.title,
        description: req.body.description,
        province: req.body.province,
        municipality: req.body.municipality,
        startsAt: req.body.startsAt ? new Date(req.body.startsAt) : undefined,
        endsAt: req.body.endsAt ? new Date(req.body.endsAt) : undefined,
        ownerId: req.userId!,
      },
    });

    res.status(201).json({ mission });
  },
);

router.post(
  '/missions/:missionId/check-in',
  requireAuth(['VOLUNTARIO', 'MODERADOR', 'ADMIN']),
  [param('missionId').isString(), body('latitude').isFloat(), body('longitude').isFloat(), body('notes').optional().isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const checkIn = await prisma.missionCheckIn.create({
      data: {
        missionId: req.params.missionId,
        volunteerId: req.userId!,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        notes: req.body.notes,
      },
    });

    res.status(201).json({ checkIn });
  },
);

