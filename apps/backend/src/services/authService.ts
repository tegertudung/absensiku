import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET wajib dikonfigurasi.');
}

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
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AuthError('Email atau password salah', 401);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new AuthError('Email atau password salah', 401);
  }

  if (!user.isActive) {
    throw new AuthError('Akun tidak aktif. Hubungi admin.', 403);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
    },
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
      mustChangePassword: user.mustChangePassword,
    },
  };
}

/**
 * Register a new user.
 * Used by admin for creating tutor accounts / existing bootstrap flow.
 */
export async function register(
  email: string,
  password: string,
  role: 'ADMIN' | 'TENTOR',
) {
  const existing = await prisma.user.findUnique({
    where: { email },
  });

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

/**
 * Any logged-in role can change their own password,
 * provided the current password is correct.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AuthError('Akun tidak ditemukan', 404);
  }

  const isValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );

  // This is input validation, not an authentication-token failure.
  // Returning 400 prevents the frontend global 401 interceptor
  // from logging the user out when they mistype their current password.
  if (!isValid) {
    throw new AuthError('Password saat ini salah', 400);
  }

  const passwordHash = await bcrypt.hash(
    newPassword,
    SALT_ROUNDS,
  );

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });
}

/**
 * Generate JWT authentication token.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verify JWT token and validate required claims.
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });

    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(payload.userId) ||
      !['ADMIN', 'TENTOR', 'PARENT'].includes(payload.role)
    ) {
      throw new Error('Invalid claims');
    }

    return payload as JwtPayload;
  } catch {
    throw new AuthError(
      'Token tidak valid atau kedaluwarsa',
      401,
    );
  }
}