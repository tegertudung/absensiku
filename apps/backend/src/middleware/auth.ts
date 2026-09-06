import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload, AuthError } from '../services/authService';
import { prisma } from '../utils/prisma';

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the Bearer token and attaches the decoded payload to req.user.
 * Use on any route that requires a logged-in user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token tidak ditemukan' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true,
        tutor: { select: { status: true, deletedAt: true } } },
    });
    if (!user || !user.isActive ||
        (user.role === 'TENTOR' && (!user.tutor || user.tutor.deletedAt || user.tutor.status !== 'ACTIVE'))) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Akun tidak aktif atau tidak tersedia.' });
    }
    req.user = { userId: user.id, email: user.email, role: user.role as JwtPayload['role'] };
    next();
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return res.status(status).json({ error: 'Unauthorized', message: 'Token tidak valid atau akun tidak tersedia.' });
  }
}

/**
 * Restricts a route to specific roles. Must run AFTER requireAuth.
 * Usage: router.get('/admin-only', requireAuth, requireRole('ADMIN'), handler)
 */
export function requireRole(...roles: Array<'ADMIN' | 'TENTOR' | 'PARENT'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Belum login' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Anda tidak memiliki akses ke resource ini',
      });
    }

    next();
  };
}
