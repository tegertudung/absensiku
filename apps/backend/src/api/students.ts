import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  createStudent,
  listStudents,
  getStudentById,
  updateStudent,
  setStudentStatus,
  deleteStudentPermanently,
} from '../services/studentService';
import { listEnrollmentsForStudent } from '../services/enrollmentService';

const router = Router();

const studentPhoneSchema = z
  .string({ required_error: 'Nomor telepon wajib diisi' })
  .min(1, 'Nomor telepon wajib diisi')
  .regex(/^\d+$/, 'Nomor telepon hanya boleh berisi angka 0-9')
  .max(13, 'Nomor telepon maksimal 13 digit');

const createSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  phone: studentPhoneSchema,
  email: z.string().email('Email tidak valid').optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
});

// POST /api/students
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const student = await createStudent(parsed.data);
    res.status(201).json({ success: true, data: student });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/students — also readable by TENTOR (needed for the "Tambah Privat"
// student search when a tentor creates their own private schedule).
router.get('/', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listStudents() });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/students/:id — includes private package history
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getStudentById(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/students/:id/classes — module 4: "kelas reguler" from the student's side
router.get('/:id/classes', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listEnrollmentsForStudent(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: studentPhoneSchema,
  email: z.string().email().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
});

// PUT /api/students/:id
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    res.json({ success: true, data: await updateStudent(req.params.id, parsed.data) });
  } catch (err) {
    handleError(err, res);
  }
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'GRADUATED']) });

// PATCH /api/students/:id/status
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    res.json({
      success: true,
      data: await setStudentStatus(req.params.id, parsed.data.status, req.user!.userId),
    });
  } catch (err) {
    handleError(err, res);
  }
});

// DELETE /api/students/:id — explicit, admin-only permanent deletion.
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await deleteStudentPermanently(req.params.id, req.user!.userId) });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
