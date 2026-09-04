-- Administrative profile fields are nullable to preserve all existing students.
ALTER TABLE "Student" ADD COLUMN "nis" TEXT;
ALTER TABLE "Student" ADD COLUMN "school" TEXT;
ALTER TABLE "Student" ADD COLUMN "schoolClass" TEXT;

CREATE TABLE "StudentLetter" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "letterNumber" TEXT NOT NULL,
  "letterDate" TIMESTAMP(3) NOT NULL,
  "studentName" TEXT NOT NULL,
  "studentNis" TEXT NOT NULL,
  "studentSchool" TEXT NOT NULL,
  "studentSchoolClass" TEXT NOT NULL,
  "programName" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "verificationCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentLetterSchedule" (
  "id" TEXT NOT NULL,
  "studentLetterId" TEXT NOT NULL,
  "meetingNumber" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentLetterSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentLetter_verificationCode_key" ON "StudentLetter"("verificationCode");
CREATE INDEX "StudentLetter_studentId_idx" ON "StudentLetter"("studentId");
CREATE INDEX "StudentLetter_letterNumber_idx" ON "StudentLetter"("letterNumber");
CREATE INDEX "StudentLetter_letterDate_idx" ON "StudentLetter"("letterDate");
CREATE UNIQUE INDEX "StudentLetterSchedule_studentLetterId_meetingNumber_key" ON "StudentLetterSchedule"("studentLetterId", "meetingNumber");
CREATE INDEX "StudentLetterSchedule_studentLetterId_idx" ON "StudentLetterSchedule"("studentLetterId");
ALTER TABLE "StudentLetter" ADD CONSTRAINT "StudentLetter_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentLetterSchedule" ADD CONSTRAINT "StudentLetterSchedule_studentLetterId_fkey" FOREIGN KEY ("studentLetterId") REFERENCES "StudentLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
