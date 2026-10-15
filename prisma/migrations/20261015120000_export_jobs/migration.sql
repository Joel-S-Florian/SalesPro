-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "rowsDone" INTEGER NOT NULL DEFAULT 0,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "error" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "companyId" TEXT NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_companyId_createdAt_idx" ON "export_jobs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

