-- CreateEnum
CREATE TYPE "EcfMode" AS ENUM ('OFF', 'PRECERT', 'CERT', 'PROD');

-- CreateEnum
CREATE TYPE "EcfType" AS ENUM ('E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47');

-- CreateEnum
CREATE TYPE "EcfStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'CONDITIONAL', 'REJECTED', 'ERROR', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "EcfDocKind" AS ENUM ('ECF', 'RFCE', 'ARECF', 'ACECF', 'ANULACION');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "ecfApprovalUrl" TEXT,
ADD COLUMN     "ecfDirectoryCheckedAt" TIMESTAMP(3),
ADD COLUMN     "ecfIssuer" BOOLEAN,
ADD COLUMN     "ecfReceptionUrl" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "eNcf" TEXT,
ADD COLUMN     "ecfSecurityCode" TEXT,
ADD COLUMN     "ecfSignedAt" TIMESTAMP(3),
ADD COLUMN     "ecfStatus" "EcfStatus",
ADD COLUMN     "ecfTrackId" TEXT,
ADD COLUMN     "ecfType" "EcfType";

-- CreateTable
CREATE TABLE "ecf_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mode" "EcfMode" NOT NULL DEFAULT 'OFF',
    "legalName" TEXT,
    "tradeName" TEXT,
    "address" TEXT,
    "municipalityCode" TEXT,
    "provinceCode" TEXT,
    "economicActivity" TEXT,
    "certificateEnc" TEXT,
    "certificatePassEnc" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "certSubject" TEXT,
    "certSerial" TEXT,
    "certIssuer" TEXT,
    "certNotBefore" TIMESTAMP(3),
    "certNotAfter" TIMESTAMP(3),
    "certFingerprint" TEXT,
    "certRncMatch" BOOLEAN,
    "lastConnectionAt" TIMESTAMP(3),
    "lastConnectionOk" BOOLEAN,
    "lastConnectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecf_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecf_sequences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ecfType" "EcfType" NOT NULL,
    "rangeFrom" INTEGER NOT NULL DEFAULT 1,
    "rangeTo" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecf_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecf_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "saleId" TEXT,
    "kind" "EcfDocKind" NOT NULL,
    "eNcf" TEXT,
    "xml" TEXT NOT NULL,
    "status" "EcfStatus" NOT NULL DEFAULT 'PENDING',
    "trackId" TEXT,
    "dgiiCode" INTEGER,
    "dgiiMessages" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecf_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecf_inbox" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "rncEmisor" TEXT NOT NULL,
    "eNcf" TEXT NOT NULL,
    "total" DOUBLE PRECISION,
    "xml" TEXT NOT NULL,
    "arecfXml" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecf_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ecf_configs_companyId_key" ON "ecf_configs"("companyId");

-- CreateIndex
CREATE INDEX "ecf_sequences_companyId_idx" ON "ecf_sequences"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ecf_sequences_companyId_ecfType_rangeFrom_key" ON "ecf_sequences"("companyId", "ecfType", "rangeFrom");

-- CreateIndex
CREATE INDEX "ecf_documents_companyId_status_nextAttemptAt_idx" ON "ecf_documents"("companyId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ecf_documents_saleId_idx" ON "ecf_documents"("saleId");

-- CreateIndex
CREATE INDEX "ecf_inbox_companyId_idx" ON "ecf_inbox"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ecf_inbox_companyId_rncEmisor_eNcf_key" ON "ecf_inbox"("companyId", "rncEmisor", "eNcf");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_eNcf_key" ON "sales"("companyId", "eNcf");

-- AddForeignKey
ALTER TABLE "ecf_configs" ADD CONSTRAINT "ecf_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_sequences" ADD CONSTRAINT "ecf_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_documents" ADD CONSTRAINT "ecf_documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecf_inbox" ADD CONSTRAINT "ecf_inbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

