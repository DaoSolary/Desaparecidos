import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Criar parceiro externo
router.post(
  '/',
  requireAuth(['ADMIN']),
  [
    body('name').isString().notEmpty(),
    body('type').isIn(['POLICIA', 'PROTECAO_CIVIL', 'ORGAO_PARCEIRO', 'OUTRO']),
    body('contactName').optional().isString(),
    body('email').optional().isEmail(),
    body('phone').optional().isString(),
    body('address').optional().isString(),
  ],
  auditLog('CREATE_PARTNER', 'PARTNER'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, type, contactName, email, phone, address } = req.body;

      const partner = await prisma.externalPartner.create({
        data: {
          name,
          type: type as any,
          contactName,
          email,
          phone,
          address,
        },
      });

      res.status(201).json({ partner });
    } catch (error: any) {
      console.error('[PARTNERS] Erro ao criar parceiro:', error);
      res.status(500).json({
        message: 'Erro ao criar parceiro',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Listar parceiros
router.get(
  '/',
  requireAuth(['MODERADOR', 'ADMIN']),
  [query('type').optional().isIn(['POLICIA', 'PROTECAO_CIVIL', 'ORGAO_PARCEIRO', 'OUTRO'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type } = req.query;

      const partners = await prisma.externalPartner.findMany({
        where: {
          isActive: true,
          ...(type ? { type: type as any } : {}),
        },
        orderBy: { name: 'asc' },
      });

      res.json({ partners });
    } catch (error: any) {
      console.error('[PARTNERS] Erro ao listar parceiros:', error);
      res.status(500).json({
        message: 'Erro ao listar parceiros',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Enviar caso para parceiro
router.post(
  '/forward',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    body('missingPersonId').isString(),
    body('partnerId').isString(),
    body('notes').optional().isString(),
  ],
  auditLog('FORWARD_CASE', 'CASE'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { missingPersonId, partnerId, notes } = req.body;

      // Verificar se o caso existe
      const missingPerson = await prisma.missingPerson.findUnique({
        where: { id: missingPersonId },
        include: {
          reporter: {
            select: { fullName: true, email: true, phone: true },
          },
          photos: true,
        },
      });

      if (!missingPerson) {
        return res.status(404).json({ message: 'Caso não encontrado' });
      }

      // Verificar se o parceiro existe
      const partner = await prisma.externalPartner.findUnique({
        where: { id: partnerId },
      });

      if (!partner || !partner.isActive) {
        return res.status(404).json({ message: 'Parceiro não encontrado ou inativo' });
      }

      // Criar registro de envio
      const forwarding = await prisma.caseForwarding.create({
        data: {
          missingPersonId,
          partnerId,
          forwardedBy: req.userId,
          notes,
        },
        include: {
          partner: true,
          missingPerson: {
            select: {
              id: true,
              fullName: true,
              age: true,
              missingDate: true,
              province: true,
            },
          },
        },
      });

      // TODO: Aqui você pode integrar com API do parceiro ou enviar email
      // Por enquanto, apenas registramos o envio

      res.status(201).json({
        forwarding,
        message: `Caso enviado para ${partner.name} com sucesso`,
      });
    } catch (error: any) {
      console.error('[PARTNERS] Erro ao enviar caso:', error);
      res.status(500).json({
        message: 'Erro ao enviar caso para parceiro',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Listar envios de casos
router.get(
  '/forwardings',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    query('missingPersonId').optional().isString(),
    query('partnerId').optional().isString(),
    query('status').optional().isIn(['ENVIADO', 'RECEBIDO', 'EM_ANALISE', 'ACEITE', 'REJEITADO']),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { missingPersonId, partnerId, status } = req.query;

      const forwardings = await prisma.caseForwarding.findMany({
        where: {
          ...(missingPersonId ? { missingPersonId: String(missingPersonId) } : {}),
          ...(partnerId ? { partnerId: String(partnerId) } : {}),
          ...(status ? { status: status as any } : {}),
        },
        include: {
          partner: true,
          missingPerson: {
            select: {
              id: true,
              fullName: true,
              age: true,
              missingDate: true,
              province: true,
            },
          },
          forwardedByUser: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ forwardings });
    } catch (error: any) {
      console.error('[PARTNERS] Erro ao listar envios:', error);
      res.status(500).json({
        message: 'Erro ao listar envios',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar status do envio
router.patch(
  '/forwardings/:id/status',
  requireAuth(['MODERADOR', 'ADMIN']),
  [
    param('id').isString(),
    body('status').isIn(['ENVIADO', 'RECEBIDO', 'EM_ANALISE', 'ACEITE', 'REJEITADO']),
    body('response').optional().isString(),
  ],
  auditLog('UPDATE_FORWARDING_STATUS', 'CASE'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { status, response } = req.body;

      const forwarding = await prisma.caseForwarding.update({
        where: { id },
        data: {
          status: status as any,
          response,
          respondedAt: status !== 'ENVIADO' ? new Date() : undefined,
        },
        include: {
          partner: true,
          missingPerson: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      res.json({ forwarding });
    } catch (error: any) {
      console.error('[PARTNERS] Erro ao atualizar status:', error);
      res.status(500).json({
        message: 'Erro ao atualizar status do envio',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);


