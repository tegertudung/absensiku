import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { listAuditLogs } from '../services/auditLogService';

const router = Router();

// GET /api/audit-logs?tableName=&recordId=
router.get('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const tableName = req.query.tableName as string | undefined;
  const recordId = req.query.recordId as string | undefined;
  try {
    res.json({ success: true, data: await listAuditLogs({ tableName, recordId }) });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
