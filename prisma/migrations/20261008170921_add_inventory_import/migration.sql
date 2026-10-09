-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('STAGED', 'APPLIED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('CREATE', 'UPDATE', 'INVALID');

-- CreateTable
CREATE TABLE "inventory_imports" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'STAGED',
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "supplierId" TEXT,
    "mapping" JSONB,
    "options" JSONB,
    "summary" JSONB,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "data" JSONB,
    "action" "ImportRowAction",
    "errors" JSONB,

    CONSTRAINT "inventory_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_import_rows_importId_idx" ON "inventory_import_rows"("importId");

-- AddForeignKey
ALTER TABLE "inventory_import_rows" ADD CONSTRAINT "inventory_import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "inventory_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
