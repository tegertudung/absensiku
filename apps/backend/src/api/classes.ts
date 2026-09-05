import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { handleError, AppError } from "../utils/errors";
import { prisma } from "../utils/prisma";
import {
  enrollStudent,
  listClassEnrollments,
  setEnrollmentStatus,
} from "../services/enrollmentService";
import { logAudit } from "../utils/auditLog";

const router = Router();
const classInputSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter"),
  level: z.string().trim().optional(),
  programId: z.string().uuid("Program wajib dipilih").optional(),
  studentIds: z
    .array(z.string().uuid("studentIds harus UUID valid"))
    .optional(),
});
const uniqueStudentIds = (ids: string[] | undefined) => [...new Set(ids ?? [])];

async function assertActiveStudents(
  tx: Pick<typeof prisma, "student">,
  studentIds: string[],
) {
  if (!studentIds.length) return;
  const students = await tx.student.findMany({
    where: { id: { in: studentIds }, status: "ACTIVE" },
    select: { id: true },
  });
  if (students.length !== studentIds.length)
    throw new AppError(
      "Satu atau lebih siswa tidak ditemukan atau tidak aktif.",
      400,
    );
}

async function assertClassBasedProgram(
  tx: Pick<typeof prisma, "program">,
  programId: string,
) {
  const program = await tx.program.findFirst({
    where: { id: programId, isActive: true, learningModel: "CLASS_BASED" },
  });
  if (!program)
    throw new AppError("Pilih Program berbasis kelas yang aktif.", 400);
  return program;
}

async function assignStudentsToProgramClass(
  tx: Pick<typeof prisma, "studentProgram" | "classEnrollment">,
  classId: string,
  programId: string,
  studentIds: string[],
) {
  if (studentIds.length) {
    const eligible = await tx.studentProgram.findMany({
      where: { studentId: { in: studentIds }, programId, status: "ACTIVE" },
      select: { studentId: true },
    });
    if (eligible.length !== studentIds.length)
      throw new AppError(
        "Siswa harus memiliki enrollment aktif pada Program yang dipilih.",
        400,
      );
    await tx.studentProgram.updateMany({
      where: { studentId: { in: studentIds }, programId, status: "ACTIVE" },
      data: { classId },
    });
    for (const studentId of studentIds) {
      await tx.classEnrollment.upsert({
        where: { classId_studentId: { classId, studentId } },
        create: { classId, studentId, status: "ACTIVE" },
        update: { status: "ACTIVE" },
      });
    }
  }
}

const classListInclude = {
  _count: {
    select: {
      studentPrograms: {
        where: { status: "ACTIVE", program: { learningModel: "CLASS_BASED" } },
      },
    },
  },
} as const;

router.get("/", requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await prisma.class.findMany({
        include: classListInclude,
        orderBy: { name: "asc" },
      }),
    });
  } catch (err) {
    handleError(err, res);
  }
});

router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = classInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const studentIds = uniqueStudentIds(parsed.data.studentIds);
      if (!parsed.data.programId)
        throw new AppError(
          "Program untuk penempatan siswa wajib dipilih.",
          400,
        );
      const kelas = await prisma.$transaction(async (tx) => {
        if (await tx.class.findUnique({ where: { name: parsed.data.name } }))
          throw new AppError("Nama kelas sudah digunakan", 409);
        await assertActiveStudents(tx, studentIds);
        await assertClassBasedProgram(tx, parsed.data.programId!);
        const kelas = await tx.class.create({
          data: {
            name: parsed.data.name,
            level: parsed.data.level || null,
          },
          include: classListInclude,
        });
        await assignStudentsToProgramClass(
          tx,
          kelas.id,
          parsed.data.programId!,
          studentIds,
        );
        return tx.class.findUniqueOrThrow({
          where: { id: kelas.id },
          include: classListInclude,
        });
      });
      res.status(201).json({ success: true, data: kelas });
    } catch (err) {
      handleError(err, res);
    }
  },
);

router.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const kelas = await prisma.class.findUnique({
        where: { id: req.params.id },
        include: {
          program: {
            select: { id: true, name: true, defaultMeetingQuota: true },
          },
          _count: {
            select: {
              studentPrograms: {
                where: {
                  status: "ACTIVE",
                  program: { learningModel: "CLASS_BASED" },
                },
              },
              schedules: true,
              sessions: true,
            },
          },
        },
      });
      if (!kelas) throw new AppError("Kelas tidak ditemukan", 404);
      const roster = await prisma.studentProgram.findMany({
        where: {
          classId: kelas.id,
          status: "ACTIVE",
          ...(kelas.programId ? { programId: kelas.programId } : {}),
        },
        include: {
          student: { select: { id: true, name: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const occurrences = await prisma.schedule.findMany({
        where: {
          classId: kelas.id,
          isPattern: false,
          ...(kelas.programId ? { programId: kelas.programId } : {}),
        },
        include: {
          tutor: { select: { name: true } },
          subject: { select: { name: true } },
          sessions: { select: { status: true }, take: 1 },
        },
        orderBy: [{ occurrenceDate: "asc" }, { startTime: "asc" }],
      });
      const completedCount = kelas.programId
        ? await prisma.teachingSession.count({
            where: {
              classId: kelas.id,
              programId: kelas.programId,
              status: "COMPLETED",
            },
          })
        : 0;
      const quotaTotal = kelas.program?.defaultMeetingQuota ?? kelas.quotaTotal;
      res.json({
        success: true,
        data: {
          ...kelas,
          enrollments: roster,
          occurrences,
          quotaTotal,
          quotaRemaining: Math.max(0, quotaTotal - completedCount),
          _count: { ...kelas._count, studentPrograms: roster.length },
        },
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const updateSchema = classInputSchema.partial();
router.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const kelas = await prisma.$transaction(async (tx) => {
        const existing = await tx.class.findUnique({
          where: { id: req.params.id },
        });
        if (!existing) throw new AppError("Kelas tidak ditemukan", 404);
        if (
          parsed.data.name &&
          parsed.data.name !== existing.name &&
          (await tx.class.findUnique({ where: { name: parsed.data.name } }))
        )
          throw new AppError("Nama kelas sudah digunakan", 409);
        const studentIds =
          parsed.data.studentIds === undefined
            ? undefined
            : uniqueStudentIds(parsed.data.studentIds);
        if (studentIds !== undefined) {
          await assertActiveStudents(tx, studentIds);
          if (parsed.data.programId) {
            await assertClassBasedProgram(tx, parsed.data.programId);
            await tx.studentProgram.updateMany({
              where: {
                classId: existing.id,
                programId: parsed.data.programId,
                studentId: { notIn: studentIds },
                status: "ACTIVE",
              },
              data: { classId: null },
            });
            await assignStudentsToProgramClass(
              tx,
              existing.id,
              parsed.data.programId,
              studentIds,
            );
          } else {
            const active = await tx.classEnrollment.findMany({
              where: { classId: existing.id, status: "ACTIVE" },
              select: { studentId: true },
            });
            const current = new Set(active.map((item) => item.studentId));
            const selected = new Set(studentIds);
            const removed = [...current].filter((id) => !selected.has(id));
            const added = studentIds.filter((id) => !current.has(id));
            if (removed.length)
              await tx.classEnrollment.updateMany({
                where: {
                  classId: existing.id,
                  studentId: { in: removed },
                  status: "ACTIVE",
                },
                data: { status: "INACTIVE" },
              });
            for (const studentId of added) {
              const prior = await tx.classEnrollment.findUnique({
                where: {
                  classId_studentId: { classId: existing.id, studentId },
                },
              });
              if (prior)
                await tx.classEnrollment.update({
                  where: { id: prior.id },
                  data: { status: "ACTIVE" },
                });
              else
                await tx.classEnrollment.create({
                  data: { classId: existing.id, studentId, status: "ACTIVE" },
                });
            }
          }
        }
        return tx.class.update({
          where: { id: existing.id },
          data: {
            ...(parsed.data.name !== undefined
              ? { name: parsed.data.name }
              : {}),
            ...(parsed.data.level !== undefined
              ? { level: parsed.data.level || null }
              : {}),
          },
          include: classListInclude,
        });
      });
      res.json({ success: true, data: kelas });
    } catch (err) {
      handleError(err, res);
    }
  },
);

router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const kelas = await prisma.class.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { schedules: true, sessions: true } } },
      });
      if (!kelas) throw new AppError("Kelas tidak ditemukan", 404);
      if (kelas._count.schedules || kelas._count.sessions)
        throw new AppError(
          "Kelas tidak dapat dihapus karena masih digunakan oleh jadwal atau riwayat sesi.",
          409,
        );
      await prisma.class.delete({ where: { id: kelas.id } });
      await logAudit({
        tableName: "classes",
        recordId: kelas.id,
        action: "DELETE",
        oldValues: { name: kelas.name },
        changedBy: req.user!.userId,
        reason: "Kelas dihapus oleh admin",
      });
      res.json({ success: true, data: { id: kelas.id } });
    } catch (err) {
      handleError(err, res);
    }
  },
);

router.post(
  "/:id/extend-quota",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      const existing = await prisma.class.findUnique({
        where: { id: req.params.id },
        include: { program: true },
      });
      if (!existing) throw new AppError("Kelas tidak ditemukan", 404);
      // A class is an academic master record. A legacy program link may still
      // provide a custom quota, but new program-neutral classes use the
      // established 24-meeting cycle without requiring a named Program.
      const increment = existing.program?.defaultMeetingQuota ?? 24;
      const kelas = await prisma.class.update({
        where: { id: req.params.id },
        data: { quotaTotal: { increment }, quotaRemaining: { increment } },
      });
      await logAudit({
        tableName: "classes",
        recordId: kelas.id,
        action: "UPDATE",
        oldValues: {
          quotaTotal: existing.quotaTotal,
          quotaUsed: existing.quotaUsed,
          quotaRemaining: existing.quotaRemaining,
        },
        newValues: {
          quotaTotal: kelas.quotaTotal,
          quotaUsed: kelas.quotaUsed,
          quotaRemaining: kelas.quotaRemaining,
        },
        changedBy: req.user!.userId,
        reason: `Tambah ${increment} pertemuan kelas oleh admin`,
      });
      res.json({ success: true, data: kelas });
    } catch (err) {
      handleError(err, res);
    }
  },
);

router.patch(
  "/:id/deactivate",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await prisma.class.update({
          where: { id: req.params.id },
          data: { status: "INACTIVE" },
        }),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const enrollSchema = z.object({
  studentId: z.string().uuid("studentId harus UUID valid"),
});
router.post(
  "/:classId/enrollments",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      res.status(201).json({
        success: true,
        data: await enrollStudent(req.params.classId, parsed.data.studentId),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);
router.get(
  "/:classId/enrollments",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await listClassEnrollments(req.params.classId),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);
const enrollmentStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED"]),
});
router.patch(
  "/:classId/enrollments/:studentId/status",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = enrollmentStatusSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      res.json({
        success: true,
        data: await setEnrollmentStatus(
          req.params.classId,
          req.params.studentId,
          parsed.data.status,
        ),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default router;
