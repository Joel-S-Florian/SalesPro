-- CreateEnum
CREATE TYPE "CardProvider" AS ENUM ('NONE', 'MANUAL', 'SIMULATOR', 'AZUL');

-- CreateEnum
CREATE TYPE "CardPaymentStatus" AS ENUM ('APPROVED', 'DECLINED', 'VOIDED', 'ERROR');

-- CreateTable
CREATE TABLE "card_provider_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "CardProvider" NOT NULL DEFAULT 'NONE',
    "mode" TEXT NOT NULL DEFAULT 'TEST',
    "merchantId" TEXT,
    "terminalCode" TEXT,
    "secretEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "CardProvider" NOT NULL,
    "status" "CardPaymentStatus" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "authCode" TEXT,
    "last4" TEXT,
    "brand" TEXT,
    "reference" TEXT,
    "message" TEXT,
    "terminalId" TEXT,
    "userId" TEXT NOT NULL,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_provider_configs_companyId_key" ON "card_provider_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "card_payments_saleId_key" ON "card_payments"("saleId");

-- CreateIndex
CREATE INDEX "card_payments_companyId_createdAt_idx" ON "card_payments"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "card_provider_configs" ADD CONSTRAINT "card_provider_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

