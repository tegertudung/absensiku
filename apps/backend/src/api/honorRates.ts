import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { createHonorRate, listHonorRates, listHonorRateHistory, deactivateHonorRate } from '../services/honorRateService';

const router = Router();

const createSchema = z.object({
  sessionType: z.enum(['REGULAR', 'PRIVATE']),
  nominal: z.number().positive('Nominal harus lebih dari 0'),
  effectiveFrom: z.string().min(10, 'Format tanggal tidak valid (YYYY-MM-DD)'),
  subjectId: z.string().uuid('subjectId harus UUID valid').optional(),
  programId: z.string().uuid('programId harus UUID valid').optional(),
  notes: z.string().optional(),
});

// POST /api/honor-rates — create a new rate (auto-closes the previous open-ended one)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const rate = await createHonorRate({
      ...parsed.data,
      effectiveFrom: new Date(parsed.data.effectiveFrom),
    });
    res.status(201).json({ success: true, data: rate });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/honor-rates?sessionType=REGULAR|PRIVATE
router.get('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const sessionType = req.query.sessionType as 'REGULAR' | 'PRIVATE' | undefined;
  const programId = typeof req.query.programId === 'string' ? req.query.programId : undefined;
  try {
    res.json({ success: true, data: await listHonorRates(sessionType, programId) });
  } catch (err) {
    handleError(err, res);
  }
});

router.get('/history', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try { res.json({ success: true, data: await listHonorRateHistory() }); } catch (err) { handleError(err, res); }
});

const deactivateSchema = z.object({ reason: z.string().optional() });

// PATCH /api/honor-rates/:id/deactivate
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = deactivateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const rate = await deactivateHonorRate(req.params.id, req.user!.userId, parsed.data.reason);
    res.json({ success: true, data: rate });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
