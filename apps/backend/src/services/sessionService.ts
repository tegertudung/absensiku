import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { getApplicableHonorRate } from "./honorService";
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
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_DAYS);
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

  assertOwnership(params.actingTutorId, schedule.tutorId);

  const existing = await prisma.teachingSession.findFirst({
    where: { scheduleId: schedule.id, sessionDate: params.sessionDate },
  });
  if (existing)
    throw new SessionError("Sesi untuk jadwal dan tanggal ini sudah ada", 409);

  if (schedule.sessionType === "PRIVATE") {
    if (!schedule.studentId)
      throw new SessionError("Jadwal privat tidak memiliki siswa", 400);

    const pkg = await prisma.privatePackage.findFirst({
      where: {
        studentId: schedule.studentId,
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
    const kelas = await prisma.class.findUnique({
      where: { id: schedule.classId },
    });
    if (!kelas || kelas.quotaRemaining <= 0) {
      throw new SessionError(
        "Kuota pertemuan kelas ini telah habis. Hubungi Admin untuk menambahkan pertemuan.",
        409,
      );
    }
  }

  return prisma.teachingSession.create({
    data: {
      scheduleId: schedule.id,
      tutorId: schedule.tutorId,
      sessionType: schedule.sessionType,
      sessionDate: params.sessionDate,
      classId: schedule.classId,
      studentId: schedule.studentId,
      subjectId: schedule.subjectId,
      programId:
        schedule.programId ??
        (await getProgramForSessionType(schedule.sessionType))?.id,
      status: "IN_PROGRESS",
      createdBy: params.createdBy,
    },
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
) {
  // Read outside the transaction — staleness by a few seconds is harmless
  // for a notification threshold, and it avoids an extra query per session
  // inside the lock.
  const session = await tx.teachingSession.findUnique({
    where: { id: sessionId },
    include: {
      subject: { select: { id: true, name: true } },
      student: { select: { name: true } },
      attendanceRecords: { select: { studentId: true } },
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

  if (!OPEN_STATUSES.includes(session.status)) {
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
  if (session.sessionType === "PRIVATE" && !progressNotes) {
    throw new SessionError(
      "Catatan perkembangan wajib diisi untuk sesi privat.",
      422,
    );
  }

  const rate = await getApplicableHonorRate(
    session.sessionType as "REGULAR" | "PRIVATE",
    session.sessionDate,
    tx,
    session.programId,
  );
  if (!rate) {
    throw new SessionError(
      `Tidak ada tarif honor aktif untuk sesi ${session.sessionType} pada tanggal ${
        session.sessionDate.toISOString().split("T")[0]
      }. Hubungi admin untuk mengatur master tarif.`,
      422,
    );
  }

  let notifyInfo: CompletionNotifyInfo = null;

  if (session.sessionType === "REGULAR") {
    if (!session.classId)
      throw new SessionError("Sesi reguler tidak memiliki kelas", 400);
    const updatedClass = await tx.class.updateMany({
      where: { id: session.classId, quotaRemaining: { gt: 0 } },
      data: { quotaUsed: { increment: 1 }, quotaRemaining: { decrement: 1 } },
    });
    if (updatedClass.count !== 1)
      throw new SessionError("Kuota pertemuan kelas sudah habis.", 409);
    const kelas = await tx.class.findUnique({
      where: { id: session.classId },
      select: { quotaRemaining: true },
    });
    notifyInfo = {
      kind: "REGULAR",
      classId: session.classId,
      quotaRemaining: kelas?.quotaRemaining ?? 0,
    };
  }

  if (session.sessionType === "PRIVATE") {
    const participantIds = resolvePrivateSessionParticipantIds(session);
    if (!participantIds.length)
      throw new SessionError("Sesi privat tidak memiliki siswa", 400);

    const packages = await tx.privatePackage.findMany({
      where: {
        studentId: { in: participantIds },
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
      honorRateSnapshot: rate.nominal,
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
  sessionType: "REGULAR" | "PRIVATE";
  classId?: string;
  studentId?: string;
  studentIds?: string[];
  subjectId: string;
  mode: "OFFLINE" | "ONLINE";
  location?: string;
  material: string;
  progressNotes?: string;
  score?: number | null;
}) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (params.sessionDate > today)
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
    if (params.sessionType === "REGULAR") {
      if (!params.classId)
        throw new SessionError("Kelas wajib dipilih untuk sesi reguler.", 422);
      const kelas = await tx.class.findFirst({
        where: { id: params.classId, status: "ACTIVE" },
      });
      if (!kelas)
        throw new SessionError("Kelas tidak ditemukan atau tidak aktif.", 404);
      classId = kelas.id;
      programId = kelas.programId;
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
        where: { id: { in: privateStudentIds }, status: "ACTIVE" },
      });
      if (students.length !== privateStudentIds.length)
        throw new SessionError("Siswa tidak ditemukan atau tidak aktif.", 404);
      const activePackages = await tx.privatePackage.findMany({
        where: {
          studentId: { in: privateStudentIds },
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
            "PRIVATE",
            params.sessionDate,
            tx,
            pkg.programId,
          );
          if (!rate)
            throw new SessionError(
              "Tidak ada tarif honor aktif untuk sesi PRIVATE. Hubungi admin untuk mengatur master tarif.",
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
    }
    if (!programId)
      programId = (
        await tx.program.findUnique({ where: { code: params.sessionType } })
      )?.id;
    const session = await tx.teachingSession.create({
      data: {
        tutorId: params.tutorId,
        sessionType: params.sessionType,
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
    if (params.sessionType === "PRIVATE") {
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
  tutorId: string;
  date: Date;
  sessionIds?: string[];
  userId: string;
}) {
  const start = new Date(params.date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const sessions = await prisma.teachingSession.findMany({
    where: params.sessionIds?.length
      ? { id: { in: params.sessionIds } }
      : {
          tutorId: params.tutorId,
          sessionDate: { gte: start, lt: end },
          status: "IN_PROGRESS",
        },
    include: {
      class: true,
      attendanceRecords: { select: { studentId: true } },
      student: {
        include: {
          packages: {
            where: { status: "ACTIVE" },
            orderBy: { activationDate: "asc" },
          },
        },
      },
    },
  });
  const issues: Array<{ sessionId: string; code: string; message: string }> =
    [];
  if (params.sessionIds && sessions.length !== new Set(params.sessionIds).size)
    issues.push({
      sessionId: "",
      code: "NOT_FOUND",
      message: "Satu atau lebih sesi tidak ditemukan.",
    });
  const regular = new Map<string, number>();
  const privateNeeds = new Map<string, number>();
  for (const s of sessions) {
    if (s.tutorId !== params.tutorId)
      issues.push({
        sessionId: s.id,
        code: "NOT_SESSION_OWNER",
        message: "Sesi bukan milik Anda.",
      });
    if (s.sessionDate < start || s.sessionDate >= end)
      issues.push({
        sessionId: s.id,
        code: "WRONG_DATE",
        message: "Sesi di luar tanggal yang dipilih.",
      });
    if (s.status === "PENDING_ADMIN")
      issues.push({
        sessionId: s.id,
        code: "PENDING_VALIDATION",
        message: "Sesi menunggu validasi.",
      });
    else if (!OPEN_STATUSES.includes(s.status))
      issues.push({
        sessionId: s.id,
        code: "INVALID_STATUS",
        message: "Status sesi tidak dapat diselesaikan.",
      });
    if (!s.material?.trim())
      issues.push({
        sessionId: s.id,
        code: "MATERIAL_REQUIRED",
        message: "Materi hari ini belum diisi.",
      });
    if (s.sessionType === "PRIVATE" && !s.progressNotes?.trim())
      issues.push({
        sessionId: s.id,
        code: "PROGRESS_NOTES_REQUIRED",
        message: "Catatan perkembangan belum diisi.",
      });
    if (s.sessionType === "REGULAR" && s.classId)
      regular.set(s.classId, (regular.get(s.classId) ?? 0) + 1);
    if (s.sessionType === "PRIVATE") {
      for (const studentId of resolvePrivateSessionParticipantIds(s)) {
        privateNeeds.set(studentId, (privateNeeds.get(studentId) ?? 0) + 1);
      }
    }
  }
  for (const [classId, count] of regular) {
    const c = sessions.find((s) => s.classId === classId)?.class;
    if (!c || c.quotaRemaining < count)
      issues.push({
        sessionId: "",
        code: "REGULAR_QUOTA_EMPTY",
        message: "Kuota kelas tidak mencukupi.",
      });
  }
  const privatePackages = privateNeeds.size
    ? await prisma.privatePackage.findMany({
        where: {
          studentId: { in: [...privateNeeds.keys()] },
          status: "ACTIVE",
        },
        orderBy: { activationDate: "asc" },
      })
    : [];
  const privatePackageByStudentId = new Map<
    string,
    (typeof privatePackages)[number]
  >();
  for (const pkg of privatePackages) {
    if (!privatePackageByStudentId.has(pkg.studentId)) {
      privatePackageByStudentId.set(pkg.studentId, pkg);
    }
  }
  for (const [studentId, count] of privateNeeds) {
    const p = privatePackageByStudentId.get(studentId);
    if (!p || p.quotaRemaining < count)
      issues.push({
        sessionId: "",
        code: "PRIVATE_QUOTA_EMPTY",
        message: "Kuota paket privat tidak mencukupi.",
      });
  }
  if (issues.length)
    throw Object.assign(
      new SessionError("Beberapa sesi belum dapat diselesaikan.", 422),
      { issues },
    );
  // Individual completion remains the business-rule source of truth. Sessions
  // are prevalidated as one set; guarded completion prevents negative quota.
  const completed = [];
  for (const s of sessions)
    completed.push(await completeSession(s.id, params.userId, params.tutorId));
  return {
    date: start.toISOString().slice(0, 10),
    completedCount: completed.length,
    sessions: completed,
  };
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
    const session = await tx.teachingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new SessionError("Sesi tidak ditemukan", 404);

    assertOwnership(actingTutorId, session.tutorId);

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
  validationId: string,
  decision: "APPROVED" | "REJECTED",
  adminId: string,
  adminNotes?: string,
) {
  const validation = await prisma.sessionValidation.findUnique({
    where: { id: validationId },
  });
  if (!validation) throw new SessionError("Validasi tidak ditemukan", 404);
  if (validation.decision !== "PENDING") {
    throw new SessionError("Validasi ini sudah diputuskan sebelumnya", 409);
  }

  const sessionBefore = await prisma.teachingSession.findUnique({
    where: { id: validation.sessionId },
  });

  await prisma.sessionValidation.update({
    where: { id: validationId },
    data: { decision, adminNotes, decidedBy: adminId, decidedAt: new Date() },
  });

  const result =
    decision === "APPROVED"
      ? // Admin acting on behalf of the session — no ownership restriction.
        await completeSession(validation.sessionId, adminId, null)
      : await prisma.teachingSession.update({
          where: { id: validation.sessionId },
          data: { status: "CANCELLED_NOT_COUNTED", updatedBy: adminId },
        });

  // BR-13: this is exactly "koreksi data setelah sesi terkunci dilakukan admin" —
  // record the traceable before/after.
  await logAudit({
    tableName: "teaching_sessions",
    recordId: validation.sessionId,
    action: "UPDATE",
    oldValues: {
      status: sessionBefore?.status ?? null,
      honorRateSnapshot: sessionBefore?.honorRateSnapshot?.toString() ?? null,
    },
    newValues: {
      status: result.status,
      honorRateSnapshot: result.honorRateSnapshot?.toString() ?? null,
    },
    changedBy: adminId,
    reason: `Validasi ${validation.caseType} diputuskan: ${decision}${adminNotes ? ` — ${adminNotes}` : ""}`,
  });

  return result;
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
