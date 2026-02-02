import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * Middleware para criar logs de auditoria automáticos
 * Captura IP, User-Agent e outras informações para rastreabilidade legal
 */
export function auditLog(action: string, entityType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.json.bind(res);
    
    res.json = function (data: any) {
      // Criar log de auditoria após a resposta
      if (req.userId) {
        const entityId = req.params.id || (data?.id || data?.user?.id || data?.case?.id);
        
        prisma.auditLog.create({
          data: {
            userId: req.userId,
            action,
            entityType: entityType || req.route?.path?.split('/')[1]?.toUpperCase(),
            entityId: entityId ? String(entityId) : undefined,
            details: `${action} - ${req.method} ${req.path}`,
            metadata: {
              method: req.method,
              path: req.path,
              query: req.query,
              body: req.method !== 'GET' ? Object.keys(req.body || {}).reduce((acc, key) => {
                // Não logar senhas ou dados sensíveis
                if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
                  acc[key] = '[REDACTED]';
                } else {
                  acc[key] = req.body[key];
                }
                return acc;
              }, {} as any) : undefined,
            },
            ipAddress: req.ip || req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          },
        }).catch((error) => {
          console.error('[AUDIT] Erro ao criar log:', error);
        });
      }
      
      return originalSend(data);
    };
    
    next();
  };
}


