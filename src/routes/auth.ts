import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPasswordResetEmail } from '../services/email-service.js';

export const router = Router();

const registerValidators = [
  body('fullName').isString().isLength({ min: 3 }),
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('phone').optional().isString(),
  body('province').optional().isString(),
  body('municipality').optional().isString(),
  body('role').optional().isIn(['CIDADAO', 'FAMILIAR', 'VOLUNTARIO']),
];

router.post('/register', registerValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { fullName, email, password, phone, province, municipality, role = 'CIDADAO' } = req.body;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({ message: 'Email já cadastrado' });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, email, password: hashed, phone, province, municipality, role },
    select: { id: true, fullName: true, email: true, role: true },
  });

  return res.status(201).json({ user });
});

router.post(
  '/login',
  [body('email').isEmail(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    // Verificar se o usuário está bloqueado
    if (user.isBlocked) {
      return res.status(403).json({ 
        message: 'Usuário bloqueado',
        reason: user.blockedReason || 'Usuário bloqueado pelo administrador',
        blocked: true,
      });
    }

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET não definido');
    }

    const token = jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '12h' });

    return res.json({
      token,
      user: { id: user.id, fullName: user.fullName, role: user.role },
    });
  },
);

router.get('/me', requireAuth(), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { 
      id: true, 
      fullName: true, 
      email: true,
      role: true, 
      phone: true,
      province: true,
      municipality: true,
      verifiedAt: true,
      createdAt: true,
    },
  });
  res.json({ user });
});

router.put('/profile', requireAuth(), [
  body('fullName').optional().isString().isLength({ min: 3 }),
  body('phone').optional().isString(),
  body('province').optional().isString(),
  body('municipality').optional().isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { fullName, phone, province, municipality } = req.body;
  const updateData: any = {};
  
  if (fullName !== undefined) updateData.fullName = fullName;
  if (phone !== undefined) updateData.phone = phone;
  if (province !== undefined) updateData.province = province;
  if (municipality !== undefined) updateData.municipality = municipality;

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: updateData,
    select: { 
      id: true, 
      fullName: true, 
      email: true,
      role: true, 
      phone: true,
      province: true,
      municipality: true,
      verifiedAt: true,
    },
  });

  res.json({ user });
});

router.put('/change-password', requireAuth(), [
  body('currentPassword').isLength({ min: 6 }),
  body('newPassword').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;
  
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { password: true },
  });

  if (!user) {
    return res.status(404).json({ message: 'Usuário não encontrado' });
  }

  const matches = await bcrypt.compare(currentPassword, user.password);
  if (!matches) {
    return res.status(401).json({ message: 'Senha atual incorreta' });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.userId },
    data: { password: hashed },
  });

  res.json({ message: 'Senha alterada com sucesso' });
});

// Solicitar recuperação de senha
router.post('/forgot-password', [
  body('email').isEmail(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Sempre retornar sucesso para não expor se o email existe
    if (!user) {
      return res.json({ 
        message: 'Se o email estiver cadastrado, você receberá um link para recuperação de senha.' 
      });
    }

    // Gerar token único
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token válido por 1 hora

    // Verificar se o modelo PasswordResetToken existe no Prisma Client
    if (!prisma.passwordResetToken) {
      console.error('[auth:forgot-password] Prisma Client não contém passwordResetToken. Execute: npx prisma generate');
      return res.status(500).json({ 
        message: 'Erro de configuração do servidor. O modelo de recuperação de senha não está disponível. Contate o administrador.' 
      });
    }

    // Deletar tokens anteriores não usados do mesmo usuário
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        used: false,
      },
    });

    // Criar novo token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    try {
      await sendPasswordResetEmail(email, token);
    } catch (error: any) {
      console.error('[auth:forgot-password] Falha ao enviar email:', error.message);
      // Se for erro de configuração SMTP, retornar mensagem específica
      if (error.message?.includes('SMTP') || error.message?.includes('configurado')) {
        return res.status(500).json({ 
          message: 'Serviço de email não configurado. Verifique as credenciais SMTP no arquivo .env do servidor.' 
        });
      }
      return res.status(500).json({ 
        message: 'Não foi possível enviar o email de recuperação. Tente novamente mais tarde.' 
      });
    }

    res.json({ 
      message: 'Se o email estiver cadastrado, você receberá um link para recuperação de senha.',
    });
  } catch (error: any) {
    console.error('[auth:forgot-password] Erro inesperado:', error);
    res.status(500).json({ 
      message: 'Erro ao processar solicitação de recuperação de senha. Tente novamente.' 
    });
  }
});

// Validar token de recuperação
router.get('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ 
        valid: false,
        message: 'Token não fornecido' 
      });
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return res.status(404).json({ 
        valid: false,
        message: 'Token inválido' 
      });
    }

    if (resetToken.used) {
      return res.status(400).json({ 
        valid: false,
        message: 'Este token já foi utilizado' 
      });
    }

    if (new Date() > resetToken.expiresAt) {
      return res.status(400).json({ 
        valid: false,
        message: 'Token expirado' 
      });
    }

    res.json({ 
      valid: true,
      email: resetToken.user.email,
    });
  } catch (error: any) {
    console.error('[auth:reset-password:validate] Erro:', error);
    res.status(500).json({ 
      valid: false,
      message: 'Erro ao validar token' 
    });
  }
});

// Resetar senha com token
router.post('/reset-password', [
  body('token').isString().notEmpty(),
  body('password').isLength({ min: 6 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, password } = req.body;

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!resetToken) {
    return res.status(404).json({ message: 'Token inválido' });
  }

  if (resetToken.used) {
    return res.status(400).json({ message: 'Este token já foi utilizado' });
  }

  if (new Date() > resetToken.expiresAt) {
    return res.status(400).json({ message: 'Token expirado' });
  }

  // Atualizar senha
  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: resetToken.userId },
    data: { password: hashed },
  });

  // Marcar token como usado
  await prisma.passwordResetToken.update({
    where: { id: resetToken.id },
    data: { used: true },
  });

  res.json({ message: 'Senha redefinida com sucesso' });
});

