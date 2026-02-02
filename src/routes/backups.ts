import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const router = Router();

// Listar backups
router.get(
  '/',
  requireAuth(['ADMIN']),
  [
    query('type').optional().isIn(['FULL', 'DATABASE_ONLY', 'FILES_ONLY', 'INCREMENTAL']),
    query('status').optional().isIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED']),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, status } = req.query;

      const backups = await prisma.backup.findMany({
        where: {
          ...(type ? { type: type as any } : {}),
          ...(status ? { status: status as any } : {}),
        },
        include: {
          startedByUser: {
            select: { id: true, fullName: true },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: 50, // Limitar a 50 backups mais recentes
      });

      res.json({ backups });
    } catch (error: any) {
      console.error('[BACKUPS] Erro ao listar:', error);
      res.status(500).json({
        message: 'Erro ao listar backups',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Criar backup
router.post(
  '/',
  requireAuth(['ADMIN']),
  [
    body('type').isIn(['FULL', 'DATABASE_ONLY', 'FILES_ONLY', 'INCREMENTAL']),
    body('description').optional().isString(),
  ],
  auditLog('CREATE_BACKUP', 'BACKUP'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { type, description } = req.body;

      // Criar registro de backup
      const backup = await prisma.backup.create({
        data: {
          type: type as any,
          status: 'PENDING',
          startedBy: req.userId,
          metadata: { description },
        },
      });

      // Executar backup em background
      executeBackup(backup.id, type as string, req.userId).catch((error) => {
        console.error('[BACKUPS] Erro ao executar backup:', error);
      });

      res.status(201).json({
        message: 'Backup iniciado',
        backup,
      });
    } catch (error: any) {
      console.error('[BACKUPS] Erro ao criar backup:', error);
      res.status(500).json({
        message: 'Erro ao criar backup',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Função para executar backup
async function executeBackup(backupId: string, type: string, userId: string) {
  try {
    // Atualizar status para IN_PROGRESS
    await prisma.backup.update({
      where: { id: backupId },
      data: { status: 'IN_PROGRESS' },
    });

    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filePath: string | null = null;
    let fileSize = 0;

    if (type === 'DATABASE_ONLY' || type === 'FULL') {
      // Backup do banco de dados usando pg_dump
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const dbFileName = `db-backup-${timestamp}.sql`;
        filePath = path.join(backupDir, dbFileName);

        // Extrair informações da URL do banco
        const urlMatch = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
        if (urlMatch) {
          const [, user, password, host, port, database] = urlMatch;
          const pgDumpCmd = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -f "${filePath}"`;

          await execAsync(pgDumpCmd);
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
        }
      }
    }

    if (type === 'FILES_ONLY' || type === 'FULL') {
      // Backup de arquivos (uploads)
      const uploadsDir = path.join(process.cwd(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const filesBackupName = `files-backup-${timestamp}.tar.gz`;
        const filesBackupPath = path.join(backupDir, filesBackupName);

        // Criar arquivo tar.gz dos uploads
        await execAsync(`tar -czf "${filesBackupPath}" -C "${process.cwd()}" uploads`);
        const stats = fs.statSync(filesBackupPath);
        fileSize += stats.size;
      }
    }

    // Atualizar backup como concluído
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'COMPLETED',
        filePath,
        fileSize,
        completedAt: new Date(),
      },
    });
  } catch (error: any) {
    console.error('[BACKUPS] Erro ao executar backup:', error);
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        error: error.message,
        completedAt: new Date(),
      },
    });
  }
}

// Obter configurações de backup
router.get(
  '/config',
  requireAuth(['ADMIN']),
  async (req: any, res: any) => {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: 'backup_config' },
      });

      const defaultConfig = {
        enabled: true,
        frequency: 'daily', // daily, weekly, monthly
        time: '02:00', // HH:mm
        retentionDays: 30,
        types: ['FULL'],
      };

      res.json({
        config: config ? { ...defaultConfig, ...(config.value as any) } : defaultConfig,
      });
    } catch (error: any) {
      console.error('[BACKUPS] Erro ao buscar configuração:', error);
      res.status(500).json({
        message: 'Erro ao buscar configuração de backup',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Atualizar configurações de backup
router.put(
  '/config',
  requireAuth(['ADMIN']),
  [
    body('enabled').optional().isBoolean(),
    body('frequency').optional().isIn(['daily', 'weekly', 'monthly']),
    body('time').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('retentionDays').optional().isInt({ min: 1 }),
    body('types').optional().isArray(),
  ],
  auditLog('UPDATE_BACKUP_CONFIG', 'CONFIG'),
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const configData = req.body;

      await prisma.systemConfig.upsert({
        where: { key: 'backup_config' },
        update: {
          value: configData,
          category: 'BACKUP',
          description: 'Configurações de backup automático',
          updatedBy: req.userId,
        },
        create: {
          key: 'backup_config',
          value: configData,
          category: 'BACKUP',
          description: 'Configurações de backup automático',
          updatedBy: req.userId,
        },
      });

      res.json({ message: 'Configuração de backup atualizada', config: configData });
    } catch (error: any) {
      console.error('[BACKUPS] Erro ao atualizar configuração:', error);
      res.status(500).json({
        message: 'Erro ao atualizar configuração de backup',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Download de backup
router.get(
  '/:id/download',
  requireAuth(['ADMIN']),
  [param('id').isString()],
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      const backup = await prisma.backup.findUnique({
        where: { id },
      });

      if (!backup || backup.status !== 'COMPLETED' || !backup.filePath) {
        return res.status(404).json({ message: 'Backup não encontrado ou não disponível' });
      }

      if (!fs.existsSync(backup.filePath)) {
        return res.status(404).json({ message: 'Arquivo de backup não encontrado' });
      }

      res.download(backup.filePath, path.basename(backup.filePath));
    } catch (error: any) {
      console.error('[BACKUPS] Erro ao fazer download:', error);
      res.status(500).json({
        message: 'Erro ao fazer download do backup',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);








