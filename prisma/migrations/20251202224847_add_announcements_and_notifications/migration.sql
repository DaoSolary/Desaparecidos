-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('NOTICIA', 'ALERTA_URGENTE', 'INSTRUCAO', 'MANUTENCAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "GlobalAnnouncement" (
    "id" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetRoles" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationConfig" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "template" TEXT,
    "targetRoles" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlobalAnnouncement_type_idx" ON "GlobalAnnouncement"("type");

-- CreateIndex
CREATE INDEX "GlobalAnnouncement_isActive_idx" ON "GlobalAnnouncement"("isActive");

-- CreateIndex
CREATE INDEX "GlobalAnnouncement_priority_idx" ON "GlobalAnnouncement"("priority");

-- CreateIndex
CREATE INDEX "GlobalAnnouncement_expiresAt_idx" ON "GlobalAnnouncement"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationConfig_eventType_key" ON "NotificationConfig"("eventType");

-- CreateIndex
CREATE INDEX "NotificationConfig_eventType_idx" ON "NotificationConfig"("eventType");

-- CreateIndex
CREATE INDEX "NotificationConfig_enabled_idx" ON "NotificationConfig"("enabled");

-- AddForeignKey
ALTER TABLE "GlobalAnnouncement" ADD CONSTRAINT "GlobalAnnouncement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationConfig" ADD CONSTRAINT "NotificationConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
