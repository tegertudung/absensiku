import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { logAudit } from '../utils/auditLog';
import { createNotification } from './notificationService';

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function formatScheduleTime(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function notifyTutorOfSchedule(
  tutorId: string,
  title: string,
  dayOfWeek: number,
  startTime: Date,
  endTime: Date
) {
  const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
  if (!tutor) return;

  await createNotification({
    userId: tutor.userId,
    title,
    message: `${DAY_NAMES[dayOfWeek]}, ${formatScheduleTime(startTime)}–${formatScheduleTime(endTime)}`,
    type: 'SCHEDULE_CHANGE',
  });
}

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

  const schedule = await prisma.schedule.create({
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

  await notifyTutorOfSchedule(
    data.tutorId,
    'Jadwal baru ditambahkan',
    data.dayOfWeek,
    data.startTime,
    data.endTime
  );

  return schedule;
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

  const updated = await prisma.schedule.update({ where: { id }, data });

  if (data.dayOfWeek !== undefined || data.startTime || data.endTime) {
    await notifyTutorOfSchedule(
      updated.tutorId,
      'Jadwal Anda diubah',
      updated.dayOfWeek,
      updated.startTime,
      updated.endTime
    );
  }

  return updated;
}

export async function setScheduleStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED',
  adminId: string
) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError('Jadwal tidak ditemukan', 404);

  const updated = await prisma.schedule.update({ where: { id }, data: { status } });

  await logAudit({
    tableName: 'schedules',
    recordId: id,
    action: 'UPDATE',
    oldValues: { status: schedule.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: `Ubah status jadwal menjadi ${status}`,
  });

  return updated;
}
