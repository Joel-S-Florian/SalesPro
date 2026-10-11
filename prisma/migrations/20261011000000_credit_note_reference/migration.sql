-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "relatedSaleId" TEXT,
ALTER COLUMN "ncfType" SET DEFAULT 'B02';

-- CreateIndex
CREATE INDEX "sales_relatedSaleId_idx" ON "sales"("relatedSaleId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_relatedSaleId_fkey" FOREIGN KEY ("relatedSaleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

