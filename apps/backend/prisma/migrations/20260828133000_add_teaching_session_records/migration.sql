-- Nullable to preserve historical teaching sessions created before structured records.
ALTER TABLE "TeachingSession"
ADD COLUMN "material" TEXT,
ADD COLUMN "teachingNotes" TEXT,
ADD COLUMN "progressNotes" TEXT,
ADD COLUMN "score" DECIMAL(65,30);
