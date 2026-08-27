import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { saveSubscription, removeSubscription, isPushConfigured } from '../services/pushService';

const router = Router();

// GET /api/push/public-key — the frontend needs this to call
// PushManager.subscribe({ applicationServerKey: ... }).
router.get('/public-key', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() },
  });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// POST /api/push/subscribe — save/refresh this device's push subscription
router.post('/subscribe', requireAuth, async (req: Request, res: Response) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    await saveSubscription(req.user!.userId, parsed.data);
    res.status(201).json({ success: true });
  } catch (err) {
    handleError(err, res);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

// POST /api/push/unsubscribe
router.post('/unsubscribe', requireAuth, async (req: Request, res: Response) => {
  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    await removeSubscription(parsed.data.endpoint);
    res.json({ success: true });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
