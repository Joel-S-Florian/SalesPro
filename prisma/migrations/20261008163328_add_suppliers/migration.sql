-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rnc" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_rnc_key" ON "suppliers"("rnc");

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: crea un proveedor por cada nombre distinto usado en compras previas y los enlaza
INSERT INTO "suppliers" ("id", "name", "updatedAt")
SELECT 'sup_' || md5(lower(trim("supplier"))), min(trim("supplier")), CURRENT_TIMESTAMP
FROM "inventory_logs"
WHERE "supplier" IS NOT NULL AND trim("supplier") <> ''
GROUP BY lower(trim("supplier"));

UPDATE "inventory_logs"
SET "supplierId" = 'sup_' || md5(lower(trim("supplier")))
WHERE "supplier" IS NOT NULL AND trim("supplier") <> '';
