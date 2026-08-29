import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { logAudit } from '../utils/auditLog';

const SALT_ROUNDS = 10;

/**
 * Admin creates a tutor account: this is both a User (login credentials,
 * role=TENTOR) and a Tutor profile, created atomically.
 */
export async function createTutor(data: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  hireDate?: Date;
  bankAccount?: string;
  bankName?: string;
  bankHolderName?: string;
  title?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError('Email sudah terdaftar', 409);

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: data.email, passwordHash, role: 'TENTOR', isActive: true },
    });

    const tutor = await tx.tutor.create({
      data: {
        userId: user.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        hireDate: data.hireDate,
        bankAccount: data.bankAccount,
        bankName: data.bankName,
        bankHolderName: data.bankHolderName,
        title: data.title,
        status: 'ACTIVE',
      },
    });

    return tutor;
  });
}

export async function listTutors() {
  return prisma.tutor.findMany({
    include: { user: { select: { email: true, isActive: true, lastLogin: true } } },
    orderBy: { name: 'asc' },
  });
}

/**
 * Profil Tentor: own info + "Mata Pelajaran" — derived from distinct subjects
 * across their active schedules, since there's no direct Tutor<->Subject
 * assignment table in the schema (subjects flow through Schedule/Class).
 */
export async function getOwnTutorProfile(id: string) {
  const [tutor, scheduleSubjects] = await Promise.all([
    prisma.tutor.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    }),
    prisma.schedule.findMany({
      where: { tutorId: id, status: 'ACTIVE', subjectId: { not: null } },
      select: { subject: { select: { id: true, name: true } } },
      distinct: ['subjectId'],
    }),
  ]);
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);

  const subjects = scheduleSubjects
    .map((s) => s.subject)
    .filter((s): s is { id: string; name: string } => Boolean(s));

  return { ...tutor, subjects };
}

export async function getTutorById(id: string) {
  const tutor = await prisma.tutor.findUnique({
    where: { id },
    include: { user: { select: { email: true, isActive: true, lastLogin: true } } },
  });
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  return tutor;
}

export async function updateTutor(
  id: string,
  data: Partial<{
    name: string;
    phone: string;
    hireDate: Date;
    bankAccount: string;
    bankName: string;
    bankHolderName: string;
    notes: string;
    title: string;
  }>
) {
  const tutor = await prisma.tutor.findUnique({ where: { id } });
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  return prisma.tutor.update({ where: { id }, data });
}

/**
 * Deactivating a tutor also disables their login (isActive on the linked User),
 * consistent with the module description "Tambah, ubah, nonaktifkan" (BR access control).
 */
export async function setTutorActive(id: string, isActive: boolean, adminId: string) {
  const tutor = await prisma.tutor.findUnique({ where: { id } });
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: tutor.userId }, data: { isActive } });
    return tx.tutor.update({
      where: { id },
      data: { status: isActive ? 'ACTIVE' : 'INACTIVE' },
    });
  });

  await logAudit({
    tableName: 'tutors',
    recordId: id,
    action: 'UPDATE',
    oldValues: { status: tutor.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: isActive ? 'Aktifkan tentor' : 'Nonaktifkan tentor',
  });

  return updated;
}

/** Tutor history is financial/operational data, so deletion is only allowed
 * before the tutor has been used by a schedule or teaching session. */
export async function deleteTutor(id: string, adminId: string) {
  const tutor = await prisma.tutor.findUnique({
    where: { id },
    include: { _count: { select: { schedules: true, sessions: true } } },
  });
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  if (tutor._count.schedules > 0 || tutor._count.sessions > 0) {
    throw new AppError('Tentor tidak dapat dihapus karena masih memiliki riwayat mengajar atau jadwal.', 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: tutor.userId } });
    await tx.auditLog.create({
      data: { tableName: 'tutors', recordId: id, action: 'DELETE', oldValues: { name: tutor.name, email: tutor.email }, changedBy: adminId, reason: 'Tentor dihapus oleh admin' },
    });
  });
  return { id };
}
