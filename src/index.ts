import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { router as apiRouter } from './routes/index.js';

dotenv.config();

// Verificar se DATABASE_URL está configurada
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurada (Render Environment Variables)');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const uploadsPath = process.env.FILE_STORAGE_PATH ?? path.resolve('uploads');
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);

if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
  }),
);
// Servir arquivos estáticos com CORS habilitado
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.length === 0) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(uploadsPath, {
  setHeaders: (res, path) => {
    // Permitir que imagens sejam carregadas de qualquer origem
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: 'v1',
  });
});

app.use('/api', apiRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    message: 'Erro interno',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'], // Permitir fallback para polling
});

// Socket.IO para notificações e chat
io.on('connection', (socket) => {
  console.log(`cliente conectado ${socket.id}`);
  
  // Join room para notificações do usuário
  socket.on('join-user-room', (data: { userId: string; userRole?: string }) => {
    const userId = typeof data === 'string' ? data : data.userId;
    const userRole = typeof data === 'object' ? data.userRole : undefined;
    (socket as any).userId = userId; // Armazenar userId no socket para verificação posterior
    socket.join(`user:${userId}`);
    
    // Verificar se entrou na sala corretamente
    const rooms = Array.from(socket.rooms);
    const inRoom = rooms.includes(`user:${userId}`);
    
    // Também fazer join na sala da role se fornecida
    if (userRole) {
      socket.join(`role:${userRole}`);
      console.log(`[SOCKET] Usuário ${userId} entrou na sala role:${userRole}`);
    }
    
    console.log(`[SOCKET] Usuário ${userId} (socket ${socket.id}) conectado`);
    console.log(`[SOCKET] Entrou na sala user:${userId}: ${inRoom}`);
    console.log(`[SOCKET] Salas do socket: ${rooms.join(', ')}`);
    
    // Verificar quantos sockets estão na sala deste usuário
    const room = io.sockets.adapter.rooms.get(`user:${userId}`);
    const socketCount = room ? room.size : 0;
    console.log(`[SOCKET] Total de sockets na sala user:${userId}: ${socketCount}`);
  });

  // Join room para chat de caso
  socket.on('join-case-room', async (data: { caseId: string; userId: string; userName: string }) => {
    socket.join(`case:${data.caseId}`);
    
    // Notificar outros usuários no chat que alguém entrou
    socket.to(`case:${data.caseId}`).emit('user-joined-chat', {
      caseId: data.caseId,
      userId: data.userId,
      userName: data.userName,
      message: `${data.userName} entrou no chat`,
    });

    // Notificar o reporter do caso se ele não estiver no chat
    try {
      const { prisma } = await import('./lib/prisma.js');
      const caseData = await prisma.missingPerson.findUnique({
        where: { id: data.caseId },
        select: { reporterId: true },
      });
      
      if (caseData?.reporterId && caseData.reporterId !== data.userId) {
        io.to(`user:${caseData.reporterId}`).emit('notification', {
          type: 'chat_user_joined',
          title: 'Alguém entrou no chat do seu caso',
          message: `${data.userName} entrou no chat do caso que você publicou.`,
        });
      }
    } catch (error) {
      console.error('Erro ao notificar reporter:', error);
    }
  });

  // Leave case room
  socket.on('leave-case-room', (caseId: string) => {
    socket.leave(`case:${caseId}`);
  });

  // Chat messages (Socket.IO para broadcast em tempo real)
  // Nota: A persistência é feita via API REST em /chat/:caseId/messages
  socket.on('chat-message', async (data: { caseId: string; message: string; senderId: string; senderName: string }) => {
    // Retransmitir para todos no chat do caso
    io.to(`case:${data.caseId}`).emit('new-message', {
      ...data,
      createdAt: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`cliente desconectado ${socket.id}`);
  });
});

import { setIO } from './lib/socket.js';

// Configurar Socket.IO
setIO(io);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('socketio', io);
app.set('uploadsPath', uploadsPath);

server.listen(PORT, () => {
  console.log(`API BaseDeDadosPessoasDesaparecidas em http://localhost:${PORT}`);
});


