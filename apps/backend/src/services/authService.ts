import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 10;

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'ADMIN' | 'TENTOR' | 'PARENT';
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Login: verify email + password, return user + token.
 */
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AuthError('Email atau password salah', 401);
  }

  if (!user.isActive) {
    throw new AuthError('Akun tidak aktif. Hubungi admin.', 403);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError('Email atau password salah', 401);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as 'ADMIN' | 'TENTOR' | 'PARENT',
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Register a new user (admin creates tutor accounts, or self-registration for admin bootstrap).
 */
export async function register(email: string, password: string, role: 'ADMIN' | 'TENTOR') {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError('Email sudah terdaftar', 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      isActive: true,
    },
  });

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as 'ADMIN' | 'TENTOR',
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    throw new AuthError('Token tidak valid atau kedaluwarsa', 401);
  }
}
