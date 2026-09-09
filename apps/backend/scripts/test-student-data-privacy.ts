import assert from "node:assert/strict";
import express from "express";

// Database-free regression suite. It uses synthetic identities and replaces
// Prisma delegates before sending requests through the real router/middleware.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "student-privacy-test-only-key-32-bytes-minimum";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const PROGRAM_ID = "33333333-3333-4333-8333-333333333333";

async function main() {
  const { prisma } = await import("../src/utils/prisma");
  const { generateToken } = await import("../src/services/authService");
  const studentsRouter = (await import("../src/api/students")).default;

  const original = {
    userFindUnique: prisma.user.findUnique,
    studentFindMany: prisma.student.findMany,
    teachingSessionGroupBy: prisma.teachingSession.groupBy,
  };

  let databaseRole: "ADMIN" | "TENTOR" | "PARENT" = "TENTOR";
  let mustChangePassword = false;
  let tutorQuery: any;

  const administrativeStudent = {
    id: STUDENT_ID,
    studentCode: "SYN-0001",
    name: "Synthetic Student",
    phone: "synthetic-phone",
    email: "synthetic@example.invalid",
    guardianName: "Synthetic Guardian",
    guardianPhone: "synthetic-guardian-phone",
    nis: "SYNTHETIC-NIS",
    school: "Synthetic School",
    schoolClass: "Synthetic Class",
    status: "ACTIVE",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    packages: [],
    programEnrollments: [],
    _count: { enrollments: 0, packages: 0, schedules: 0, sessions: 0 },
  };

  try {
    (prisma.user as any).findUnique = async () => ({
      id: USER_ID,
      email: "synthetic-user@example.invalid",
      role: databaseRole,
      isActive: true,
      isPrimaryAdmin: databaseRole === "ADMIN",
      deletedAt: null,
      mustChangePassword,
      authVersion: 0,
      tutor:
        databaseRole === "TENTOR"
          ? { status: "ACTIVE", deletedAt: null }
          : null,
    });
    (prisma.student as any).findMany = async (args: any) => {
      if (!args.select) return [administrativeStudent];
      tutorQuery = args;
      return [
        {
          id: STUDENT_ID,
          name: "Synthetic Student",
          studentCode: "SYN-0001",
          programEnrollments: [{ programId: PROGRAM_ID }],
        },
      ];
    };
    (prisma.teachingSession as any).groupBy = async () => [];

    const app = express();
    app.use(express.json());
    app.use("/api/students", studentsRouter);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/students`;

    const token = (claimRole = databaseRole) =>
      generateToken({
        userId: USER_ID,
        email: "synthetic-user@example.invalid",
        role: claimRole,
        authVersion: 0,
      });
    const get = (path = "", bearer?: string) =>
      fetch(`${baseUrl}${path}`, {
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });

    // TEST 1: normal business authentication remains mandatory.
    assert.equal((await get()).status, 401);

    // TEST 2-3 + 7: Tentor receives the usable private-session directory,
    // but only through the explicit minimal projection.
    databaseRole = "TENTOR";
    const tutorResponse = await get("", token());
    assert.equal(tutorResponse.status, 200);
    const tutorBody = (await tutorResponse.json()) as any;
    assert.deepEqual(Object.keys(tutorBody.data[0]).sort(), [
      "id",
      "name",
      "programEnrollments",
      "studentCode",
    ]);
    assert.deepEqual(Object.keys(tutorBody.data[0].programEnrollments[0]), [
      "programId",
    ]);
    for (const forbidden of [
      "phone",
      "email",
      "guardianName",
      "guardianPhone",
      "nis",
      "school",
      "schoolClass",
      "createdAt",
      "updatedAt",
      "packages",
      "programs",
      "hasOperationalHistory",
    ]) {
      assert.equal(forbidden in tutorBody.data[0], false, forbidden);
    }
    assert.deepEqual(tutorQuery.where, {
      status: "ACTIVE",
      programEnrollments: {
        some: {
          status: "ACTIVE",
          program: { learningModel: "INDIVIDUAL", isActive: true },
        },
      },
    });
    assert.deepEqual(tutorQuery.select.programEnrollments.select, {
      programId: true,
    });

    // TEST 4: Admin retains the existing administrative representation.
    databaseRole = "ADMIN";
    const adminResponse = await get("", token());
    assert.equal(adminResponse.status, 200);
    const adminBody = (await adminResponse.json()) as any;
    assert.equal(adminBody.data[0].phone, "synthetic-phone");
    assert.equal(adminBody.data[0].guardianName, "Synthetic Guardian");

    // TEST 5: detail remains Admin-only for Tentor.
    databaseRole = "TENTOR";
    assert.equal((await get(`/${STUDENT_ID}`, token())).status, 403);

    // TEST 8: Parent cannot use the shared student directory; its owned-child
    // portal remains a separate flow and is not modified by SEC-004.
    databaseRole = "PARENT";
    assert.equal((await get("", token())).status, 403);

    // TEST 9: a forged Admin claim is replaced by the database Tentor role.
    databaseRole = "TENTOR";
    const forgedResponse = await get("", token("ADMIN"));
    const forgedBody = (await forgedResponse.json()) as any;
    assert.equal(forgedResponse.status, 200);
    assert.equal("phone" in forgedBody.data[0], false);

    // TEST 10: first-login/reset restriction still blocks the business API.
    mustChangePassword = true;
    assert.equal((await get("", token())).status, 403);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    console.log("Student data privacy tests passed (10 security scenarios).");
  } finally {
    (prisma.user as any).findUnique = original.userFindUnique;
    (prisma.student as any).findMany = original.studentFindMany;
    (prisma.teachingSession as any).groupBy = original.teachingSessionGroupBy;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Student privacy test failed.",
  );
  process.exitCode = 1;
});
