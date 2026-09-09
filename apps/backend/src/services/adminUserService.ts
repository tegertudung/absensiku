import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { logAudit } from "../utils/auditLog";
import { AppError } from "../utils/errors";

const SALT_ROUNDS = 10;

const adminUserSelect = {
  id: true,
  email: true,
  isPrimaryAdmin: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditMetadata(actorEmail: string, targetEmail: string) {
  return { actorEmail, targetEmail };
}

async function findAdminOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "ADMIN") {
    throw new AppError("Akun Admin tidak ditemukan.", 404);
  }
  return user;
}

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function listAdminUsers() {
  return prisma.user.findMany({
    where: { role: "ADMIN", deletedAt: null },
    select: adminUserSelect,
    orderBy: [{ isPrimaryAdmin: "desc" }, { createdAt: "asc" }],
  });
}

export async function createAdminUser(
  email: string,
  password: string,
  actor: { id: string; email: string },
) {
  const normalizedEmail = normalizeAdminEmail(email);
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) throw new AppError("Email sudah terdaftar.", 409);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        role: "ADMIN",
        isPrimaryAdmin: false,
        isActive: true,
        deletedAt: null,
      },
      select: adminUserSelect,
    });
    await logAudit(
      {
        tableName: "users",
        recordId: user.id,
        action: "INSERT",
        newValues: auditMetadata(actor.email, user.email),
        changedBy: actor.id,
        reason: "ADMIN_CREATED",
      },
      tx,
    );
    return user;
  });
}

export async function resetAdminPassword(
  targetId: string,
  password: string,
  actor: { id: string; email: string },
) {
  const target = await findAdminOrThrow(targetId);
  if (target.isPrimaryAdmin) {
    throw new AppError(
      "Password Admin Utama tidak dapat direset dari Kelola Admin.",
      400,
    );
  }
  if (targetId === actor.id) {
    throw new AppError(
      "Password akun sendiri tidak dapat direset dari Kelola Admin.",
      400,
    );
  }
  if (target.deletedAt) throw new AppError("Akun Admin sudah dihapus.", 404);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await logAudit(
      {
        tableName: "users",
        recordId: target.id,
        action: "UPDATE",
        newValues: auditMetadata(actor.email, target.email),
        changedBy: actor.id,
        reason: "ADMIN_PASSWORD_RESET_BY_ADMIN",
      },
      tx,
    );
  });
}

export async function deleteAdminUser(
  targetId: string,
  actor: { id: string; email: string },
) {
  const target = await findAdminOrThrow(targetId);
  if (target.isPrimaryAdmin) {
    throw new AppError("Admin Utama tidak dapat dihapus.", 400);
  }
  if (targetId === actor.id) {
    throw new AppError(
      "Akun Admin sendiri tidak dapat dihapus dari Kelola Admin.",
      400,
    );
  }
  if (target.deletedAt) throw new AppError("Akun Admin sudah dihapus.", 404);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await logAudit(
      {
        tableName: "users",
        recordId: target.id,
        action: "DELETE",
        newValues: auditMetadata(actor.email, target.email),
        changedBy: actor.id,
        reason: "ADMIN_DELETED",
      },
      tx,
    );
  });
}
