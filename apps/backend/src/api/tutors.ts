import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  createTutor,
  listTutors,
  getTutorById,
  updateTutor,
  setTutorActive,
} from '../services/tutorService';

const router = Router();

const createSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  phone: z.string().optional(),
  hireDate: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  bankHolderName: z.string().optional(),
});

// POST /api/tutors — admin creates a tutor account (User + Tutor)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const tutor = await createTutor({
      ...parsed.data,
      hireDate: parsed.data.hireDate ? new Date(parsed.data.hireDate) : undefined,
    });
    res.status(201).json({ success: true, data: tutor });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/tutors
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listTutors() });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/tutors/:id
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getTutorById(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  hireDate: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  bankHolderName: z.string().optional(),
  notes: z.string().optional(),
});

// PUT /api/tutors/:id
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.hireDate) data.hireDate = new Date(parsed.data.hireDate);
    res.json({ success: true, data: await updateTutor(req.params.id, data) });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/tutors/:id/deactivate
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await setTutorActive(req.params.id, false) });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/tutors/:id/activate
router.patch('/:id/activate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await setTutorActive(req.params.id, true) });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
