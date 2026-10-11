-- AlterEnum
ALTER TYPE "EcfDocKind" ADD VALUE 'DELIVERY';

-- AlterTable
ALTER TABLE "ecf_documents" ADD COLUMN     "target" TEXT;

