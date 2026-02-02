import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

function ensureEmailConfig() {
  if (!smtpHost) {
    throw new Error('SMTP_HOST não configurado. Atualize o .env com as credenciais de email.');
  }
}

export async function sendPasswordResetEmail(email: string, token: string) {
  ensureEmailConfig();

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '');
  const resetUrl = `${frontendUrl}/recuperar-senha?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Base de Dados <no-reply@desaparecidos.gov>',
    to: email,
    subject: 'Recuperação de senha - Base de Dados de Pessoas Desaparecidas',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <h2 style="color: #0f172a;">Recuperação de senha</h2>
        <p>Recebemos um pedido para redefinir a sua senha.</p>
        <p>Para escolher uma nova senha, clique no link abaixo:</p>
        <p>
          <a href="${resetUrl}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
            Redefinir senha
          </a>
        </p>
        <p>Este link expira em 1 hora. Se você não fez este pedido, pode ignorar esta mensagem.</p>
        <p style="margin-top: 32px; font-size: 14px; color: #475569;">
          Equipa Base de Dados de Pessoas Desaparecidas
        </p>
      </div>
    `,
  });
}


