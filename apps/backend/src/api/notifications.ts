import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { handleError } from '../utils/errors';
import {
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService';

const router = Router();

// GET /api/notifications — own notifications, any authenticated role
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listNotificationsForUser(req.user!.userId) });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    await markNotificationRead(req.params.id, req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    handleError(err, res);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await markAllNotificationsRead(req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
