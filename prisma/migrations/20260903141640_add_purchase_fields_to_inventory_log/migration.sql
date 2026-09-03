-- AlterTable
ALTER TABLE "inventory_logs" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "supplier" TEXT,
ADD COLUMN     "totalCost" DOUBLE PRECISION,
ADD COLUMN     "unitCost" DOUBLE PRECISION;
