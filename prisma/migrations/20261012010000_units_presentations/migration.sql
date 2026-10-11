-- AlterTable
ALTER TABLE "inventory_logs" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "product_batches" ALTER COLUMN "initialStock" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "currentStock" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'UND',
ALTER COLUMN "stock" SET DEFAULT 0,
ALTER COLUMN "stock" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "minStock" SET DEFAULT 0,
ALTER COLUMN "minStock" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "sale_batch_details" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "sale_details" ADD COLUMN     "presentationName" TEXT,
ADD COLUMN     "presentationQty" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'UND',
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "product_presentations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "barcode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_presentations_companyId_productId_idx" ON "product_presentations"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_companyId_productId_name_key" ON "product_presentations"("companyId", "productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_companyId_barcode_key" ON "product_presentations"("companyId", "barcode");

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

