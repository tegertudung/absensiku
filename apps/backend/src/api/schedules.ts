import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { handleError, AppError } from "../utils/errors";
import { prisma } from "../utils/prisma";
import { logAudit } from "../utils/auditLog";
import { resolveTutorIdForUser } from "../services/sessionService";
import { createNotification } from "../services/notificationService";
import {
  createSchedule,
  listSchedules,
  getScheduleById,
  updateSchedule,
  setScheduleStatus,
  findScheduleConflicts,
  repairLegacyOccurrencePrograms,
} from "../services/scheduleService";

const router = Router();

const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Format jam harus HH:mm");
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

function combineDateTime(baseDate: string, time: string): Date {
  return new Date(`${baseDate}T${time}:00`);
}
function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Notifikasi Tentor (siklus Pertemuan): "when" formatters mirror the style
// already used for schedule-pattern notifications (day name + time range),
// just built from a one-off session date instead of a recurring dayOfWeek.
// Fire-and-forget everywhere they're used (`.catch` + log) — a notification
// failure must never fail the underlying meeting create/edit/cancel/delete.
const MEETING_DAY_NAMES = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const MEETING_MONTH_NAMES = [
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
function formatMeetingWhen(
  sessionDate: string,
  startTime: string,
  endTime: string,
): string {
  const d = new Date(`${sessionDate}T00:00:00`);
  return `${MEETING_DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MEETING_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${startTime}–${endTime}`;
}
// Same as above but from already-loaded DB Date columns (delete/cancel paths
// read an existing record instead of a freshly-parsed request body). start/end
// are nullable on TeachingSession (older pattern-derived rows may lack an
// explicit override), so the time range is just omitted when either is unset.
function formatMeetingWhenFromRecord(
  sessionDate: Date,
  startTime: Date | null,
  endTime: Date | null,
): string {
  const dateLabel = `${MEETING_DAY_NAMES[sessionDate.getDay()]}, ${sessionDate.getDate()} ${MEETING_MONTH_NAMES[sessionDate.getMonth()]} ${sessionDate.getFullYear()}`;
  if (!startTime || !endTime) return dateLabel;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateLabel}, ${pad(startTime.getHours())}:${pad(startTime.getMinutes())}–${pad(endTime.getHours())}:${pad(endTime.getMinutes())}`;
}
function notifyTutorOfMeeting(userId: string, title: string, when: string) {
  createNotification({
    userId,
    title,
    message: when,
    type: "SCHEDULE_CHANGE",
  }).catch((err) =>
    console.error("[notify] meeting tutor notification failed:", err),
  );
}

const createSchema = z.object({
  // Optional because a TENTOR-submitted "Tambah Privat" request is forced to
  // their own tutorId server-side and doesn't need to send one; ADMIN requests
  // still must supply it (enforced below, not by the schema).
  tutorId: z.string().uuid("tutorId harus UUID valid").optional(),
  sessionType: z.enum(["REGULAR", "PRIVATE"]),
  programId: z.string().uuid("Program wajib diisi"),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  dayOfWeek: z
    .number()
    .int()
    .min(0)
    .max(6, "dayOfWeek harus 0 (Minggu) sampai 6 (Sabtu)"),
  startTime: timeString,
  endTime: timeString,
  startDate: dateString,
  endDate: dateString.optional(),
  mode: z.enum(["ONLINE", "OFFLINE"]).default("OFFLINE"),
  location: z.string().trim().max(255).optional(),
  notes: z.string().optional(),
});

// POST /api/schedules — ADMIN membuat jadwal reguler atau privat untuk tentor manapun.
// TENTOR juga bisa membuat jadwal PRIVATE untuk siswanya sendiri (mockup "Tambah
// Privat"); tutorId dipaksa ke akun tentor yang login, dan jenis jadwal dikunci ke
// PRIVATE — pembuatan kelas REGULAR tetap admin-only karena terikat ke struktur kelas.
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  let tutorId = d.tutorId;

  if (req.user!.role === "TENTOR") {
    const own = await resolveTutorIdForUser(req.user!.userId);
    if (!own)
      return res
        .status(403)
        .json({ error: "Forbidden", message: "Akun tentor tidak ditemukan" });
    tutorId = own;
    if (d.sessionType !== "PRIVATE") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Tentor hanya dapat membuat jadwal privat",
      });
    }
  } else if (req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  } else if (!tutorId) {
    return res
      .status(400)
      .json({ error: "Validation error", message: "tutorId wajib diisi" });
  }

  try {
    const schedule = await createSchedule({
      tutorId: tutorId!,
      sessionType: d.sessionType,
      programId: d.programId,
      classId: d.classId,
      studentId: d.studentId,
      subjectId: d.subjectId,
      dayOfWeek: d.dayOfWeek,
      startTime: combineDateTime(d.startDate, d.startTime),
      endTime: combineDateTime(d.startDate, d.endTime),
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : undefined,
      mode: d.mode,
      location: d.location,
      notes: d.notes,
    });
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    handleError(err, res);
  }
});

const checkConflictsSchema = z.object({
  tutorId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startDate: dateString,
  startTime: timeString,
  endTime: timeString,
});

// POST /api/schedules/check-conflicts — pre-save "Jadwal Bentrok" check (mockup
// "Tambah Privat" shows this inline before the user submits, not just after).
router.post(
  "/check-conflicts",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = checkConflictsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const d = parsed.data;

    let tutorId = d.tutorId;
    if (req.user!.role === "TENTOR") {
      const own = await resolveTutorIdForUser(req.user!.userId);
      if (!own) return res.json({ success: true, data: [] });
      tutorId = own;
    } else if (!tutorId) {
      return res
        .status(400)
        .json({ error: "Validation error", message: "tutorId wajib diisi" });
    }

    try {
      const conflicts = await findScheduleConflicts(
        tutorId!,
        d.dayOfWeek,
        combineDateTime(d.startDate, d.startTime),
        combineDateTime(d.startDate, d.endTime),
      );
      res.json({ success: true, data: conflicts });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /api/schedules — TENTOR scoped ke jadwal sendiri; ADMIN bisa filter bebas
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const { sessionType, status, classId, studentId, tutorId } = req.query;

  let scopedTutorId: string | undefined;
  if (req.user!.role === "TENTOR") {
    const own = await resolveTutorIdForUser(req.user!.userId);
    if (!own) return res.json({ success: true, data: [] });
    scopedTutorId = own;
  } else {
    scopedTutorId = typeof tutorId === "string" ? tutorId : undefined;
  }

  try {
    await repairLegacyOccurrencePrograms();
    const schedules = await listSchedules({
      tutorId: scopedTutorId,
      sessionType: typeof sessionType === "string" ? sessionType : undefined,
      status: typeof status === "string" ? status : undefined,
      classId: typeof classId === "string" ? classId : undefined,
      studentId: typeof studentId === "string" ? studentId : undefined,
    });
    res.json({ success: true, data: schedules });
  } catch (err) {
    handleError(err, res);
  }
});

const patternSlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeString,
    endTime: timeString,
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    message: "Jam mulai harus sebelum jam selesai.",
  });

const patternSchema = z
  .object({
    programId: z.string().uuid("Program wajib dipilih"),
    startDate: dateString,
    slots: z
      .array(patternSlotSchema)
      .min(1, "Minimal satu hari jadwal diperlukan."),
  })
  .superRefine((data, ctx) => {
    const keys = new Set<string>();
    data.slots.forEach((slot, index) => {
      const key = `${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}`;
      if (keys.has(key))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", index],
          message: "Slot hari dan waktu tidak boleh duplikat.",
        });
      keys.add(key);
    });
  });

type PersistedPatternSlot = {
  patternId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

function nextPatternDates(
  startDate: string,
  slots: PersistedPatternSlot[],
  count: number,
) {
  const from = new Date(`${startDate}T00:00:00`);
  const ordered = [...slots].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime),
  );
  const dates: Array<{ date: Date; slot: (typeof ordered)[number] }> = [];
  for (let offset = 0; dates.length < count && offset < 3660; offset++) {
    const date = new Date(from);
    date.setDate(from.getDate() + offset);
    for (const slot of ordered) {
      if (date.getDay() === slot.dayOfWeek) dates.push({ date, slot });
      if (dates.length === count) break;
    }
  }
  return dates;
}

// Patterns are templates only. Each generated class meeting is a real Schedule
// occurrence, linked through patternId and safe to edit independently.
router.get("/patterns", requireAuth, async (_req: Request, res: Response) => {
  try {
    const patterns = await prisma.schedule.findMany({
      where: { isPattern: true, sessionType: "REGULAR", status: "ACTIVE" },
      include: {
        class: { select: { id: true, name: true, level: true } },
        program: {
          select: { id: true, name: true, defaultMeetingQuota: true },
        },
      },
      orderBy: [{ classId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    res.json({ success: true, data: patterns });
  } catch (err) {
    handleError(err, res);
  }
});

router.put(
  "/patterns/:classId",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = patternSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const result = await prisma.$transaction(async (tx) => {
        const [kelas, program] = await Promise.all([
          tx.class.findFirst({
            where: { id: req.params.classId, status: "ACTIVE" },
          }),
          tx.program.findFirst({
            where: {
              id: parsed.data.programId,
              isActive: true,
              learningModel: "CLASS_BASED",
            },
          }),
        ]);
        if (!kelas)
          throw new AppError("Kelas tidak ditemukan atau tidak aktif.", 404);
        if (!program)
          throw new AppError(
            "Program kelas tidak ditemukan atau tidak aktif.",
            404,
          );
        if (!program.usesQuota)
          throw new AppError(
            "Program tanpa kuota belum mendukung generate otomatis. Tentukan pertemuan manual.",
            422,
          );
        const existingPatternSchedules = await tx.schedule.findMany({
          where: { classId: kelas.id, programId: program.id, isPattern: true },
          select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
        });
        const base = new Date("1970-01-01T00:00:00");
        const wanted = new Map(
          parsed.data.slots.map((slot) => [
            `${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}`,
            slot,
          ]),
        );
        for (const pattern of existingPatternSchedules) {
          const key = `${pattern.dayOfWeek}-${String(pattern.startTime.getHours()).padStart(2, "0")}:${String(pattern.startTime.getMinutes()).padStart(2, "0")}-${String(pattern.endTime.getHours()).padStart(2, "0")}:${String(pattern.endTime.getMinutes()).padStart(2, "0")}`;
          if (wanted.has(key)) {
            await tx.schedule.update({
              where: { id: pattern.id },
              data: {
                status: "ACTIVE",
                startDate: new Date(`${parsed.data.startDate}T00:00:00`),
              },
            });
            wanted.delete(key);
            continue;
          }
          const hasSessions = await tx.teachingSession.count({
            where: { scheduleId: pattern.id },
          });
          if (hasSessions)
            await tx.schedule.update({
              where: { id: pattern.id },
              data: { status: "INACTIVE" },
            });
          else await tx.schedule.delete({ where: { id: pattern.id } });
        }
        for (const slot of wanted.values()) {
          await tx.schedule.create({
            data: {
              classId: kelas.id,
              programId: program.id,
              sessionType: "REGULAR",
              dayOfWeek: slot.dayOfWeek,
              startTime: combineDateTime("1970-01-01", slot.startTime),
              endTime: combineDateTime("1970-01-01", slot.endTime),
              startDate: base,
              status: "ACTIVE",
              isPattern: true,
            },
          });
        }
        const patterns = await tx.schedule.findMany({
          where: {
            classId: kelas.id,
            programId: program.id,
            isPattern: true,
            status: "ACTIVE",
          },
          include: { class: { select: { id: true, name: true } } },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        });
        const existingOccurrences = await tx.schedule.findMany({
          where: { patternId: { in: patterns.map((pattern) => pattern.id) } },
          select: {
            id: true,
            patternId: true,
            occurrenceDate: true,
            startTime: true,
            endTime: true,
            dayOfWeek: true,
          },
        });
        const existingKeys = new Set(
          existingOccurrences.map(
            (row) =>
              `${row.patternId}:${row.occurrenceDate ? localDateKey(row.occurrenceDate) : ""}:${String(row.startTime.getHours()).padStart(2, "0")}:${String(row.startTime.getMinutes()).padStart(2, "0")}`,
          ),
        );
        const slotsWithPattern: PersistedPatternSlot[] = patterns.map(
          (pattern) => ({
            dayOfWeek: pattern.dayOfWeek,
            startTime: `${String(pattern.startTime.getHours()).padStart(2, "0")}:${String(pattern.startTime.getMinutes()).padStart(2, "0")}`,
            endTime: `${String(pattern.endTime.getHours()).padStart(2, "0")}:${String(pattern.endTime.getMinutes()).padStart(2, "0")}`,
            patternId: pattern.id,
          }),
        );
        const candidates = nextPatternDates(
          parsed.data.startDate,
          slotsWithPattern,
          program.defaultMeetingQuota * 4,
        );
        const creates = [];
        let sequence = existingOccurrences.length + 1;
        for (const candidate of candidates) {
          if (
            existingOccurrences.length + creates.length >=
            program.defaultMeetingQuota
          )
            break;
          const key = `${candidate.slot.patternId}:${localDateKey(candidate.date)}:${candidate.slot.startTime}`;
          if (existingKeys.has(key)) continue;
          creates.push({
            patternId: candidate.slot.patternId,
            occurrenceDate: candidate.date,
            occurrenceSequence: sequence++,
            programId: program.id,
            classId: kelas.id,
            sessionType: "REGULAR",
            dayOfWeek: candidate.date.getDay(),
            startTime: combineDateTime(
              localDateKey(candidate.date),
              candidate.slot.startTime,
            ),
            endTime: combineDateTime(
              localDateKey(candidate.date),
              candidate.slot.endTime,
            ),
            startDate: candidate.date,
            status: "ACTIVE",
            isPattern: false,
            mode: "OFFLINE",
          });
        }
        if (creates.length)
          await tx.schedule.createMany({ data: creates, skipDuplicates: true });
        return {
          patterns,
          generated: creates.length,
          target: program.defaultMeetingQuota,
        };
      });
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const meetingSchema = z
  .object({
    programId: z.string().uuid("Program wajib dipilih"),
    sessionType: z.enum(["REGULAR", "PRIVATE"]),
    classId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    tutorId: z.string().uuid(),
    subjectId: z.string().uuid(),
    sessionDate: dateString,
    startTime: timeString,
    endTime: timeString,
    mode: z.enum(["ONLINE", "OFFLINE"]).default("OFFLINE"),
    location: z.string().trim().max(255).optional(),
    patternId: z.string().uuid().optional(),
    patternOccurrenceDate: dateString.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startTime >= data.endTime)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "Jam selesai harus setelah jam mulai.",
      });
    if (data.sessionType === "REGULAR" && !data.classId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["classId"],
        message: "Kelas wajib dipilih.",
      });
    if (data.sessionType === "PRIVATE" && !data.studentId)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentId"],
        message: "Siswa wajib dipilih.",
      });
  });

async function assertMeetingConflicts(
  data: z.infer<typeof meetingSchema>,
  excludeId?: string,
) {
  const start = combineDateTime(data.sessionDate, data.startTime);
  const end = combineDateTime(data.sessionDate, data.endTime);
  const dayStart = new Date(`${data.sessionDate}T00:00:00`);
  const dayEnd = new Date(`${data.sessionDate}T23:59:59.999`);
  const overlap = {
    sessionDate: { gte: dayStart, lte: dayEnd },
    startTime: { lt: end },
    endTime: { gt: start },
    status: { notIn: ["CANCELLED", "CANCELLED_NOT_COUNTED"] },
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  if (
    await prisma.teachingSession.findFirst({
      where: { ...overlap, tutorId: data.tutorId },
      select: { id: true },
    })
  )
    throw new AppError(
      "Tentor sudah memiliki pertemuan yang bertabrakan pada waktu tersebut.",
      409,
    );
  if (
    data.sessionType === "REGULAR" &&
    (await prisma.teachingSession.findFirst({
      where: { ...overlap, classId: data.classId },
      select: { id: true },
    }))
  )
    throw new AppError(
      "Kelas sudah memiliki pertemuan yang bertabrakan pada waktu tersebut.",
      409,
    );
  if (
    data.sessionType === "PRIVATE" &&
    (await prisma.teachingSession.findFirst({
      where: { ...overlap, studentId: data.studentId },
      select: { id: true },
    }))
  )
    throw new AppError(
      "Siswa sudah memiliki pertemuan privat yang bertabrakan pada waktu tersebut.",
      409,
    );
}

router.post(
  "/meetings",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = meetingSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const data = parsed.data;
      await assertMeetingConflicts(data);
      let tutorUserId: string | undefined;
      const meeting = await prisma.$transaction(async (tx) => {
        const [tutor, subject, program] = await Promise.all([
          tx.tutor.findFirst({
            where: {
              id: data.tutorId,
              status: "ACTIVE",
              deletedAt: null,
              user: { is: { isActive: true } },
              subjects: { some: { subjectId: data.subjectId } },
            },
          }),
          tx.subject.findFirst({
            where: { id: data.subjectId, isActive: true },
          }),
          tx.program.findFirst({
            where: { id: data.programId, isActive: true },
          }),
        ]);
        if (!tutor)
          throw new AppError(
            "Tentor tidak tersedia untuk mata pelajaran yang dipilih.",
            422,
          );
        tutorUserId = tutor.userId;
        if (!subject)
          throw new AppError(
            "Mata pelajaran tidak ditemukan atau tidak aktif.",
            404,
          );
        if (!program)
          throw new AppError("Program tidak ditemukan atau tidak aktif.", 404);
        if (
          (program.learningModel === "CLASS_BASED") !==
          (data.sessionType === "REGULAR")
        )
          throw new AppError(
            "Program tidak sesuai dengan jenis pertemuan.",
            400,
          );
        if (
          data.sessionType === "REGULAR" &&
          !(await tx.class.findFirst({
            where: { id: data.classId, status: "ACTIVE" },
          }))
        )
          throw new AppError("Kelas tidak ditemukan atau tidak aktif.", 404);
        if (
          data.sessionType === "PRIVATE" &&
          !(await tx.student.findFirst({
            where: { id: data.studentId, status: "ACTIVE" },
          }))
        )
          throw new AppError("Siswa tidak ditemukan atau tidak aktif.", 404);
        let patternOccurrenceDate: Date | null = null;
        if (data.patternId || data.patternOccurrenceDate) {
          if (
            data.sessionType !== "REGULAR" ||
            !data.patternId ||
            !data.patternOccurrenceDate
          )
            throw new AppError("Referensi pola pertemuan tidak valid.", 422);
          const pattern = await tx.schedule.findFirst({
            where: {
              id: data.patternId,
              classId: data.classId,
              isPattern: true,
              sessionType: "REGULAR",
              status: "ACTIVE",
            },
          });
          const occurrence = new Date(`${data.patternOccurrenceDate}T00:00:00`);
          if (!pattern || occurrence.getDay() !== pattern.dayOfWeek)
            throw new AppError("Pola asal pertemuan tidak valid.", 422);
          patternOccurrenceDate = occurrence;
        }
        // An Admin completing a generated placeholder updates that occurrence;
        // it must not create a second Schedule or an early TeachingSession.
        if (data.sessionType === "REGULAR") {
          const occurrence = await tx.schedule.findFirst({
            where: {
              programId: program.id,
              classId: data.classId,
              occurrenceDate: new Date(`${data.sessionDate}T00:00:00`),
              startTime: combineDateTime(data.sessionDate, data.startTime),
              endTime: combineDateTime(data.sessionDate, data.endTime),
              isPattern: false,
              status: "ACTIVE",
            },
          });
          if (occurrence) {
            if (occurrence.tutorId && occurrence.tutorId !== data.tutorId)
              throw new AppError(
                "Occurrence sudah ditugaskan ke tentor lain.",
                409,
              );
            return tx.schedule.update({
              where: { id: occurrence.id },
              data: {
                tutorId: data.tutorId,
                subjectId: data.subjectId,
                mode: data.mode,
                location:
                  data.mode === "OFFLINE" ? data.location || null : null,
              },
            });
          }
        }
        return tx.teachingSession.create({
          data: {
            tutorId: data.tutorId,
            scheduleId: data.patternId || null,
            patternOccurrenceDate,
            sessionType: data.sessionType,
            sessionDate: new Date(`${data.sessionDate}T00:00:00`),
            startTime: combineDateTime(data.sessionDate, data.startTime),
            endTime: combineDateTime(data.sessionDate, data.endTime),
            classId: data.sessionType === "REGULAR" ? data.classId : null,
            studentId: data.sessionType === "PRIVATE" ? data.studentId : null,
            subjectId: data.subjectId,
            programId: program?.id,
            mode: data.mode,
            location: data.mode === "OFFLINE" ? data.location || null : null,
            status: "SCHEDULED",
            createdBy: req.user!.userId,
          },
          include: {
            tutor: { select: { name: true } },
            class: { select: { name: true } },
            student: { select: { name: true } },
            subject: { select: { name: true } },
          },
        });
      });
      if (tutorUserId) {
        notifyTutorOfMeeting(
          tutorUserId,
          "Pertemuan Baru Ditambahkan",
          formatMeetingWhen(data.sessionDate, data.startTime, data.endTime),
        );
      }
      res.status(201).json({ success: true, data: meeting });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const updateMeetingSchema = z
  .object({
    programId: z.string().uuid("Program wajib dipilih"),
    tutorId: z.string().uuid(),
    subjectId: z.string().uuid(),
    sessionDate: dateString,
    startTime: timeString,
    endTime: timeString,
    mode: z.enum(["ONLINE", "OFFLINE"]),
    location: z.string().trim().max(255).optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "Jam selesai harus setelah jam mulai.",
    path: ["endTime"],
  });

router.put(
  "/meetings/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = updateMeetingSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const current = await prisma.teachingSession.findUnique({
        where: { id: req.params.id },
      });
      if (!current) throw new AppError("Pertemuan tidak ditemukan.", 404);
      if (!["SCHEDULED", "IN_PROGRESS"].includes(current.status))
        throw new AppError(
          "Pertemuan yang sudah selesai atau dibatalkan tidak dapat diubah.",
          409,
        );
      const data = parsed.data;
      await assertMeetingConflicts(
        {
          ...data,
          sessionType: current.sessionType as "REGULAR" | "PRIVATE",
          programId: data.programId,
          classId: current.classId || undefined,
          studentId: current.studentId || undefined,
        },
        current.id,
      );
      const [tutor, subject, program] = await Promise.all([
        prisma.tutor.findFirst({
          where: {
            id: data.tutorId,
            status: "ACTIVE",
            deletedAt: null,
            user: { is: { isActive: true } },
            subjects: { some: { subjectId: data.subjectId } },
          },
        }),
        prisma.subject.findFirst({
          where: { id: data.subjectId, isActive: true },
        }),
        prisma.program.findFirst({
          where: { id: data.programId, isActive: true },
        }),
      ]);
      if (!tutor)
        throw new AppError(
          "Tentor tidak tersedia untuk mata pelajaran yang dipilih.",
          422,
        );
      if (!subject)
        throw new AppError(
          "Mata pelajaran tidak ditemukan atau tidak aktif.",
          404,
        );
      if (!program)
        throw new AppError("Program tidak ditemukan atau tidak aktif.", 404);
      if (
        (program.learningModel === "CLASS_BASED") !==
        (current.sessionType === "REGULAR")
      )
        throw new AppError("Program tidak sesuai dengan jenis pertemuan.", 400);
      const result = await prisma.teachingSession.update({
        where: { id: current.id },
        data: {
          tutorId: data.tutorId,
          programId: program.id,
          subjectId: data.subjectId,
          sessionDate: new Date(`${data.sessionDate}T00:00:00`),
          startTime: combineDateTime(data.sessionDate, data.startTime),
          endTime: combineDateTime(data.sessionDate, data.endTime),
          mode: data.mode,
          location: data.mode === "OFFLINE" ? data.location || null : null,
          updatedBy: req.user!.userId,
        },
        include: {
          tutor: { select: { id: true, name: true } },
          class: { select: { name: true } },
          student: { select: { name: true } },
          subject: { select: { name: true } },
        },
      });

      const when = formatMeetingWhen(
        data.sessionDate,
        data.startTime,
        data.endTime,
      );
      if (data.tutorId !== current.tutorId) {
        // Reassigned to a different tentor — the old one needs to know it's
        // no longer theirs just as much as the new one needs to know it is.
        notifyTutorOfMeeting(tutor.userId, "Pertemuan Baru Ditugaskan", when);
        const previousTutor = current.tutorId
          ? await prisma.tutor.findUnique({
              where: { id: current.tutorId },
              select: { userId: true },
            })
          : null;
        if (previousTutor)
          notifyTutorOfMeeting(
            previousTutor.userId,
            "Pertemuan Dipindahkan ke Tentor Lain",
            when,
          );
      } else {
        notifyTutorOfMeeting(tutor.userId, "Jadwal Pertemuan Diubah", when);
      }

      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// DELETE /api/schedules/meetings/:id — only while still SCHEDULED (never
// started). Once a tentor has opened it (IN_PROGRESS) or it's been acted
// on, use "Batalkan Pertemuan" instead so the history/audit trail stays
// intact — this is for cleaning up a meeting that was never touched.
router.delete(
  "/meetings/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const meeting = await prisma.teachingSession.findUnique({
        where: { id: req.params.id },
      });
      if (!meeting) throw new AppError("Pertemuan tidak ditemukan.", 404);
      if (meeting.status !== "SCHEDULED")
        throw new AppError(
          'Hanya pertemuan berstatus "Terjadwal" yang dapat dihapus. Gunakan "Batalkan Pertemuan" untuk pertemuan yang sudah berjalan.',
          409,
        );
      await prisma.teachingSession.delete({ where: { id: meeting.id } });
      await logAudit({
        tableName: "teaching_sessions",
        recordId: meeting.id,
        action: "DELETE",
        oldValues: {
          sessionType: meeting.sessionType,
          sessionDate: meeting.sessionDate.toISOString(),
          tutorId: meeting.tutorId,
        },
        changedBy: req.user!.userId,
        reason: "Pertemuan dihapus oleh admin",
      });
      if (meeting.tutorId) {
        const tutor = await prisma.tutor.findUnique({
          where: { id: meeting.tutorId },
          select: { userId: true },
        });
        if (tutor)
          notifyTutorOfMeeting(
            tutor.userId,
            "Pertemuan Dihapus",
            formatMeetingWhenFromRecord(
              meeting.sessionDate,
              meeting.startTime,
              meeting.endTime,
            ),
          );
      }
      res.json({ success: true, data: { id: meeting.id } });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const completeOccurrenceSchema = z.object({
  tutorId: z.string().uuid("Tentor wajib dipilih"),
  subjectId: z.string().uuid("Mata pelajaran wajib dipilih"),
  mode: z.enum(["ONLINE", "OFFLINE"]),
  location: z.string().trim().max(255).optional(),
});

// Completes the planning data on one generated occurrence. It intentionally
// never creates a TeachingSession or a second Schedule.
router.put(
  "/occurrences/:id/complete",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = completeOccurrenceSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const data = parsed.data;
      const result = await prisma.$transaction(async (tx) => {
        const occurrence = await tx.schedule.findFirst({
          where: { id: req.params.id, isPattern: false, status: "ACTIVE" },
        });
        if (!occurrence)
          throw new AppError("Occurrence pertemuan tidak ditemukan.", 404);
        if (!occurrence.programId || !occurrence.classId)
          throw new AppError(
            "Program atau kelas pada pertemuan ini belum ditentukan.",
            422,
          );
        const tutor = await tx.tutor.findFirst({
          where: {
            id: data.tutorId,
            status: "ACTIVE",
            deletedAt: null,
            subjects: { some: { subjectId: data.subjectId } },
          },
        });
        if (!tutor)
          throw new AppError(
            "Tentor tidak dapat mengajar mata pelajaran yang dipilih.",
            422,
          );
        const subject = await tx.subject.findFirst({
          where: { id: data.subjectId, isActive: true },
        });
        if (!subject) throw new AppError("Mata pelajaran tidak aktif.", 422);
        return tx.schedule.update({
          where: { id: occurrence.id },
          data: {
            tutorId: tutor.id,
            subjectId: subject.id,
            mode: data.mode,
            location: data.mode === "OFFLINE" ? data.location || null : null,
          },
        });
      });
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /api/schedules/:id
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const schedule = await getScheduleById(req.params.id);

    if (req.user!.role === "TENTOR") {
      const own = await resolveTutorIdForUser(req.user!.userId);
      if (!own || schedule.tutorId !== own) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Anda tidak memiliki akses ke jadwal ini",
        });
      }
    }

    res.json({ success: true, data: schedule });
  } catch (err) {
    handleError(err, res);
  }
});

const updateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startDate: dateString.optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  endDate: dateString.optional(),
  mode: z.enum(["ONLINE", "OFFLINE"]).optional(),
  location: z.string().trim().max(255).optional(),
  notes: z.string().optional(),
  // Required only when a TENTOR submits this (enforced below, not by the
  // schema, so ADMIN edits don't need to carry a reason).
  reason: z.string().optional(),
});

// PUT /api/schedules/:id — ADMIN can edit any schedule freely. TENTOR can
// edit their own ("Ajukan Perubahan Jadwal") with a required reason; it
// takes effect immediately, same as "Tambah Privat" — no approval step.
router.put("/:id", requireAuth, async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  let meta: { changedBy: string; reason: string } | undefined;

  if (req.user!.role === "TENTOR") {
    return res.status(403).json({
      error: "Forbidden",
      message:
        "Tentor tidak dapat mengubah jadwal langsung. Ajukan perubahan pada pertemuan terkait.",
    });
  } else if (req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const referenceDate = d.startDate ?? localDateKey(new Date());
    const data: Record<string, unknown> = {};
    if (d.notes !== undefined) data.notes = d.notes;
    if (d.mode !== undefined) data.mode = d.mode;
    if (d.location !== undefined) data.location = d.location;
    if (d.dayOfWeek !== undefined) data.dayOfWeek = d.dayOfWeek;
    if (d.startDate) data.startDate = new Date(d.startDate);
    if (d.endDate) data.endDate = new Date(d.endDate);
    if (d.startTime)
      data.startTime = combineDateTime(referenceDate, d.startTime);
    if (d.endTime) data.endTime = combineDateTime(referenceDate, d.endTime);

    res.json({
      success: true,
      data: await updateSchedule(req.params.id, data, meta),
    });
  } catch (err) {
    handleError(err, res);
  }
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "CANCELLED"]),
});

// PATCH /api/schedules/:id/status
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json({
        success: true,
        data: await setScheduleStatus(
          req.params.id,
          parsed.data.status,
          req.user!.userId,
        ),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default router;
