import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'pretty',
  });

// Testar conexão ao inicializar
prisma.$connect().catch((error) => {
  console.error('❌ Erro ao conectar ao banco de dados:', error.message);
  console.error('📋 Verifique se o PostgreSQL está rodando em localhost:5432');
  console.error('📋 Verifique se a variável DATABASE_URL está configurada corretamente no arquivo .env');
  process.exit(1);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}


