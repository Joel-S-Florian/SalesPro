-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isPerishable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "initialStock" INTEGER NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_batch_details" (
    "id" TEXT NOT NULL,
    "saleDetailId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "sale_batch_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_batches_companyId_productId_idx" ON "product_batches"("companyId", "productId");

-- CreateIndex
CREATE INDEX "product_batches_companyId_expirationDate_idx" ON "product_batches"("companyId", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_companyId_productId_batchNumber_key" ON "product_batches"("companyId", "productId", "batchNumber");

-- CreateIndex
CREATE INDEX "sale_batch_details_companyId_saleDetailId_idx" ON "sale_batch_details"("companyId", "saleDetailId");

-- CreateIndex
CREATE INDEX "sale_batch_details_batchId_idx" ON "sale_batch_details"("batchId");

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_details" ADD CONSTRAINT "sale_batch_details_saleDetailId_fkey" FOREIGN KEY ("saleDetailId") REFERENCES "sale_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_details" ADD CONSTRAINT "sale_batch_details_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "product_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_details" ADD CONSTRAINT "sale_batch_details_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

