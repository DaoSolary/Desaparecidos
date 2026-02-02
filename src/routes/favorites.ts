import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Listar favoritos do usuário
router.get('/', requireAuth(), async (req, res) => {
  try {
    const favorites = await prisma.favoriteCase.findMany({
      where: { userId: req.userId },
      include: {
        missingPerson: {
          include: {
            photos: true,
            reporter: {
              select: { fullName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ favorites });
  } catch (error) {
    console.error('[favorites:list] Erro:', error);
    res.status(500).json({ message: 'Erro ao listar favoritos' });
  }
});

// Adicionar favorito
router.post('/', requireAuth(), async (req, res) => {
  try {
    const { missingPersonId } = req.body;

    if (!missingPersonId) {
      return res.status(400).json({ message: 'missingPersonId é obrigatório' });
    }

    // Verificar se o caso existe
    const missingPerson = await prisma.missingPerson.findUnique({
      where: { id: missingPersonId },
    });

    if (!missingPerson) {
      return res.status(404).json({ message: 'Caso não encontrado' });
    }

    // Criar ou verificar se já existe
    const favorite = await prisma.favoriteCase.upsert({
      where: {
        userId_missingPersonId: {
          userId: req.userId!,
          missingPersonId,
        },
      },
      create: {
        userId: req.userId!,
        missingPersonId,
      },
      update: {},
    });

    res.json({ favorite });
  } catch (error) {
    console.error('[favorites:create] Erro:', error);
    res.status(500).json({ message: 'Erro ao adicionar favorito' });
  }
});

// Remover favorito
router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.favoriteCase.deleteMany({
      where: {
        id,
        userId: req.userId,
      },
    });

    res.json({ message: 'Favorito removido' });
  } catch (error) {
    console.error('[favorites:delete] Erro:', error);
    res.status(500).json({ message: 'Erro ao remover favorito' });
  }
});


