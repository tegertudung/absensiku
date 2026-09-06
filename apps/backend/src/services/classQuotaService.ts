import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export async function getClassProgramQuota(programId: string, classId: string, db: PrismaClient | Prisma.TransactionClient = prisma) {
  const program = await db.program.findUnique({ where: { id: programId } });
  if (!program || program.learningModel !== 'CLASS_BASED') throw new AppError('Program kelas tidak ditemukan.', 422);
  const used = await db.teachingSession.count({ where: { programId, classId, status: 'COMPLETED' } });
  return { programId, programName: program.name, usesQuota: program.usesQuota,
    quotaTotal: program.defaultMeetingQuota, quotaUsed: used,
    quotaRemaining: Math.max(program.defaultMeetingQuota - used, 0) };
}

export async function getClassQuotas(classId: string, db: PrismaClient | Prisma.TransactionClient = prisma) {
  const programs = await db.program.findMany({ where: { learningModel: 'CLASS_BASED', OR: [
    { studentPrograms: { some: { classId, status: 'ACTIVE' } } },
    { schedules: { some: { classId } } }, { sessions: { some: { classId } } },
  ] }, orderBy: { name: 'asc' } });
  return Promise.all(programs.map(p => getClassProgramQuota(p.id, classId, db)));
}
