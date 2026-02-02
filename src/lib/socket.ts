import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIO(io: Server) {
  ioInstance = io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO não inicializado');
  }
  return ioInstance;
}

export function emitNotification(options: { userId?: string | null; userRole?: string | null; type: string; title: string; message: string; metadata?: any }) {
  try {
    const io = getIO();
    const { userId, userRole, type, title, message, metadata } = options;
    
    const notification = {
      type,
      title,
      message,
      metadata,
      timestamp: new Date().toISOString(),
    };

    if (userId) {
      // Notificação para usuário específico
      const room = io.sockets.adapter.rooms.get(`user:${userId}`);
      const socketCount = room ? room.size : 0;
      
      console.log(`[NOTIFICATION] Enviando notificação para usuário ${userId} (${socketCount} socket(s) na sala)`);
      
      if (socketCount === 0) {
        console.warn(`[NOTIFICATION] Usuário ${userId} não está conectado. Notificação será perdida.`);
      }
      
      io.to(`user:${userId}`).emit('notification', notification);
      console.log(`[NOTIFICATION] Notificação enviada para usuário ${userId}:`, type);
    } else if (userRole) {
      // Notificação para todos os usuários com uma role específica
      const room = io.sockets.adapter.rooms.get(`role:${userRole}`);
      const socketCount = room ? room.size : 0;
      
      console.log(`[NOTIFICATION] Enviando notificação para role ${userRole} (${socketCount} socket(s) na sala)`);
      
      io.to(`role:${userRole}`).emit('notification', notification);
      console.log(`[NOTIFICATION] Notificação enviada para role ${userRole}:`, type);
    } else {
      // Broadcast para todos
      console.log(`[NOTIFICATION] Enviando notificação para todos os usuários`);
      io.emit('notification', notification);
    }
  } catch (error) {
    console.error(`[NOTIFICATION] Erro ao enviar notificação:`, error);
  }
}

