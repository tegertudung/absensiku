import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  createPackage,
  extendPackage,
  listPackagesForStudent,
  getPackageById,
  setPackageStatus,
} from '../services/privatePackageService';

const router = Router();

const createSchema = z.object({
  studentId: z.string().uuid('studentId harus UUID valid'),
  quotaTotal: z.number().int().positive('Kuota harus lebih dari 0'),
  packageName: z.string().optional(),
  price: z.number().optional(),
  paymentDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/private-packages — admin activates a new package (BR-02, alur H.2)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }

  try {
    const pkg = await createPackage({
      ...parsed.data,
      paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : undefined,
      createdBy: req.user!.userId,
    });
    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/private-packages?studentId=...
router.get('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const studentId = req.query.studentId as string | undefined;
  if (!studentId) {
    return res.status(400).json({ error: 'Validation error', message: 'studentId wajib diisi sebagai query param' });
  }
  try {
    res.json({ success: true, data: await listPackagesForStudent(studentId) });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/private-packages/:id — includes usage ledger
router.get('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getPackageById(req.params.id) });
  } catch (err) {
    handleError(err, res);
  }
});

const extendSchema = z.object({
  additionalQuota: z.number().int().positive('Jumlah tambahan kuota harus lebih dari 0'),
  reason: z.string().optional(),
});

// POST /api/private-packages/:id/extend — BR-05
router.post('/:id/extend', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    const pkg = await extendPackage(req.params.id, parsed.data.additionalQuota, req.user!.userId, parsed.data.reason);
    res.json({ success: true, data: pkg });
  } catch (err) {
    handleError(err, res);
  }
});

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED']) });

// PATCH /api/private-packages/:id/status
router.patch('/:id/status', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    res.json({
      success: true,
      data: await setPackageStatus(req.params.id, parsed.data.status, req.user!.userId),
    });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
