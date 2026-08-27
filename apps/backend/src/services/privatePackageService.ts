import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { logAudit } from '../utils/auditLog';

/**
 * BR-02/alur H.2 step 1: admin activates a private package for a student.
 * A student can only have ONE currently-active package at a time — if quota
 * is running low, admin should use extendPackage() on the existing one
 * instead of creating a second concurrent package (keeps quota deduction in
 * sessionService unambiguous, one active source of truth per student).
 */
export async function createPackage(data: {
  studentId: string;
  quotaTotal: number;
  packageName?: string;
  price?: number;
  paymentDate?: Date;
  paymentMethod?: string;
  notes?: string;
  createdBy: string;
}) {
  const student = await prisma.student.findUnique({ where: { id: data.studentId } });
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);

  const existingActive = await prisma.privatePackage.findFirst({
    where: { studentId: data.studentId, status: 'ACTIVE' },
  });
  if (existingActive) {
    throw new AppError(
      'Siswa masih memiliki paket aktif. Gunakan "Tambah Kuota" untuk menambah sesi pada paket yang sudah ada.',
      409
    );
  }

  return prisma.$transaction(async (tx) => {
    const pkg = await tx.privatePackage.create({
      data: {
        studentId: data.studentId,
        quotaTotal: data.quotaTotal,
        quotaUsed: 0,
        quotaRemaining: data.quotaTotal,
        status: 'ACTIVE',
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
        changeType: 'ADMIN_ADJUSTMENT',
        changedBy: data.createdBy,
        reason: 'Aktivasi paket baru',
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
  reason?: string
) {
  if (additionalQuota <= 0) throw new AppError('Jumlah tambahan kuota harus lebih dari 0', 400);

  const pkg = await prisma.privatePackage.findUnique({ where: { id } });
  if (!pkg) throw new AppError('Paket tidak ditemukan', 404);
  if (pkg.status !== 'ACTIVE') throw new AppError('Paket tidak aktif, tidak dapat ditambah kuotanya', 400);

  return prisma.$transaction(async (tx) => {
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
        changeType: 'ADMIN_ADJUSTMENT',
        changedBy: adminId,
        reason: reason || `Penambahan ${additionalQuota} kuota oleh admin`,
      },
    });

    return updated;
  });
}

export async function listPackagesForStudent(studentId: string) {
  return prisma.privatePackage.findMany({
    where: { studentId },
    orderBy: { activationDate: 'desc' },
  });
}

export async function getPackageById(id: string) {
  const pkg = await prisma.privatePackage.findUnique({
    where: { id },
    include: {
      student: { select: { name: true } },
      usages: { orderBy: { changedAt: 'desc' } },
    },
  });
  if (!pkg) throw new AppError('Paket tidak ditemukan', 404);
  return pkg;
}

export async function setPackageStatus(
  id: string,
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED',
  adminId: string
) {
  const pkg = await prisma.privatePackage.findUnique({ where: { id } });
  if (!pkg) throw new AppError('Paket tidak ditemukan', 404);

  const updated = await prisma.privatePackage.update({ where: { id }, data: { status } });

  await logAudit({
    tableName: 'private_packages',
    recordId: id,
    action: 'UPDATE',
    oldValues: { status: pkg.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: `Ubah status paket menjadi ${status}`,
  });

  return updated;
}
