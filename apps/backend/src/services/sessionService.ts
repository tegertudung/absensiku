import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { getApplicableHonorRate } from "./honorService";
import { formatBusinessDate, isAfterBusinessDate, startOfBusinessDate, addBusinessDays } from "../utils/businessDate";
import { getClassProgramQuota } from "./classQuotaService";
import { logAudit } from "../utils/auditLog";
import { getProgramForSessionType } from "./programService";
import { getSettings } from "./settingsService";
import {
  createNotification,
  notifyParentsOfStudent,
  notifyParentsOfClass,
} from "./notificationService";
import { resolvePrivateSessionParticipantIds } from "./privateSessionParticipantService";

export class SessionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Statuses from which a session may still be completed or cancelled.
// COMPLETED and CANCELLED_NOT_COUNTED are terminal (BR-13: further changes need admin correction with audit trail).
const OPEN_STATUSES = ["SCHEDULED", "IN_PROGRESS"];

// BR-07/AC-05: tentor loses edit rights 3 days after the session date.
export const OVERDUE_DAYS = 3;

/**
 * Synchronous backstop for AC-05, independent of the hourly lock job (see
 * jobs/lockOverdueSessions.ts) — closes the up-to-1-hour gap between a
 * session becoming overdue and the next cron tick. A tentor cannot act on an
 * overdue session even if its status hasn't been flipped to PENDING_ADMIN
 * yet; admin is never subject to this (actingTutorId is null for admin).
 */
export function isOverdue(sessionDate: Date): boolean {
  const cutoff = addBusinessDays(new Date(), -OVERDUE_DAYS);
  return sessionDate.getTime() < cutoff.getTime();
}

/**
 * Resolve a logged-in user's Tutor profile id, if any.
 * Used to scope TENTOR-role requests to their own data (Kontrol Akses in the spec).
 */
export async function resolveTutorIdForUser(
  userId: string,
): Promise<string | null> {
  const tutor = await prisma.tutor.findFirst({
    where: { userId, deletedAt: null },
  });
  return tutor?.id ?? null;
}

/**
 * Throws 403 if a TENTOR is trying to act on a resource that isn't theirs.
 * Pass `actingTutorId = null/undefined` for ADMIN (no restriction).
 */
function assertOwnership(
  actingTutorId: string | null | undefined,
  resourceTutorId: string,
) {
  if (actingTutorId && actingTutorId !== resourceTutorId) {
    throw new SessionError("Anda tidak memiliki akses ke sesi ini", 403);
  }
}

/**
 * Tentor opens a scheduled slot and starts recording a session.
 * BR-05: for PRIVATE sessions, block up front if the package has no quota left —
 * actual quota deduction happens later, on completion (so a session that never
 * finishes doesn't consume quota).
 */
export async function createSessionFromSchedule(params: {
  scheduleId: string;
  sessionDate: Date;
  createdBy: string;
  actingTutorId?: string | null;
}) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: params.scheduleId },
  });
  if (!schedule) throw new SessionError("Jadwal tidak ditemukan", 404);
  if (schedule.status !== "ACTIVE")
    throw new SessionError("Jadwal tidak aktif", 400);
  if (!schedule.tutorId || !schedule.subjectId)
    throw new SessionError(
      "Pola kelas belum dilengkapi sebagai pertemuan aktual.",
      400,
    );
  if (!schedule.programId)
    throw new SessionError(
      "Program pada jadwal ini belum ditentukan. Minta Admin memperbarui jadwal.",
      422,
    );
  if (schedule.isPattern) throw new SessionError("Pilih pertemuan nyata dari pola jadwal.", 422);
  if (schedule.occurrenceDate && formatBusinessDate(schedule.occurrenceDate) !== formatBusinessDate(params.sessionDate))
    throw new SessionError("Tanggal sesi harus sesuai dengan pertemuan.", 422);
  const assignedTutorId = schedule.tutorId;

  assertOwnership(params.actingTutorId, schedule.tutorId);

  const existing = await prisma.teachingSession.findFirst({
    where: { scheduleId: schedule.id },
  });
  if (existing) {
    if (existing.status === "COMPLETED")
      throw new SessionError("Pertemuan ini sudah selesai.", 409);
    return existing;
  }

  if (schedule.sessionType === "PRIVATE") {
    if (!schedule.studentId)
      throw new SessionError("Jadwal privat tidak memiliki siswa", 400);

    const pkg = await prisma.privatePackage.findFirst({
      where: {
        studentId: schedule.studentId,
        programId: schedule.programId,
        status: "ACTIVE",
        quotaRemaining: { gt: 0 },
      },
    });
    if (!pkg) {
      throw new SessionError(
        "Paket privat tidak aktif atau kuota sudah habis. Hubungi admin untuk perpanjangan.",
        409,
      );
    }
  }

  if (schedule.sessionType === "REGULAR") {
    if (!schedule.classId)
      throw new SessionError("Jadwal reguler tidak memiliki kelas", 400);
    const quota = await getClassProgramQuota(schedule.programId, schedule.classId);
    if (quota.usesQuota && quota.quotaRemaining <= 0) {
      throw new SessionError(
        "Kuota pertemuan kelas ini telah habis. Hubungi Admin untuk menambahkan pertemuan.",
        409,
      );
    }
  }

  // PostgreSQL advisory lock makes the find/create pair idempotent for one
  // occurrence without requiring a schema migration on an already-live DB.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schedule.id}))`;
    const concurrent = await tx.teachingSession.findFirst({
      where: { scheduleId: schedule.id },
    });
    if (concurrent) {
      if (concurrent.status === "COMPLETED")
        throw new SessionError("Pertemuan ini sudah selesai.", 409);
      return concurrent;
    }
    return tx.teachingSession.create({
      data: {
        scheduleId: schedule.id,
        tutorId: assignedTutorId,
        sessionType: schedule.sessionType,
        sessionDate: schedule.occurrenceDate ?? startOfBusinessDate(params.sessionDate),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        mode: schedule.mode,
        location: schedule.location,
        classId: schedule.classId,
        studentId: schedule.studentId,
        subjectId: schedule.subjectId,
        programId: schedule.programId,
        status: "IN_PROGRESS",
        createdBy: params.createdBy,
      },
    });
  });
}

/**
 * BR-04/BR-09: mark a session COMPLETED, snapshotting the honor rate that is
 * currently in effect and, for PRIVATE sessions, atomically deducting one
 * unit of quota. Everything happens in a single transaction — either both the
 * quota deduction and the session update succeed, or neither does.
 */
// Notifikasi Orang Tua (Tier 1): what completeSession() found out mid-
// transaction that the post-commit notification step needs to know about.
type CompletionNotifyInfo =
  | {
      kind: "PRIVATE";
      participants: Array<{
        studentId: string;
        studentName: string;
        quotaRemaining: number;
      }>;
      subjectName: string | null;
      score: number | null;
    }
  | { kind: "REGULAR"; classId: string; quotaRemaining: number }
  | null;

type SessionRecord = {
  material?: string;
  teachingNotes?: string;
  progressNotes?: string;
  score?: number | null;
};
type Tx = Prisma.TransactionClient;

async function finalizeTeachingSession(
  tx: Tx,
  sessionId: string,
  userId: string,
  actingTutorId?: string | null,
  record?: SessionRecord,
  enforceOverdue = true,
  validationApproval = false,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`session:${sessionId}`}))`;
  const session = await tx.teachingSession.findUnique({
    where: { id: sessionId },
    include: {
      subject: { select: { id: true, name: true } },
      student: { select: { name: true } },
      attendanceRecords: { select: { studentId: true } },
      program: true,
    },
  });
  if (!session) throw new SessionError("Sesi tidak ditemukan", 404);

  assertOwnership(actingTutorId, session.tutorId);

  if (enforceOverdue && actingTutorId && isOverdue(session.sessionDate)) {
    throw new SessionError(
      `Sesi ini sudah melewati batas ${OVERDUE_DAYS} hari dan terkunci dari tentor. Hubungi admin untuk penyelesaian.`,
      409,
    );
  }

  if (!OPEN_STATUSES.includes(session.status) && !(validationApproval && session.status === "PENDING_ADMIN")) {
    throw new SessionError(
      `Sesi berstatus "${session.status}" tidak dapat diselesaikan`,
      409,
    );
  }

  const material = record?.material?.trim() ?? session.material?.trim();
  const teachingNotes = record?.teachingNotes ?? session.teachingNotes;
  const progressNotes =
    record?.progressNotes?.trim() ?? session.progressNotes?.trim();
  if (!material) throw new SessionError("Materi hari ini wajib diisi.", 422);
  const individual = session.program?.learningModel === "INDIVIDUAL";
  if (individual && !progressNotes) {
    throw new SessionError(
      "Catatan perkembangan wajib diisi untuk sesi privat.",
      422,
    );
  }

  if (!session.programId)
    throw new SessionError("Sesi tidak memiliki Program.", 422);
  const rate = await getApplicableHonorRate(
    session.programId,
    session.sessionDate,
    tx,
  );
  if (!rate) {
    throw new SessionError(
      `Tidak ada tarif honor aktif untuk sesi ${session.sessionType} pada tanggal ${formatBusinessDate(
        session.sessionDate,
      )}. Hubungi admin untuk mengatur master tarif.`,
      422,
    );
  }

  let notifyInfo: CompletionNotifyInfo = null;

  if (session.program?.learningModel === "CLASS_BASED") {
    if (!session.classId)
      throw new SessionError("Sesi reguler tidak memiliki kelas", 400);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quota:${session.programId}:${session.classId}`}))`;
    const quota = await getClassProgramQuota(session.programId, session.classId, tx);
    if (quota.usesQuota && quota.quotaRemaining <= 0)
      throw new SessionError("Kuota pertemuan kelas sudah habis.", 409);
    notifyInfo = {
      kind: "REGULAR",
      classId: session.classId,
      quotaRemaining: Math.max(0, quota.quotaRemaining - 1),
    };
  }

  if (individual) {
    const participantIds = resolvePrivateSessionParticipantIds(session);
    if (!participantIds.length)
      throw new SessionError("Sesi privat tidak memiliki siswa", 400);
    const memberships = await tx.studentProgram.count({ where: { programId: session.programId,
      studentId: { in: participantIds }, status: "ACTIVE", student: { status: "ACTIVE" } } });
    if (memberships !== participantIds.length) throw new SessionError("Siswa harus terdaftar aktif pada Program sesi.", 422);

    const packages = await tx.privatePackage.findMany({
      where: {
        studentId: { in: participantIds },
        programId: session.programId,
        status: "ACTIVE",
        quotaRemaining: { gt: 0 },
      },
      orderBy: { activationDate: "asc" },
    });
    const packageByStudentId = new Map<string, (typeof packages)[number]>();
    for (const pkg of packages) {
      if (!packageByStudentId.has(pkg.studentId)) {
        packageByStudentId.set(pkg.studentId, pkg);
      }
    }
    if (
      participantIds.some((studentId) => !packageByStudentId.has(studentId))
    ) {
      throw new SessionError("Kuota privat siswa sudah habis.", 409);
    }

    const updatedPackages = await Promise.all(
      participantIds.map(async (studentId) => {
        const pkg = packageByStudentId.get(studentId)!;
        const quotaUpdate = await tx.privatePackage.updateMany({
          where: { id: pkg.id, quotaRemaining: { gt: 0 } },
          data: {
            quotaUsed: { increment: 1 },
            quotaRemaining: { decrement: 1 },
          },
        });
        if (quotaUpdate.count !== 1)
          throw new SessionError("Kuota privat siswa sudah habis.", 409);
        const updatedPkg = await tx.privatePackage.findUniqueOrThrow({
          where: { id: pkg.id },
        });
        await tx.privatePackageUsage.create({
          data: {
            packageId: pkg.id,
            sessionId: session.id,
            quantityUsed: 1,
            changeType: "SESSION_COMPLETED",
            changedBy: userId,
            reason: "Sesi privat diselesaikan oleh tentor",
          },
        });
        return { studentId, updatedPkg };
      }),
    );
    const participantStudents = await tx.student.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, name: true },
    });
    const participantNameById = new Map(
      participantStudents.map((student) => [student.id, student.name]),
    );

    const finalScore = record?.score ?? session.score;
    notifyInfo = {
      kind: "PRIVATE",
      participants: updatedPackages.map(({ studentId, updatedPkg }) => ({
        studentId,
        studentName:
          participantNameById.get(studentId) ??
          (studentId === session.studentId ? session.student?.name : null) ??
          "",
        quotaRemaining: updatedPkg.quotaRemaining,
      })),
      subjectName: session.subject?.name ?? null,
      score: finalScore != null ? Number(finalScore) : null,
    };
  }

  const updated = await tx.teachingSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      honorRateSnapshot: individual ? rate.nominal.mul(resolvePrivateSessionParticipantIds(session).length) : rate.nominal,
      material,
      teachingNotes:
        session.sessionType === "REGULAR"
          ? teachingNotes?.trim() || null
          : null,
      progressNotes: session.sessionType === "PRIVATE" ? progressNotes : null,
      score: record?.score ?? session.score,
      completedAt: new Date(),
      updatedBy: userId,
    },
  });

  return { completed: updated, notifyInfo };
}

export async function completeSession(
  sessionId: string,
  userId: string,
  actingTutorId?: string | null,
  record?: SessionRecord,
) {
  const lowQuotaThreshold =
    Number((await getSettings()).lowQuotaWarningThreshold) || 3;
  const { completed, notifyInfo } = await prisma.$transaction((tx) =>
    finalizeTeachingSession(tx, sessionId, userId, actingTutorId, record),
  );

  // Fired only after the transaction actually commits — notifications write
  // through the outer `prisma` client (not `tx`), so triggering them earlier
  // could leave a "sesi selesai" notification standing for a session whose
  // completion later rolled back.
  notifyOfCompletion(notifyInfo, lowQuotaThreshold).catch((err) =>
    console.error("[notify] session completion notification failed:", err),
  );

  return completed;
}

export async function createDirectSession(params: {
  tutorId: string;
  userId: string;
  sessionDate: Date;
  startTime: string;
  endTime: string;
  programId: string;
  sessionType?: "REGULAR" | "PRIVATE";
  classId?: string;
  studentId?: string;
  studentIds?: string[];
  subjectId: string;
  mode: "OFFLINE" | "ONLINE";
  location?: string;
  material: string;
  progressNotes?: string;
  score?: number | null;
  scheduleId?: string;
}) {
  if (isAfterBusinessDate(params.sessionDate, new Date()))
    throw new SessionError(
      "Sesi mengajar tidak dapat dicatat untuk tanggal mendatang.",
      422,
    );
  const dateKey = `${params.sessionDate.getFullYear()}-${String(params.sessionDate.getMonth() + 1).padStart(2, "0")}-${String(params.sessionDate.getDate()).padStart(2, "0")}`;
  const start = new Date(`${dateKey}T${params.startTime}:00`);
  const end = new Date(`${dateKey}T${params.endTime}:00`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new SessionError("Jam selesai harus setelah jam mulai.", 422);
  }

  const lowQuotaThreshold =
    Number((await getSettings()).lowQuotaWarningThreshold) || 3;
  const { completed, notifyInfo } = await prisma.$transaction(async (tx) => {
    const program = await tx.program.findFirst({
      where: { id: params.programId, isActive: true },
    });
    if (!program)
      throw new SessionError("Program tidak ditemukan atau tidak aktif.", 404);
    const sessionType =
      program.learningModel === "CLASS_BASED" ? "REGULAR" : "PRIVATE";
    const slotKey = `meeting:${program.id}:${params.classId ?? params.tutorId}:${dateKey}:${params.startTime}:${params.endTime}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${slotKey}))`;
    const subject = await tx.subject.findFirst({
      where: { id: params.subjectId, isActive: true },
    });
    if (!subject)
      throw new SessionError(
        "Mata pelajaran tidak ditemukan atau tidak aktif.",
        404,
      );

    let classId: string | undefined;
    let studentId: string | undefined;
    let programId: string | null | undefined;
    let privateStudentIds: string[] = [];
    let occurrenceId: string | undefined;
    if (sessionType === "REGULAR") {
      if (!params.classId)
        throw new SessionError("Kelas wajib dipilih untuk sesi reguler.", 422);
      const kelas = await tx.class.findFirst({
        where: { id: params.classId, status: "ACTIVE" },
      });
      if (!kelas)
        throw new SessionError("Kelas tidak ditemukan atau tidak aktif.", 404);
      const rosterCount = await tx.studentProgram.count({
        where: { classId: kelas.id, programId: program.id, status: "ACTIVE" },
      });
      if (!rosterCount)
        throw new SessionError(
          "Kelas belum memiliki siswa pada Program yang dipilih.",
          422,
        );
      classId = kelas.id;
      // Prefer the planned occurrence. A conditional claim prevents two
      // tentors from silently taking the same incomplete meeting.
      const occurrence = await tx.schedule.findFirst({
        where: params.scheduleId
          ? { id: params.scheduleId, isPattern: false, sessionType: "REGULAR" }
          : {
              programId: program.id,
              classId,
              occurrenceDate: params.sessionDate,
              startTime: start,
              endTime: end,
              isPattern: false,
              status: "ACTIVE",
            },
      });
      if (params.scheduleId && !occurrence) throw new SessionError("Pertemuan tidak ditemukan.", 404);
      if (occurrence) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrence.id}))`;
        const current = await tx.schedule.findUniqueOrThrow({ where: { id: occurrence.id } });
        if (current.status !== "ACTIVE") throw new SessionError("Pertemuan dibatalkan atau tidak aktif.", 409);
        if (current.tutorId && current.tutorId !== params.tutorId) throw new SessionError("Pertemuan ini sudah diambil oleh tentor lain.", 409);
        if (!occurrence.occurrenceDate || formatBusinessDate(occurrence.occurrenceDate) !== dateKey || occurrence.startTime.getTime() !== start.getTime() || occurrence.endTime.getTime() !== end.getTime())
          throw new SessionError("Tanggal dan jam harus sesuai dengan pertemuan.", 422);
        if (
          occurrence.programId !== program.id ||
          occurrence.classId !== classId
        )
          throw new SessionError(
            "Occurrence tidak sesuai dengan Program atau Kelas yang dipilih.",
            422,
          );
        if (occurrence.tutorId && occurrence.tutorId !== params.tutorId)
          throw new SessionError(
            "Pertemuan ini sudah dilengkapi oleh tentor lain.",
            409,
          );
        const existingSession = await tx.teachingSession.findFirst({
          where: { scheduleId: occurrence.id },
        });
        if (existingSession) {
          if (existingSession.status === "COMPLETED")
            throw new SessionError("Pertemuan ini sudah selesai.", 409);
          return finalizeTeachingSession(
            tx,
            existingSession.id,
            params.userId,
            params.tutorId,
            {
              material: params.material,
              progressNotes: params.progressNotes,
              score: params.score,
            },
            false,
          );
        }
        if (!occurrence.tutorId) {
          const claimed = await tx.schedule.updateMany({
            where: { id: occurrence.id, tutorId: null },
            data: {
              tutorId: params.tutorId,
              subjectId: subject.id,
              mode: params.mode,
              location:
                params.mode === "OFFLINE"
                  ? params.location?.trim() || null
                  : null,
            },
          });
          if (!claimed.count)
            throw new SessionError(
              "Pertemuan ini sudah diambil oleh tentor lain.",
              409,
            );
        } else if (!occurrence.subjectId) {
          await tx.schedule.update({
            where: { id: occurrence.id },
            data: { subjectId: subject.id },
          });
        }
        occurrenceId = occurrence.id;
      } else {
        // Existing business flow permits a direct regular meeting. It is still
        // an occurrence and is checked again in the transaction above.
        const created = await tx.schedule.create({
          data: {
            tutorId: params.tutorId,
            subjectId: subject.id,
            programId: program.id,
            classId,
            sessionType: "REGULAR",
            dayOfWeek: params.sessionDate.getDay(),
            startTime: start,
            endTime: end,
            startDate: params.sessionDate,
            occurrenceDate: params.sessionDate,
            status: "ACTIVE",
            mode: params.mode,
            location:
              params.mode === "OFFLINE"
                ? params.location?.trim() || null
                : null,
          },
        });
        occurrenceId = created.id;
      }
    } else {
      privateStudentIds =
        params.studentIds ?? (params.studentId ? [params.studentId] : []);
      if (!privateStudentIds.length)
        throw new SessionError("Pilih minimal 1 siswa.", 422);
      if (privateStudentIds.length > 3)
        throw new SessionError("Maksimal 3 siswa dalam satu sesi privat.", 422);
      if (new Set(privateStudentIds).size !== privateStudentIds.length)
        throw new SessionError(
          "Siswa tidak boleh dipilih lebih dari sekali.",
          422,
        );

      const students = await tx.student.findMany({
        where: { id: { in: privateStudentIds }, status: "ACTIVE", programEnrollments: { some: { programId: program.id, status: "ACTIVE" } } },
      });
      if (students.length !== privateStudentIds.length)
        throw new SessionError("Siswa tidak ditemukan atau tidak aktif.", 404);
      const activePackages = await tx.privatePackage.findMany({
        where: {
          studentId: { in: privateStudentIds },
          programId: program.id,
          status: "ACTIVE",
        },
        orderBy: { activationDate: "asc" },
      });
      const activePackageStudentIds = new Set(
        activePackages.map((pkg) => pkg.studentId),
      );
      if (privateStudentIds.some((id) => !activePackageStudentIds.has(id)))
        throw new SessionError("Siswa tidak memiliki paket privat aktif.", 409);
      const packageByStudentId = new Map<
        string,
        (typeof activePackages)[number]
      >();
      for (const pkg of activePackages) {
        if (pkg.quotaRemaining > 0 && !packageByStudentId.has(pkg.studentId)) {
          packageByStudentId.set(pkg.studentId, pkg);
        }
      }
      if (privateStudentIds.some((id) => !packageByStudentId.has(id)))
        throw new SessionError("Kuota privat siswa sudah habis.", 409);

      const rates = await Promise.all(
        privateStudentIds.map(async (id) => {
          const pkg = packageByStudentId.get(id)!;
          const rate = await getApplicableHonorRate(
            program.id,
            params.sessionDate,
            tx,
          );
          if (!rate)
            throw new SessionError(
              `Tidak ada tarif honor aktif untuk Program ${program.name}. Hubungi admin untuk mengatur master tarif.`,
              422,
            );
          return rate;
        }),
      );
      if (new Set(rates.map((rate) => rate.nominal.toString())).size > 1)
        throw new SessionError(
          "Siswa ini memiliki tarif privat yang berbeda dan tidak dapat digabung dalam sesi yang sama.",
          422,
        );

      studentId = privateStudentIds[0];
      programId = packageByStudentId.get(studentId)!.programId;
      const duplicate = await tx.teachingSession.findFirst({ where: {
        tutorId: params.tutorId, programId: program.id, sessionDate: params.sessionDate,
        startTime: start, endTime: end, status: { not: "CANCELLED_NOT_COUNTED" },
        OR: [{ studentId: { in: privateStudentIds } }, { attendanceRecords: { some: { studentId: { in: privateStudentIds } } } }],
      } });
      if (duplicate) throw new SessionError("Sesi untuk siswa pada waktu tersebut sudah tercatat.", 409);
    }
    programId = program.id;
    const session = await tx.teachingSession.create({
      data: {
        scheduleId: occurrenceId,
        tutorId: params.tutorId,
        sessionType,
        sessionDate: params.sessionDate,
        startTime: start,
        endTime: end,
        classId,
        studentId,
        subjectId: subject.id,
        programId,
        status: "SCHEDULED",
        createdBy: params.userId,
        mode: params.mode,
        location:
          params.mode === "OFFLINE" ? params.location?.trim() || null : null,
      },
    });
    if (sessionType === "PRIVATE") {
      await tx.attendanceRecord.createMany({
        data: privateStudentIds.map((participantId) => ({
          sessionId: session.id,
          studentId: participantId,
          status: "PRESENT",
        })),
      });
    }
    return finalizeTeachingSession(
      tx,
      session.id,
      params.userId,
      params.tutorId,
      {
        material: params.material,
        progressNotes: params.progressNotes,
        score: params.score,
      },
      false,
    );
  });
  notifyOfCompletion(notifyInfo, lowQuotaThreshold).catch((err) =>
    console.error("[notify] direct session notification failed:", err),
  );
  return completed;
}

async function notifyOfCompletion(
  info: CompletionNotifyInfo,
  lowQuotaThreshold: number,
) {
  if (!info) return;

  if (info.kind === "PRIVATE") {
    const subject = info.subjectName ? ` ${info.subjectName}` : "";
    const scoreText = info.score != null ? ` Nilai: ${info.score}.` : "";
    await Promise.all(
      info.participants.map(async (participant) => {
        await notifyParentsOfStudent(participant.studentId, {
          title: "Sesi Privat Selesai",
          message: `Sesi${subject} ${participant.studentName} hari ini telah selesai.${scoreText}`,
          type: "SESSION_COMPLETED",
        });
        if (participant.quotaRemaining === 0) {
          await notifyParentsOfStudent(participant.studentId, {
            title: "Kuota Privat Habis",
            message: `Kuota les privat ${participant.studentName} sudah habis. Hubungi Admin untuk memperpanjang.`,
            type: "QUOTA_LOW",
          });
        } else if (participant.quotaRemaining === lowQuotaThreshold) {
          await notifyParentsOfStudent(participant.studentId, {
            title: "Kuota Privat Menipis",
            message: `Sisa kuota les privat ${participant.studentName} tinggal ${participant.quotaRemaining} pertemuan lagi.`,
            type: "QUOTA_LOW",
          });
        }
      }),
    );
    return;
  }

  // REGULAR — quota is shared by the whole class, so every currently active
  // parent in it gets a message built around their own child's name.
  if (info.quotaRemaining === 0) {
    await notifyParentsOfClass(info.classId, (studentName) => ({
      title: "Kuota Kelas Habis",
      message: `Kuota pertemuan kelas yang diikuti ${studentName} sudah habis. Hubungi Admin untuk memperpanjang.`,
      type: "QUOTA_LOW",
    }));
  } else if (info.quotaRemaining === lowQuotaThreshold) {
    await notifyParentsOfClass(info.classId, (studentName) => ({
      title: "Kuota Kelas Menipis",
      message: `Sisa kuota pertemuan kelas yang diikuti ${studentName} tinggal ${info.quotaRemaining} pertemuan lagi.`,
      type: "QUOTA_LOW",
    }));
  }
}

export async function saveSessionDraft(
  sessionId: string,
  data: {
    material?: string;
    teachingNotes?: string;
    progressNotes?: string;
    score?: number | null;
  },
  actingTutorId?: string | null,
) {
  const session = await prisma.teachingSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new SessionError("Sesi tidak ditemukan", 404);
  assertOwnership(actingTutorId, session.tutorId);
  if (!OPEN_STATUSES.includes(session.status))
    throw new SessionError("Sesi tidak dapat diubah", 409);
  if (actingTutorId && isOverdue(session.sessionDate))
    throw new SessionError("Sesi sudah terkunci dari tentor.", 409);
  return prisma.teachingSession.update({
    where: { id: sessionId },
    data: {
      material: data.material?.trim() || null,
      teachingNotes: data.teachingNotes?.trim() || null,
      progressNotes: data.progressNotes?.trim() || null,
      score: data.score ?? null,
    },
  });
}

export async function completeSessionsBatch(params: {
  tutorId: string; date: Date; sessionIds?: string[]; userId: string;
}) {
  const start = startOfBusinessDate(params.date), end = addBusinessDays(start, 1);
  const lowQuotaThreshold = Number((await getSettings()).lowQuotaWarningThreshold) || 3;
  const results = await prisma.$transaction(async tx => {
    const sessions = await tx.teachingSession.findMany({ where: {
      tutorId: params.tutorId, sessionDate: { gte: start, lt: end },
      ...(params.sessionIds ? { id: { in: params.sessionIds } } : { status: { in: OPEN_STATUSES }, material: { not: null } }),
    }, orderBy: { id: 'asc' } });
    if (params.sessionIds && sessions.length !== new Set(params.sessionIds).size)
      throw new SessionError('Sesi tidak ditemukan, bukan milik Anda, atau di luar tanggal yang dipilih.', 403);
    const completed = [];
    for (const session of sessions) completed.push(await finalizeTeachingSession(tx, session.id, params.userId, params.tutorId));
    return completed;
  }, { timeout: 15000 });
  for (const result of results) notifyOfCompletion(result.notifyInfo, lowQuotaThreshold).catch(() => {});
  return { date: formatBusinessDate(start), completedCount: results.length, sessions: results.map(r => r.completed) };
}

/**
 * BR-06: tentor reports that the student cancelled on the day of the session.
 * The session moves to PENDING_ADMIN — nothing is counted (no quota deducted,
 * no honor) until an admin decides.
 */
export async function reportCancellation(
  sessionId: string,
  reason: string,
  userId: string,
  actingTutorId?: string | null,
) {
  const validation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`session:${sessionId}`}))`;
    const session = await tx.teachingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new SessionError("Sesi tidak ditemukan", 404);

    assertOwnership(actingTutorId, session.tutorId);
    if (formatBusinessDate(session.sessionDate) !== formatBusinessDate(new Date()))
      throw new SessionError("Pengajuan pembatalan hanya untuk sesi hari ini.", 422);

    if (actingTutorId && isOverdue(session.sessionDate)) {
      throw new SessionError(
        `Sesi ini sudah melewati batas ${OVERDUE_DAYS} hari dan terkunci dari tentor. Hubungi admin untuk penyelesaian.`,
        409,
      );
    }

    if (!OPEN_STATUSES.includes(session.status)) {
      throw new SessionError(
        `Sesi berstatus "${session.status}" tidak dapat dibatalkan`,
        409,
      );
    }

    await tx.teachingSession.update({
      where: { id: sessionId },
      data: { status: "PENDING_ADMIN", updatedBy: userId },
    });

    return tx.sessionValidation.create({
      data: {
        sessionId,
        caseType: "CANCELLATION_DAY_OF",
        decision: "PENDING",
        description: reason,
        createdBy: userId,
      },
    });
  });

  // Notifikasi Orang Tua (Tier 2) — this is the moment a parent most wants
  // to know: today's session isn't happening. Sent as soon as the tentor
  // reports it, not held until admin later approves/rejects the validation.
  notifyOfCancellation(sessionId).catch((err) =>
    console.error(
      "[notify] session cancellation parent notification failed:",
      err,
    ),
  );

  return validation;
}

const CANCEL_DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const CANCEL_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
// start/end are nullable on TeachingSession (older pattern-derived rows may
// lack an explicit override) — the time range is omitted when either is unset.
function formatCancelledWhen(
  sessionDate: Date,
  startTime: Date | null,
  endTime: Date | null,
): string {
  const dateLabel = `${CANCEL_DAY_NAMES[sessionDate.getDay()]}, ${sessionDate.getDate()} ${CANCEL_MONTH_NAMES[sessionDate.getMonth()]} ${sessionDate.getFullYear()}`;
  if (!startTime || !endTime) return dateLabel;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateLabel}, ${pad(startTime.getHours())}:${pad(startTime.getMinutes())}–${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
}

/** Admin cancels a future/open meeting directly. No quota or honor is created. */
export async function cancelScheduledSessionByAdmin(
  sessionId: string,
  reason: string,
  adminId: string,
) {
  const session = await prisma.teachingSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) throw new SessionError("Sesi tidak ditemukan", 404);
  if (!OPEN_STATUSES.includes(session.status)) {
    throw new SessionError(
      `Sesi berstatus "${session.status}" tidak dapat dibatalkan`,
      409,
    );
  }

  const result = await prisma.teachingSession.update({
    where: { id: sessionId },
    data: {
      status: "CANCELLED_NOT_COUNTED",
      notes: reason,
      updatedBy: adminId,
    },
  });
  await logAudit({
    tableName: "teaching_sessions",
    recordId: sessionId,
    action: "UPDATE",
    oldValues: { status: session.status },
    newValues: { status: result.status },
    changedBy: adminId,
    reason: `Pertemuan dibatalkan: ${reason}`,
  });

  // Notifikasi Tentor: admin's own cancellation previously notified nobody
  // (only a tentor-reported day-of cancellation notified parents, below).
  if (session.tutorId) {
    prisma.tutor
      .findUnique({ where: { id: session.tutorId }, select: { userId: true } })
      .then((tutor) => {
        if (!tutor) return;
        return createNotification({
          userId: tutor.userId,
          title: "Pertemuan Dibatalkan",
          message: `${formatCancelledWhen(session.sessionDate, session.startTime, session.endTime)} — Alasan: ${reason}`,
          type: "SCHEDULE_CHANGE",
        });
      })
      .catch((err) =>
        console.error("[notify] admin-cancel tutor notification failed:", err),
      );
  }

  return result;
}

async function notifyOfCancellation(sessionId: string) {
  const session = await prisma.teachingSession.findUnique({
    where: { id: sessionId },
    include: {
      subject: { select: { name: true } },
      attendanceRecords: { select: { studentId: true } },
    },
  });
  if (!session) return;
  const subject = session.subject?.name ? ` ${session.subject.name}` : "";

  if (session.sessionType === "PRIVATE") {
    await Promise.all(
      resolvePrivateSessionParticipantIds(session).map((studentId) =>
        notifyParentsOfStudent(studentId, {
          title: "Sesi Dibatalkan Hari Ini",
          message: `Sesi${subject} hari ini dibatalkan.`,
          type: "SESSION_CANCELLED",
        }),
      ),
    );
  } else if (session.sessionType === "REGULAR" && session.classId) {
    await notifyParentsOfClass(session.classId, (studentName) => ({
      title: "Sesi Dibatalkan Hari Ini",
      message: `Sesi${subject} hari ini dibatalkan (kelas yang diikuti ${studentName}).`,
      type: "SESSION_CANCELLED",
    }));
  }
}

/**
 * BR-06/BR-07: admin resolves a pending validation (day-of cancellation, overdue
 * completion, or a manual correction case).
 * APPROVED  -> session is completed normally (honor snapshot + quota deduction if PRIVATE).
 * REJECTED  -> session is marked CANCELLED_NOT_COUNTED; nothing is deducted or counted.
 */
export async function decideValidation(
  validationId: string, decision: "APPROVED" | "REJECTED", adminId: string, adminNotes?: string,
) {
  const lowQuotaThreshold = Number((await getSettings()).lowQuotaWarningThreshold) || 3;
  const outcome = await prisma.$transaction(async tx => {
    const validation = await tx.sessionValidation.findUnique({ where: { id: validationId } });
    if (!validation) throw new SessionError('Validasi tidak ditemukan', 404);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'session:' + validation.sessionId}))`;
    const current = await tx.sessionValidation.findUniqueOrThrow({ where: { id: validationId } });
    if (current.decision !== 'PENDING') throw new SessionError('Validasi ini sudah diputuskan sebelumnya', 409);
    const before = await tx.teachingSession.findUniqueOrThrow({ where: { id: current.sessionId } });
    if (before.status !== 'PENDING_ADMIN') throw new SessionError('Sesi tidak menunggu validasi.', 409);
    const result = decision === 'APPROVED'
      ? await finalizeTeachingSession(tx, before.id, adminId, null, {
          material: before.material || current.description,
          progressNotes: before.progressNotes || current.description,
        }, false, true)
      : { completed: await tx.teachingSession.update({ where: { id: before.id },
          data: { status: 'CANCELLED_NOT_COUNTED', updatedBy: adminId } }), notifyInfo: null };
    await tx.sessionValidation.update({ where: { id: validationId },
      data: { decision, adminNotes, decidedBy: adminId, decidedAt: new Date() } });
    await logAudit({ tableName: 'teaching_sessions', recordId: before.id, action: 'UPDATE',
      oldValues: { status: before.status }, newValues: { status: result.completed.status },
      changedBy: adminId, reason: 'Validasi ' + current.caseType + ': ' + decision }, tx);
    return result;
  });
  notifyOfCompletion(outcome.notifyInfo, lowQuotaThreshold).catch(() => {});
  return outcome.completed;
}

/**
 * BR-11/AC-07: "difilter berdasarkan jam, hari, kelas, bulan, dan tentor."
 * "Bulan" is just a date range (startDate/endDate). "Hari" (day of week) and
 * "jam" (time of day) aren't stored on the session itself — they live on its
 * originating Schedule — so dayOfWeek filters via the schedule relation
 * (native Prisma support) and hour is matched in-memory against the
 * schedule's startTime, since Prisma has no portable "extract hour from
 * DateTime" filter without raw SQL. Fine at this scale (single-office
 * volume); revisit with a raw query if session counts grow large.
 */
export async function listSessions(filters: {
  tutorId?: string;
  status?: string;
  sessionType?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  studentId?: string;
  dayOfWeek?: number;
  hour?: string; // "HH:mm"
}) {
  const sessions = await prisma.teachingSession.findMany({
    where: {
      tutorId: filters.tutorId,
      status: filters.status as any,
      sessionType: filters.sessionType as any,
      classId: filters.classId,
      ...(filters.studentId
        ? {
            OR: [
              { studentId: filters.studentId },
              { attendanceRecords: { some: { studentId: filters.studentId } } },
            ],
          }
        : {}),
      sessionDate:
        filters.startDate || filters.endDate
          ? { gte: filters.startDate, lte: filters.endDate }
          : undefined,
      schedule:
        filters.dayOfWeek !== undefined
          ? { dayOfWeek: filters.dayOfWeek }
          : undefined,
    },
    include: {
      tutor: { select: { id: true, name: true } },
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
      schedule: {
        select: { startTime: true, endTime: true, mode: true, location: true },
      },
      changeRequests: {
        where: { status: "PENDING" },
        select: {
          id: true,
          proposedDate: true,
          proposedStartTime: true,
          proposedEndTime: true,
          reason: true,
          status: true,
        },
        take: 1,
      },
    },
    orderBy: { sessionDate: "desc" },
  });

  if (!filters.hour) return sessions;

  return sessions.filter((s) => {
    const d = s.startTime
      ? new Date(s.startTime)
      : s.schedule?.startTime
        ? new Date(s.schedule.startTime)
        : null;
    if (!d) return false;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}` === filters.hour;
  });
}

export async function listPendingValidations() {
  return prisma.sessionValidation.findMany({
    where: { decision: "PENDING" },
    include: {
      session: {
        include: {
          tutor: { select: { name: true } },
          class: { select: { name: true } },
          student: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}
