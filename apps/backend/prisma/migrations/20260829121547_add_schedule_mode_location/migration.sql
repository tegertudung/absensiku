-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "location" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'OFFLINE';
