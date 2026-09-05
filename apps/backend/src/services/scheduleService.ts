import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";
import {
  createNotification,
  notifyParentsOfStudent,
  notifyParentsOfClass,
} from "./notificationService";
import { getMinimumScheduleStartGapMinutes } from "./settingsService";
import { getProgramForSessionType } from "./programService";

const DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jum'at",
  "Sabtu",
];
export const MIN_SCHEDULE_START_GAP_MINUTES = 30;

function formatScheduleTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function notifyTutorOfSchedule(
  tutorId: string,
  title: string,
  dayOfWeek: number,
  startTime: Date,
  endTime: Date,
  type: string = "SCHEDULE_CHANGE",
) {
  const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
  if (!tutor) return;

  await createNotification({
    userId: tutor.userId,
    title,
    message: `${DAY_NAMES[dayOfWeek]}, ${formatScheduleTime(startTime)}–${formatScheduleTime(endTime)}`,
    type,
  });
}

/**
 * Notifikasi Orang Tua (Tier 2): mirrors notifyTutorOfSchedule but for the
 * child(ren) attached to this schedule — a single student for PRIVATE, or
 * every actively-enrolled student for REGULAR (the schedule belongs to the
 * whole class, not one family).
 */
async function notifyParentsOfSchedule(
  schedule: {
    sessionType: string;
    studentId: string | null;
    classId: string | null;
  },
  title: string,
  dayOfWeek: number,
  startTime: Date,
  endTime: Date,
) {
  const timeLabel = `${DAY_NAMES[dayOfWeek]}, ${formatScheduleTime(startTime)}–${formatScheduleTime(endTime)}`;
  if (schedule.sessionType === "PRIVATE" && schedule.studentId) {
    await notifyParentsOfStudent(schedule.studentId, {
      title,
      message: timeLabel,
      type: "SCHEDULE_CHANGE",
    });
  } else if (schedule.sessionType === "REGULAR" && schedule.classId) {
    await notifyParentsOfClass(schedule.classId, (studentName) => ({
      title,
      message: `${timeLabel} (kelas yang diikuti ${studentName})`,
      type: "SCHEDULE_CHANGE",
    }));
  }
}

function timeToMinutes(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export interface ScheduleConflict {
  scheduleId: string;
  sessionType: string;
  label: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startGapMinutes: number;
}

/**
 * Section J: "kelas bentrok" — two ACTIVE schedules for the same tutor on the
 * same day of week whose time ranges overlap. Same-tutor-same-time is
 * physically impossible regardless of whether either schedule is REGULAR or
 * PRIVATE, so sessionType is intentionally not part of the filter. Compared
 * as minutes-since-midnight rather than raw DateTime, since startTime/endTime
 * are stored combined with an arbitrary date — only the time-of-day matters
 * for a recurring weekly schedule.
 */
export async function findScheduleConflicts(
  tutorId: string,
  dayOfWeek: number,
  startTime: Date,
  endTime: Date,
  excludeScheduleId?: string,
): Promise<ScheduleConflict[]> {
  const candidates = await prisma.schedule.findMany({
    where: {
      tutorId,
      dayOfWeek,
      status: "ACTIVE",
      id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
    },
    include: {
      class: { select: { name: true, quotaTotal: true, quotaRemaining: true } },
      student: {
        select: {
          name: true,
          packages: {
            where: { status: "ACTIVE" },
            select: { quotaTotal: true, quotaRemaining: true },
            take: 1,
          },
        },
      },
    },
  });

  const newStart = timeToMinutes(startTime);
  // End time is intentionally not part of the locked spacing rule.

  return candidates
    .map((c) => {
      const cStart = timeToMinutes(c.startTime);
      const startGapMinutes = Math.abs(newStart - cStart);
      return { c, startGapMinutes };
    })
    .map(({ c, startGapMinutes }) => ({
      scheduleId: c.id,
      sessionType: c.sessionType,
      label:
        c.sessionType === "REGULAR"
          ? (c.class?.name ?? "-")
          : (c.student?.name ?? "-"),
      dayOfWeek: c.dayOfWeek,
      startTime: formatScheduleTime(c.startTime),
      endTime: formatScheduleTime(c.endTime),
      startGapMinutes,
    }));
}

async function assertAllowedOverlap(
  conflicts: ScheduleConflict[],
  newStartTime: Date,
) {
  const minimum = await getMinimumScheduleStartGapMinutes();
  const blocked = conflicts.find(
    (conflict) => conflict.startGapMinutes < minimum,
  );
  if (blocked) {
    const error = new AppError(
      `Jarak jam mulai dengan jadwal Tentor yang sudah ada kurang dari ${minimum} menit.`,
      409,
    ) as AppError & { code?: string; details?: unknown };
    error.code = "SCHEDULE_START_GAP_TOO_SHORT";
    error.details = {
      minimumStartGapMinutes: minimum,
      actualStartGapMinutes: blocked.startGapMinutes,
      conflictingScheduleId: blocked.scheduleId,
      conflictingStartTime: blocked.startTime,
      newStartTime: formatScheduleTime(newStartTime),
    };
    throw error;
  }
}

export async function createSchedule(data: {
  tutorId: string;
  sessionType: "REGULAR" | "PRIVATE";
  programId: string;
  classId?: string;
  studentId?: string;
  subjectId?: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  startDate: Date;
  endDate?: Date;
  mode?: "ONLINE" | "OFFLINE";
  location?: string;
  notes?: string;
}) {
  const tutor = await prisma.tutor.findUnique({ where: { id: data.tutorId } });
  if (!tutor || tutor.deletedAt)
    throw new AppError("Tentor tidak ditemukan", 404);
  if (tutor.status !== "ACTIVE") throw new AppError("Tentor tidak aktif", 400);

  if (data.sessionType === "REGULAR" && !data.classId) {
    throw new AppError("classId wajib diisi untuk jadwal reguler", 400);
  }
  if (data.sessionType === "PRIVATE" && !data.studentId) {
    throw new AppError("studentId wajib diisi untuk jadwal privat", 400);
  }
  if (data.startTime.getTime() >= data.endTime.getTime()) {
    throw new AppError("Jam mulai harus sebelum jam selesai", 400);
  }

  const conflicts = await findScheduleConflicts(
    data.tutorId,
    data.dayOfWeek,
    data.startTime,
    data.endTime,
  );
  await assertAllowedOverlap(conflicts, data.startTime);

  const program = await prisma.program.findFirst({
    where: { id: data.programId, isActive: true },
  });
  if (!program)
    throw new AppError("Program tidak ditemukan atau tidak aktif", 404);
  if (
    (program.learningModel === "CLASS_BASED") !==
    (data.sessionType === "REGULAR")
  )
    throw new AppError("Program tidak sesuai dengan jenis jadwal.", 400);
  const schedule = await prisma.schedule.create({
    data: {
      tutorId: data.tutorId,
      sessionType: data.sessionType,
      classId: data.sessionType === "REGULAR" ? data.classId : undefined,
      studentId: data.sessionType === "PRIVATE" ? data.studentId : undefined,
      subjectId: data.subjectId,
      programId: program.id,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      startDate: data.startDate,
      endDate: data.endDate,
      status: "ACTIVE",
      mode: data.mode ?? "OFFLINE",
      // Location only makes sense for an in-person slot — dropped rather than
      // stored when mode is ONLINE, so switching modes later can't leave a
      // stale address behind.
      location: data.mode === "ONLINE" ? undefined : data.location,
      notes: data.notes,
    },
  });

  await notifyTutorOfSchedule(
    data.tutorId,
    "Jadwal baru ditambahkan",
    data.dayOfWeek,
    data.startTime,
    data.endTime,
  );

  if (conflicts.length > 0) {
    await notifyTutorOfSchedule(
      data.tutorId,
      `Jadwal bentrok terdeteksi dengan ${conflicts.length} jadwal lain`,
      data.dayOfWeek,
      data.startTime,
      data.endTime,
      "SCHEDULE_CONFLICT",
    );
  }

  // Merged onto the schedule object so existing callers reading plain schedule
  // fields (id, tutorId, ...) are unaffected; new callers can check `.conflicts`
  // for an immediate inline warning without waiting on the notification.
  return { ...schedule, conflicts };
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
      // A tutor's personal calendar contains only explicitly assigned
      // occurrences. Unassigned class occurrences are claimable via the
      // direct-session lookup, never presented as that tutor's schedule.
      tutorId: filters.tutorId,
      sessionType: filters.sessionType as any,
      status: filters.status as any,
      classId: filters.classId,
      studentId: filters.studentId,
    },
    include: {
      tutor: { select: { name: true } },
      program: { select: { id: true, name: true, learningModel: true } },
      pattern: {
        select: {
          id: true,
          programId: true,
          program: { select: { id: true, name: true, learningModel: true } },
        },
      },
      // Quota included so Tentor Jadwal can show/disable "Mulai Kelas" once a
      // class or package runs out, same rule as the Beranda dashboard cards.
      class: { select: { name: true, quotaTotal: true, quotaRemaining: true } },
      student: {
        select: {
          name: true,
          packages: {
            where: { status: "ACTIVE" },
            select: { quotaTotal: true, quotaRemaining: true },
            take: 1,
          },
        },
      },
      subject: { select: { name: true } },
    },
    orderBy: [
      { occurrenceDate: "asc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
    ],
  });
}

/**
 * One-time-safe compatibility repair for generated occurrences created before
 * programId was copied from their parent pattern. Standalone schedules are
 * deliberately excluded: only an explicit parent relation may supply a value.
 */
export async function repairLegacyOccurrencePrograms() {
  const candidates = await prisma.schedule.findMany({
    where: { programId: null, patternId: { not: null } },
    select: { id: true, pattern: { select: { programId: true } } },
  });
  const repairs = candidates.filter((item) => item.pattern?.programId);
  if (!repairs.length) return 0;
  const result = await prisma.$transaction(
    repairs.map((item) =>
      prisma.schedule.updateMany({
        where: { id: item.id, programId: null },
        data: { programId: item.pattern!.programId! },
      }),
    ),
  );
  return result.reduce((total, item) => total + item.count, 0);
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
  if (!schedule) throw new AppError("Jadwal tidak ditemukan", 404);
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
    mode: "ONLINE" | "OFFLINE";
    location: string | null;
    notes: string;
  }>,
  // Set when a TENTOR (not admin) makes the change — "Ajukan Perubahan
  // Jadwal" takes effect immediately (no approval step, same as "Tambah
  // Privat"), but is logged for admin visibility via the existing Audit Log.
  meta?: { changedBy: string; reason: string },
) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError("Jadwal tidak ditemukan", 404);
  if (schedule.isPattern)
    throw new AppError(
      "Pola kelas harus diubah melalui pengaturan pola jadwal.",
      400,
    );

  if (
    data.startTime &&
    data.endTime &&
    data.startTime.getTime() >= data.endTime.getTime()
  ) {
    throw new AppError("Jam mulai harus sebelum jam selesai", 400);
  }

  const nextDay = data.dayOfWeek ?? schedule.dayOfWeek;
  const nextStart = data.startTime ?? schedule.startTime;
  const nextEnd = data.endTime ?? schedule.endTime;
  const conflictsBeforeUpdate = schedule.tutorId
    ? await findScheduleConflicts(
        schedule.tutorId,
        nextDay,
        nextStart,
        nextEnd,
        id,
      )
    : [];
  if (schedule.tutorId)
    await assertAllowedOverlap(conflictsBeforeUpdate, nextStart);
  // Same rule as createSchedule: switching to ONLINE drops any stale address.
  if (data.mode === "ONLINE") data.location = null;
  const updated = await prisma.schedule.update({
    where: { id },
    data: {
      ...data,
      ...(schedule.occurrenceDate && data.startDate
        ? { occurrenceDate: data.startDate }
        : {}),
    },
  });

  if (meta) {
    await logAudit({
      tableName: "schedules",
      recordId: id,
      action: "UPDATE",
      oldValues: {
        dayOfWeek: schedule.dayOfWeek,
        startTime: formatScheduleTime(schedule.startTime),
        endTime: formatScheduleTime(schedule.endTime),
      },
      newValues: {
        dayOfWeek: updated.dayOfWeek,
        startTime: formatScheduleTime(updated.startTime),
        endTime: formatScheduleTime(updated.endTime),
      },
      changedBy: meta.changedBy,
      reason: `Tentor mengajukan perubahan jadwal: ${meta.reason}`,
    });
  }

  let conflicts: ScheduleConflict[] = [];

  if (
    schedule.tutorId &&
    (data.dayOfWeek !== undefined || data.startTime || data.endTime)
  ) {
    conflicts = await findScheduleConflicts(
      updated.tutorId!,
      updated.dayOfWeek,
      updated.startTime,
      updated.endTime,
      id,
    );

    await notifyTutorOfSchedule(
      updated.tutorId!,
      "Jadwal Anda diubah",
      updated.dayOfWeek,
      updated.startTime,
      updated.endTime,
    );

    await notifyParentsOfSchedule(
      updated,
      "Jadwal Berubah",
      updated.dayOfWeek,
      updated.startTime,
      updated.endTime,
    ).catch((err) =>
      console.error(
        "[notify] schedule change parent notification failed:",
        err,
      ),
    );

    if (conflicts.length > 0) {
      await notifyTutorOfSchedule(
        updated.tutorId!,
        `Jadwal bentrok terdeteksi dengan ${conflicts.length} jadwal lain`,
        updated.dayOfWeek,
        updated.startTime,
        updated.endTime,
        "SCHEDULE_CONFLICT",
      );
    }
  }

  return { ...updated, conflicts };
}

export async function setScheduleStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE" | "CANCELLED",
  adminId: string,
) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError("Jadwal tidak ditemukan", 404);

  const updated = await prisma.schedule.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    tableName: "schedules",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: schedule.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: `Ubah status jadwal menjadi ${status}`,
  });

  // Notifikasi Orang Tua (Tier 2) — only the actual "dibatalkan" transition;
  // INACTIVE is left alone since admins also use it to archive a schedule
  // that's being replaced, not necessarily to disrupt an ongoing one.
  if (status === "CANCELLED" && schedule.status !== "CANCELLED") {
    await notifyParentsOfSchedule(
      updated,
      "Jadwal Dibatalkan",
      updated.dayOfWeek,
      updated.startTime,
      updated.endTime,
    ).catch((err) =>
      console.error(
        "[notify] schedule cancellation parent notification failed:",
        err,
      ),
    );
  }

  return updated;
}
