-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'OPS', 'VIEWER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'PO_CONFIRMED', 'DOCS_IN_PREP', 'READY_TO_SHIP', 'IN_TRANSIT', 'DELIVERED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('EXPORTER', 'IMPORTER', 'CHA', 'FORWARDER', 'CARRIER', 'BANK');

-- CreateEnum
CREATE TYPE "PartyChannel" AS ENUM ('APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COMMERCIAL_INVOICE', 'PACKING_LIST', 'PURCHASE_ORDER', 'BILL_OF_LADING', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'NEEDS_REVIEW', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'APP');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageIntent" AS ENUM ('APPROVAL', 'CHANGE_REQUEST', 'QUESTION', 'DOC_SUBMISSION', 'STATUS_UPDATE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TaskSeverity" AS ENUM ('BLOCKER', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('REQUESTED', 'GRANTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AI', 'SYSTEM', 'COUNTERPARTY');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "inboundKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "poNumber" TEXT,
    "invoiceNumber" TEXT,
    "incoterm" TEXT,
    "currency" TEXT,
    "totalValue" DECIMAL(14,2),
    "originPort" TEXT,
    "destPort" TEXT,
    "originCountry" TEXT,
    "destCountry" TEXT,
    "etd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "carrierRef" TEXT,
    "inboundToken" TEXT NOT NULL,
    "lastEventSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "channel" "PartyChannel" NOT NULL DEFAULT 'EMAIL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "family" TEXT NOT NULL,
    "fileRef" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedData" JSONB,
    "confidence" DOUBLE PRECISION,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "rawText" TEXT NOT NULL,
    "externalId" TEXT,
    "parsedIntent" "MessageIntent" NOT NULL DEFAULT 'UNKNOWN',
    "parsedPayload" JSONB,
    "intentConfidence" DOUBLE PRECISION,
    "sourceSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "TaskSeverity" NOT NULL DEFAULT 'WARNING',
    "subjectRef" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "subjectRef" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'REQUESTED',
    "evidenceMessageId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "claimedByUserId" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Org_inboundKey_key" ON "Org"("inboundKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_inboundToken_key" ON "Shipment"("inboundToken");

-- CreateIndex
CREATE INDEX "Shipment_orgId_status_idx" ON "Shipment"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orgId_reference_key" ON "Shipment"("orgId", "reference");

-- CreateIndex
CREATE INDEX "Party_orgId_shipmentId_idx" ON "Party"("orgId", "shipmentId");

-- CreateIndex
CREATE INDEX "Party_email_idx" ON "Party"("email");

-- CreateIndex
CREATE INDEX "Party_phone_idx" ON "Party"("phone");

-- CreateIndex
CREATE INDEX "Document_orgId_shipmentId_idx" ON "Document"("orgId", "shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_shipmentId_family_version_key" ON "Document"("shipmentId", "family", "version");

-- CreateIndex
CREATE INDEX "Message_orgId_shipmentId_createdAt_idx" ON "Message"("orgId", "shipmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_channel_externalId_key" ON "Message"("channel", "externalId");

-- CreateIndex
CREATE INDEX "Task_orgId_status_severity_idx" ON "Task"("orgId", "status", "severity");

-- CreateIndex
CREATE INDEX "Task_orgId_shipmentId_idx" ON "Task"("orgId", "shipmentId");

-- CreateIndex
CREATE INDEX "Approval_orgId_shipmentId_idx" ON "Approval"("orgId", "shipmentId");

-- CreateIndex
CREATE INDEX "Event_orgId_createdAt_idx" ON "Event"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_shipmentId_seq_idx" ON "Event"("shipmentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Event_shipmentId_seq_key" ON "Event"("shipmentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerLink_token_key" ON "BuyerLink"("token");

-- CreateIndex
CREATE INDEX "BuyerLink_orgId_shipmentId_idx" ON "BuyerLink"("orgId", "shipmentId");

-- CreateIndex
CREATE INDEX "AiCall_orgId_createdAt_idx" ON "AiCall"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_shipmentId_idx" ON "AiCall"("shipmentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerLink" ADD CONSTRAINT "BuyerLink_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
