import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

async function main() {
  const defaultPassword = await bcrypt.hash('Seguranca@123', 10);

  // 1. Administrador
  const admin = await prisma.user.upsert({
    where: { email: 'admin@desaparecidos.gov' },
    create: {
      fullName: 'Administrador Nacional',
      email: 'admin@desaparecidos.gov',
      password: defaultPassword,
      role: 'ADMIN',
      phone: '+244900000000',
      province: 'Luanda',
      municipality: 'Luanda',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Administrador criado:', admin.email);

  // 2. Cidadão
  const cidadao = await prisma.user.upsert({
    where: { email: 'cidadao@teste.com' },
    create: {
      fullName: 'João Silva',
      email: 'cidadao@teste.com',
      password: defaultPassword,
      role: 'CIDADAO',
      phone: '+244923456789',
      province: 'Luanda',
      municipality: 'Belas',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Cidadão criado:', cidadao.email);

  // 3. Moderador
  const moderador = await prisma.user.upsert({
    where: { email: 'moderador@desaparecidos.gov' },
    create: {
      fullName: 'Maria Santos - Moderadora',
      email: 'moderador@desaparecidos.gov',
      password: defaultPassword,
      role: 'MODERADOR',
      phone: '+244912345678',
      province: 'Luanda',
      municipality: 'Kilamba Kiaxi',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Moderador criado:', moderador.email);

  // 4. Autoridade (Polícia/SIC/Proteção Civil)
  const autoridade = await prisma.user.upsert({
    where: { email: 'autoridade@desaparecidos.gov' },
    create: {
      fullName: 'Capitão Pedro Costa - Polícia Nacional',
      email: 'autoridade@desaparecidos.gov',
      password: defaultPassword,
      role: 'AUTORIDADE',
      phone: '+244934567890',
      province: 'Luanda',
      municipality: 'Cazenga',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Autoridade criada:', autoridade.email);

  // 5. Familiar
  const familiar = await prisma.user.upsert({
    where: { email: 'familiar@teste.com' },
    create: {
      fullName: 'Ana Oliveira - Familiar',
      email: 'familiar@teste.com',
      password: defaultPassword,
      role: 'FAMILIAR',
      phone: '+244945678901',
      province: 'Benguela',
      municipality: 'Benguela',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Familiar criado:', familiar.email);

  // 6. Voluntário
  const voluntario = await prisma.user.upsert({
    where: { email: 'voluntario@teste.com' },
    create: {
      fullName: 'Carlos Mendes - Voluntário',
      email: 'voluntario@teste.com',
      password: defaultPassword,
      role: 'VOLUNTARIO',
      phone: '+244956789012',
      province: 'Huíla',
      municipality: 'Lubango',
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log('✅ Voluntário criado:', voluntario.email);

  console.log('\n📋 Resumo de usuários criados:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 ADMIN:        admin@desaparecidos.gov');
  console.log('👤 CIDADAO:      cidadao@teste.com');
  console.log('👤 MODERADOR:    moderador@desaparecidos.gov');
  console.log('👤 AUTORIDADE:   autoridade@desaparecidos.gov');
  console.log('👤 FAMILIAR:     familiar@teste.com');
  console.log('👤 VOLUNTARIO:   voluntario@teste.com');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔑 Senha padrão para todos: Seguranca@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());


