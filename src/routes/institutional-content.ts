import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

export const router = Router();

// Listar conteúdo institucional
router.get(
  '/',
  [
    query('type').optional().isIn(['FAQ', 'INSTRUCOES', 'CONTACTO_EMERGENCIA', 'SOBRE_NOS', 'TERMOS_USO', 'POLITICA_PRIVACIDADE', 'OUTRO']),
    query('isActive').optional().isBoolean(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, isActive } = req.query;

      const content = await prisma.institutionalContent.findMany({
        where: {
          ...(type ? { type: type as any } : {}),
          ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
        },
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
          updatedByUser: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: [{ type: 'asc' }, { order: 'asc' }],
      });

      res.json({ content });
    } catch (error: any) {
      console.error('[INSTITUTIONAL_CONTENT] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar conteúdo institucional',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Criar conteúdo institucional
router.post(
  '/',
  requireAuth(['ADMIN']),
  [
    body('type').isIn(['FAQ', 'INSTRUCOES', 'CONTACTO_EMERGENCIA', 'SOBRE_NOS', 'TERMOS_USO', 'POLITICA_PRIVACIDADE', 'OUTRO']),
    body('title').isString().notEmpty(),
    body('content').isString().notEmpty(),
    body('order').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  auditLog('CREATE_INSTITUTIONAL_CONTENT', 'CONTENT'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, title, content, order = 0, isActive = true } = req.body;

      const newContent = await prisma.institutionalContent.create({
        data: {
          type: type as any,
          title,
          content,
          order,
          isActive,
          createdBy: req.userId,
        },
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
        },
      });

      res.status(201).json({ content: newContent });
    } catch (error: any) {
      console.error('[INSTITUTIONAL_CONTENT] Erro ao criar:', error);
      res.status(500).json({
        message: 'Erro ao criar conteúdo institucional',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar conteúdo institucional
router.put(
  '/:id',
  requireAuth(['ADMIN']),
  [
    param('id').isString(),
    body('title').optional().isString().notEmpty(),
    body('content').optional().isString().notEmpty(),
    body('order').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
  ],
  auditLog('UPDATE_INSTITUTIONAL_CONTENT', 'CONTENT'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const { title, content, order, isActive } = req.body;

      const updated = await prisma.institutionalContent.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(order !== undefined ? { order } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          updatedBy: req.userId,
        },
        include: {
          createdByUser: {
            select: { id: true, fullName: true },
          },
          updatedByUser: {
            select: { id: true, fullName: true },
          },
        },
      });

      res.json({ content: updated });
    } catch (error: any) {
      console.error('[INSTITUTIONAL_CONTENT] Erro ao atualizar:', error);
      res.status(500).json({
        message: 'Erro ao atualizar conteúdo institucional',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Deletar conteúdo institucional
router.delete(
  '/:id',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  auditLog('DELETE_INSTITUTIONAL_CONTENT', 'CONTENT'),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      await prisma.institutionalContent.delete({
        where: { id },
      });

      res.json({ message: 'Conteúdo deletado com sucesso' });
    } catch (error: any) {
      console.error('[INSTITUTIONAL_CONTENT] Erro ao deletar:', error);
      res.status(500).json({
        message: 'Erro ao deletar conteúdo institucional',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);








