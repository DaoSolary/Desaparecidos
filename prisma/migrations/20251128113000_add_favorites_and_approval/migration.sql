-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDENTE', 'EM_ANALISE', 'ACEITE', 'REJEITADO');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUTORIDADE';

-- AlterTable
ALTER TABLE "MissingPerson" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "FavoriteCase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseReport" (
    "id" TEXT NOT NULL,
    "missingPersonId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDENTE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteCase_userId_missingPersonId_key" ON "FavoriteCase"("userId", "missingPersonId");

-- AddForeignKey
ALTER TABLE "MissingPerson" ADD CONSTRAINT "MissingPerson_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCase" ADD CONSTRAINT "FavoriteCase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteCase" ADD CONSTRAINT "FavoriteCase_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReport" ADD CONSTRAINT "CaseReport_missingPersonId_fkey" FOREIGN KEY ("missingPersonId") REFERENCES "MissingPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseReport" ADD CONSTRAINT "CaseReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
