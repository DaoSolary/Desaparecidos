-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('FAQ', 'INSTRUCOES', 'CONTACTO_EMERGENCIA', 'SOBRE_NOS', 'TERMOS_USO', 'POLITICA_PRIVACIDADE', 'OUTRO');

-- CreateEnum
CREATE TYPE "ConfigCategory" AS ENUM ('GENERAL', 'LIMITES_USO', 'BACKUP', 'SEGURANCA', 'NOTIFICACOES');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('FULL', 'DATABASE_ONLY', 'FILES_ONLY', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "MissingPerson" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InstitutionalContent" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionalContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" "ConfigCategory" NOT NULL DEFAULT 'GENERAL',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedCase" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseData" JSONB NOT NULL,
    "deletedBy" TEXT NOT NULL,
    "deletionReason" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoredBy" TEXT,

    CONSTRAINT "DeletedCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "type" "BackupType" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "fileSize" INTEGER,
    "startedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstitutionalContent_type_idx" ON "InstitutionalContent"("type");

-- CreateIndex
CREATE INDEX "InstitutionalContent_isActive_idx" ON "InstitutionalContent"("isActive");

-- CreateIndex
CREATE INDEX "InstitutionalContent_order_idx" ON "InstitutionalContent"("order");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_category_idx" ON "SystemConfig"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DeletedCase_caseId_key" ON "DeletedCase"("caseId");

-- CreateIndex
CREATE INDEX "DeletedCase_deletedBy_idx" ON "DeletedCase"("deletedBy");

-- CreateIndex
CREATE INDEX "DeletedCase_deletedAt_idx" ON "DeletedCase"("deletedAt");

-- CreateIndex
CREATE INDEX "DeletedCase_restoredAt_idx" ON "DeletedCase"("restoredAt");

-- CreateIndex
CREATE INDEX "Backup_type_idx" ON "Backup"("type");

-- CreateIndex
CREATE INDEX "Backup_status_idx" ON "Backup"("status");

-- CreateIndex
CREATE INDEX "Backup_startedAt_idx" ON "Backup"("startedAt");

-- AddForeignKey
ALTER TABLE "InstitutionalContent" ADD CONSTRAINT "InstitutionalContent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstitutionalContent" ADD CONSTRAINT "InstitutionalContent_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedCase" ADD CONSTRAINT "DeletedCase_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletedCase" ADD CONSTRAINT "DeletedCase_restoredBy_fkey" FOREIGN KEY ("restoredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backup" ADD CONSTRAINT "Backup_startedBy_fkey" FOREIGN KEY ("startedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
