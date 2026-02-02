import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { getIO } from '../lib/socket.js';

export const router = Router();

// Criar ou obter thread de chat para um caso
async function getOrCreateChatThread(caseId: string) {
  let thread = await prisma.chatThread.findFirst({
    where: { missingPersonId: caseId },
  });

  if (!thread) {
    // Criar thread público para o caso
    const caseData = await prisma.missingPerson.findUnique({
      where: { id: caseId },
      select: { reporterId: true },
    });

    if (!caseData) {
      throw new Error('Caso não encontrado');
    }

    thread = await prisma.chatThread.create({
      data: {
        missingPersonId: caseId,
        createdById: caseData.reporterId,
        type: 'FAMILIARES',
        visibility: 'PUBLICO',
      },
    });
  }

  return thread;
}

// Buscar mensagens de um caso
router.get(
  '/:caseId/messages',
  requireAuth(),
  [param('caseId').isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const thread = await getOrCreateChatThread(req.params.caseId);
      
      const messages = await prisma.chatMessage.findMany({
        where: { threadId: thread.id },
        include: {
          sender: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.json({
        messages: messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          senderId: msg.senderId,
          senderName: msg.sender.fullName,
          createdAt: msg.createdAt.toISOString(),
        })),
      });
    } catch (error: any) {
      console.error('Erro ao buscar mensagens:', error);
      res.status(500).json({ message: error.message || 'Erro ao buscar mensagens' });
    }
  },
);

// Enviar mensagem
router.post(
  '/:caseId/messages',
  requireAuth(),
  [
    param('caseId').isString(),
    body('content').isString().isLength({ min: 1, max: 1000 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const thread = await getOrCreateChatThread(req.params.caseId);
      
      const message = await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          senderId: req.userId!,
          content: req.body.content,
        },
        include: {
          sender: {
            select: { id: true, fullName: true },
          },
        },
      });

      // Buscar informações do caso para notificação
      const caseData = await prisma.missingPerson.findUnique({
        where: { id: req.params.caseId },
        select: { reporterId: true },
      });

      // Enviar via Socket.IO para todos no chat
      const io = getIO();
      io.to(`case:${req.params.caseId}`).emit('new-message', {
        caseId: req.params.caseId,
        message: message.content,
        senderId: message.senderId,
        senderName: message.sender.fullName,
        createdAt: message.createdAt.toISOString(),
      });

      // Notificações em tempo real APENAS entre reporter e o outro usuário:
      
      // 1. Se o sender NÃO é o reporter, notificar APENAS o reporter
      if (caseData?.reporterId && caseData.reporterId !== req.userId) {
        console.log(`[CHAT] Enviando notificação para reporter ${caseData.reporterId} sobre mensagem de ${req.userId}`);
        io.to(`user:${caseData.reporterId}`).emit('notification', {
          type: 'new_chat_message',
          title: 'Nova mensagem no chat do seu caso',
          message: `${message.sender.fullName}: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
          caseId: req.params.caseId,
        });
      }

      // 2. Se o sender É o reporter, notificar APENAS o último usuário que enviou mensagem (conversa 1-1)
      if (caseData?.reporterId && caseData.reporterId === req.userId) {
        // Buscar a última mensagem antes desta (para saber com quem o reporter está conversando)
        const thread = await prisma.chatThread.findFirst({
          where: { missingPersonId: req.params.caseId },
        });

        if (thread) {
          // Buscar a última mensagem que não foi do reporter
          const lastMessage = await prisma.chatMessage.findFirst({
            where: { 
              threadId: thread.id,
              senderId: { not: req.userId },
            },
            orderBy: { createdAt: 'desc' },
            select: { senderId: true },
          });

          // Se encontrou uma mensagem anterior, notificar apenas esse usuário
          if (lastMessage) {
            console.log(`[CHAT] Enviando notificação para ${lastMessage.senderId} sobre mensagem do reporter ${req.userId}`);
            io.to(`user:${lastMessage.senderId}`).emit('notification', {
              type: 'new_chat_message',
              title: 'Nova mensagem do autor do caso',
              message: `${message.sender.fullName}: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
              caseId: req.params.caseId,
            });
          }
        }
      }

      res.status(201).json({
        message: {
          id: message.id,
          content: message.content,
          senderId: message.senderId,
          senderName: message.sender.fullName,
          createdAt: message.createdAt.toISOString(),
        },
      });
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      res.status(500).json({ message: error.message || 'Erro ao enviar mensagem' });
    }
  },
);

