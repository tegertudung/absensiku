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

const classListInclude = {
  _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
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
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: parsed.error.flatten().fieldErrors,
        });
    try {
      const studentIds = uniqueStudentIds(parsed.data.studentIds);
      const kelas = await prisma.$transaction(async (tx) => {
        if (await tx.class.findUnique({ where: { name: parsed.data.name } }))
          throw new AppError("Nama kelas sudah digunakan", 409);
        await assertActiveStudents(tx, studentIds);
        const program = await tx.program.findUnique({
          where: { code: "REGULAR" },
        });
        if (!program)
          throw new AppError(
            "Konfigurasi program Reguler tidak ditemukan.",
            500,
          );
        const quota = program.defaultMeetingQuota;
        return tx.class.create({
          data: {
            name: parsed.data.name,
            level: parsed.data.level || null,
            programId: program.id,
            quotaTotal: quota,
            quotaUsed: 0,
            quotaRemaining: quota,
            enrollments: studentIds.length
              ? {
                  create: studentIds.map((studentId) => ({
                    studentId,
                    status: "ACTIVE",
                  })),
                }
              : undefined,
          },
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
          program: { select: { id: true, name: true } },
          enrollments: {
            where: { status: "ACTIVE" },
            include: {
              student: { select: { id: true, name: true, status: true } },
            },
            orderBy: { enrollmentDate: "asc" },
          },
          _count: {
            select: {
              enrollments: { where: { status: "ACTIVE" } },
              schedules: true,
              sessions: true,
            },
          },
        },
      });
      if (!kelas) throw new AppError("Kelas tidak ditemukan", 404);
      res.json({ success: true, data: kelas });
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
      return res
        .status(400)
        .json({
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
              where: { classId_studentId: { classId: existing.id, studentId } },
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
      if (!existing.program)
        throw new AppError("Konfigurasi program kelas tidak ditemukan.", 500);
      const increment = existing.program.defaultMeetingQuota;
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
      return res
        .status(400)
        .json({
          error: "Validation error",
          details: parsed.error.flatten().fieldErrors,
        });
    try {
      res
        .status(201)
        .json({
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
      return res
        .status(400)
        .json({
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
