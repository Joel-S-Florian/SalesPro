-- AlterTable
ALTER TABLE "cashier_closes" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_name_key" ON "branches"("companyId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_closes" ADD CONSTRAINT "cashier_closes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Relleno: cada empresa existente recibe su sucursal Principal y todo lo anterior queda asignado a ella
INSERT INTO "branches" ("id", "name", "code", "isMain", "active", "updatedAt", "companyId")
SELECT 'brn_' || "id", 'Principal', '001', true, true, CURRENT_TIMESTAMP, "id" FROM "companies";

UPDATE "terminals" SET "branchId" = 'brn_' || "companyId" WHERE "branchId" IS NULL;
UPDATE "sales" SET "branchId" = 'brn_' || "companyId" WHERE "branchId" IS NULL;
UPDATE "cashier_closes" SET "branchId" = 'brn_' || "companyId" WHERE "branchId" IS NULL;
UPDATE "inventory_logs" SET "branchId" = 'brn_' || "companyId" WHERE "branchId" IS NULL;
