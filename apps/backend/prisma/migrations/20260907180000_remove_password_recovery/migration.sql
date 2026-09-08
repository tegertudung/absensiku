-- Forward-only removal of the explicitly cancelled password-recovery feature.
DROP TABLE "PasswordResetToken";
ALTER TABLE "User" DROP COLUMN "recoveryEmail";
