ALTER TABLE "Tutor" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Tutor_deletedAt_idx" ON "Tutor"("deletedAt");
