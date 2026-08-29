import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { login, register, changePassword, AuthError } from '../services/authService';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../utils/prisma';

const router = Router();

const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

const registerSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['ADMIN', 'TENTOR']),
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation error',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await login(parsed.data.email, parsed.data.password);
    res.json({ success: true, data: result });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    res.status(status).json({ error: 'Login failed', message: (err as Error).message });
  }
});

// POST /api/auth/register
// NOTE: Phase 1 — open registration for bootstrap. Lock this down to admin-only
// (requireAuth + requireRole('ADMIN')) once the first admin account exists.
router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation error',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const result = await register(parsed.data.email, parsed.data.password, parsed.data.role);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    res.status(status).json({ error: 'Register failed', message: (err as Error).message });
  }
});

// GET /api/auth/me — return current logged-in user
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, role: true, isActive: true, lastLogin: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true, data: user });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
  newPassword: z.string().min(6, 'Password baru minimal 6 karakter'),
});

// POST /api/auth/change-password — any authenticated role
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation error', details: parsed.error.flatten().fieldErrors });
  }
  try {
    await changePassword(req.user!.userId, parsed.data.currentPassword, parsed.data.newPassword);
    res.json({ success: true });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    res.status(status).json({ error: 'Change password failed', message: (err as Error).message });
  }
});

export default router;
