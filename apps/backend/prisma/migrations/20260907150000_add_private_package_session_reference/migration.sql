-- Pin private schedules and teaching sessions to their package source.
-- Nullable fields preserve all historical rows without a reset or backfill guess.
ALTER TABLE "Schedule" ADD COLUMN "privatePackageId" TEXT;
ALTER TABLE "TeachingSession" ADD COLUMN "privatePackageId" TEXT;

CREATE INDEX "Schedule_privatePackageId_idx" ON "Schedule"("privatePackageId");
CREATE INDEX "TeachingSession_privatePackageId_idx" ON "TeachingSession"("privatePackageId");

ALTER TABLE "Schedule"
  ADD CONSTRAINT "Schedule_privatePackageId_fkey"
  FOREIGN KEY ("privatePackageId") REFERENCES "PrivatePackage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeachingSession"
  ADD CONSTRAINT "TeachingSession_privatePackageId_fkey"
  FOREIGN KEY ("privatePackageId") REFERENCES "PrivatePackage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
