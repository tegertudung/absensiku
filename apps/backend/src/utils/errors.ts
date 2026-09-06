import { Response } from 'express';

export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Generic error handler for route try/catch blocks. Recognizes any error with
 * a numeric `.status` (AppError, AuthError, SessionError, ...) so it works
 * uniformly across modules without needing instanceof checks per error class.
 */
export function handleError(err: unknown, res: Response) {
  const e = err as { status?: unknown; message?: string; code?: string; details?: unknown } | null;
  if (e?.code === 'P2002') return res.status(409).json({ error: 'Conflict', message: 'Data tersebut sudah terdaftar.' });
  if (e?.code === 'P2025') return res.status(404).json({ error: 'Not found', message: 'Data tidak ditemukan.' });
  if (e?.code === 'P2003') return res.status(409).json({ error: 'Conflict', message: 'Data terkait tidak valid atau masih digunakan.' });
  const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 500 ? e.status : 500;
  return res.status(status).json({ error: 'Request failed', message: status === 500 ? 'Terjadi kesalahan internal. Silakan coba kembali.' : e?.message,
    ...(status < 500 ? { code: e?.code, details: e?.details } : {}) });
}
