-- Additive token-revocation version. Existing users remain compatible at
-- version 0; changing/resetting a password or logging out increments it.
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
