import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError, AppError } from '../utils/errors';
import { prisma } from '../utils/prisma';
import { enrollStudent, listClassEnrollments, setEnrollmentStatus } from '../services/enrollmentService';
import { logAudit } from '../utils/auditLog';

const router = Router();

// GET /api/classes — readable by any authenticated user (used in dropdowns)
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    const classes = await prisma.class.findMany({
      include: { subject: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: classes });
  } catch (err) {
    handleError(err, res);
  }
});

const createSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  level: z.string().optional(),
  subjectId: z.string().uuid('subjectId harus UUID valid').optional(),
  maxStudents: z.number().int().positive().optional(),
});

// POST /api/classes
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const existing = await prisma.class.findUnique({ where: { name: parsed.data.name } });
    if (existing) throw new AppError('Nama kelas sudah digunakan', 409);

    const kelas = await prisma.class.create({
      data: { ...parsed.data, quotaTotal: 24, quotaUsed: 0, quotaRemaining: 24 },
    });
    res.status(201).json({ success: true, data: kelas });
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const kelas = await prisma.class.findUnique({
      where: { id: req.params.id },
      include: { subject: { select: { id: true, name: true } }, program: { select: { id: true, name: true } }, _count: { select: { enrollments: true, schedules: true, sessions: true } } },
    });
    if (!kelas) throw new AppError('Kelas tidak ditemukan', 404);
    res.json({ success: true, data: kelas });
  } catch (err) { handleError(err, res); }
});

const updateSchema = createSchema.partial();
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  try {
    const existing = await prisma.class.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Kelas tidak ditemukan', 404);
    const kelas = await prisma.class.update({ where: { id: req.params.id }, data: parsed.data });
    res.json({ success: true, data: kelas });
  } catch (err) { handleError(err, res); }
});

router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const kelas = await prisma.class.findUnique({ where: { id: req.params.id }, include: { _count: { select: { schedules: true, sessions: true } } } });
    if (!kelas) throw new AppError('Kelas tidak ditemukan', 404);
    if (kelas._count.schedules > 0 || kelas._count.sessions > 0) throw new AppError('Kelas tidak dapat dihapus karena masih digunakan oleh jadwal atau riwayat sesi.', 409);
    await prisma.class.delete({ where: { id: kelas.id } });
    await logAudit({ tableName: 'classes', recordId: kelas.id, action: 'DELETE', oldValues: { name: kelas.name }, changedBy: req.user!.userId, reason: 'Kelas dihapus oleh admin' });
    res.json({ success: true, data: { id: kelas.id } });
  } catch (err) { handleError(err, res); }
});

// POST /api/classes/:id/extend-quota â€” add one standard 24-meeting cycle.
router.post('/:id/extend-quota', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const existing = await prisma.class.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Kelas tidak ditemukan', 404);

    const kelas = await prisma.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id: req.params.id },
        data: { quotaTotal: { increment: 24 }, quotaRemaining: { increment: 24 } },
      });
      return updated;
    });

    await logAudit({
      tableName: 'classes',
      recordId: kelas.id,
      action: 'UPDATE',
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
      reason: 'Tambah 24 pertemuan kelas oleh admin',
    });

    res.json({ success: true, data: kelas });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/classes/:id/deactivate
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const kelas = await prisma.class.update({
      where: { id: req.params.id },
      data: { status: 'INACTIVE' },
    });
    res.json({ success: true, data: kelas });
  } catch (err) {
    handleError(err, res);
  }
});

// ============================================
// Class Enrollments — which students belong to a class (needed for attendance roster)
// ============================================

const enrollSchema = z.object({ studentId: z.string().uuid('studentId harus UUID valid') });

// POST /api/classes/:classId/enrollments
router.post(
  '/:classId/enrollments',
  requireAuth,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const parsed = enrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }
    try {
      const enrollment = await enrollStudent(req.params.classId, parsed.data.studentId);
      res.status(201).json({ success: true, data: enrollment });
    } catch (err) {
      handleError(err, res);
    }
  }
);

// GET /api/classes/:classId/enrollments — class roster (any authenticated role)
router.get('/:classId/enrollments', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listClassEnrollments(req.params.classId) });
  } catch (err) {
    handleError(err, res);
  }
});

const enrollmentStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED']) });

// PATCH /api/classes/:classId/enrollments/:studentId/status
router.patch(
  '/:classId/enrollments/:studentId/status',
  requireAuth,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const parsed = enrollmentStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }
    try {
      const enrollment = await setEnrollmentStatus(
        req.params.classId,
        req.params.studentId,
        parsed.data.status
      );
      res.json({ success: true, data: enrollment });
    } catch (err) {
      handleError(err, res);
    }
  }
);

export default router;
