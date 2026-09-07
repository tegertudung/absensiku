import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";
import { notifyParentsOfStudent } from "./notificationService";

type PrivatePackageDb = any;

/**
 * The single backend source of truth for PRIVATE eligibility.  A StudentProgram
 * confirms the student belongs to the selected individual program; the package
 * confirms that the program still has an active, usable quota.
 */
export async function assertEligiblePrivatePackage(
  data: { studentId: string; programId: string; privatePackageId: string },
  db: PrivatePackageDb = prisma,
) {
  const [student, program, membership, pkg] = await Promise.all([
    db.student.findFirst({ where: { id: data.studentId, status: "ACTIVE" } }),
    db.program.findFirst({
      where: {
        id: data.programId,
        isActive: true,
        learningModel: "INDIVIDUAL",
      },
    }),
    db.studentProgram.findFirst({
      where: {
        studentId: data.studentId,
        programId: data.programId,
        status: "ACTIVE",
      },
    }),
    db.privatePackage.findUnique({ where: { id: data.privatePackageId } }),
  ]);

  if (!student)
    throw new AppError("Siswa tidak ditemukan atau tidak aktif.", 404);
  if (!program)
    throw new AppError("Program privat tidak ditemukan atau tidak aktif.", 404);
  if (!membership)
    throw new AppError(
      "Siswa tidak memiliki enrollment Privat aktif pada program ini.",
      422,
    );
  if (!pkg || pkg.studentId !== data.studentId)
    throw new AppError("Paket Privat siswa tidak valid.", 422);
  if (pkg.status !== "ACTIVE")
    throw new AppError("Paket Privat siswa tidak aktif.", 409);
  if (pkg.quotaRemaining <= 0)
    throw new AppError("Kuota paket Privat siswa telah habis.", 409);

  // Packages created before programId existed are accepted only when the
  // student has exactly one active individual program. This preserves legacy
  // data without guessing when more than one private program is present.
  if (pkg.programId !== data.programId) {
    const individualMemberships = await db.studentProgram.findMany({
      where: {
        studentId: data.studentId,
        status: "ACTIVE",
        program: { learningModel: "INDIVIDUAL" },
      },
      select: { programId: true },
    });
    const isUnambiguousLegacyPackage =
      pkg.programId === null &&
      individualMemberships.length === 1 &&
      individualMemberships[0].programId === data.programId;
    if (!isUnambiguousLegacyPackage)
      throw new AppError(
        "Paket Privat tidak sesuai dengan program pertemuan.",
        422,
      );
  }

  return pkg;
}

export async function getEligiblePrivateStudents(programId: string) {
  const program = await prisma.program.findFirst({
    where: { id: programId, isActive: true, learningModel: "INDIVIDUAL" },
    select: { id: true, name: true },
  });
  if (!program)
    throw new AppError("Program privat tidak ditemukan atau tidak aktif.", 404);

  const packages = await prisma.privatePackage.findMany({
    where: {
      status: "ACTIVE",
      quotaRemaining: { gt: 0 },
      OR: [{ programId }, { programId: null }],
      student: {
        status: "ACTIVE",
        programEnrollments: { some: { programId, status: "ACTIVE" } },
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          programEnrollments: {
            where: {
              status: "ACTIVE",
              program: { learningModel: "INDIVIDUAL" },
            },
            select: { programId: true },
          },
        },
      },
    },
    orderBy: { activationDate: "asc" },
  });

  return packages
    .filter(
      (pkg) =>
        pkg.programId === programId ||
        (pkg.programId === null &&
          pkg.student.programEnrollments.length === 1 &&
          pkg.student.programEnrollments[0].programId === programId),
    )
    .map((pkg) => ({
      studentId: pkg.student.id,
      studentName: pkg.student.name,
      privatePackageId: pkg.id,
      packageName: pkg.packageName || `Paket ${program.name}`,
      quotaRemaining: pkg.quotaRemaining,
      program,
    }));
}

/**
 * BR-02/alur H.2 step 1: admin activates a private package for a student.
 * A student can only have ONE currently-active package at a time — if quota
 * is running low, admin should use extendPackage() on the existing one
 * instead of creating a second concurrent package (keeps quota deduction in
 * sessionService unambiguous, one active source of truth per student).
 */
export async function createPackage(data: {
  studentId: string;
  programId?: string;
  quotaTotal: number;
  packageName?: string;
  price?: number;
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  createdBy: string;
}) {
  const student = await prisma.student.findFirst({
    where: { id: data.studentId, status: "ACTIVE" },
  });
  if (!student)
    throw new AppError("Siswa tidak ditemukan atau tidak aktif", 404);

  const program = data.programId
    ? await prisma.program.findFirst({
        where: {
          id: data.programId,
          isActive: true,
          learningModel: "INDIVIDUAL",
        },
      })
    : await prisma.program.findFirst({
        where: { code: "PRIVATE", isActive: true, learningModel: "INDIVIDUAL" },
      });
  if (!program)
    throw new AppError("Program Privat tidak ditemukan atau tidak aktif.", 404);
  const membership = await prisma.studentProgram.findFirst({
    where: {
      studentId: data.studentId,
      programId: program.id,
      status: "ACTIVE",
    },
  });
  if (!membership)
    throw new AppError(
      "Siswa harus memiliki enrollment Privat aktif sebelum paket diaktifkan.",
      422,
    );

  const existingActive = await prisma.privatePackage.findFirst({
    where: { studentId: data.studentId, status: "ACTIVE" },
  });
  if (existingActive) {
    throw new AppError(
      'Siswa masih memiliki paket aktif. Gunakan "Tambah Kuota" untuk menambah sesi pada paket yang sudah ada.',
      409,
    );
  }

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.privatePackage.create({
      data: {
        studentId: data.studentId,
        programId: program.id,
        quotaTotal: data.quotaTotal,
        quotaUsed: 0,
        quotaRemaining: data.quotaTotal,
        status: "ACTIVE",
        packageName: data.packageName,
        price: data.price,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        notes: data.notes,
      },
    });

    // Traceable from day one — every quota change has a ledger entry (K/L Validasi:
    // "Setiap perubahan kuota privat memiliki transaksi penggunaan atau penyesuaian").
    await tx.privatePackageUsage.create({
      data: {
        packageId: pkg.id,
        quantityUsed: -data.quotaTotal,
        changeType: "ADMIN_ADJUSTMENT",
        changedBy: data.createdBy,
        reason: "Aktivasi paket baru",
      },
    });

    return pkg;
  });
}

/**
 * BR-05: "Penambahan atau pembaruan paket dilakukan admin." Adds quota to an
 * existing ACTIVE package rather than creating a new one.
 */
export async function extendPackage(
  id: string,
  additionalQuota: number,
  adminId: string,
  reason?: string,
) {
  if (additionalQuota <= 0)
    throw new AppError("Jumlah tambahan kuota harus lebih dari 0", 400);

  const pkg = await prisma.privatePackage.findUnique({ where: { id } });
  if (!pkg) throw new AppError("Paket tidak ditemukan", 404);
  if (pkg.status !== "ACTIVE")
    throw new AppError("Paket tidak aktif, tidak dapat ditambah kuotanya", 400);

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.privatePackage.update({
      where: { id },
      data: {
        quotaTotal: { increment: additionalQuota },
        quotaRemaining: { increment: additionalQuota },
      },
    });

    await tx.privatePackageUsage.create({
      data: {
        packageId: id,
        quantityUsed: -additionalQuota,
        changeType: "ADMIN_ADJUSTMENT",
        changedBy: adminId,
        reason: reason || `Penambahan ${additionalQuota} kuota oleh admin`,
      },
    });

    return updated;
  });

  // Notifikasi Orang Tua Tier 2 — fired only after the transaction commits.
  const student = await prisma.student.findUnique({
    where: { id: pkg.studentId },
    select: { name: true },
  });
  notifyParentsOfStudent(pkg.studentId, {
    title: "Kuota Privat Diperpanjang",
    message: `Kuota les privat ${student?.name ?? ""} ditambah ${additionalQuota} pertemuan oleh Admin. Sisa kuota sekarang: ${updated.quotaRemaining} pertemuan.`,
    type: "QUOTA_EXTENDED",
  }).catch((err) =>
    console.error("[notify] package extension notification failed:", err),
  );

  return updated;
}

export async function listPackagesForStudent(studentId: string) {
  return prisma.privatePackage.findMany({
    where: { studentId },
    orderBy: { activationDate: "desc" },
  });
}

export async function getPackageById(id: string) {
  const pkg = await prisma.privatePackage.findUnique({
    where: { id },
    include: {
      student: { select: { name: true } },
      usages: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!pkg) throw new AppError("Paket tidak ditemukan", 404);
  return pkg;
}

export async function setPackageStatus(
  id: string,
  status: "ACTIVE" | "EXPIRED" | "CANCELLED",
  adminId: string,
) {
  const pkg = await prisma.privatePackage.findUnique({ where: { id } });
  if (!pkg) throw new AppError("Paket tidak ditemukan", 404);

  const updated = await prisma.privatePackage.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    tableName: "private_packages",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: pkg.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: `Ubah status paket menjadi ${status}`,
  });

  return updated;
}
