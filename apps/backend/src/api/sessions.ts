import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { handleError as sharedHandleError } from "../utils/errors";
import {
  createSessionFromSchedule,
  completeSession,
  reportCancellation,
  decideValidation,
  listSessions,
  listPendingValidations,
  resolveTutorIdForUser,
  saveSessionDraft,
  completeSessionsBatch,
  createDirectSession,
  cancelScheduledSessionByAdmin,
} from "../services/sessionService";
import {
  recordAttendance,
  getAttendanceForSession,
} from "../services/attendanceService";
import { lockOverdueSessions } from "../jobs/lockOverdueSessions";

const router = Router();
const batchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionIds: z.array(z.string().uuid()).optional(),
});
const changeRequestSchema = z
  .object({
    proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    proposedStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    proposedEndTime: z.string().regex(/^\d{2}:\d{2}$/),
    reason: z.string().trim().min(3),
  })
  .refine((data) => data.proposedStartTime < data.proposedEndTime, {
    path: ["proposedEndTime"],
    message: "Jam selesai harus setelah jam mulai.",
  });
router.post(
  "/complete-batch",
  requireAuth,
  requireRole("TENTOR"),
  async (req: Request, res: Response) => {
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const tutorId = await resolveTutorIdForUser(req.user!.userId);
      if (!tutorId) return res.status(403).json({ error: "Forbidden" });
      res.json({
        success: true,
        data: await completeSessionsBatch({
          ...parsed.data,
          date: new Date(parsed.data.date),
          tutorId,
          userId: req.user!.userId,
        }),
      });
    } catch (err: any) {
      if (err?.issues)
        return res
          .status(422)
          .json({ success: false, message: err.message, issues: err.issues });
      handleError(err, res);
    }
  },
);

router.post(
  "/:id/change-requests",
  requireAuth,
  requireRole("TENTOR"),
  async (req: Request, res: Response) => {
    const parsed = changeRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const tutorId = await resolveTutorIdForUser(req.user!.userId);
      const session = tutorId
        ? await prisma.teachingSession.findFirst({
            where: { id: req.params.id, tutorId },
          })
        : null;
      if (!session)
        return res.status(403).json({
          error: "Forbidden",
          message: "Sesi tidak ditemukan atau bukan milik Anda.",
        });
      if (!["SCHEDULED", "IN_PROGRESS"].includes(session.status))
        throw new Error(
          "Sesi yang selesai atau dibatalkan tidak dapat diajukan perubahan.",
        );
      const pending = await prisma.scheduleChangeRequest.findFirst({
        where: { teachingSessionId: session.id, status: "PENDING" },
      });
      if (pending)
        return res.status(409).json({
          error: "Conflict",
          message:
            "Pengajuan perubahan untuk sesi ini masih menunggu persetujuan.",
        });
      const data = parsed.data;
      const request = await prisma.scheduleChangeRequest.create({
        data: {
          teachingSessionId: session.id,
          tutorId: tutorId!,
          proposedDate: new Date(`${data.proposedDate}T00:00:00`),
          proposedStartTime: new Date(
            `${data.proposedDate}T${data.proposedStartTime}:00`,
          ),
          proposedEndTime: new Date(
            `${data.proposedDate}T${data.proposedEndTime}:00`,
          ),
          reason: data.reason,
        },
      });
      res.status(201).json({ success: true, data: request });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: "Request error",
        message: err.message || "Gagal mengirim pengajuan.",
      });
    }
  },
);

// SessionError and AppError both carry a numeric .status — the shared handler
// checks that structurally, so it works uniformly for either error class.
function handleError(err: unknown, res: Response) {
  sharedHandleError(err, res);
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Format tanggal tidak valid");

// ============================================
// POST /api/sessions — tentor starts a session from their schedule
// ============================================
const createSessionSchema = z.object({
  scheduleId: z.string().uuid("scheduleId harus UUID valid"),
  sessionDate: isoDate,
});

router.post(
  "/",
  requireAuth,
  requireRole("TENTOR", "ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const actingTutorId =
        req.user!.role === "TENTOR"
          ? await resolveTutorIdForUser(req.user!.userId)
          : null;

      if (req.user!.role === "TENTOR" && !actingTutorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Akun Anda belum terhubung ke profil tentor",
        });
      }

      const session = await createSessionFromSchedule({
        scheduleId: parsed.data.scheduleId,
        sessionDate: new Date(parsed.data.sessionDate),
        createdBy: req.user!.userId,
        actingTutorId,
      });
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const directSessionSchema = z
  .object({
    sessionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid"),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam mulai tidak valid"),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format jam selesai tidak valid"),
    sessionType: z.enum(["REGULAR", "PRIVATE"]),
    classId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    studentIds: z
      .array(z.string().uuid())
      .min(1, "Pilih minimal 1 siswa.")
      .max(3, "Maksimal 3 siswa dalam satu sesi privat.")
      .optional(),
    subjectId: z.string().uuid(),
    mode: z.enum(["OFFLINE", "ONLINE"]),
    location: z.string().max(255).optional(),
    material: z.string().trim().min(1, "Materi hari ini wajib diisi."),
    progressNotes: z.string().trim().optional(),
    score: z.number().min(0).max(100).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sessionType === "REGULAR" && !data.classId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classId"],
        message: "Kelas wajib dipilih.",
      });
    if (data.sessionType === "PRIVATE" && !data.studentIds && !data.studentId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentIds"],
        message: "Pilih minimal 1 siswa.",
      });
    if (
      data.sessionType === "PRIVATE" &&
      data.studentIds &&
      new Set(data.studentIds).size !== data.studentIds.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentIds"],
        message: "Siswa tidak boleh dipilih lebih dari sekali.",
      });
    if (data.sessionType === "PRIVATE" && !data.progressNotes)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["progressNotes"],
        message: "Catatan perkembangan wajib diisi.",
      });
  });

// A completed manual session has no Schedule by design; the transaction in the
// service creates it and consumes quota/honor using the same finalizer as a scheduled session.
router.post(
  "/direct",
  requireAuth,
  requireRole("TENTOR"),
  async (req: Request, res: Response) => {
    const parsed = directSessionSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const tutorId = await resolveTutorIdForUser(req.user!.userId);
      if (!tutorId)
        return res.status(403).json({
          error: "Forbidden",
          message: "Akun Anda belum terhubung ke profil tentor",
        });
      const session = await createDirectSession({
        ...parsed.data,
        tutorId,
        userId: req.user!.userId,
        sessionDate: new Date(`${parsed.data.sessionDate}T00:00:00`),
      });
      res.status(201).json({
        success: true,
        data: session,
        message: "Sesi mengajar berhasil dicatat",
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// POST /api/sessions/:id/complete
// ============================================
router.post(
  "/:id/complete",
  requireAuth,
  requireRole("TENTOR", "ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const actingTutorId =
        req.user!.role === "TENTOR"
          ? await resolveTutorIdForUser(req.user!.userId)
          : null;

      const record = z
        .object({
          material: z.string().optional(),
          teachingNotes: z.string().optional(),
          progressNotes: z.string().optional(),
          score: z.number().nullable().optional(),
        })
        .safeParse(req.body);
      if (!record.success)
        return res.status(400).json({
          error: "Validation error",
          details: record.error.flatten().fieldErrors,
        });
      const session = await completeSession(
        req.params.id,
        req.user!.userId,
        actingTutorId,
        record.data,
      );
      res.json({
        success: true,
        data: session,
        message: "Sesi selesai & honor tercatat",
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const draftSchema = z.object({
  material: z.string().optional(),
  teachingNotes: z.string().optional(),
  progressNotes: z.string().optional(),
  score: z.number().nullable().optional(),
});
router.patch(
  "/:id/draft",
  requireAuth,
  requireRole("TENTOR", "ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const actingTutorId =
        req.user!.role === "TENTOR"
          ? await resolveTutorIdForUser(req.user!.userId)
          : null;
      res.json({
        success: true,
        data: await saveSessionDraft(req.params.id, parsed.data, actingTutorId),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// POST /api/sessions/:id/cancel — day-of cancellation reported by tutor
// ============================================
const cancelSchema = z.object({
  reason: z.string().min(3, "Alasan wajib diisi (minimal 3 karakter)"),
});

router.post(
  "/:id/cancel",
  requireAuth,
  requireRole("TENTOR", "ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const actingTutorId =
        req.user!.role === "TENTOR"
          ? await resolveTutorIdForUser(req.user!.userId)
          : null;

      const validation = await reportCancellation(
        req.params.id,
        parsed.data.reason,
        req.user!.userId,
        actingTutorId,
      );
      res.json({
        success: true,
        data: validation,
        message: "Pembatalan dilaporkan, menunggu keputusan admin",
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// Admin cancellation is final for an open scheduled meeting. It preserves the
// TeachingSession as history while ensuring it never consumes quota or honor.
router.post(
  "/:id/admin-cancel",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const session = await cancelScheduledSessionByAdmin(
        req.params.id,
        parsed.data.reason,
        req.user!.userId,
      );
      res.json({
        success: true,
        data: session,
        message: "Pertemuan berhasil dibatalkan",
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// POST /api/sessions/lock-overdue — manually trigger the BR-07 overdue sweep
// (normally runs hourly via cron; this lets admin force-check immediately)
// ============================================
router.post(
  "/lock-overdue",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: Request, res: Response) => {
    try {
      const count = await lockOverdueSessions();
      res.json({ success: true, data: { lockedCount: count } });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// GET /api/sessions/validations/pending — admin queue
// ============================================
router.get(
  "/validations/pending",
  requireAuth,
  requireRole("ADMIN"),
  async (_req: Request, res: Response) => {
    try {
      const validations = await listPendingValidations();
      res.json({ success: true, data: validations });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// POST /api/sessions/validations/:id/decide — admin approves/rejects
// ============================================
const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  adminNotes: z.string().optional(),
});

router.post(
  "/validations/:id/decide",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await decideValidation(
        req.params.id,
        parsed.data.decision,
        req.user!.userId,
        parsed.data.adminNotes,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// ============================================
// GET /api/sessions — list with filters. TENTOR is scoped to their own sessions.
// ============================================
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const {
    status,
    sessionType,
    startDate,
    endDate,
    tutorId,
    classId,
    studentId,
    dayOfWeek,
    hour,
  } = req.query;

  let scopedTutorId: string | undefined;

  if (req.user!.role === "TENTOR") {
    const ownTutorId = await prisma.tutor.findUnique({
      where: { userId: req.user!.userId },
    });
    if (!ownTutorId) {
      // Fail closed: no linked tutor profile yet => nothing to show, never leak all data.
      return res.json({ success: true, data: [] });
    }
    scopedTutorId = ownTutorId.id;
  } else {
    scopedTutorId = typeof tutorId === "string" ? tutorId : undefined;
  }

  try {
    const sessions = await listSessions({
      tutorId: scopedTutorId,
      status: typeof status === "string" ? status : undefined,
      sessionType: typeof sessionType === "string" ? sessionType : undefined,
      // Session dates are created as local date-only values. Do not parse the
      // YYYY-MM-DD filter as UTC here: west/east timezone offsets can otherwise
      // exclude meetings from the first or last day in a calendar week.
      startDate:
        typeof startDate === "string"
          ? new Date(`${startDate}T00:00:00`)
          : undefined,
      endDate:
        typeof endDate === "string"
          ? new Date(`${endDate}T23:59:59.999`)
          : undefined,
      classId: typeof classId === "string" ? classId : undefined,
      studentId: typeof studentId === "string" ? studentId : undefined,
      dayOfWeek: typeof dayOfWeek === "string" ? Number(dayOfWeek) : undefined,
      hour: typeof hour === "string" ? hour : undefined,
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    handleError(err, res);
  }
});

// ============================================
// Absensi Reguler (module 7) — per-student attendance for a REGULAR session
// ============================================
const attendanceSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.string().uuid("studentId harus UUID valid"),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
        notes: z.string().optional(),
      }),
    )
    .min(1, "Minimal 1 data kehadiran"),
});

// POST /api/sessions/:id/attendance — bulk record/update attendance (upsert)
router.post(
  "/:id/attendance",
  requireAuth,
  requireRole("TENTOR", "ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = attendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const actingTutorId =
        req.user!.role === "TENTOR"
          ? await resolveTutorIdForUser(req.user!.userId)
          : null;
      if (req.user!.role === "TENTOR" && !actingTutorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Akun Anda belum terhubung ke profil tentor",
        });
      }

      const result = await recordAttendance(
        req.params.id,
        parsed.data.records,
        actingTutorId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /api/sessions/:id/attendance — class roster merged with recorded attendance
router.get(
  "/:id/attendance",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await getAttendanceForSession(req.params.id),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default router;
