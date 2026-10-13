-- AlterTable
ALTER TABLE "cashier_closes" ADD COLUMN     "openingCount" JSONB;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "cashChange" JSONB,
ADD COLUMN     "cashReceived" JSONB;

