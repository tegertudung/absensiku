import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { logAudit } from '../utils/auditLog';

const SALT_ROUNDS = 10;

/**
 * Admin creates a parent account: a User (login credentials, role=PARENT), a
 * Parent profile, and one ParentStudent link per child — all atomic, same
 * pattern as createTutor(). At least one child must be linked; a parent
 * account with zero children can't see anything useful.
 */
export async function createParent(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  studentIds: string[];
}) {
  if (data.studentIds.length === 0) {
    throw new AppError('Pilih minimal satu siswa (anak) untuk dihubungkan', 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError('Email sudah terdaftar', 409);

  const students = await prisma.student.findMany({ where: { id: { in: data.studentIds } } });
  if (students.length !== data.studentIds.length) {
    throw new AppError('Salah satu siswa yang dipilih tidak ditemukan', 404);
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: data.email, passwordHash, role: 'PARENT', isActive: true },
    });

    const parent = await tx.parent.create({
      data: { userId: user.id, name: data.name, phone: data.phone },
    });

    await tx.parentStudent.createMany({
      data: data.studentIds.map((studentId) => ({ parentId: parent.id, studentId })),
    });

    return getParentById(parent.id, tx);
  });
}

export async function listParents() {
  return prisma.parent.findMany({
    include: {
      user: { select: { email: true, isActive: true, lastLogin: true } },
      children: { include: { student: { select: { id: true, name: true } } } },
    },
    orderBy: { name: 'asc' },
  });
}

// `tx` accepted so createParent() above can read back the row it just wrote
// inside the same transaction, instead of a separate connection.
export async function getParentById(id: string, tx: Prisma.TransactionClient = prisma) {
  const parent = await tx.parent.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, isActive: true, lastLogin: true } },
      children: { include: { student: { select: { id: true, name: true, status: true } } } },
    },
  });
  if (!parent) throw new AppError('Akun orang tua tidak ditemukan', 404);
  return parent;
}

/** Resolve a logged-in PARENT user's Parent profile id — mirrors resolveTutorIdForUser. */
export async function resolveParentIdForUser(userId: string): Promise<string | null> {
  const parent = await prisma.parent.findUnique({ where: { userId } });
  return parent?.id ?? null;
}

export async function updateParent(id: string, data: Partial<{ name: string; phone: string }>) {
  const parent = await prisma.parent.findUnique({ where: { id } });
  if (!parent) throw new AppError('Akun orang tua tidak ditemukan', 404);
  return prisma.parent.update({ where: { id }, data });
}

export async function setParentActive(id: string, isActive: boolean, adminId: string) {
  const parent = await prisma.parent.findUnique({ where: { id } });
  if (!parent) throw new AppError('Akun orang tua tidak ditemukan', 404);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: parent.userId }, data: { isActive } });
  });

  await logAudit({
    tableName: 'parents',
    recordId: id,
    action: 'UPDATE',
    oldValues: {},
    newValues: { isActive },
    changedBy: adminId,
    reason: isActive ? 'Aktifkan akun orang tua' : 'Nonaktifkan akun orang tua',
  });

  return getParentById(id);
}

export async function linkChild(parentId: string, studentId: string, relationship: string | undefined, adminId: string) {
  const [parent, student] = await Promise.all([
    prisma.parent.findUnique({ where: { id: parentId } }),
    prisma.student.findUnique({ where: { id: studentId } }),
  ]);
  if (!parent) throw new AppError('Akun orang tua tidak ditemukan', 404);
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);

  const existing = await prisma.parentStudent.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
  });
  if (existing) throw new AppError('Siswa ini sudah terhubung ke akun orang tua tersebut', 409);

  await prisma.parentStudent.create({ data: { parentId, studentId, relationship } });

  await logAudit({
    tableName: 'parents',
    recordId: parentId,
    action: 'UPDATE',
    oldValues: {},
    newValues: { linkedStudentId: studentId },
    changedBy: adminId,
    reason: `Hubungkan siswa ${student.name} ke akun orang tua`,
  });

  return getParentById(parentId);
}

export async function unlinkChild(parentId: string, studentId: string, adminId: string) {
  const link = await prisma.parentStudent.findUnique({
    where: { parentId_studentId: { parentId, studentId } },
  });
  if (!link) throw new AppError('Relasi siswa-orang tua ini tidak ditemukan', 404);

  await prisma.parentStudent.delete({ where: { id: link.id } });

  await logAudit({
    tableName: 'parents',
    recordId: parentId,
    action: 'UPDATE',
    oldValues: { linkedStudentId: studentId },
    newValues: {},
    changedBy: adminId,
    reason: 'Putuskan hubungan siswa dari akun orang tua',
  });

  return getParentById(parentId);
}
