-- CreateEnum
CREATE TYPE "BadgeType" AS ENUM ('FIRST_CASE', 'ACTIVE_CONTRIBUTOR', 'HELPER', 'VERIFIED', 'TOP_REPORTER', 'COMMUNITY_HERO');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'RESOLVIDO', 'FECHADO');

-- AlterTable
ALTER TABLE "Sighting" ADD COLUMN     "reporterId" TEXT;

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeType" "BadgeType" NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "ChatStatus" NOT NULL DEFAULT 'ABERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeType_key" ON "UserBadge"("userId", "badgeType");

-- CreateIndex
CREATE INDEX "AuthorityChat_userId_idx" ON "AuthorityChat"("userId");

-- CreateIndex
CREATE INDEX "AuthorityChat_authorityId_idx" ON "AuthorityChat"("authorityId");

-- CreateIndex
CREATE INDEX "AuthorityChatMessage_chatId_idx" ON "AuthorityChatMessage"("chatId");

-- AddForeignKey
ALTER TABLE "Sighting" ADD CONSTRAINT "Sighting_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityChat" ADD CONSTRAINT "AuthorityChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityChat" ADD CONSTRAINT "AuthorityChat_authorityId_fkey" FOREIGN KEY ("authorityId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityChatMessage" ADD CONSTRAINT "AuthorityChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AuthorityChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityChatMessage" ADD CONSTRAINT "AuthorityChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
