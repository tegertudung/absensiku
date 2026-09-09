import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "../src/services/authService";

// This suite is deliberately database-free: it exercises the real auth,
// middleware, hashing and tutor-provisioning code with an in-memory Prisma
// delegate. It never reads or writes development/production records.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "auth-security-test-only-key-32-bytes-minimum";

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: "ADMIN" | "TENTOR" | "PARENT";
  isActive: boolean;
  isPrimaryAdmin: boolean;
  deletedAt: Date | null;
  mustChangePassword: boolean;
  authVersion: number;
  tutor: { status: string; deletedAt: Date | null } | null;
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

async function main() {
  const { prisma } = await import("../src/utils/prisma");
  const auth = await import("../src/services/authService");
  const middleware = await import("../src/middleware/auth");
  const tutorService = await import("../src/services/tutorService");
  const adminUserService = await import("../src/services/adminUserService");

  const original = {
    userFindUnique: prisma.user.findUnique,
    userUpdate: prisma.user.update,
    transaction: prisma.$transaction,
  };

  let user: FakeUser = {
    id: USER_ID,
    email: "tutor.test@example.invalid",
    passwordHash: await bcrypt.hash("temporary-password", 10),
    role: "TENTOR",
    isActive: true,
    isPrimaryAdmin: false,
    deletedAt: null,
    mustChangePassword: false,
    authVersion: 0,
    tutor: { status: "ACTIVE", deletedAt: null },
  };

  function installUserDelegate() {
    (prisma.user as any).findUnique = async () => ({ ...user });
    (prisma.user as any).update = async (args: any) => {
      if (args.data.passwordHash) user.passwordHash = args.data.passwordHash;
      if (typeof args.data.mustChangePassword === "boolean")
        user.mustChangePassword = args.data.mustChangePassword;
      if (args.data.authVersion?.increment)
        user.authVersion += args.data.authVersion.increment;
      return { ...user };
    };
  }

  function token(overrides: Partial<JwtPayload> = {}) {
    return auth.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      authVersion: user.authVersion,
      ...overrides,
    });
  }

  async function run(
    handler: typeof middleware.authenticate,
    bearerToken: string,
  ) {
    let nextCalled = false;
    const response: { status?: number; body?: any } = {};
    const req = {
      headers: { authorization: `Bearer ${bearerToken}` },
    } as any;
    const res = {
      status(code: number) {
        response.status = code;
        return this;
      },
      json(body: any) {
        response.body = body;
        return this;
      },
    } as any;
    await handler(req, res, () => {
      nextCalled = true;
    });
    return { nextCalled, response, req };
  }

  try {
    // TEST 1: two real provisioning calls produce unique, strong temporary
    // passwords and only bcrypt hashes are handed to persistence.
    const storedHashes: string[] = [];
    let code = 0;
    (prisma.user as any).findUnique = async () => null;
    (prisma as any).$transaction = async (callback: (tx: any) => unknown) =>
      callback({
        subject: {
          findMany: async ({ where }: any) =>
            where.id.in.map((id: string) => ({ id })),
        },
        user: {
          create: async ({ data }: any) => {
            storedHashes.push(data.passwordHash);
            return { id: `user-${storedHashes.length}` };
          },
        },
        tutor: {
          create: async ({ data }: any) => ({
            id: `tutor-${storedHashes.length}`,
            ...data,
          }),
          findUniqueOrThrow: async () => ({
            id: `tutor-${storedHashes.length}`,
          }),
        },
        tutorSubject: { createMany: async () => ({ count: 1 }) },
        $queryRaw: async () => [{ value: BigInt(++code) }],
      });
    const first = await tutorService.createTutor({
      email: "one@example.invalid",
      name: "Tutor One",
      phone: "081234567890",
      subjectIds: ["33333333-3333-4333-8333-333333333333"],
    });
    const second = await tutorService.createTutor({
      email: "two@example.invalid",
      name: "Tutor Two",
      phone: "081234567891",
      subjectIds: ["33333333-3333-4333-8333-333333333333"],
    });
    assert.notEqual(first.temporaryPassword, second.temporaryPassword);
    assert.ok(first.temporaryPassword.length >= 12);
    assert.ok(await bcrypt.compare(first.temporaryPassword, storedHashes[0]));
    assert.notEqual(storedHashes[0], first.temporaryPassword);

    installUserDelegate();

    // TEST 2 + 3: restricted accounts fail the normal business boundary but
    // pass the base authenticator used by change-password/me/logout.
    user.mustChangePassword = true;
    const restrictedToken = token();
    const business = await run(middleware.requireAuth, restrictedToken);
    assert.equal(business.response.status, 403);
    assert.equal(business.response.body.code, "PASSWORD_CHANGE_REQUIRED");
    assert.equal(
      (await run(middleware.authenticate, restrictedToken)).nextCalled,
      true,
    );

    // TEST 4-6: change is atomic, clears the restriction, increments the
    // version, revokes the old token, and returns a usable replacement.
    const changed = await auth.changePassword(
      user.id,
      "temporary-password",
      "new-secure-password",
    );
    assert.equal(user.mustChangePassword, false);
    assert.equal(user.authVersion, 1);
    assert.equal(
      (await run(middleware.requireAuth, restrictedToken)).response.status,
      401,
    );
    assert.equal(
      (await run(middleware.requireAuth, changed.token)).nextCalled,
      true,
    );

    // TEST 7: tutor reset revokes prior tokens and restores the restriction.
    const beforeReset = changed.token;
    (prisma as any).$transaction = async (callback: (tx: any) => unknown) =>
      callback({
        tutor: {
          findUnique: async () => ({
            id: "tutor-1",
            tutorCode: "TTR-0001",
            name: "Tutor Test",
            user: { id: user.id },
          }),
        },
        user: { update: prisma.user.update },
        auditLog: { create: async () => ({}) },
      });
    await tutorService.resetTutorPassword("tutor-1", ADMIN_ID);
    assert.equal(user.mustChangePassword, true);
    assert.equal(user.authVersion, 2);
    assert.equal(
      (await run(middleware.authenticate, beforeReset)).response.status,
      401,
    );

    // Also cover the second reset path (non-primary Admin reset).
    user = {
      ...user,
      role: "ADMIN",
      isPrimaryAdmin: false,
      mustChangePassword: false,
    };
    installUserDelegate();
    const adminToken = token();
    (prisma as any).$transaction = async (callback: (tx: any) => unknown) =>
      callback({
        user: { update: prisma.user.update },
        auditLog: { create: async () => ({}) },
      });
    await adminUserService.resetAdminPassword(user.id, "admin-new-password", {
      id: ADMIN_ID,
      email: "primary@example.invalid",
    });
    assert.equal(user.authVersion, 3);
    assert.equal(
      (await run(middleware.authenticate, adminToken)).response.status,
      401,
    );

    // TEST 8: logout revokes the token used to call it.
    const beforeLogout = token();
    await auth.logout(user.id);
    assert.equal(
      (await run(middleware.authenticate, beforeLogout)).response.status,
      401,
    );

    // TEST 9 + 10: existing account-state enforcement remains intact.
    const current = token();
    user.isActive = false;
    assert.equal(
      (await run(middleware.authenticate, current)).response.status,
      401,
    );
    user.isActive = true;
    user.deletedAt = new Date();
    assert.equal(
      (await run(middleware.authenticate, current)).response.status,
      401,
    );
    user.deletedAt = null;

    // TEST 11 + 12: signature tampering and expiry continue to fail.
    assert.equal(
      (await run(middleware.authenticate, `${current}x`)).response.status,
      401,
    );
    const expired = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        authVersion: user.authVersion,
      },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: -1 },
    );
    assert.equal(
      (await run(middleware.authenticate, expired)).response.status,
      401,
    );

    // TEST 13: an explicit version mismatch is revoked.
    assert.equal(
      (
        await run(
          middleware.authenticate,
          token({ authVersion: user.authVersion - 1 }),
        )
      ).response.status,
      401,
    );

    // TEST 14: the database role remains authoritative over a forged claim.
    user.role = "TENTOR";
    user.tutor = { status: "ACTIVE", deletedAt: null };
    const forgedRole = token({ role: "ADMIN" });
    const effective = await run(middleware.authenticate, forgedRole);
    assert.equal(effective.nextCalled, true);
    assert.equal(effective.req.user.role, "TENTOR");

    // Configuration guard regression checks (no secret values are printed).
    assert.throws(() => auth.validateJwtSecret(undefined, "production"));
    assert.throws(() =>
      auth.validateJwtSecret(
        "CHANGE_ME_USE_A_RANDOM_SECRET_AT_LEAST_32_BYTES",
        "production",
      ),
    );
    assert.throws(() => auth.validateJwtSecret("too-short", "production"));
    auth.validateJwtSecret(
      "production-test-key-with-at-least-32-bytes",
      "production",
    );

    console.log(
      "Authentication security tests passed (14 scenarios + config validation).",
    );
  } finally {
    (prisma.user as any).findUnique = original.userFindUnique;
    (prisma.user as any).update = original.userUpdate;
    (prisma as any).$transaction = original.transaction;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Authentication test failed.",
  );
  process.exitCode = 1;
});
