/*
  Warnings:

  - You are about to drop the column `payload` on the `AuditLog` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('PENDENTE', 'CONFIRMADO', 'REJEITADO', 'RESOLVIDO');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('POLICIA', 'PROTECAO_CIVIL', 'ORGAO_PARCEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "ForwardingStatus" AS ENUM ('ENVIADO', 'RECEBIDO', 'EM_ANALISE', 'ACEITE', 'REJEITADO');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('METADATA', 'MANIPULATION_DETECTION', 'QUALITY_CHECK', 'FULL_ANALYSIS');

-- AlterTable
ALTER TABLE "AuditLog" DROP COLUMN "payload",
ADD COLUMN     "details" TEXT,
ADD COLUMN     "entityId" TEXT,
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "DuplicateCase" (
    "id" TEXT NOT NULL,
    "originalCaseId" TEXT NOT NULL,
    "duplicateCaseId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "detectedBy" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'PENDENTE',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,

    CONSTRAINT "DuplicateCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseForwarding" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "forwardedBy" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ForwardingStatus" NOT NULL DEFAULT 'ENVIADO',
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseForwarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAnalysis" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "analysisType" "AnalysisType" NOT NULL,
    "result" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isManipulated" BOOLEAN NOT NULL DEFAULT false,
    "manipulationDetails" TEXT,
    "analyzedBy" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateCase_originalCaseId_idx" ON "DuplicateCase"("originalCaseId");

-- CreateIndex
CREATE INDEX "DuplicateCase_duplicateCaseId_idx" ON "DuplicateCase"("duplicateCaseId");

-- CreateIndex
CREATE INDEX "DuplicateCase_status_idx" ON "DuplicateCase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCase_originalCaseId_duplicateCaseId_key" ON "DuplicateCase"("originalCaseId", "duplicateCaseId");

-- CreateIndex
CREATE INDEX "ExternalPartner_type_idx" ON "ExternalPartner"("type");

-- CreateIndex
CREATE INDEX "ExternalPartner_isActive_idx" ON "ExternalPartner"("isActive");

-- CreateIndex
CREATE INDEX "CaseForwarding_missingPersonId_idx" ON "CaseForwarding"("missingPersonId");

-- CreateIndex
CREATE INDEX "CaseForwarding_partnerId_idx" ON "CaseForwarding"("partnerId");

-- CreateIndex
CREATE INDEX "CaseForwarding_status_idx" ON "CaseForwarding"("status");

-- CreateIndex
CREATE INDEX "CaseForwarding_createdAt_idx" ON "CaseForwarding"("createdAt");

-- CreateIndex
CREATE INDEX "ImageAnalysis_photoId_idx" ON "ImageAnalysis"("photoId");

-- CreateIndex
CREATE INDEX "ImageAnalysis_isManipulated_idx" ON "ImageAnalysis"("isManipulated");

-- CreateIndex
CREATE INDEX "ImageAnalysis_analyzedAt_idx" ON "ImageAnalysis"("analyzedAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DuplicateCase" ADD CONSTRAINT "DuplicateCase_originalCaseId_fkey" FOREIGN KEY ("originalCaseId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCase" ADD CONSTRAINT "DuplicateCase_duplicateCaseId_fkey" FOREIGN KEY ("duplicateCaseId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseForwarding" ADD CONSTRAINT "CaseForwarding_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseForwarding" ADD CONSTRAINT "CaseForwarding_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ExternalPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseForwarding" ADD CONSTRAINT "CaseForwarding_forwardedBy_fkey" FOREIGN KEY ("forwardedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAnalysis" ADD CONSTRAINT "ImageAnalysis_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MissingPersonPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
