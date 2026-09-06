import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { getStudentById } from './studentService';
import { formatBusinessDate } from '../utils/businessDate';

export async function assertParentOwnsStudent(parentId: string, studentId: string) {
  const link = await prisma.parentStudent.findUnique({ where: { parentId_studentId: { parentId, studentId } } });
  if (!link) throw new AppError('Data siswa tidak ditemukan.', 404);
  return link;
}
export function learningPrograms(student: Awaited<ReturnType<typeof getStudentById>>) {
  return student.programSummaries.map(e => ({
    programId: e.programId,
    type: e.program.learningModel === 'CLASS_BASED' ? 'REGULAR' as const : 'PRIVATE' as const,
    label: e.program.name + (e.class ? ' · ' + e.class.name : ''),
    quotaTotal: e.quota.quotaTotal, quotaRemaining: e.quota.quotaRemaining,
    quotaUsed: e.quota.quotaTotal - e.quota.quotaRemaining,
  }));
}
export async function listChildrenForParent(parentId: string) {
  const links = await prisma.parentStudent.findMany({ where: { parentId } });
  const children = await Promise.all(links.map(async link => {
    const student = await getStudentById(link.studentId);
    return { relationship: link.relationship, student: { id: student.id, name: student.name,
      status: student.status, programs: learningPrograms(student) } };
  }));
  return children.sort((a,b) => a.student.name.localeCompare(b.student.name));
}
/** Internal academic projection. Callers must enforce ownership before using it. */
export async function getStudentProgress(studentId: string, date?: Date) {
  const student = await getStudentById(studentId);
  const sessions = student.sessionHistory.filter(s => !date || formatBusinessDate(s.sessionDate) === formatBusinessDate(date));
  return {
    privateSessions: sessions.filter(s => !s.classId).map(s => ({
      id: s.id, programId: s.programId, programName: s.program?.name,
      sessionDate: s.sessionDate, tutorName: s.tutor.name, subjectName: s.subject?.name ?? null,
      startTime: s.startTime, endTime: s.endTime, mode: s.mode, location: s.location,
      material: s.material, progressNotes: s.progressNotes, score: s.score,
    })),
    regularAttendance: sessions.filter(s => !!s.classId).map(s => ({
      id: s.id, programId: s.programId, programName: s.program?.name,
      sessionDate: s.sessionDate, className: s.class?.name ?? null,
      subjectName: s.subject?.name ?? null, tutorName: s.tutor.name,
      material: s.material, attendanceStatus: 'PRESENT',
    })),
  };
}
export async function getChildProgress(parentId: string, studentId: string, date?: Date) {
  await assertParentOwnsStudent(parentId, studentId);
  return getStudentProgress(studentId, date);
}
