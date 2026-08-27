import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError, AppError } from '../utils/errors';
import { prisma } from '../utils/prisma';

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

    const kelas = await prisma.class.create({ data: parsed.data });
    res.status(201).json({ success: true, data: kelas });
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

export default router;
