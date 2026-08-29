import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export const PROGRAM_CODES = ['REGULAR', 'PRIVATE'] as const;

export async function ensureCorePrograms() {
  await Promise.all([
    prisma.program.upsert({ where: { code: 'REGULAR' }, update: {}, create: { code: 'REGULAR', name: 'Reguler', learningModel: 'CLASS_BASED', usesQuota: true, defaultMeetingQuota: 24 } }),
    prisma.program.upsert({ where: { code: 'PRIVATE' }, update: {}, create: { code: 'PRIVATE', name: 'Privat', learningModel: 'INDIVIDUAL', usesQuota: true, defaultMeetingQuota: 24 } }),
  ]);
}

export async function listPrograms(includeInactive = true) {
  await ensureCorePrograms();
  return prisma.program.findMany({ where: includeInactive ? undefined : { isActive: true }, orderBy: { code: 'asc' } });
}

export async function createProgram(data: { code: string; name: string; learningModel: string; usesQuota: boolean; defaultMeetingQuota: number }) {
  return prisma.program.create({ data: { ...data, code: data.code.trim().toUpperCase(), name: data.name.trim() } });
}

export async function updateProgram(id: string, data: Partial<{ name: string; learningModel: string; usesQuota: boolean; defaultMeetingQuota: number; isActive: boolean }>) {
  const current = await prisma.program.findUnique({ where: { id } });
  if (!current) throw new AppError('Program tidak ditemukan', 404);
  return prisma.program.update({ where: { id }, data });
}

export async function getProgram(id: string) {
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) throw new AppError('Program tidak ditemukan', 404);
  return program;
}

export async function deleteProgram(id: string) {
  return prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id } });
    if (!program) throw new AppError('Program tidak ditemukan', 404);
    if (PROGRAM_CODES.includes(program.code as (typeof PROGRAM_CODES)[number])) {
      throw new AppError('Program tidak dapat dihapus karena sudah digunakan pada data operasional.', 409);
    }
    const [classes, privatePackages, schedules, sessions, honorRates] = await Promise.all([
      tx.class.count({ where: { programId: id } }),
      tx.privatePackage.count({ where: { programId: id } }),
      tx.schedule.count({ where: { programId: id } }),
      tx.teachingSession.count({ where: { programId: id } }),
      tx.honorRate.count({ where: { programId: id } }),
    ]);
    if (classes + privatePackages + schedules + sessions + honorRates > 0) {
      throw new AppError('Program tidak dapat dihapus karena sudah digunakan pada data operasional.', 409);
    }
    return tx.program.delete({ where: { id } });
  });
}

export async function getProgramForSessionType(sessionType: string) {
  await ensureCorePrograms();
  return prisma.program.findUnique({ where: { code: sessionType } });
}
