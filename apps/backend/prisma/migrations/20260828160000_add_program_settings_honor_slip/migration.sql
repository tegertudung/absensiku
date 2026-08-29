CREATE TABLE "Program" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "learningModel" TEXT NOT NULL,
  "usesQuota" BOOLEAN NOT NULL DEFAULT true,
  "defaultMeetingQuota" INTEGER NOT NULL DEFAULT 24,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");
CREATE TABLE "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "Tutor" ADD COLUMN "title" TEXT;
ALTER TABLE "Class" ADD COLUMN "programId" TEXT;
ALTER TABLE "Schedule" ADD COLUMN "programId" TEXT;
ALTER TABLE "TeachingSession" ADD COLUMN "programId" TEXT;
ALTER TABLE "PrivatePackage" ADD COLUMN "programId" TEXT;
ALTER TABLE "HonorRate" ADD COLUMN "programId" TEXT;
CREATE INDEX "Class_programId_idx" ON "Class"("programId");
CREATE INDEX "Schedule_programId_idx" ON "Schedule"("programId");
CREATE INDEX "TeachingSession_programId_idx" ON "TeachingSession"("programId");
CREATE INDEX "PrivatePackage_programId_idx" ON "PrivatePackage"("programId");
CREATE INDEX "HonorRate_programId_idx" ON "HonorRate"("programId");
ALTER TABLE "Class" ADD CONSTRAINT "Class_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeachingSession" ADD CONSTRAINT "TeachingSession_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivatePackage" ADD CONSTRAINT "PrivatePackage_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HonorRate" ADD CONSTRAINT "HonorRate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HonorRateHistory" ADD CONSTRAINT "HonorRateHistory_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "HonorRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "Program" ("id", "code", "name", "learningModel", "usesQuota", "defaultMeetingQuota", "isActive", "createdAt", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'REGULAR', 'Reguler', 'CLASS_BASED', true, 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'PRIVATE', 'Privat', 'INDIVIDUAL', true, 24, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
UPDATE "Class" SET "programId" = (SELECT id FROM "Program" WHERE code = 'REGULAR') WHERE "programId" IS NULL;
UPDATE "PrivatePackage" SET "programId" = (SELECT id FROM "Program" WHERE code = 'PRIVATE') WHERE "programId" IS NULL;
UPDATE "Schedule" SET "programId" = (SELECT id FROM "Program" WHERE code = "Schedule"."sessionType") WHERE "programId" IS NULL AND "sessionType" IN ('REGULAR','PRIVATE');
UPDATE "TeachingSession" SET "programId" = (SELECT id FROM "Program" WHERE code = "TeachingSession"."sessionType") WHERE "programId" IS NULL AND "sessionType" IN ('REGULAR','PRIVATE');
UPDATE "HonorRate" SET "programId" = (SELECT id FROM "Program" WHERE code = "HonorRate"."sessionType") WHERE "programId" IS NULL AND "sessionType" IN ('REGULAR','PRIVATE');
