import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { emitNotification } from '../lib/socket.js';

export const router = Router();

// Criar novo chat com autoridade
router.post(
  '/',
  requireAuth(),
  [
    body('authorityId').isString(),
    body('subject').isString().notEmpty(),
    body('message').isString().notEmpty(),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { authorityId, subject, message } = req.body;
      const userId = req.userId;

      // Verificar se a autoridade existe e tem role apropriado
      const authority = await prisma.user.findUnique({
        where: { id: authorityId },
        select: { id: true, role: true },
      });

      if (!authority || (authority.role !== 'AUTORIDADE' && authority.role !== 'ADMIN' && authority.role !== 'MODERADOR')) {
        return res.status(404).json({ message: 'Autoridade não encontrada' });
      }

      // Criar chat
      const chat = await prisma.authorityChat.create({
        data: {
          userId,
          authorityId,
          subject,
          status: 'ABERTO',
          messages: {
            create: {
              senderId: userId,
              content: message,
            },
          },
        },
        include: {
          authority: {
            select: {
              fullName: true,
              role: true,
            },
          },
        },
      });

      // Notificar autoridade
      emitNotification(authorityId, {
        type: 'new_authority_chat',
        title: 'Nova mensagem de cidadão',
        message: `Você recebeu uma nova mensagem sobre: ${subject}`,
        chatId: chat.id,
      });

      res.status(201).json({ chat });
    } catch (error: any) {
      console.error('[AUTHORITY_CHAT] Erro ao criar chat:', error);
      res.status(500).json({
        message: 'Erro ao criar chat',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

// Listar chats do usuário
router.get('/', requireAuth(), async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const userRole = req.userRole;

    let chats;
    if (userRole === 'AUTORIDADE' || userRole === 'ADMIN' || userRole === 'MODERADOR') {
      // Autoridades veem chats onde são a autoridade
      chats = await prisma.authorityChat.findMany({
        where: { authorityId: userId },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    } else {
      // Usuários comuns veem seus próprios chats
      chats = await prisma.authorityChat.findMany({
        where: { userId },
        include: {
          authority: {
            select: {
              fullName: true,
              role: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    res.json({ chats });
  } catch (error: any) {
    console.error('[AUTHORITY_CHAT] Erro ao listar chats:', error);
    res.status(500).json({
      message: 'Erro ao listar chats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Obter detalhes de um chat
router.get('/:chatId', requireAuth(), [param('chatId').isString()], async (req: any, res: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Verificar se o usuário tem acesso ao chat
    const chat = await prisma.authorityChat.findUnique({
      where: { id: chatId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        authority: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    if (!chat || (chat.userId !== userId && chat.authorityId !== userId)) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    res.json({ chat });
  } catch (error: any) {
    console.error('[AUTHORITY_CHAT] Erro ao buscar chat:', error);
    res.status(500).json({
      message: 'Erro ao buscar chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Obter mensagens de um chat
router.get('/:chatId/messages', requireAuth(), [param('chatId').isString()], async (req: any, res: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Verificar se o usuário tem acesso ao chat
    const chat = await prisma.authorityChat.findUnique({
      where: { id: chatId },
      select: { userId: true, authorityId: true },
    });

    if (!chat || (chat.userId !== userId && chat.authorityId !== userId)) {
      return res.status(403).json({ message: 'Acesso negado' });
    }

    const messages = await prisma.authorityChatMessage.findMany({
      where: { chatId },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Marcar mensagens como lidas
    await prisma.authorityChatMessage.updateMany({
      where: {
        chatId,
        senderId: { not: userId },
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({ messages });
  } catch (error: any) {
    console.error('[AUTHORITY_CHAT] Erro ao buscar mensagens:', error);
    res.status(500).json({
      message: 'Erro ao buscar mensagens',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Enviar mensagem
router.post(
  '/:chatId/messages',
  requireAuth(),
  [param('chatId').isString(), body('content').isString().notEmpty()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { chatId } = req.params;
      const { content } = req.body;
      const userId = req.userId;

      // Verificar acesso
      const chat = await prisma.authorityChat.findUnique({
        where: { id: chatId },
        include: {
          user: { select: { id: true } },
          authority: { select: { id: true } },
        },
      });

      if (!chat || (chat.userId !== userId && chat.authorityId !== userId)) {
        return res.status(403).json({ message: 'Acesso negado' });
      }

      // Criar mensagem
      const message = await prisma.authorityChatMessage.create({
        data: {
          chatId,
          senderId: userId,
          content,
        },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              role: true,
            },
          },
        },
      });

      // Atualizar status do chat
      await prisma.authorityChat.update({
        where: { id: chatId },
        data: { status: 'EM_ATENDIMENTO', updatedAt: new Date() },
      });

      // Notificar o outro participante
      const recipientId = chat.userId === userId ? chat.authorityId : chat.userId;
      emitNotification(recipientId, {
        type: 'authority_chat_message',
        title: 'Nova mensagem',
        message: content.substring(0, 50) + '...',
        chatId,
      });

      res.status(201).json({ message });
    } catch (error: any) {
      console.error('[AUTHORITY_CHAT] Erro ao enviar mensagem:', error);
      res.status(500).json({
        message: 'Erro ao enviar mensagem',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

