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
  const status = err && typeof (err as any).status === 'number' ? (err as any).status : 500;
  res.status(status).json({ error: 'Request failed', message: (err as Error).message });
}
