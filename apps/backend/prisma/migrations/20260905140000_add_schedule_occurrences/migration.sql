-- Generated class meetings are Schedule occurrences linked to their weekly
-- template. This is additive: existing patterns and TeachingSession history
-- remain untouched.
ALTER TABLE "Schedule" ADD COLUMN "patternId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN "occurrenceDate" TIMESTAMP(3);
ALTER TABLE "Schedule" ADD COLUMN "occurrenceSequence" INTEGER;

ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_patternId_fkey"
  FOREIGN KEY ("patternId") REFERENCES "Schedule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Schedule_patternId_occurrenceDate_idx"
  ON "Schedule"("patternId", "occurrenceDate");
CREATE UNIQUE INDEX "Schedule_patternId_occurrenceDate_startTime_key"
  ON "Schedule"("patternId", "occurrenceDate", "startTime");
