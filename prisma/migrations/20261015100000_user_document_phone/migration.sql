-- AlterTable
ALTER TABLE "users" ADD COLUMN     "documentId" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_companyId_documentId_key" ON "users"("companyId", "documentId");

