import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

/**
 * BR-08/BR-09: honor rates are never edited in place once created — a rate change
 * always means "close the currently open-ended rate, then create a new one with a
 * later effectiveFrom". This keeps historical snapshots (TeachingSession.honorRateSnapshot)
 * meaningful even as tarif policy evolves, and keeps getApplicableHonorRate()
 * unambiguous (at most one open-ended ACTIVE rate per sessionType+subjectId at a time).
 */
export async function createHonorRate(data: {
  sessionType: 'REGULAR' | 'PRIVATE';
  nominal: number;
  effectiveFrom: Date;
  subjectId?: string;
  programId?: string;
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.honorRate.findFirst({
      where: {
        sessionType: data.sessionType,
        programId: data.programId ?? null,
        subjectId: data.subjectId ?? null,
        status: 'ACTIVE',
        effectiveTo: null,
      },
    });

    if (previous) {
      const dayBefore = new Date(data.effectiveFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);

      if (previous.effectiveFrom > dayBefore) {
        throw new AppError(
          'Tanggal mulai tarif baru harus setelah tanggal mulai tarif yang sedang aktif (tidak boleh overlap)',
          409
        );
      }

      await tx.honorRate.update({
        where: { id: previous.id },
        data: { effectiveTo: dayBefore },
      });

      await tx.honorRateHistory.create({
        data: {
          rateId: previous.id,
          oldNominal: previous.nominal,
          newNominal: previous.nominal,
          reason: `Digantikan oleh tarif baru mulai ${data.effectiveFrom.toISOString().split('T')[0]}`,
        },
      });
    }

    return tx.honorRate.create({
      data: {
        sessionType: data.sessionType,
        nominal: data.nominal,
        effectiveFrom: data.effectiveFrom,
        subjectId: data.subjectId,
        programId: data.programId,
        status: 'ACTIVE',
        notes: data.notes,
      },
    });
  });
}

export async function listHonorRates(sessionType?: 'REGULAR' | 'PRIVATE', programId?: string) {
  return prisma.honorRate.findMany({
    where: { ...(sessionType ? { sessionType } : {}), ...(programId ? { programId } : {}) },
    include: { program: true },
    orderBy: [{ sessionType: 'asc' }, { effectiveFrom: 'desc' }],
  });
}

export async function listHonorRateHistory() {
  return prisma.honorRateHistory.findMany({
    include: { rate: { include: { program: true } } },
    orderBy: { changedAt: 'desc' },
  });
}

export async function deactivateHonorRate(id: string, adminId: string, reason?: string) {
  const rate = await prisma.honorRate.findUnique({ where: { id } });
  if (!rate) throw new AppError('Tarif honor tidak ditemukan', 404);

  return prisma.$transaction(async (tx) => {
    await tx.honorRateHistory.create({
      data: {
        rateId: rate.id,
        oldNominal: rate.nominal,
        newNominal: rate.nominal,
        changedBy: adminId,
        reason: reason || 'Dinonaktifkan oleh admin',
      },
    });

    return tx.honorRate.update({ where: { id }, data: { status: 'INACTIVE' } });
  });
}
