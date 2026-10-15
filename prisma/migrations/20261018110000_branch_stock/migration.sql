-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('ENVIADA', 'RECIBIDA', 'ANULADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "InventoryType" ADD VALUE 'TRANSFER_IN';

-- DropIndex
DROP INDEX "product_batches_companyId_productId_batchNumber_key";

-- AlterTable
ALTER TABLE "product_batches" ADD COLUMN     "branchId" TEXT;

-- Relleno: los lotes existentes pertenecen a la sucursal Principal de su empresa
UPDATE "product_batches" SET "branchId" = 'brn_' || "companyId";
ALTER TABLE "product_batches" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateTable
CREATE TABLE "branch_stocks" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "branch_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'ENVIADA',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "receivedByName" TEXT,
    "receivedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "lots" JSONB,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_stocks_companyId_productId_idx" ON "branch_stocks"("companyId", "productId");

-- CreateIndex
CREATE INDEX "branch_stocks_companyId_branchId_idx" ON "branch_stocks"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "branch_stocks_branchId_productId_key" ON "branch_stocks"("branchId", "productId");

-- CreateIndex
CREATE INDEX "stock_transfers_companyId_status_idx" ON "stock_transfers"("companyId", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_companyId_createdAt_idx" ON "stock_transfers"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_companyId_transferId_idx" ON "stock_transfer_lines"("companyId", "transferId");

-- CreateIndex
CREATE INDEX "product_batches_companyId_branchId_idx" ON "product_batches"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_companyId_productId_branchId_batchNumber_key" ON "product_batches"("companyId", "productId", "branchId", "batchNumber");

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Relleno: el stock actual de cada producto queda en la sucursal Principal de su empresa
INSERT INTO "branch_stocks" ("id", "productId", "branchId", "stock", "updatedAt", "companyId")
SELECT 'bst_' || "id", "id", 'brn_' || "companyId", "stock", CURRENT_TIMESTAMP, "companyId" FROM "products";
