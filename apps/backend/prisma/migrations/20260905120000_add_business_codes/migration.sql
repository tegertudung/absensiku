-- Human-readable business identifiers. UUID primary/foreign keys remain intact.
ALTER TABLE "Tutor" ADD COLUMN "tutorCode" TEXT;
ALTER TABLE "Student" ADD COLUMN "studentCode" TEXT;
ALTER TABLE "Parent" ADD COLUMN "parentCode" TEXT;

CREATE SEQUENCE "Tutor_tutorCode_seq";
CREATE SEQUENCE "Student_studentCode_seq";
CREATE SEQUENCE "Parent_parentCode_seq";

-- Stable, deterministic backfill for existing rows.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS number
  FROM "Tutor"
)
UPDATE "Tutor" AS target
SET "tutorCode" = 'TTR-' || CASE WHEN numbered.number < 10000
  THEN LPAD(numbered.number::TEXT, 4, '0') ELSE numbered.number::TEXT END
FROM numbered WHERE target."id" = numbered."id";

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS number
  FROM "Student"
)
UPDATE "Student" AS target
SET "studentCode" = 'SIS-' || CASE WHEN numbered.number < 10000
  THEN LPAD(numbered.number::TEXT, 4, '0') ELSE numbered.number::TEXT END
FROM numbered WHERE target."id" = numbered."id";

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS number
  FROM "Parent"
)
UPDATE "Parent" AS target
SET "parentCode" = 'ORT-' || CASE WHEN numbered.number < 10000
  THEN LPAD(numbered.number::TEXT, 4, '0') ELSE numbered.number::TEXT END
FROM numbered WHERE target."id" = numbered."id";

SELECT setval('"Tutor_tutorCode_seq"', GREATEST((SELECT COUNT(*) FROM "Tutor"), 1), EXISTS (SELECT 1 FROM "Tutor"));
SELECT setval('"Student_studentCode_seq"', GREATEST((SELECT COUNT(*) FROM "Student"), 1), EXISTS (SELECT 1 FROM "Student"));
SELECT setval('"Parent_parentCode_seq"', GREATEST((SELECT COUNT(*) FROM "Parent"), 1), EXISTS (SELECT 1 FROM "Parent"));

ALTER TABLE "Tutor" ALTER COLUMN "tutorCode" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "studentCode" SET NOT NULL;
ALTER TABLE "Parent" ALTER COLUMN "parentCode" SET NOT NULL;

CREATE UNIQUE INDEX "Tutor_tutorCode_key" ON "Tutor"("tutorCode");
CREATE UNIQUE INDEX "Student_studentCode_key" ON "Student"("studentCode");
CREATE UNIQUE INDEX "Parent_parentCode_key" ON "Parent"("parentCode");
