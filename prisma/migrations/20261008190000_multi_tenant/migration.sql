-- Multi-cliente: introduce la tabla companies y asigna todos los datos existentes a una empresa inicial.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN';

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rnc" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_rnc_key" ON "companies"("rnc");

-- Empresa inicial: hereda el nombre configurado del negocio (si existe)
INSERT INTO "companies" ("id", "name", "updatedAt")
VALUES (
    'cmp_default',
    COALESCE(
        (SELECT NULLIF(TRIM("value"->>'name'), '') FROM "system_config" WHERE "key" = 'business' LIMIT 1),
        'Mi Empresa'
    ),
    CURRENT_TIMESTAMP
);

-- DropIndex
DROP INDEX "categories_name_key";

-- DropIndex
DROP INDEX "customers_documentId_key";

-- DropIndex
DROP INDEX "ncf_sequences_ncfType_key";

-- DropIndex
DROP INDEX "products_code_key";

-- DropIndex
DROP INDEX "sales_invoiceNumber_key";

-- DropIndex
DROP INDEX "suppliers_rnc_key";

-- DropIndex
DROP INDEX "terminals_name_key";

-- Columna companyId: se agrega nullable, se rellena y luego se vuelve obligatoria
ALTER TABLE "cashier_closes" ADD COLUMN "companyId" TEXT;
ALTER TABLE "categories" ADD COLUMN "companyId" TEXT;
ALTER TABLE "customers" ADD COLUMN "companyId" TEXT;
ALTER TABLE "inventory_logs" ADD COLUMN "companyId" TEXT;
ALTER TABLE "ncf_sequences" ADD COLUMN "companyId" TEXT;
ALTER TABLE "products" ADD COLUMN "companyId" TEXT;
ALTER TABLE "sale_details" ADD COLUMN "companyId" TEXT;
ALTER TABLE "sales" ADD COLUMN "companyId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "companyId" TEXT;
ALTER TABLE "users" ADD COLUMN "companyId" TEXT;

UPDATE "cashier_closes" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "categories" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "customers" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "inventory_logs" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "ncf_sequences" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "products" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "sale_details" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "sales" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "audit_logs" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "users" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "inventory_imports" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "suppliers" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "system_config" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;
UPDATE "terminals" SET "companyId" = 'cmp_default' WHERE "companyId" IS NULL;

ALTER TABLE "cashier_closes" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "inventory_logs" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ncf_sequences" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sale_details" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "sales" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "inventory_imports" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "system_config" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "terminals" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "system_config" DROP CONSTRAINT "system_config_pkey", ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("companyId", "key");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_idx" ON "audit_logs"("companyId");

-- CreateIndex
CREATE INDEX "cashier_closes_companyId_idx" ON "cashier_closes"("companyId");

-- CreateIndex
CREATE INDEX "categories_companyId_idx" ON "categories"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_companyId_name_key" ON "categories"("companyId", "name");

-- CreateIndex
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_documentId_key" ON "customers"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "inventory_imports_companyId_idx" ON "inventory_imports"("companyId");

-- CreateIndex
CREATE INDEX "inventory_logs_companyId_idx" ON "inventory_logs"("companyId");

-- CreateIndex
CREATE INDEX "ncf_sequences_companyId_idx" ON "ncf_sequences"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ncf_sequences_companyId_ncfType_key" ON "ncf_sequences"("companyId", "ncfType");

-- CreateIndex
CREATE INDEX "products_companyId_idx" ON "products"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_code_key" ON "products"("companyId", "code");

-- CreateIndex
CREATE INDEX "sale_details_companyId_idx" ON "sale_details"("companyId");

-- CreateIndex
CREATE INDEX "sales_companyId_idx" ON "sales"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_invoiceNumber_key" ON "sales"("companyId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "suppliers_companyId_idx" ON "suppliers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_companyId_rnc_key" ON "suppliers"("companyId", "rnc");

-- CreateIndex
CREATE INDEX "terminals_companyId_idx" ON "terminals"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_companyId_name_key" ON "terminals"("companyId", "name");

-- CreateIndex
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_details" ADD CONSTRAINT "sale_details_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_closes" ADD CONSTRAINT "cashier_closes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_imports" ADD CONSTRAINT "inventory_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ncf_sequences" ADD CONSTRAINT "ncf_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

