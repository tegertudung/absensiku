import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { resolveTutorIdForUser } from '../services/sessionService';
import {
  createSchedule,
  listSchedules,
  getScheduleById,
  updateSchedule,
  setScheduleStatus,
} from '../services/scheduleService';

const router = Router();

const timeString = z.string().regex(/^\d{2}:\d{2}$/, 'Format jam harus HH:mm');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');

function combineDateTime(baseDate: string, time: string): Date {
  return new Date(`${baseDate}T${time}:00`);
}

const createSchema = z.object({
  tutorId: z.string().uuid('tutorId harus UUID valid'),
  sessionType: z.enum(['REGULAR', 'PRIVATE']),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6, 'dayOfWeek harus 0 (Minggu) sampai 6 (Sabtu)'),
  startTime: timeString,
  endTime: timeString,
  startDate: dateString,
  endDate: dateString.optional(),
  notes: z.string().optional(),
});

// POST /api/schedules — admin membuat jadwal reguler atau privat
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const d = parsed.data;
    const schedule = await createSchedule({
      tutorId: d.tutorId,
      sessionType: d.sessionType,
      classId: d.classId,
      studentId: d.studentId,
      subjectId: d.subjectId,
      dayOfWeek: d.dayOfWeek,
      startTime: combineDateTime(d.startDate, d.startTime),
      endTime: combineDateTime(d.startDate, d.endTime),
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : undefined,
      notes: d.notes,
    });
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/schedules — TENTOR scoped ke jadwal sendiri; ADMIN bisa filter bebas
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { sessionType, status, classId, studentId, tutorId } = req.query;

  let scopedTutorId: string | undefined;
  if (req.user!.role === 'TENTOR') {
    const own = await resolveTutorIdForUser(req.user!.userId);
    if (!own) return res.json({ success: true, data: [] });
    scopedTutorId = own;
  } else {
    scopedTutorId = typeof tutorId === 'string' ? tutorId : undefined;
  }

  try {
    const schedules = await listSchedules({
      tutorId: scopedTutorId,
      sessionType: typeof sessionType === 'string' ? sessionType : undefined,
      status: typeof status === 'string' ? status : undefined,
      classId: typeof classId === 'string' ? classId : undefined,
      studentId: typeof studentId === 'string' ? studentId : undefined,
    });
    res.json({ success: true, data: schedules });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/schedules/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const schedule = await getScheduleById(req.params.id);

    if (req.user!.role === 'TENTOR') {
      const own = await resolveTutorIdForUser(req.user!.userId);
      if (!own || schedule.tutorId !== own) {
        return res.status(403).json({ error: 'Forbidden', message: 'Anda tidak memiliki akses ke jadwal ini' });
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
  notes: z.string().optional(),
});

// PUT /api/schedules/:id
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const d = parsed.data;
    const referenceDate = d.startDate ?? new Date().toISOString().split('T')[0];
    const data: Record<string, unknown> = {};
    if (d.notes !== undefined) data.notes = d.notes;
    if (d.dayOfWeek !== undefined) data.dayOfWeek = d.dayOfWeek;
    if (d.startDate) data.startDate = new Date(d.startDate);
    if (d.endDate) data.endDate = new Date(d.endDate);
    if (d.startTime) data.startTime = combineDateTime(referenceDate, d.startTime);
    if (d.endTime) data.endTime = combineDateTime(referenceDate, d.endTime);

    res.json({ success: true, data: await updateSchedule(req.params.id, data) });
  } catch (err) {
    handleError(err, res);
  }
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED']) });

// PATCH /api/schedules/:id/status
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    res.json({
      success: true,
      data: await setScheduleStatus(req.params.id, parsed.data.status, req.user!.userId),
    });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
