import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";

export async function listPrograms(includeInactive = true) {
  return prisma.program.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { code: "asc" },
  });
}

export async function createProgram(data: {
  code: string;
  name: string;
  learningModel: "CLASS_BASED" | "INDIVIDUAL";
  usesQuota: boolean;
  defaultMeetingQuota: number;
  honorNominal: number;
  honorEffectiveFrom: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const { honorNominal, honorEffectiveFrom, ...programData } = data;
    const program = await tx.program.create({
      data: {
        ...programData,
        code: programData.code.trim().toUpperCase(),
        name: programData.name.trim(),
      },
    });
    const rate = await tx.honorRate.create({
      data: {
        programId: program.id,
        sessionType:
          program.learningModel === "CLASS_BASED" ? "REGULAR" : "PRIVATE",
        nominal: honorNominal,
        effectiveFrom: honorEffectiveFrom,
        status: "ACTIVE",
      },
    });
    await tx.honorRateHistory.create({
      data: {
        rateId: rate.id,
        newNominal: rate.nominal,
        reason: "Tarif honor awal program",
      },
    });
    return program;
  });
}

export async function updateProgram(
  id: string,
  data: Partial<{
    name: string;
    learningModel: string;
    usesQuota: boolean;
    defaultMeetingQuota: number;
    isActive: boolean;
  }>,
) {
  const current = await prisma.program.findUnique({ where: { id } });
  if (!current) throw new AppError("Program tidak ditemukan", 404);
  return prisma.program.update({ where: { id }, data });
}

export async function getProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) throw new AppError("Program tidak ditemukan", 404);
  return program;
}

export async function deleteProgram(id: string) {
  return prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id } });
    if (!program) throw new AppError("Program tidak ditemukan", 404);
    const [classes, privatePackages, schedules, sessions, honorRates] =
      await Promise.all([
        tx.class.count({ where: { programId: id } }),
        tx.privatePackage.count({ where: { programId: id } }),
        tx.schedule.count({ where: { programId: id } }),
        tx.teachingSession.count({ where: { programId: id } }),
        tx.honorRate.count({ where: { programId: id } }),
      ]);
    if (classes + privatePackages + schedules + sessions + honorRates > 0) {
      throw new AppError(
        "Program tidak dapat dihapus karena sudah digunakan pada data operasional.",
        409,
      );
    }
    return tx.program.delete({ where: { id } });
  });
}

export async function getProgramForSessionType(sessionType: string) {
  return prisma.program.findUnique({ where: { code: sessionType } });
}
