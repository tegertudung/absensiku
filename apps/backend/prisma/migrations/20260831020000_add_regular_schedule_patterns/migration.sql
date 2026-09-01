-- Existing Schedule rows remain legacy recurring assignments. A pattern is a
-- Regular schedule row without Tutor or Subject; actual meetings stay in
-- TeachingSession and retain all historical relations.
ALTER TABLE "Schedule" ALTER COLUMN "tutorId" DROP NOT NULL;
ALTER TABLE "Schedule" ADD COLUMN "isPattern" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Schedule_isPattern_idx" ON "Schedule"("isPattern");
