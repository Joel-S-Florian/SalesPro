-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "ecfStampUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ecf_documents_saleId_kind_key" ON "ecf_documents"("saleId", "kind");

