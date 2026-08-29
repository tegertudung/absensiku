import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { resolveParentIdForUser } from '../services/parentService';
import { listChildrenForParent, getChildProgress } from '../services/parentPortalService';

const router = Router();

// GET /api/parent/children — Beranda: every linked child + quota summary
router.get('/children', requireAuth, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const parentId = await resolveParentIdForUser(req.user!.userId);
    if (!parentId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil orang tua' });
    }
    res.json({ success: true, data: await listChildrenForParent(parentId) });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/parent/children/:studentId/progress — riwayat belajar + kehadiran satu anak
router.get('/children/:studentId/progress', requireAuth, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const parentId = await resolveParentIdForUser(req.user!.userId);
    if (!parentId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil orang tua' });
    }
    res.json({ success: true, data: await getChildProgress(parentId, req.params.studentId) });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
