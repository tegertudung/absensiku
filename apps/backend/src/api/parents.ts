import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  createParent,
  listParents,
  getParentById,
  updateParent,
  setParentActive,
  linkChild,
  unlinkChild,
} from '../services/parentService';

const router = Router();

const createSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  phone: z.string().optional(),
  studentIds: z.array(z.string().uuid()).min(1, 'Pilih minimal satu siswa'),
});

// POST /api/parents — admin creates a parent account (User + Parent + links to children)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const parent = await createParent(parsed.data);
    res.status(201).json({ success: true, data: parent });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/parents
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listParents() });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/parents/:id
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getParentById(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
});

// PUT /api/parents/:id
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    res.json({ success: true, data: await updateParent(req.params.id, parsed.data) });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/parents/:id/deactivate
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await setParentActive(req.params.id, false, req.user!.userId) });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/parents/:id/activate
router.patch('/:id/activate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await setParentActive(req.params.id, true, req.user!.userId) });
  } catch (err) {
    handleError(err, res);
  }
});

const linkSchema = z.object({
  studentId: z.string().uuid(),
  relationship: z.string().optional(),
});

// POST /api/parents/:id/children — link another child to an existing parent account
router.post('/:id/children', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const data = await linkChild(req.params.id, parsed.data.studentId, parsed.data.relationship, req.user!.userId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/parents/:id/children/:studentId
router.delete('/:id/children/:studentId', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const data = await unlinkChild(req.params.id, req.params.studentId, req.user!.userId);
    res.json({ success: true, data });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
