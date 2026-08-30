-- Direct/manual teaching sessions have no recurring schedule.
ALTER TABLE "TeachingSession" ALTER COLUMN "scheduleId" DROP NOT NULL;
ALTER TABLE "TeachingSession" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'OFFLINE';
ALTER TABLE "TeachingSession" ADD COLUMN "location" TEXT;
