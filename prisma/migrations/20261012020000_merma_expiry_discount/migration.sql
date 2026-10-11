-- AlterEnum
ALTER TYPE "InventoryType" ADD VALUE 'MERMA';

-- AlterTable
ALTER TABLE "sale_batch_details" ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

