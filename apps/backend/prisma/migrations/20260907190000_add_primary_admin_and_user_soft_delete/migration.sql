ALTER TABLE "User"
ADD COLUMN "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Preserve the legacy account when the final primary address is not present,
-- then promote only the canonical account. No account is deleted or merged.
UPDATE "User"
SET "email" = 'admin@pioneerclass.com'
WHERE "email" = 'admin@pionerclass.com'
  AND "role" = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM "User" WHERE "email" = 'admin@pioneerclass.com'
  );

UPDATE "User"
SET "isPrimaryAdmin" = true,
    "isActive" = true,
    "deletedAt" = NULL
WHERE "email" = 'admin@pioneerclass.com'
  AND "role" = 'ADMIN';

CREATE UNIQUE INDEX "User_single_primary_admin"
ON "User" ("isPrimaryAdmin")
WHERE "isPrimaryAdmin" = true;

CREATE INDEX "User_deletedAt_idx" ON "User" ("deletedAt");
