-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CIDADAO', 'FAMILIAR', 'VOLUNTARIO', 'MODERADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('GERAL', 'CRIANCA', 'IDOSO', 'DEFICIENCIA', 'URGENTE');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ABERTO', 'EM_INVESTIGACAO', 'AVISTADO', 'ENCONTRADO', 'ENCERRADO');

-- CreateEnum
CREATE TYPE "SightingStatus" AS ENUM ('PENDENTE', 'VALIDADO', 'DESCARTADO');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PUSH', 'EMAIL', 'SMS', 'APLICATIVO');

-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('FAMILIARES', 'ANONIMO', 'AUTORIDADES');

-- CreateEnum
CREATE TYPE "ThreadVisibility" AS ENUM ('PUBLICO', 'PRIVADO');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('PLANEJADA', 'ATIVA', 'PAUSADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CIDADAO',
    "province" TEXT,
    "municipality" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingPerson" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "alias" TEXT,
    "age" INTEGER,
    "gender" "Gender",
    "missingDate" TIMESTAMP(3) NOT NULL,
    "lastSeenLocation" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "municipality" TEXT,
    "description" TEXT,
    "circumstances" TEXT,
    "healthConditions" TEXT,
    "priority" "PriorityLevel" NOT NULL DEFAULT 'GERAL',
    "status" "CaseStatus" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignalLat" DOUBLE PRECISION,
    "lastSignalLng" DOUBLE PRECISION,
    "lastSignalSource" TEXT,
    "reporterId" TEXT NOT NULL,

    CONSTRAINT "MissingPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissingPersonPhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "missingPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissingPersonPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sighting" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterContact" TEXT,
    "description" TEXT,
    "province" TEXT,
    "municipality" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "SightingStatus" NOT NULL DEFAULT 'PENDENTE',
    "evidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "province" TEXT,
    "municipality" TEXT,
    "radiusKm" INTEGER DEFAULT 25,
    "filters" JSONB,
    "type" "AlertType" NOT NULL DEFAULT 'APLICATIVO',
    "deviceToken" TEXT,
    "lastNotified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "ChatType" NOT NULL DEFAULT 'FAMILIARES',
    "visibility" "ThreadVisibility" NOT NULL DEFAULT 'PRIVADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerMission" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "province" TEXT NOT NULL,
    "municipality" TEXT,
    "status" "MissionStatus" NOT NULL DEFAULT 'PLANEJADA',
    "priority" "PriorityLevel" NOT NULL DEFAULT 'GERAL',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "checkpoints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCheckIn" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseHistory" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "MissingPerson" ADD CONSTRAINT "MissingPerson_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissingPersonPhoto" ADD CONSTRAINT "MissingPersonPhoto_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sighting" ADD CONSTRAINT "Sighting_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSubscription" ADD CONSTRAINT "AlertSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerMission" ADD CONSTRAINT "VolunteerMission_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCheckIn" ADD CONSTRAINT "MissionCheckIn_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "VolunteerMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCheckIn" ADD CONSTRAINT "MissionCheckIn_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertLog" ADD CONSTRAINT "AlertLog_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseHistory" ADD CONSTRAINT "CaseHistory_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
