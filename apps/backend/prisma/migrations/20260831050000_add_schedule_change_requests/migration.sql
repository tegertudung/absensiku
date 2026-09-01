CREATE TABLE "ScheduleChangeRequest" (
  "id" TEXT NOT NULL,
  "teachingSessionId" TEXT NOT NULL,
  "tutorId" TEXT NOT NULL,
  "proposedDate" TIMESTAMP(3) NOT NULL,
  "proposedStartTime" TIMESTAMP(3) NOT NULL,
  "proposedEndTime" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleChangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScheduleChangeRequest_teachingSessionId_fkey" FOREIGN KEY ("teachingSessionId") REFERENCES "TeachingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduleChangeRequest_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ScheduleChangeRequest_teachingSessionId_status_idx" ON "ScheduleChangeRequest"("teachingSessionId", "status");
CREATE INDEX "ScheduleChangeRequest_tutorId_status_idx" ON "ScheduleChangeRequest"("tutorId", "status");
