import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import {
  createSessionFromSchedule,
  completeSession,
  reportCancellation,
  decideValidation,
  listSessions,
  listPendingValidations,
  resolveTutorIdForUser,
  SessionError,
} from '../services/sessionService';

const router = Router();

function handleError(err: unknown, res: Response) {
  const status = err instanceof SessionError ? err.status : 500;
  res.status(status).json({ error: 'Request failed', message: (err as Error).message });
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'Format tanggal tidak valid');

// ============================================
// POST /api/sessions — tentor starts a session from their schedule
// ============================================
const createSessionSchema = z.object({
  scheduleId: z.string().uuid('scheduleId harus UUID valid'),
  sessionDate: isoDate,
});

router.post('/', requireAuth, requireRole('TENTOR', 'ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const actingTutorId =
      req.user!.role === 'TENTOR' ? await resolveTutorIdForUser(req.user!.userId) : null;

    if (req.user!.role === 'TENTOR' && !actingTutorId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil tentor' });
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
});

// ============================================
// POST /api/sessions/:id/complete
// ============================================
router.post(
  '/:id/complete',
  requireAuth,
  requireRole('TENTOR', 'ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const actingTutorId =
        req.user!.role === 'TENTOR' ? await resolveTutorIdForUser(req.user!.userId) : null;

      const session = await completeSession(req.params.id, req.user!.userId, actingTutorId);
      res.json({ success: true, data: session, message: 'Sesi selesai & honor tercatat' });
    } catch (err) {
      handleError(err, res);
    }
  }
);

// ============================================
// POST /api/sessions/:id/cancel — day-of cancellation reported by tutor
// ============================================
const cancelSchema = z.object({ reason: z.string().min(3, 'Alasan wajib diisi (minimal 3 karakter)') });

router.post('/:id/cancel', requireAuth, requireRole('TENTOR', 'ADMIN'), async (req: Request, res: Response) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const actingTutorId =
      req.user!.role === 'TENTOR' ? await resolveTutorIdForUser(req.user!.userId) : null;

    const validation = await reportCancellation(
      req.params.id,
      parsed.data.reason,
      req.user!.userId,
      actingTutorId
    );
    res.json({ success: true, data: validation, message: 'Pembatalan dilaporkan, menunggu keputusan admin' });
  } catch (err) {
    handleError(err, res);
  }
});

// ============================================
// GET /api/sessions/validations/pending — admin queue
// ============================================
router.get(
  '/validations/pending',
  requireAuth,
  requireRole('ADMIN'),
  async (_req: Request, res: Response) => {
    try {
      const validations = await listPendingValidations();
      res.json({ success: true, data: validations });
    } catch (err) {
      handleError(err, res);
    }
  }
);

// ============================================
// POST /api/sessions/validations/:id/decide — admin approves/rejects
// ============================================
const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  adminNotes: z.string().optional(),
});

router.post(
  '/validations/:id/decide',
  requireAuth,
  requireRole('ADMIN'),
  async (req: Request, res: Response) => {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
    }

    try {
      const result = await decideValidation(
        req.params.id,
        parsed.data.decision,
        req.user!.userId,
        parsed.data.adminNotes
      );
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  }
);

// ============================================
// GET /api/sessions — list with filters. TENTOR is scoped to their own sessions.
// ============================================
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const { status, sessionType, startDate, endDate, tutorId } = req.query;

  let scopedTutorId: string | undefined;

  if (req.user!.role === 'TENTOR') {
    const ownTutorId = await prisma.tutor.findUnique({ where: { userId: req.user!.userId } });
    if (!ownTutorId) {
      // Fail closed: no linked tutor profile yet => nothing to show, never leak all data.
      return res.json({ success: true, data: [] });
    }
    scopedTutorId = ownTutorId.id;
  } else {
    scopedTutorId = typeof tutorId === 'string' ? tutorId : undefined;
  }

  try {
    const sessions = await listSessions({
      tutorId: scopedTutorId,
      status: typeof status === 'string' ? status : undefined,
      sessionType: typeof sessionType === 'string' ? sessionType : undefined,
      startDate: typeof startDate === 'string' ? new Date(startDate) : undefined,
      endDate: typeof endDate === 'string' ? new Date(endDate) : undefined,
    });
    res.json({ success: true, data: sessions });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
