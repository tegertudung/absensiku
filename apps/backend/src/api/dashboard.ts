import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { resolveTutorIdForUser } from '../services/sessionService';
import { getAdminDashboardSummary, getTutorDashboardSummary } from '../services/dashboardService';

const router = Router();

// GET /api/dashboard/admin
router.get('/admin', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await getAdminDashboardSummary() });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/dashboard/tentor
router.get('/tentor', requireAuth, requireRole('TENTOR'), async (req: Request, res: Response) => {
  try {
    const tutorId = await resolveTutorIdForUser(req.user!.userId);
    if (!tutorId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil tentor' });
    }
    res.json({ success: true, data: await getTutorDashboardSummary(tutorId) });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
