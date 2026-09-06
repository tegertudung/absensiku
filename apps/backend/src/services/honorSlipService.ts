import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { getSettings } from './settingsService';

export async function buildHonorSlip(tutorId: string, month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [tutor, settings, sessions] = await Promise.all([
    prisma.tutor.findUnique({ where: { id: tutorId } }), getSettings(),
    prisma.teachingSession.findMany({ where: { tutorId, status: 'COMPLETED', sessionDate: { gte: start, lt: end }, honorRateSnapshot: { not: null } }, include: { program: true }, orderBy: { sessionDate: 'asc' } }),
  ]);
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  if (!sessions.length) throw new AppError('Belum ada sesi selesai pada periode tersebut.', 404);
  const rows = new Map<string, { program: string; sessions: number; rate: string; subtotal: number }>();
  for (const s of sessions) { const rate = s.honorRateSnapshot!.toString(); const program = s.program?.name ?? (s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'); const key=`${program}:${rate}`; const row=rows.get(key) ?? {program,sessions:0,rate,subtotal:0}; row.sessions++; row.subtotal += Number(rate); rows.set(key,row); }
  return { tutor, settings, month, year, rows: [...rows.values()], totalSessions: sessions.length, totalHonor: [...rows.values()].reduce((total,row)=>total+row.subtotal,0) };
}
