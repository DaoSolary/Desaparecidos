import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

interface TokenPayload {
  sub: string;
  role: string;
}

// Estender Request para incluir propriedades de autenticação e rastreabilidade
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  }
}

export function requireAuth(roles: string[] = []) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.token;

      if (!token) {
        return res.status(401).json({ message: 'Não autenticado' });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET não configurado');
      }

      const payload = jwt.verify(token, secret) as TokenPayload;
      req.userId = payload.sub;
      req.userRole = payload.role;
      
      // Capturar IP e User-Agent para rastreabilidade
      req.ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
      req.userAgent = req.headers['user-agent'];

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ message: 'Sem permissão' });
      }

      next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Sessão inválida' });
    }
  };
}

// Middleware opcional: tenta autenticar mas não bloqueia se não houver token
export function optionalAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.token;

      if (token) {
        const secret = process.env.JWT_SECRET;
        if (secret) {
          try {
            const payload = jwt.verify(token, secret) as TokenPayload;
            req.userId = payload.sub;
            req.userRole = payload.role;
          } catch (error) {
            // Token inválido, mas não bloqueia - continua sem autenticação
            req.userId = undefined;
            req.userRole = undefined;
          }
        }
      }

      next();
    } catch (error) {
      // Em caso de erro, continua sem autenticação
      next();
    }
  };
}


