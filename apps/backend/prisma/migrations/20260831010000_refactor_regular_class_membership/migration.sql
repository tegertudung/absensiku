-- A regular class is a learning group. Subject remains attached to schedules
-- and teaching sessions, where historical subject data is preserved.
DROP INDEX IF EXISTS "Class_subjectId_idx";
ALTER TABLE "Class" DROP CONSTRAINT IF EXISTS "Class_subjectId_fkey";
ALTER TABLE "Class" DROP COLUMN IF EXISTS "subjectId";

-- maxStudents was only a UI-level enrollment limit and was not used by
-- scheduling, sessions, attendance, or quota consumption.
ALTER TABLE "Class" DROP COLUMN IF EXISTS "maxStudents";
