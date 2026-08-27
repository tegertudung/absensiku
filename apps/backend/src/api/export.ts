import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { generateRecapExcel } from '../services/exportService';
import { resolveTutorIdForUser } from '../services/sessionService';

const router = Router();

// GET /api/export/recap.xlsx?startDate=&endDate=&tutorId=&sessionType=&status=
// Admin: can export all tutors or filter to one via ?tutorId=.
// Tentor: BR-12 — always scoped to their own data, ?tutorId= is ignored.
router.get('/recap.xlsx', requireAuth, async (req: Request, res: Response) => {
  const { startDate, endDate, tutorId, sessionType, status, classId, dayOfWeek, hour } = req.query;

  let scopedTutorId: string | undefined;

  if (req.user!.role === 'TENTOR') {
    const ownTutorId = await resolveTutorIdForUser(req.user!.userId);
    if (!ownTutorId) {
      return res
        .status(403)
        .json({ error: 'Forbidden', message: 'Akun Anda belum terhubung ke profil tentor' });
    }
    scopedTutorId = ownTutorId;
  } else {
    scopedTutorId = typeof tutorId === 'string' ? tutorId : undefined;
  }

  try {
    const buffer = await generateRecapExcel({
      tutorId: scopedTutorId,
      status: typeof status === 'string' ? status : undefined,
      sessionType: typeof sessionType === 'string' ? sessionType : undefined,
      startDate: typeof startDate === 'string' ? new Date(startDate) : undefined,
      endDate: typeof endDate === 'string' ? new Date(endDate) : undefined,
      classId: typeof classId === 'string' ? classId : undefined,
      dayOfWeek: typeof dayOfWeek === 'string' ? Number(dayOfWeek) : undefined,
      hour: typeof hour === 'string' ? hour : undefined,
    });

    const filename = `rekap-mengajar-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Export failed', message: (err as Error).message });
  }
});

export default router;
