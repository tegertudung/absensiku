import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import {
  addBusinessDays,
  formatBusinessDate,
  startOfBusinessDate,
} from "../utils/businessDate";

/**
 * BR-08/BR-09: honor rates are never edited in place once created — a rate change
 * always means "close the currently open-ended rate, then create a new one with a
 * later effectiveFrom". This keeps historical snapshots (TeachingSession.honorRateSnapshot)
 * meaningful even as tarif policy evolves, and keeps getApplicableHonorRate()
 * unambiguous (at most one open-ended ACTIVE rate per sessionType+subjectId at a time).
 */
export async function createHonorRate(data: {
  sessionType?: "REGULAR" | "PRIVATE";
  nominal: number;
  effectiveFrom: Date;
  subjectId?: string;
  programId?: string;
  notes?: string;
}) {
  const effectiveFrom = startOfBusinessDate(data.effectiveFrom);
  return prisma.$transaction(async (tx) => {
    if (!data.programId) throw new AppError("Program wajib dipilih.", 422);
    const program = await tx.program.findFirst({ where: { id: data.programId, isActive: true } });
    if (!program) throw new AppError("Program tidak ditemukan atau tidak aktif.", 422);
    const sessionType = program.learningModel === "CLASS_BASED" ? "REGULAR" : "PRIVATE";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`honor:${program.id}`}))`;
    const previous = await tx.honorRate.findFirst({
      where: {
        programId: program.id,
        status: "ACTIVE",
        effectiveTo: null,
      },
    });

    if (previous) {
      const dayBefore = addBusinessDays(effectiveFrom, -1);

      if (previous.effectiveFrom > dayBefore) {
        throw new AppError(
          "Tanggal mulai tarif baru harus setelah tanggal mulai tarif yang sedang aktif (tidak boleh overlap)",
          409,
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
          reason: `Digantikan oleh tarif baru mulai ${formatBusinessDate(effectiveFrom)}`,
        },
      });
    }

    return tx.honorRate.create({
      data: {
        sessionType,
        nominal: data.nominal,
        effectiveFrom,
        subjectId: data.subjectId,
        programId: data.programId,
        status: "ACTIVE",
        notes: data.notes,
      },
    });
  });
}

export async function listHonorRates(
  sessionType?: "REGULAR" | "PRIVATE",
  programId?: string,
) {
  return prisma.honorRate.findMany({
    where: {
      ...(sessionType ? { sessionType } : {}),
      ...(programId ? { programId } : {}),
    },
    include: { program: true },
    orderBy: [{ sessionType: "asc" }, { effectiveFrom: "desc" }],
  });
}

export async function listHonorRateHistory() {
  return prisma.honorRateHistory.findMany({
    include: { rate: { include: { program: true } } },
    orderBy: { changedAt: "desc" },
  });
}

export async function deactivateHonorRate(
  id: string,
  adminId: string,
  reason?: string,
) {
  const rate = await prisma.honorRate.findUnique({ where: { id } });
  if (!rate) throw new AppError("Tarif honor tidak ditemukan", 404);

  return prisma.$transaction(async (tx) => {
    await tx.honorRateHistory.create({
      data: {
        rateId: rate.id,
        oldNominal: rate.nominal,
        newNominal: rate.nominal,
        changedBy: adminId,
        reason: reason || "Dinonaktifkan oleh admin",
      },
    });

    return tx.honorRate.update({ where: { id }, data: { status: "INACTIVE" } });
  });
}
