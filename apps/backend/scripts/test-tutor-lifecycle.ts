import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "tutor-lifecycle-test-only-key-32-bytes-minimum";

const SUBJECT_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";

type FakeTutor = {
  id: string;
  tutorCode: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  hireDate?: Date;
  bankAccount?: string;
  bankName?: string;
  bankHolderName?: string;
  status: string;
  deletedAt: Date | null;
  subjects: Array<{ subject: { id: string; name: string } }>;
  historicalSessionIds: string[];
};

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
  lastLogin: Date | null;
  tutor: FakeTutor | null;
};

async function main() {
  const { prisma } = await import("../src/utils/prisma");
  const lifecycle = await import("../src/services/tutorService");
  const { commitTutorImport } =
    await import("../src/services/tutorImportService");
  const auth = await import("../src/services/authService");
  const { authenticate, requireRole } = await import("../src/middleware/auth");

  const original = {
    userFindUnique: prisma.user.findUnique,
    userFindMany: prisma.user.findMany,
    subjectFindMany: prisma.subject.findMany,
    transaction: prisma.$transaction,
  };
  const users = new Map<string, FakeUser>();
  const tutors = new Map<string, FakeTutor>();
  const auditEntries: any[] = [];
  let userSequence = 0;
  let tutorSequence = 0;
  let businessSequence = 0;
  let passwordUpdates = 0;
  let destructiveCalls = 0;

  const subjectRows = [{ id: SUBJECT_ID, name: "Matematika" }];
  const findUser = (where: any) => {
    if (where.email) return users.get(where.email) ?? null;
    return [...users.values()].find((user) => user.id === where.id) ?? null;
  };

  const tx: any = {
    subject: {
      findMany: async ({ where }: any) =>
        subjectRows.filter((subject) => where.id.in.includes(subject.id)),
    },
    user: {
      create: async ({ data }: any) => {
        const user: FakeUser = {
          id: `user-${++userSequence}`,
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          isActive: data.isActive,
          isPrimaryAdmin: false,
          deletedAt: null,
          mustChangePassword: data.mustChangePassword,
          authVersion: 0,
          lastLogin: null,
          tutor: null,
        };
        users.set(user.email, user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const user = findUser(where);
        assert.ok(user);
        if (data.passwordHash) {
          user.passwordHash = data.passwordHash;
          passwordUpdates += 1;
        }
        if (typeof data.isActive === "boolean") user.isActive = data.isActive;
        if (data.deletedAt === null) user.deletedAt = null;
        if (typeof data.mustChangePassword === "boolean")
          user.mustChangePassword = data.mustChangePassword;
        if (data.authVersion?.increment)
          user.authVersion += data.authVersion.increment;
        return user;
      },
      delete: async () => {
        destructiveCalls += 1;
      },
    },
    tutor: {
      create: async ({ data }: any) => {
        const tutor: FakeTutor = {
          id: `tutor-${++tutorSequence}`,
          tutorCode: data.tutorCode,
          userId: data.userId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          title: data.title,
          status: data.status,
          deletedAt: null,
          subjects: [],
          historicalSessionIds: [],
        };
        tutors.set(tutor.id, tutor);
        const user = [...users.values()].find(
          (item) => item.id === data.userId,
        );
        assert.ok(user);
        user.tutor = tutor;
        return tutor;
      },
      findUnique: async ({ where }: any) => {
        const tutor = tutors.get(where.id) ?? null;
        if (!tutor) return null;
        const user = [...users.values()].find(
          (item) => item.id === tutor.userId,
        );
        return { ...tutor, user };
      },
      updateMany: async ({ where, data }: any) => {
        const tutor = tutors.get(where.id);
        if (!tutor || !tutor.deletedAt) return { count: 0 };
        Object.assign(tutor, data);
        return { count: 1 };
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const tutor = tutors.get(where.id);
        assert.ok(tutor);
        return tutor;
      },
      update: async ({ where, data }: any) => {
        const tutor = tutors.get(where.id);
        assert.ok(tutor);
        Object.assign(tutor, data);
        const user = [...users.values()].find(
          (item) => item.id === tutor.userId,
        );
        return { ...tutor, user };
      },
      delete: async () => {
        destructiveCalls += 1;
      },
    },
    tutorSubject: {
      deleteMany: async () => ({ count: 1 }),
      createMany: async ({ data }: any) => {
        for (const item of data) {
          const tutor = tutors.get(item.tutorId);
          if (tutor)
            tutor.subjects = [
              { subject: { id: item.subjectId, name: "Matematika" } },
            ];
        }
        return { count: data.length };
      },
    },
    auditLog: { create: async ({ data }: any) => auditEntries.push(data) },
    $queryRaw: async () => [{ value: BigInt(++businessSequence) }],
  };

  function addArchived(email: string, role: FakeUser["role"] = "TENTOR") {
    const user: FakeUser = {
      id: `user-${++userSequence}`,
      email,
      passwordHash: "old-password-hash",
      role,
      isActive: false,
      isPrimaryAdmin: false,
      deletedAt: null,
      mustChangePassword: false,
      authVersion: 7,
      lastLogin: null,
      tutor: null,
    };
    users.set(email, user);
    if (role === "TENTOR") {
      const tutor: FakeTutor = {
        id: `tutor-${++tutorSequence}`,
        tutorCode: `TTR-${tutorSequence}`,
        userId: user.id,
        name: "Archived Tutor",
        email,
        status: "ACTIVE",
        deletedAt: new Date(0),
        subjects: [],
        historicalSessionIds: ["historical-session-1"],
      };
      tutors.set(tutor.id, tutor);
      user.tutor = tutor;
    }
    return user;
  }

  const rows = (...emails: string[]) =>
    emails.map((email, index) => ({
      rowNumber: index + 2,
      name: `Synthetic Tutor ${index + 1}`,
      title: "",
      phone: `0812345678${index}`,
      email,
      subjectNames: ["Matematika"],
    }));

  try {
    (prisma.user as any).findUnique = async ({ where }: any) => findUser(where);
    (prisma.user as any).findMany = async () => [...users.values()];
    (prisma.subject as any).findMany = async () => subjectRows;
    (prisma as any).$transaction = async (callback: (client: any) => unknown) =>
      callback(tx);

    // TEST 1-3: each newly imported Tutor gets a unique one-time plaintext,
    // while persistence receives only its bcrypt hash.
    const created = await commitTutorImport(
      rows("new-one@example.invalid", "new-two@example.invalid"),
      ADMIN_ID,
    );
    assert.equal(created.created, 2);
    assert.equal(
      created.results.every((row) => row.status === "CREATED"),
      true,
    );
    assert.equal(created.credentials.length, 2);
    assert.notEqual(
      created.credentials[0].temporaryPassword,
      created.credentials[1].temporaryPassword,
    );
    for (const credential of created.credentials) {
      const stored = users.get(credential.email)!;
      assert.notEqual(stored.passwordHash, credential.temporaryPassword);
      assert.equal(
        await bcrypt.compare(credential.temporaryPassword, stored.passwordHash),
        true,
      );
    }

    // TEST 4: an active duplicate is skipped without changing its password.
    const active = users.get("new-one@example.invalid")!;
    const activeHash = active.passwordHash;
    const updatesBeforeActive = passwordUpdates;
    const duplicate = await commitTutorImport(
      rows("new-one@example.invalid"),
      ADMIN_ID,
    );
    assert.equal(duplicate.alreadyActive, 1);
    assert.equal(duplicate.results[0].status, "ALREADY_ACTIVE");
    assert.equal(duplicate.credentials.length, 0);
    assert.equal(active.passwordHash, activeHash);
    assert.equal(passwordUpdates, updatesBeforeActive);

    // TEST 5-10: import restores the same records, rotates credentials,
    // revokes the old token, and leaves historical relations untouched.
    const archived = addArchived("restore-import@example.invalid");
    const archivedTutor = archived.tutor!;
    const originalUserId = archived.id;
    const originalTutorId = archivedTutor.id;
    const historicalReference = archivedTutor.historicalSessionIds;
    const oldVersion = archived.authVersion;
    const oldToken = auth.generateToken({
      userId: archived.id,
      email: archived.email,
      role: "TENTOR",
      authVersion: oldVersion,
    });
    const restoredImport = await commitTutorImport(
      rows("restore-import@example.invalid"),
      ADMIN_ID,
    );
    assert.equal(restoredImport.restored, 1);
    assert.equal(restoredImport.results[0].status, "RESTORED");
    assert.ok(restoredImport.credentials[0].temporaryPassword);
    assert.equal(archived.mustChangePassword, true);
    assert.equal(archived.authVersion, oldVersion + 1);
    assert.equal(archived.isActive, true);
    assert.equal(archived.tutor!.deletedAt, null);
    assert.equal(archived.tutor!.status, "ACTIVE");
    assert.equal(archived.id, originalUserId);
    assert.equal(archived.tutor!.id, originalTutorId);
    assert.equal(archived.tutor!.historicalSessionIds, historicalReference);
    assert.equal(destructiveCalls, 0);
    assert.equal(
      await bcrypt.compare(
        restoredImport.credentials[0].temporaryPassword,
        archived.passwordHash,
      ),
      true,
    );
    const req = { headers: { authorization: `Bearer ${oldToken}` } } as any;
    const response: { status?: number } = {};
    const res = {
      status(code: number) {
        response.status = code;
        return this;
      },
      json() {
        return this;
      },
    } as any;
    await authenticate(req, res, () => assert.fail("Old token was accepted"));
    assert.equal(response.status, 401);

    // TEST 11-13: manual create reports an archived state without restoring;
    // an explicit restore action then succeeds.
    const manual = addArchived("restore-manual@example.invalid");
    const manualVersion = manual.authVersion;
    await assert.rejects(
      () =>
        lifecycle.createTutor({
          email: manual.email,
          name: "Manual Restore",
          phone: "081234567899",
          subjectIds: [SUBJECT_ID],
        }),
      (error: any) =>
        error.code === "TUTOR_ARCHIVED" &&
        error.details?.tutorId === manual.tutor?.id,
    );
    assert.equal(manual.isActive, false);
    const manualRestored = await lifecycle.restoreTutor(
      manual.tutor!.id,
      ADMIN_ID,
      {
        name: "Manual Restore",
        phone: "081234567899",
        subjectIds: [SUBJECT_ID],
      },
    );
    assert.ok(manualRestored.temporaryPassword);
    assert.equal(manual.isActive, true);
    assert.equal(manual.authVersion, manualVersion + 1);

    // TEST 15-22: reset replaces (never recovers) credentials, leaves the
    // profile/history intact, revokes all tokens, and remains Admin-only.
    manual.tutor!.historicalSessionIds.push("historical-session-reset");
    const resetHashBefore = manual.passwordHash;
    const resetVersionBefore = manual.authVersion;
    const tokenBeforeReset = auth.generateToken({
      userId: manual.id,
      email: manual.email,
      role: "TENTOR",
      authVersion: resetVersionBefore,
    });
    const reset = await lifecycle.resetTutorPassword(
      manual.tutor!.id,
      ADMIN_ID,
    );
    assert.deepEqual(Object.keys(reset).sort(), [
      "mustChangePassword",
      "temporaryPassword",
    ]);
    assert.ok(reset.temporaryPassword);
    assert.equal(reset.mustChangePassword, true);
    assert.notEqual(reset.temporaryPassword, resetHashBefore);
    assert.notEqual(manual.passwordHash, resetHashBefore);
    assert.equal(
      await bcrypt.compare(reset.temporaryPassword, manual.passwordHash),
      true,
    );
    assert.equal(manual.mustChangePassword, true);
    assert.equal(manual.authVersion, resetVersionBefore + 1);
    assert.equal(
      manual.tutor!.historicalSessionIds.includes("historical-session-reset"),
      true,
    );
    const resetReq = {
      headers: { authorization: `Bearer ${tokenBeforeReset}` },
    } as any;
    const resetResponse: { status?: number } = {};
    const resetRes = {
      status(code: number) {
        resetResponse.status = code;
        return this;
      },
      json() {
        return this;
      },
    } as any;
    await authenticate(resetReq, resetRes, () =>
      assert.fail("Pre-reset token was accepted"),
    );
    assert.equal(resetResponse.status, 401);
    let roleStatus: number | undefined;
    requireRole("ADMIN")(
      { user: { role: "TENTOR" } } as any,
      {
        status(code: number) {
          roleStatus = code;
          return this;
        },
        json() {
          return this;
        },
      } as any,
      () => assert.fail("Tentor passed Admin-only reset authorization"),
    );
    assert.equal(roleStatus, 403);
    const archivedForReset = addArchived("reset-archived@example.invalid");
    await assert.rejects(
      () => lifecycle.resetTutorPassword(archivedForReset.tutor!.id, ADMIN_ID),
      (error: any) => error.status === 409,
    );
    assert.equal(archivedForReset.isActive, false);
    assert.ok(archivedForReset.tutor!.deletedAt);
    assert.equal(destructiveCalls, 0);

    const activeManualHash = manual.passwordHash;
    await assert.rejects(
      () =>
        lifecycle.createTutor({
          email: manual.email,
          name: "Duplicate Active",
          phone: "081234567899",
          subjectIds: [SUBJECT_ID],
        }),
      (error: any) => error.code === "TUTOR_ALREADY_ACTIVE",
    );
    assert.equal(manual.passwordHash, activeManualHash);

    // TEST 14: a non-Tentor owner is a conflict, never role-converted.
    const otherRole = addArchived("admin-owner@example.invalid", "ADMIN");
    const conflict = await commitTutorImport(
      rows("admin-owner@example.invalid"),
      ADMIN_ID,
    );
    assert.equal(conflict.failed, 1);
    assert.equal(conflict.results[0].status, "FAILED");
    assert.equal(otherRole.role, "ADMIN");
    assert.equal(otherRole.tutor, null);

    assert.equal(
      auditEntries.some(
        (entry) =>
          entry.reason === "TUTOR_RESTORED" &&
          !JSON.stringify(entry).includes("temporaryPassword") &&
          !JSON.stringify(entry).includes("passwordHash"),
      ),
      true,
    );
    assert.equal(
      auditEntries.some(
        (entry) =>
          entry.reason === "TUTOR_PASSWORD_RESET" &&
          !JSON.stringify(entry).includes("temporaryPassword") &&
          !JSON.stringify(entry).includes("passwordHash"),
      ),
      true,
    );
    console.log("Tutor lifecycle tests passed (22 security scenarios).");
  } finally {
    (prisma.user as any).findUnique = original.userFindUnique;
    (prisma.user as any).findMany = original.userFindMany;
    (prisma.subject as any).findMany = original.subjectFindMany;
    (prisma as any).$transaction = original.transaction;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Tutor lifecycle test failed.",
  );
  process.exitCode = 1;
});
