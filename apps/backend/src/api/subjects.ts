import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError, AppError } from '../utils/errors';
import { prisma } from '../utils/prisma';

const router = Router();

// GET /api/subjects — readable by any authenticated user (used in dropdowns)
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    const subjects = await prisma.subject.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: subjects });
  } catch (err) {
    handleError(err, res);
  }
});

const createSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  description: z.string().optional(),
});

// POST /api/subjects
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const existing = await prisma.subject.findUnique({ where: { name: parsed.data.name } });
    if (existing) throw new AppError('Mata pelajaran sudah ada', 409);

    const subject = await prisma.subject.create({ data: parsed.data });
    res.status(201).json({ success: true, data: subject });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/subjects/:id/deactivate
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const subject = await prisma.subject.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true, data: subject });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
