/**
 * Participant helpers for private teaching sessions.
 *
 * New multi-student sessions persist every participant in AttendanceRecord,
 * while older records only have TeachingSession.studentId. Keeping the
 * fallback here prevents readers from drifting apart during the transition.
 */
export type PrivateSessionWithParticipants = {
  sessionType: string;
  studentId: string | null;
  attendanceRecords?: Array<{ studentId: string }>;
};

export function resolvePrivateSessionParticipantIds(
  session: PrivateSessionWithParticipants,
): string[] {
  if (session.sessionType !== "PRIVATE") return [];

  return [
    ...new Set(
      [
        ...(session.attendanceRecords?.map((record) => record.studentId) ?? []),
        session.studentId,
      ].filter((studentId): studentId is string => Boolean(studentId)),
    ),
  ];
}
