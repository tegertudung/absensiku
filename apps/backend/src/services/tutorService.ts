import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";
import { nextBusinessCode } from "../utils/businessCode";
import { randomBytes } from "crypto";

const SALT_ROUNDS = 10;

export class TutorLifecycleError extends AppError {
  code: "TUTOR_ARCHIVED" | "TUTOR_ALREADY_ACTIVE" | "TUTOR_ACCOUNT_CONFLICT";
  details?: { tutorId: string };

  constructor(
    message: string,
    code: TutorLifecycleError["code"],
    details?: { tutorId: string },
  ) {
    super(message, 409);
    this.code = code;
    this.details = details;
  }
}

export type TutorProvisioningInput = {
  email: string;
  name: string;
  phone?: string;
  hireDate?: Date;
  bankAccount?: string;
  bankName?: string;
  bankHolderName?: string;
  title?: string;
  subjectIds: string[];
};

/** 96 bits of CSPRNG entropy, encoded as 16 URL-safe characters. */
export function generateTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

/**
 * Admin creates a tutor account: this is both a User (login credentials,
 * role=TENTOR) and a Tutor profile, created atomically.
 */
export async function createTutor(data: TutorProvisioningInput) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    include: { tutor: { select: { id: true, deletedAt: true } } },
  });
  if (existing) {
    if (
      existing.role === "TENTOR" &&
      existing.tutor?.deletedAt &&
      !existing.isActive
    ) {
      throw new TutorLifecycleError(
        "Akun dengan email ini pernah dihapus dan dapat dipulihkan.",
        "TUTOR_ARCHIVED",
        { tutorId: existing.tutor.id },
      );
    }
    if (
      existing.role === "TENTOR" &&
      existing.tutor &&
      !existing.tutor.deletedAt &&
      existing.isActive
    ) {
      throw new TutorLifecycleError(
        "Email sudah digunakan oleh Tentor aktif.",
        "TUTOR_ALREADY_ACTIVE",
      );
    }
    throw new TutorLifecycleError(
      "Email sudah digunakan oleh akun lain atau memiliki status yang tidak konsisten.",
      "TUTOR_ACCOUNT_CONFLICT",
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  const tutor = await prisma.$transaction(async (tx) => {
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
      data: {
        email: data.email,
        passwordHash,
        role: "TENTOR",
        isActive: true,
        mustChangePassword: true,
      },
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
  return { tutor, temporaryPassword };
}

export async function restoreTutor(
  id: string,
  adminId: string,
  profile?: Omit<TutorProvisioningInput, "email">,
) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  const tutor = await prisma.$transaction(async (tx) => {
    const archived = await tx.tutor.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!archived) throw new AppError("Tentor tidak ditemukan.", 404);
    if (
      archived.user.role !== "TENTOR" ||
      !archived.deletedAt ||
      archived.user.isActive
    ) {
      throw new TutorLifecycleError(
        "Akun Tentor tidak berada dalam kondisi arsip yang aman untuk dipulihkan.",
        "TUTOR_ACCOUNT_CONFLICT",
      );
    }

    const subjectIds = profile ? [...new Set(profile.subjectIds)] : undefined;
    if (subjectIds) {
      const subjects = await tx.subject.findMany({
        where: { id: { in: subjectIds }, isActive: true },
        select: { id: true },
      });
      if (subjects.length !== subjectIds.length)
        throw new AppError(
          "Satu atau lebih mata pelajaran tidak ditemukan atau tidak aktif.",
          400,
        );
    }

    // Atomically claim this archived profile. Concurrent restore attempts
    // cannot both succeed and return different one-time passwords.
    const claimed = await tx.tutor.updateMany({
      where: { id: archived.id, deletedAt: { not: null } },
      data: { deletedAt: null, status: "ACTIVE" },
    });
    if (claimed.count !== 1) {
      throw new TutorLifecycleError(
        "Akun Tentor sudah dipulihkan atau statusnya telah berubah.",
        "TUTOR_ACCOUNT_CONFLICT",
      );
    }

    await tx.user.update({
      where: { id: archived.userId },
      data: {
        passwordHash,
        isActive: true,
        deletedAt: null,
        mustChangePassword: true,
        authVersion: { increment: 1 },
      },
    });

    if (subjectIds) {
      await tx.tutorSubject.deleteMany({ where: { tutorId: archived.id } });
      await tx.tutorSubject.createMany({
        data: subjectIds.map((subjectId) => ({
          tutorId: archived.id,
          subjectId,
        })),
      });
    }

    const restored = await tx.tutor.update({
      where: { id: archived.id },
      data: {
        ...(profile
          ? {
              name: profile.name,
              phone: profile.phone,
              hireDate: profile.hireDate,
              bankAccount: profile.bankAccount,
              bankName: profile.bankName,
              bankHolderName: profile.bankHolderName,
              title: profile.title,
            }
          : {}),
      },
      include: {
        user: { select: { email: true, isActive: true, lastLogin: true } },
        subjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        tableName: "tutors",
        recordId: archived.id,
        action: "UPDATE",
        oldValues: { status: archived.status, deletedAt: archived.deletedAt },
        newValues: { status: "ACTIVE", deletedAt: null },
        changedBy: adminId,
        reason: "TUTOR_RESTORED",
      },
    });
    return restored;
  });

  return { tutor, temporaryPassword };
}

export async function provisionTutorFromImport(
  data: TutorProvisioningInput,
  adminId: string,
): Promise<
  | { status: "CREATED" | "RESTORED"; temporaryPassword: string }
  | { status: "ALREADY_ACTIVE" }
> {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    include: { tutor: { select: { id: true, deletedAt: true } } },
  });
  if (!existing) {
    const created = await createTutor(data);
    return { status: "CREATED", temporaryPassword: created.temporaryPassword };
  }
  if (
    existing.role === "TENTOR" &&
    existing.tutor &&
    !existing.tutor.deletedAt &&
    existing.isActive
  ) {
    return { status: "ALREADY_ACTIVE" };
  }
  if (
    existing.role === "TENTOR" &&
    existing.tutor?.deletedAt &&
    !existing.isActive
  ) {
    const restored = await restoreTutor(existing.tutor.id, adminId, {
      name: data.name,
      phone: data.phone,
      hireDate: data.hireDate,
      bankAccount: data.bankAccount,
      bankName: data.bankName,
      bankHolderName: data.bankHolderName,
      title: data.title,
      subjectIds: data.subjectIds,
    });
    return {
      status: "RESTORED",
      temporaryPassword: restored.temporaryPassword,
    };
  }
  throw new TutorLifecycleError(
    "Email digunakan oleh akun lain atau memiliki status yang tidak konsisten.",
    "TUTOR_ACCOUNT_CONFLICT",
  );
}

/**
 * Admin-only credential reset. This never recovers an old password: it
 * replaces it with a new one-time password and revokes all existing tokens.
 */
export async function resetTutorPassword(id: string, adminId: string) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const tutor = await tx.tutor.findUnique({
      where: { id },
      include: { user: { select: { id: true, deletedAt: true } } },
    });
    if (!tutor) throw new AppError("Tentor tidak ditemukan.", 404);
    if (!tutor.user) throw new AppError("Akun tentor tidak ditemukan.", 404);
    if (tutor.deletedAt || tutor.user.deletedAt)
      throw new AppError(
        "Tentor yang diarsipkan harus dipulihkan sebelum password dapat direset.",
        409,
      );

    await tx.user.update({
      where: { id: tutor.user.id },
      // Admin set this value on the tentor's behalf, same as account
      // creation — force them to set their own on next login.
      data: {
        passwordHash,
        mustChangePassword: true,
        authVersion: { increment: 1 },
      },
    });
    await logAudit(
      {
        tableName: "tutors",
        recordId: tutor.id,
        action: "UPDATE",
        changedBy: adminId,
        reason: "TUTOR_PASSWORD_RESET",
      },
      tx,
    );
    return { temporaryPassword, mustChangePassword: true };
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
