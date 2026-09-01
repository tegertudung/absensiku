ALTER TABLE "TeachingSession"
ADD COLUMN "patternOccurrenceDate" TIMESTAMP(3);

ALTER TABLE "TeachingSession"
DROP CONSTRAINT IF EXISTS "TeachingSession_scheduleId_fkey";

ALTER TABLE "TeachingSession"
ADD CONSTRAINT "TeachingSession_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TeachingSession_scheduleId_patternOccurrenceDate_idx"
ON "TeachingSession"("scheduleId", "patternOccurrenceDate");
