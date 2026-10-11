-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('STARTER', 'BUSINESS', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "plan" "PlanType" NOT NULL DEFAULT 'STARTER',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "businessType" TEXT,
    "contact" TEXT NOT NULL,
    "note" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "companyId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_status_createdAt_idx" ON "leads"("status", "createdAt");

