import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { resolveParentIdForUser, getParentById } from '../services/parentService';
import { listChildrenForParent, getChildProgress } from '../services/parentPortalService';
import { buildStudentReport, renderStudentReportPdf } from '../services/studentReportService';

const router = Router();

// GET /api/parent/me — own profile (Profil page: name, phone, email)
router.get('/me', requireAuth, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const parentId = await resolveParentIdForUser(req.user!.userId);
    if (!parentId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil orang tua' });
    }
    res.json({ success: true, data: await getParentById(parentId) });
  } catch (err) {
    handleError(err, res);
  }
});

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

// GET /api/parent/children/:studentId/report.pdf — Laporan Progress Siswa
router.get('/children/:studentId/report.pdf', requireAuth, requireRole('PARENT'), async (req: Request, res: Response) => {
  try {
    const parentId = await resolveParentIdForUser(req.user!.userId);
    if (!parentId) {
      return res.status(403).json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil orang tua' });
    }
    // Re-uses getChildProgress purely to run its ownership check (throws 403
    // if this student isn't actually linked to the requesting parent) before
    // building the PDF — avoids duplicating that check here.
    await getChildProgress(parentId, req.params.studentId);
    const report = await buildStudentReport(req.params.studentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${report.student.name.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf"`);
    res.send(renderStudentReportPdf(report));
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
