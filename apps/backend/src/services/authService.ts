import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

/**
 * JWT_SECRET wajib tersedia.
 *
 * Dibuat melalui function agar TypeScript mengetahui hasil akhirnya
 * selalu bertipe string, bukan string | undefined.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET wajib dikonfigurasi.');
  }

  return secret;
}

const JWT_SECRET = getJwtSecret();

const JWT_EXPIRES_IN: jwt.SignOptions['expiresIn'] =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '7d';

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
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * Login:
 * - cari user berdasarkan email
 * - verifikasi password
 * - pastikan akun aktif
 * - update lastLogin
 * - generate JWT
 */
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user) {
    throw new AuthError('Email atau password salah', 401);
  }

  const isValid = await bcrypt.compare(
    password,
    user.passwordHash,
  );

  if (!isValid) {
    throw new AuthError('Email atau password salah', 401);
  }

  /**
   * Check dilakukan setelah password tervalidasi agar login dengan
   * credential salah tetap memberikan response generik.
   */
  if (!user.isActive) {
    throw new AuthError(
      'Akun tidak aktif. Hubungi admin.',
      403,
    );
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastLogin: new Date(),
    },
  });

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as JwtPayload['role'],
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
 * Register user baru.
 *
 * Saat ini mengikuti flow existing:
 * Admin dapat membuat ADMIN / TENTOR sesuai caller/API yang
 * sudah menggunakan service ini.
 */
export async function register(
  email: string,
  password: string,
  role: 'ADMIN' | 'TENTOR',
) {
  const existing = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existing) {
    throw new AuthError(
      'Email sudah terdaftar',
      409,
    );
  }

  const passwordHash = await bcrypt.hash(
    password,
    SALT_ROUNDS,
  );

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
    role: user.role as JwtPayload['role'],
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
 * User yang sudah login dapat mengganti password sendiri.
 *
 * Password lama wajib benar.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new AuthError(
      'Akun tidak ditemukan',
      404,
    );
  }

  const isValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );

  /**
   * Gunakan 400, bukan 401.
   *
   * 401 pada frontend diperlakukan sebagai authentication failure
   * dan dapat membuat user otomatis logout.
   *
   * Password lama yang salah adalah validation error terhadap input
   * user, bukan token yang invalid.
   */
  if (!isValid) {
    throw new AuthError(
      'Password saat ini salah',
      400,
    );
  }

  const passwordHash = await bcrypt.hash(
    newPassword,
    SALT_ROUNDS,
  );

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
      mustChangePassword: false,
    },
  });
}

/**
 * Generate JWT authentication token.
 *
 * Algoritma dikunci ke HS256.
 */
export function generateToken(
  payload: JwtPayload,
): string {
  return jwt.sign(
    payload,
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

/**
 * Verify JWT dan validasi claim yang diperlukan aplikasi.
 */
export function verifyToken(
  token: string,
): JwtPayload {
  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET,
      {
        algorithms: ['HS256'],
      },
    );

    /**
     * jsonwebtoken dapat mengembalikan string atau object.
     * Aplikasi membutuhkan JWT object dengan claim tertentu.
     */
    if (
      typeof decoded !== 'object' ||
      decoded === null
    ) {
      throw new Error('Invalid token payload');
    }

    const userId = decoded.userId;
    const email = decoded.email;
    const role = decoded.role;

    if (
      typeof userId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(userId)
    ) {
      throw new Error('Invalid userId claim');
    }

    if (
      typeof email !== 'string' ||
      email.trim().length === 0
    ) {
      throw new Error('Invalid email claim');
    }

    if (
      role !== 'ADMIN' &&
      role !== 'TENTOR' &&
      role !== 'PARENT'
    ) {
      throw new Error('Invalid role claim');
    }

    /**
     * Jangan cast seluruh decoded token menjadi JwtPayload,
     * karena decoded juga membawa JWT metadata seperti iat/exp.
     *
     * Bangun object aplikasi secara eksplisit.
     */
    return {
      userId,
      email,
      role,
    };
  } catch {
    throw new AuthError(
      'Token tidak valid atau kedaluwarsa',
      401,
    );
  }
}