import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { emitNotification } from '../lib/socket.js';

export const router = Router();

const createValidators = [
  body('fullName').isString(),
  body('age').optional().isInt({ min: 0, max: 120 }),
  body('gender').optional().isIn(['MASCULINO', 'FEMININO', 'OUTRO']),
  body('missingDate').isISO8601(),
  body('lastSeenLocation').isString(),
  body('province').isString(),
  body('municipality').optional().isString(),
  body('description').optional().isString(),
  body('priority').optional().isIn(['GERAL', 'CRIANCA', 'IDOSO', 'DEFICIENCIA', 'URGENTE']),
  body('photos').optional().isArray(),
];

router.post('/', requireAuth(['CIDADAO', 'FAMILIAR', 'MODERADOR', 'ADMIN']), createValidators, async (req: any, res: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { photos = [], ...data } = req.body;
  const missingPerson = await prisma.missingPerson.create({
    data: {
      ...data,
      missingDate: new Date(data.missingDate),
      reporterId: req.userId!,
      approved: false, // Garantir que o caso seja criado como pendente
      photos: {
        create: photos.map((url: string) => ({ url })),
      },
    },
    include: {
      photos: true,
      reporter: {
        select: { fullName: true, email: true },
      },
    },
  });

  // Notificar moderadores sobre novo caso pendente em tempo real
  // Usar setTimeout com delay pequeno para garantir que o caso foi salvo no banco
  setTimeout(async () => {
    try {
      const moderators = await prisma.user.findMany({
        where: { role: { in: ['MODERADOR', 'ADMIN'] } },
        select: { id: true, fullName: true, email: true },
      });
      
      if (moderators.length === 0) {
        console.log('[CASOS] Nenhum moderador encontrado para notificar');
        return;
      }
      
      console.log(`[CASOS] Notificando ${moderators.length} moderador(es) sobre novo caso: ${missingPerson.fullName} (ID: ${missingPerson.id})`);
      console.log(`[CASOS] Caso criado com approved: ${(missingPerson as any).approved}`);
      
      for (const mod of moderators) {
        console.log(`[CASOS] Enviando notificação para moderador: ${mod.fullName} (${mod.id})`);
        emitNotification({
          userId: mod.id,
          type: 'new_pending_case',
          title: 'Novo caso pendente de aprovação',
          message: `Novo caso reportado: ${missingPerson.fullName} - ${missingPerson.province}`,
          metadata: { caseId: missingPerson.id },
        });
      }
    } catch (error) {
      console.error('[CASOS] Erro ao enviar notificação para moderadores:', error);
    }
  }, 200); // Delay de 200ms para garantir que o caso foi salvo

  // Verificar e atribuir badges
  try {
    const { checkAndAwardBadges } = await import('./badges.js');
    await checkAndAwardBadges(req.userId!);
  } catch (error) {
    console.error('[CASOS] Erro ao verificar badges:', error);
  }

  res.status(201).json({ missingPerson });
});

router.get(
  '/',
  optionalAuth(),
  [
    query('name').optional().isString(),
    query('province').optional().isString(),
    query('municipality').optional().isString(),
    query('gender').optional().isString(),
    query('status').optional().isString(),
    query('priority').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: any, res: any) => {
    const { name, province, municipality, gender, status, priority, page, limit } = req.query;
    
    // Verificar se o usuário está autenticado e qual é o seu papel
    const userRole = req.userRole;
    const isModeratorOrAdmin = userRole === 'MODERADOR' || userRole === 'ADMIN';
    const userId = req.userId;

    // Valores válidos dos enums
    const validStatuses = ['ABERTO', 'EM_INVESTIGACAO', 'AVISTADO', 'ENCONTRADO', 'ENCERRADO'];
    const validGenders = ['MASCULINO', 'FEMININO', 'OUTRO'];
    const validPriorities = ['GERAL', 'CRIANCA', 'IDOSO', 'DEFICIENCIA', 'URGENTE'];

    const whereClause: any = {};

    // Adicionar filtros apenas se tiverem valores válidos
    if (name) {
      whereClause.fullName = { contains: String(name), mode: 'insensitive' };
    }
    if (province) {
      whereClause.province = String(province);
    }
    if (municipality) {
      whereClause.municipality = String(municipality);
    }
    if (gender && validGenders.includes(String(gender).toUpperCase())) {
      whereClause.gender = String(gender).toUpperCase() as any;
    }
    if (status) {
      const statusStr = String(status);
      // Se houver múltiplos valores separados por vírgula, usar 'in'
      if (statusStr.includes(',')) {
        const statusArray = statusStr.split(',').map(s => s.trim().toUpperCase()).filter(s => validStatuses.includes(s));
        if (statusArray.length > 0) {
          whereClause.status = { in: statusArray as any[] };
        }
      } else if (validStatuses.includes(statusStr.toUpperCase())) {
        whereClause.status = statusStr.toUpperCase() as any;
      }
    }
    if (priority && validPriorities.includes(String(priority).toUpperCase())) {
      whereClause.priority = String(priority).toUpperCase() as any;
    }

    // Se não for moderador/admin, só mostrar casos aprovados
    // Usuários comuns (CIDADAO, FAMILIAR, VOLUNTARIO) só veem casos aprovados
    // Eles podem ver seus próprios casos não aprovados apenas no dashboard
    if (!isModeratorOrAdmin) {
      whereClause.approved = true;
    }

    try {
      // Paginação
      const pageNumber = page ? parseInt(String(page), 10) : 1;
      const pageSize = limit ? parseInt(String(limit), 10) : 10;
      const skip = (pageNumber - 1) * pageSize;

      // Contar total de casos
      const total = await prisma.missingPerson.count({ where: whereClause });

      // Buscar casos com paginação
      // Para admin, não filtrar por isDeleted (para ver todos)
      // Para outros, filtrar apenas casos não deletados
      if (!isModeratorOrAdmin) {
        whereClause.isDeleted = false;
      }

      const missingPeople = await prisma.missingPerson.findMany({
        where: whereClause,
        include: {
          photos: true,
          sightings: true,
          reporter: {
            select: { fullName: true, email: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      const totalPages = Math.ceil(total / pageSize);

      res.json({ 
        items: missingPeople,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1,
        },
      });
    } catch (error: any) {
      console.error('[CASOS] Erro ao buscar casos:', error);
      res.status(500).json({ 
        message: 'Erro ao buscar casos',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
);

router.get('/:id', optionalAuth(), [param('id').isString()], async (req: any, res: any) => {
  const userRole = req.userRole;
  const userId = req.userId;
  const isModeratorOrAdmin = userRole === 'MODERADOR' || userRole === 'ADMIN';

  const missingPerson = await prisma.missingPerson.findUnique({
    where: { id: req.params.id },
    include: {
      photos: true,
      sightings: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          description: true,
          province: true,
          municipality: true,
          location: true,
          reporterName: true,
          reporterContact: true,
          evidenceUrl: true,
          createdAt: true,
          status: true,
        },
      },
      reporter: {
        select: { fullName: true, email: true, phone: true },
      },
    },
  });

  if (!missingPerson) {
    return res.status(404).json({ message: 'Caso não encontrado' });
  }

  // Verificar se o usuário pode ver este caso
  // Moderadores e Admins sempre podem ver todos os casos
  if (isModeratorOrAdmin) {
    return res.json({ missingPerson });
  }

  // Para outros usuários, verificar se o caso está aprovado ou se é o reporter
  const isApproved = (missingPerson as any).approved === true;
  const reporterId = (missingPerson as any).reporterId;
  if (!isApproved && reporterId !== userId) {
    return res.status(403).json({ message: 'Caso ainda não foi aprovado' });
  }

  res.json({ missingPerson });
});

router.patch(
  '/:id/status',
  requireAuth(['MODERADOR', 'ADMIN', 'AUTORIDADE']),
  [param('id').isString(), body('status').isIn(['ABERTO', 'EM_INVESTIGACAO', 'AVISTADO', 'ENCONTRADO', 'ENCERRADO'])],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    // Buscar o caso antes de atualizar para obter o reporterId
    const caseBeforeUpdate = await prisma.missingPerson.findUnique({
      where: { id },
      select: { reporterId: true, fullName: true },
    });

    if (!caseBeforeUpdate) {
      return res.status(404).json({ message: 'Caso não encontrado' });
    }

    const updated = await prisma.missingPerson.update({
      where: { id },
      data: { status },
      include: {
        photos: true,
        reporter: {
          select: { fullName: true, email: true, phone: true },
        },
      },
    });

    // Criar histórico
    try {
      await prisma.caseHistory.create({
        data: {
          missingPersonId: id,
          status,
          notes: notes || null,
          createdById: req.userId,
        },
      });
    } catch (error) {
      // Se o modelo CaseHistory não existir, apenas logar o erro
      console.error('Erro ao criar histórico do caso:', error);
    }

    // Criar log de auditoria com rastreabilidade
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'UPDATE_CASE_STATUS',
          entityType: 'CASE',
          entityId: id,
          details: `Status do caso "${caseBeforeUpdate.fullName}" alterado para ${status}`,
          metadata: {
            caseId: id,
            oldStatus: updated.status,
            newStatus: status,
            notes: notes || null,
          },
          ipAddress: req.ipAddress,
          userAgent: req.userAgent,
        },
      });
    } catch (error) {
      console.error('Erro ao criar log de auditoria:', error);
    }

    // Notificar o reporter sobre a mudança de status
    const statusMessages: Record<string, string> = {
      'EM_INVESTIGACAO': 'Caso em investigação',
      'AVISTADO': 'Caso avistado',
      'ENCONTRADO': 'Caso encontrado',
      'ENCERRADO': 'Caso encerrado',
      'ABERTO': 'Caso reaberto',
    };

    const statusMessage = statusMessages[status] || `Status alterado para ${status}`;

    try {
      if (caseBeforeUpdate.reporterId) {
        const { emitNotification } = await import('../lib/socket.js');
        emitNotification({
          userId: caseBeforeUpdate.reporterId,
          type: 'case_status_changed',
          title: statusMessage,
          message: `O status do caso "${caseBeforeUpdate.fullName}" foi alterado para: ${statusMessage}`,
          metadata: { caseId: id },
        });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação de mudança de status:', error);
    }

    res.json({ missingPerson: updated });
  },
);

// Aprovar/Rejeitar caso
router.patch(
  '/:id/approve',
  requireAuth(['MODERADOR', 'ADMIN']),
  [param('id').isString(), body('approved').isBoolean()],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { approved, rejectionReason } = req.body;

    const updateData: any = {
      approved,
      approvedAt: approved ? new Date() : null,
      approvedById: approved ? req.userId : null,
    };

    if (!approved && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const updated = await prisma.missingPerson.update({
      where: { id },
      data: updateData,
      include: {
        photos: true,
        reporter: {
          select: { fullName: true, email: true, phone: true },
        },
      },
    });

    // Criar log de auditoria
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: approved 
            ? `Caso aprovado: ${updated.fullName} (ID: ${id})`
            : `Caso rejeitado: ${updated.fullName} (ID: ${id})`,
          payload: {
            caseId: id,
            caseName: updated.fullName,
            action: approved ? 'approved' : 'rejected',
            rejectionReason: rejectionReason || null,
            approvedBy: req.userId,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Erro ao criar log de auditoria:', error);
    }

    // Notificar reporter sobre aprovação/rejeição
    try {
      if (updated.reporterId) {
        emitNotification({
          userId: updated.reporterId,
          type: approved ? 'case_approved' : 'case_rejected',
          title: approved ? 'Caso aprovado' : 'Caso rejeitado',
          message: approved
            ? `Seu caso "${updated.fullName}" foi aprovado e está agora público.`
            : `Seu caso "${updated.fullName}" foi rejeitado. Motivo: ${rejectionReason || 'Não especificado'}`,
        });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
    }

    res.json({ missingPerson: updated });
  },
);

// Editar qualquer caso (apenas ADMIN)
router.put(
  '/:id',
  requireAuth(['ADMIN']),
  [
    param('id').isString(),
    body('fullName').optional().isString(),
    body('age').optional().isInt({ min: 0, max: 120 }),
    body('gender').optional().isIn(['MASCULINO', 'FEMININO', 'OUTRO']),
    body('missingDate').optional().isISO8601(),
    body('lastSeenLocation').optional().isString(),
    body('province').optional().isString(),
    body('municipality').optional().isString(),
    body('description').optional().isString(),
    body('circumstances').optional().isString(),
    body('healthConditions').optional().isString(),
    body('priority').optional().isIn(['GERAL', 'CRIANCA', 'IDOSO', 'DEFICIENCIA', 'URGENTE']),
    body('status').optional().isIn(['ABERTO', 'EM_INVESTIGACAO', 'AVISTADO', 'ENCONTRADO', 'ENCERRADO']),
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { id } = req.params;
      const updateData: any = {};

      if (req.body.fullName !== undefined) updateData.fullName = req.body.fullName;
      if (req.body.age !== undefined) updateData.age = req.body.age;
      if (req.body.gender !== undefined) updateData.gender = req.body.gender;
      if (req.body.missingDate !== undefined) updateData.missingDate = new Date(req.body.missingDate);
      if (req.body.lastSeenLocation !== undefined) updateData.lastSeenLocation = req.body.lastSeenLocation;
      if (req.body.province !== undefined) updateData.province = req.body.province;
      if (req.body.municipality !== undefined) updateData.municipality = req.body.municipality;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.circumstances !== undefined) updateData.circumstances = req.body.circumstances;
      if (req.body.healthConditions !== undefined) updateData.healthConditions = req.body.healthConditions;
      if (req.body.priority !== undefined) updateData.priority = req.body.priority;
      if (req.body.status !== undefined) updateData.status = req.body.status;

      const updated = await prisma.missingPerson.update({
        where: { id, isDeleted: false },
        data: updateData,
        include: {
          photos: true,
          reporter: {
            select: { fullName: true, email: true, phone: true },
          },
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'EDIT_CASE',
          entityType: 'CASE',
          entityId: id,
          details: `Caso "${updated.fullName}" editado por admin`,
          metadata: { changes: updateData },
          ipAddress: req.ipAddress,
          userAgent: req.userAgent,
        },
      });

      res.json({ missingPerson: updated });
    } catch (error: any) {
      console.error('[CASOS] Erro ao editar caso:', error);
      res.status(500).json({
        message: 'Erro ao editar caso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);

// Deletar caso (soft delete - apenas ADMIN)
router.delete(
  '/:id',
  requireAuth(['ADMIN']),
  [param('id').isString(), body('reason').optional().isString()],
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const caseToDelete = await prisma.missingPerson.findUnique({
        where: { id, isDeleted: false },
        include: {
          photos: true,
          reporter: {
            select: { fullName: true, email: true },
          },
        },
      });

      if (!caseToDelete) {
        return res.status(404).json({ message: 'Caso não encontrado' });
      }

      const caseData = {
        ...caseToDelete,
        photos: caseToDelete.photos.map(p => ({ url: p.url, storageProvider: p.storageProvider })),
      };

      await prisma.deletedCase.create({
        data: {
          caseId: id,
          caseData: caseData as any,
          deletedBy: req.userId,
          deletionReason: reason,
        },
      });

      await prisma.missingPerson.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: req.userId,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: req.userId,
          action: 'DELETE_CASE',
          entityType: 'CASE',
          entityId: id,
          details: `Caso "${caseToDelete.fullName}" deletado por admin`,
          metadata: { reason },
          ipAddress: req.ipAddress,
          userAgent: req.userAgent,
        },
      });

      res.json({ message: 'Caso deletado com sucesso. Pode ser restaurado posteriormente.' });
    } catch (error: any) {
      console.error('[CASOS] Erro ao deletar caso:', error);
      res.status(500).json({
        message: 'Erro ao deletar caso',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);


