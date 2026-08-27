import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export async function createStudent(data: {
  name: string;
  phone?: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
}) {
  return prisma.student.create({ data: { ...data, status: 'ACTIVE' } });
}

export async function listStudents() {
  return prisma.student.findMany({ orderBy: { name: 'asc' } });
}

export async function getStudentById(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      packages: { orderBy: { activationDate: 'desc' } },
    },
  });
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);
  return student;
}

export async function updateStudent(
  id: string,
  data: Partial<{ name: string; phone: string; email: string; guardianName: string; guardianPhone: string }>
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);
  return prisma.student.update({ where: { id }, data });
}

export async function setStudentStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED') {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);
  return prisma.student.update({ where: { id }, data: { status } });
}
