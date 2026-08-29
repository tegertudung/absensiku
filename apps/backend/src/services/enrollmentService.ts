import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export async function enrollStudent(classId: string, studentId: string) {
  const kelas = await prisma.class.findUnique({ where: { id: classId } });
  if (!kelas) throw new AppError('Kelas tidak ditemukan', 404);

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });

  if (existing) {
    if (existing.status === 'ACTIVE') throw new AppError('Siswa sudah terdaftar di kelas ini', 409);
    return prisma.classEnrollment.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
  }

  return prisma.classEnrollment.create({ data: { classId, studentId, status: 'ACTIVE' } });
}

export async function listClassEnrollments(classId: string) {
  return prisma.classEnrollment.findMany({
    where: { classId, status: 'ACTIVE' },
    include: { student: { select: { name: true, status: true } } },
    orderBy: { enrollmentDate: 'asc' },
  });
}

/**
 * Reverse lookup: module 4 ("Data Siswa: ... kelas reguler ...") requires
 * seeing which classes a STUDENT belongs to, not just a class's roster.
 * listClassEnrollments above only answers the class -> students direction.
 */
export async function listEnrollmentsForStudent(studentId: string) {
  return prisma.classEnrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: { class: { select: { name: true, level: true, quotaTotal: true, quotaRemaining: true } } },
    orderBy: { enrollmentDate: 'asc' },
  });
}

export async function setEnrollmentStatus(
  classId: string,
  studentId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED'
) {
  const enrollment = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
  });
  if (!enrollment) throw new AppError('Siswa tidak terdaftar di kelas ini', 404);
  return prisma.classEnrollment.update({ where: { id: enrollment.id }, data: { status } });
}
