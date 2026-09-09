import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";

/**
 * JWT_SECRET wajib tersedia.
 *
 * Dibuat melalui function agar TypeScript mengetahui hasil akhirnya
 * selalu bertipe string, bukan string | undefined.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  validateJwtSecret(secret, process.env.NODE_ENV);
  return secret as string;
}

const KNOWN_JWT_SECRET_PLACEHOLDERS = new Set([
  "your-super-secret-key-here",
  "CHANGE_ME_USE_A_RANDOM_SECRET_AT_LEAST_32_BYTES",
]);

/** Fail closed when an example/weak signing key reaches a running backend. */
export function validateJwtSecret(
  secret: string | undefined,
  nodeEnv: string | undefined,
): void {
  if (!secret || !secret.trim()) {
    throw new Error(
      "Invalid JWT configuration: JWT_SECRET wajib dikonfigurasi.",
    );
  }
  if (
    KNOWN_JWT_SECRET_PLACEHOLDERS.has(secret) ||
    /^(change[_-]?me|replace[_-]?me|example|your[_-])/i.test(secret)
  ) {
    throw new Error(
      "Invalid JWT configuration: JWT_SECRET harus menggunakan nilai unik yang aman.",
    );
  }
  if (nodeEnv === "production" && Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "Invalid JWT configuration: JWT_SECRET production minimal 32 byte.",
    );
  }
}

const JWT_SECRET = getJwtSecret();

const JWT_EXPIRES_IN: jwt.SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "7d";

const SALT_ROUNDS = 10;

export interface JwtPayload {
  userId: string;
  email: string;
  role: "ADMIN" | "TENTOR" | "PARENT";
  authVersion: number;
  isPrimaryAdmin?: boolean;
  mustChangePassword?: boolean;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
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
    throw new AuthError("Email atau password salah", 401);
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new AuthError("Email atau password salah", 401);
  }

  /**
   * Check dilakukan setelah password tervalidasi agar login dengan
   * credential salah tetap memberikan response generik.
   */
  if (!user.isActive || user.deletedAt) {
    throw new AuthError("Akun tidak aktif. Hubungi admin.", 403);
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
    role: user.role as JwtPayload["role"],
    authVersion: user.authVersion,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isPrimaryAdmin: user.isPrimaryAdmin,
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
  role: "ADMIN" | "TENTOR",
) {
  const existing = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existing) {
    throw new AuthError("Email sudah terdaftar", 409);
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
    role: user.role as JwtPayload["role"],
    authVersion: user.authVersion,
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
    throw new AuthError("Akun tidak ditemukan", 404);
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

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
    throw new AuthError("Password saat ini salah", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const updated = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash,
      mustChangePassword: false,
      authVersion: { increment: 1 },
    },
    select: {
      id: true,
      email: true,
      role: true,
      isPrimaryAdmin: true,
      mustChangePassword: true,
      authVersion: true,
    },
  });

  return {
    token: generateToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role as JwtPayload["role"],
      authVersion: updated.authVersion,
    }),
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      isPrimaryAdmin: updated.isPrimaryAdmin,
      mustChangePassword: updated.mustChangePassword,
    },
  };
}

/** Logout is intentionally account-wide for this small deployment. */
export async function logout(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { authVersion: { increment: 1 } },
  });
}

/**
 * Generate JWT authentication token.
 *
 * Algoritma dikunci ke HS256.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify JWT dan validasi claim yang diperlukan aplikasi.
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });

    /**
     * jsonwebtoken dapat mengembalikan string atau object.
     * Aplikasi membutuhkan JWT object dengan claim tertentu.
     */
    if (typeof decoded !== "object" || decoded === null) {
      throw new Error("Invalid token payload");
    }

    const userId = decoded.userId;
    const email = decoded.email;
    const role = decoded.role;
    const authVersion = decoded.authVersion;

    if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new Error("Invalid userId claim");
    }

    if (typeof email !== "string" || email.trim().length === 0) {
      throw new Error("Invalid email claim");
    }

    if (role !== "ADMIN" && role !== "TENTOR" && role !== "PARENT") {
      throw new Error("Invalid role claim");
    }

    if (!Number.isInteger(authVersion) || authVersion < 0) {
      throw new Error("Invalid authVersion claim");
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
      authVersion,
    };
  } catch {
    throw new AuthError("Token tidak valid atau kedaluwarsa", 401);
  }
}
