import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";
import { nextBusinessCode } from "../utils/businessCode";

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
  subjectIds: string[];
}) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) throw new AppError("Email sudah terdaftar", 409);

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const subjectIds = [...new Set(data.subjectIds)];
    const subjects = await tx.subject.findMany({
      where: { id: { in: subjectIds }, isActive: true },
      select: { id: true },
    });
    if (subjects.length !== subjectIds.length)
      throw new AppError(
        "Satu atau lebih mata pelajaran tidak ditemukan atau tidak aktif.",
        400,
      );
    const user = await tx.user.create({
      data: { email: data.email, passwordHash, role: "TENTOR", isActive: true },
    });

    const tutor = await tx.tutor.create({
      data: {
        tutorCode: await nextBusinessCode(tx, "tutor"),
        userId: user.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        hireDate: data.hireDate,
        bankAccount: data.bankAccount,
        bankName: data.bankName,
        bankHolderName: data.bankHolderName,
        title: data.title,
        status: "ACTIVE",
      },
    });
    await tx.tutorSubject.createMany({
      data: subjectIds.map((subjectId) => ({ tutorId: tutor.id, subjectId })),
    });

    return tx.tutor.findUniqueOrThrow({
      where: { id: tutor.id },
      include: {
        subjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });
  });
}

/** Admin-only password recovery for an existing Tutor account. */
export async function resetTutorPassword(
  id: string,
  newPassword: string,
  adminId: string,
) {
  return prisma.$transaction(async (tx) => {
    const tutor = await tx.tutor.findUnique({
      where: { id },
      include: { user: { select: { id: true } } },
    });
    if (!tutor) throw new AppError("Tentor tidak ditemukan.", 404);
    if (!tutor.user) throw new AppError("Akun tentor tidak ditemukan.", 404);

    await tx.user.update({
      where: { id: tutor.user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS) },
    });
    await logAudit(
      {
        tableName: "tutors",
        recordId: tutor.id,
        action: "UPDATE",
        changedBy: adminId,
        reason: `Reset password akun tentor ${tutor.tutorCode} (${tutor.name})`,
      },
      tx,
    );
  });
}

export async function listTutors(subjectId?: string) {
  return prisma.tutor.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      user: { is: { isActive: true } },
      ...(subjectId ? { subjects: { some: { subjectId } } } : {}),
    },
    include: {
      user: { select: { email: true, isActive: true, lastLogin: true } },
      subjects: { include: { subject: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
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
      include: {
        user: { select: { email: true } },
        subjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.schedule.findMany({
      where: { tutorId: id, status: "ACTIVE", subjectId: { not: null } },
      select: { subject: { select: { id: true, name: true } } },
      distinct: ["subjectId"],
    }),
  ]);
  if (!tutor) throw new AppError("Tentor tidak ditemukan", 404);

  const subjects = tutor.subjects.map((item) => item.subject);

  return { ...tutor, subjects };
}

export async function getTutorById(id: string) {
  const tutor = await prisma.tutor.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, isActive: true, lastLogin: true } },
      subjects: { include: { subject: { select: { id: true, name: true } } } },
    },
  });
  if (!tutor) throw new AppError("Tentor tidak ditemukan", 404);
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
    subjectIds: string[];
  }>,
) {
  const tutor = await prisma.tutor.findUnique({ where: { id } });
  if (!tutor) throw new AppError("Tentor tidak ditemukan", 404);
  return prisma.$transaction(async (tx) => {
    if (data.subjectIds !== undefined) {
      const subjectIds = [...new Set(data.subjectIds)];
      const subjects = await tx.subject.findMany({
        where: { id: { in: subjectIds }, isActive: true },
        select: { id: true },
      });
      if (subjects.length !== subjectIds.length)
        throw new AppError(
          "Satu atau lebih mata pelajaran tidak ditemukan atau tidak aktif.",
          400,
        );
      await tx.tutorSubject.deleteMany({ where: { tutorId: id } });
      await tx.tutorSubject.createMany({
        data: subjectIds.map((subjectId) => ({ tutorId: id, subjectId })),
      });
    }
    const { subjectIds: _subjectIds, ...profile } = data;
    return tx.tutor.update({
      where: { id },
      data: profile,
      include: {
        subjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });
  });
}

/**
 * Deactivating a tutor also disables their login (isActive on the linked User),
 * consistent with the module description "Tambah, ubah, nonaktifkan" (BR access control).
 */
export async function setTutorActive(
  id: string,
  isActive: boolean,
  adminId: string,
) {
  const tutor = await prisma.tutor.findUnique({ where: { id } });
  if (!tutor) throw new AppError("Tentor tidak ditemukan", 404);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: tutor.userId }, data: { isActive } });
    return tx.tutor.update({
      where: { id },
      data: { status: isActive ? "ACTIVE" : "INACTIVE" },
    });
  });

  await logAudit({
    tableName: "tutors",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: tutor.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: isActive ? "Aktifkan tentor" : "Nonaktifkan tentor",
  });

  return updated;
}

/** Tutor history is financial/operational data, so deletion is only allowed
 * before the tutor has been used by a schedule or teaching session. */
export async function deleteTutor(id: string, adminId: string) {
  const tutor = await prisma.tutor.findUnique({
    where: { id },
  });
  if (!tutor || tutor.deletedAt)
    throw new AppError("Tentor tidak ditemukan", 404);

  await prisma.$transaction(async (tx) => {
    await tx.tutor.update({ where: { id }, data: { deletedAt: new Date() } });
    await tx.user.update({
      where: { id: tutor.userId },
      data: { isActive: false },
    });
    await tx.auditLog.create({
      data: {
        tableName: "tutors",
        recordId: id,
        action: "DELETE",
        oldValues: { name: tutor.name, email: tutor.email },
        changedBy: adminId,
        reason: "Tutor diarsipkan dari operasional oleh admin",
      },
    });
  });
  return { id };
}
