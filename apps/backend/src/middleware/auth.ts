import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload, AuthError } from '../services/authService';

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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token tidak ditemukan' });
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    return res.status(status).json({ error: 'Unauthorized', message: (err as Error).message });
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
