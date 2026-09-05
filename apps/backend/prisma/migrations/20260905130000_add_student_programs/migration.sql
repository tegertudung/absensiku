-- Additive, historical Student <-> Program membership. Existing operational
-- enrollments/packages are preserved and copied where their Program is known.
CREATE TABLE "StudentProgram" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "classId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentProgram_pkey" PRIMARY KEY ("id")
);

-- PostgreSQL requires the conflict target to be backed by a unique index or
-- constraint before an INSERT ... ON CONFLICT statement is executed.
CREATE UNIQUE INDEX "StudentProgram_studentId_programId_key" ON "StudentProgram"("studentId", "programId");

INSERT INTO "StudentProgram" ("id", "studentId", "programId", "classId", "status", "createdAt", "updatedAt")
SELECT md5('student-program-class-' || ce."id"), ce."studentId", c."programId", ce."classId", ce."status", ce."createdAt", ce."createdAt"
FROM "ClassEnrollment" ce
JOIN "Class" c ON c."id" = ce."classId"
WHERE c."programId" IS NOT NULL
ON CONFLICT ("studentId", "programId") DO NOTHING;

INSERT INTO "StudentProgram" ("id", "studentId", "programId", "status", "createdAt", "updatedAt")
SELECT md5('student-program-package-' || pp."id"), pp."studentId", pp."programId",
       CASE WHEN pp."status" = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END, pp."createdAt", pp."createdAt"
FROM "PrivatePackage" pp
WHERE pp."programId" IS NOT NULL
ON CONFLICT ("studentId", "programId") DO NOTHING;

CREATE INDEX "StudentProgram_studentId_status_idx" ON "StudentProgram"("studentId", "status");
CREATE INDEX "StudentProgram_programId_status_idx" ON "StudentProgram"("programId", "status");
CREATE INDEX "StudentProgram_classId_idx" ON "StudentProgram"("classId");

ALTER TABLE "StudentProgram" ADD CONSTRAINT "StudentProgram_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentProgram" ADD CONSTRAINT "StudentProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProgram" ADD CONSTRAINT "StudentProgram_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
