-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterEnum

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "changesRequested" TEXT,
ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "lastRemindedAt" TIMESTAMP(3),
ADD COLUMN     "partyId" TEXT,
ADD COLUMN     "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "issuedByPartyId" TEXT,
ADD COLUMN     "visibleTo" "PartyType"[];

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "inReplyTo" TEXT,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "threadId" TEXT;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "canUpload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "counterpartyId" TEXT,
ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "portalEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "portalToken" TEXT,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lastProviderMessageId" TEXT,
    "referenceIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "volume" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Counterparty_orgId_type_idx" ON "Counterparty"("orgId", "type");

-- CreateIndex
CREATE INDEX "EmailThread_orgId_idx" ON "EmailThread"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_shipmentId_partyId_key" ON "EmailThread"("shipmentId", "partyId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Approval_state_dueAt_idx" ON "Approval"("state", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Party_portalToken_key" ON "Party"("portalToken");

-- CreateIndex
CREATE INDEX "Party_userId_idx" ON "Party"("userId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_issuedByPartyId_fkey" FOREIGN KEY ("issuedByPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

