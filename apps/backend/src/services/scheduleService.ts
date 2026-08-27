import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export async function createSchedule(data: {
  tutorId: string;
  sessionType: 'REGULAR' | 'PRIVATE';
  classId?: string;
  studentId?: string;
  subjectId?: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}) {
  const tutor = await prisma.tutor.findUnique({ where: { id: data.tutorId } });
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  if (tutor.status !== 'ACTIVE') throw new AppError('Tentor tidak aktif', 400);

  if (data.sessionType === 'REGULAR' && !data.classId) {
    throw new AppError('classId wajib diisi untuk jadwal reguler', 400);
  }
  if (data.sessionType === 'PRIVATE' && !data.studentId) {
    throw new AppError('studentId wajib diisi untuk jadwal privat', 400);
  }
  if (data.startTime.getTime() >= data.endTime.getTime()) {
    throw new AppError('Jam mulai harus sebelum jam selesai', 400);
  }

  return prisma.schedule.create({
    data: {
      tutorId: data.tutorId,
      sessionType: data.sessionType,
      classId: data.sessionType === 'REGULAR' ? data.classId : undefined,
      studentId: data.sessionType === 'PRIVATE' ? data.studentId : undefined,
      subjectId: data.subjectId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'ACTIVE',
      notes: data.notes,
    },
  });
}

export async function listSchedules(filters: {
  tutorId?: string;
  sessionType?: string;
  status?: string;
  classId?: string;
  studentId?: string;
}) {
  return prisma.schedule.findMany({
    where: {
      tutorId: filters.tutorId,
      sessionType: filters.sessionType as any,
      status: filters.status as any,
      classId: filters.classId,
      studentId: filters.studentId,
    },
    include: {
      tutor: { select: { name: true } },
      class: { select: { name: true } },
      student: { select: { name: true } },
      subject: { select: { name: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function getScheduleById(id: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      tutor: { select: { name: true } },
      class: { select: { name: true } },
      student: { select: { name: true } },
      subject: { select: { name: true } },
    },
  });
  if (!schedule) throw new AppError('Jadwal tidak ditemukan', 404);
  return schedule;
}

export async function updateSchedule(
  id: string,
  data: Partial<{
    dayOfWeek: number;
    startTime: Date;
    endTime: Date;
    startDate: Date;
    endDate: Date;
    notes: string;
  }>
) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError('Jadwal tidak ditemukan', 404);

  if (data.startTime && data.endTime && data.startTime.getTime() >= data.endTime.getTime()) {
    throw new AppError('Jam mulai harus sebelum jam selesai', 400);
  }

  return prisma.schedule.update({ where: { id }, data });
}

export async function setScheduleStatus(id: string, status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED') {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError('Jadwal tidak ditemukan', 404);
  return prisma.schedule.update({ where: { id }, data: { status } });
}
