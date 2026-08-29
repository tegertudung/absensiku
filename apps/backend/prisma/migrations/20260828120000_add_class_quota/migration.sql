-- Existing classes receive a fresh 24-meeting cycle. Historical use is not
-- inferred because sessions predating this feature cannot reliably establish
-- a class quota history.
ALTER TABLE "Class"
ADD COLUMN "quotaTotal" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "quotaUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "quotaRemaining" INTEGER NOT NULL DEFAULT 24;
