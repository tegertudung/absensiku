import assert from "node:assert/strict";
import { fork, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

type WorkerOperation =
  | { kind: "complete"; sessionId: string; actorId: string; material: string }
  | { kind: "draft"; sessionId: string; material: string }
  | { kind: "cancel"; sessionId: string; actorId: string }
  | { kind: "overdue" };

type WorkerReply = {
  type: "result";
  requestId: number;
  ok: boolean;
  status?: number;
  value?: number;
};

async function runWorker() {
  process.on("message", async (message: any) => {
    if (message?.type === "shutdown") {
      const { prisma } = await import("../src/utils/prisma");
      await prisma.$disconnect();
      process.exit(0);
    }
    if (message?.type !== "run") return;
    const operation = message.operation as WorkerOperation;
    try {
      if (operation.kind === "overdue") {
        const { lockOverdueSessions } =
          await import("../src/jobs/lockOverdueSessions");
        const value = await lockOverdueSessions();
        process.send?.({
          type: "result",
          requestId: message.requestId,
          ok: true,
          value,
        } satisfies WorkerReply);
        return;
      }
      const {
        completeSession,
        saveSessionDraft,
        cancelScheduledSessionByAdmin,
      } = await import("../src/services/sessionService");
      if (operation.kind === "complete") {
        await completeSession(operation.sessionId, operation.actorId, null, {
          material: operation.material,
          progressNotes: "Synthetic progress for concurrency verification",
        });
      } else if (operation.kind === "draft") {
        await saveSessionDraft(
          operation.sessionId,
          {
            material: operation.material,
            progressNotes: "Synthetic draft progress",
          },
          null,
        );
      } else {
        await cancelScheduledSessionByAdmin(
          operation.sessionId,
          "Synthetic concurrency cancellation",
          operation.actorId,
        );
      }
      process.send?.({
        type: "result",
        requestId: message.requestId,
        ok: true,
      } satisfies WorkerReply);
    } catch (error: any) {
      process.send?.({
        type: "result",
        requestId: message.requestId,
        ok: false,
        status: typeof error?.status === "number" ? error.status : undefined,
      } satisfies WorkerReply);
    }
  });
  process.send?.({ type: "ready" });
}

type TestWorker = {
  child: ChildProcess;
  run(operation: WorkerOperation): Promise<WorkerReply>;
};

let requestSequence = 0;
async function startWorker(testDatabaseUrl: string): Promise<TestWorker> {
  const child = fork(__filename, [], {
    execArgv: ["-r", require.resolve("ts-node/register")],
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      SESSION_CONCURRENCY_WORKER: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.on("message", (message: any) => {
      if (message?.type === "ready") resolve();
    });
    child.once("exit", (code) => {
      if (code !== null && code !== 0)
        reject(new Error(`Concurrency worker exited before ready (${code})`));
    });
  });
  return {
    child,
    run(operation) {
      const requestId = ++requestSequence;
      return new Promise<WorkerReply>((resolve, reject) => {
        const onError = (error: Error) => {
          child.off("message", onMessage);
          reject(error);
        };
        const onMessage = (message: any) => {
          if (message?.type === "result" && message.requestId === requestId) {
            child.off("message", onMessage);
            child.off("error", onError);
            resolve(message as WorkerReply);
          }
        };
        child.on("message", onMessage);
        child.once("error", onError);
        child.send({ type: "run", requestId, operation });
      });
    },
  };
}

function databaseName(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

async function resolveAndPrepareTestDatabase() {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
  const developmentValue = process.env.DATABASE_URL;
  if (!developmentValue)
    throw new Error(
      "Development DATABASE_URL is required for isolation comparison.",
    );
  const developmentUrl = new URL(developmentValue);
  const developmentDatabase = databaseName(developmentUrl);

  let testUrl: URL;
  if (process.env.TEST_DATABASE_URL) {
    testUrl = new URL(process.env.TEST_DATABASE_URL);
  } else {
    const requestedName = process.env.SECURITY_TEST_DATABASE_NAME;
    if (!requestedName)
      throw new Error(
        "Fail closed: set TEST_DATABASE_URL or SECURITY_TEST_DATABASE_NAME.",
      );
    if (!/^[a-zA-Z0-9_]+$/.test(requestedName))
      throw new Error("Unsafe security test database name.");
    testUrl = new URL(developmentUrl.toString());
    testUrl.pathname = `/${requestedName}`;
  }
  const testDatabase = databaseName(testUrl);
  assert.notEqual(
    testDatabase,
    developmentDatabase,
    "Test DB equals development DB",
  );
  assert.match(
    testDatabase,
    /(?:_test|security_test)/i,
    "Test DB name is not explicitly test-only",
  );
  assert.equal(
    testUrl.hostname,
    developmentUrl.hostname,
    "Unexpected test DB host",
  );

  const adminUrl = new URL(developmentUrl.toString());
  adminUrl.pathname = "/postgres";
  adminUrl.searchParams.delete("schema");
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl.toString() } },
  });
  try {
    const existing = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${testDatabase}) AS "exists"
    `;
    if (!existing[0]?.exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabase}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  const prismaCli = require.resolve("prisma/build/index.js");
  const migrate = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: testUrl.toString() },
      encoding: "utf8",
    },
  );
  if (migrate.status !== 0) {
    throw new Error(
      `Prisma migrate deploy failed for isolated test DB (${migrate.status}).`,
    );
  }
  return {
    testDatabaseUrl: testUrl.toString(),
    developmentDatabase,
    testDatabase,
  };
}

function localDay(offset: number) {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value;
}

async function main() {
  const isolation = await resolveAndPrepareTestDatabase();
  process.env.DATABASE_URL = isolation.testDatabaseUrl;
  const db = new PrismaClient({
    datasources: { db: { url: isolation.testDatabaseUrl } },
  });
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const code = runId.replace(/[^a-zA-Z0-9]/g, "").slice(-18);

  const user = await db.user.create({
    data: {
      email: `sec006-${runId}@example.invalid`,
      passwordHash: "synthetic-not-a-login-credential",
      role: "TENTOR",
      isActive: true,
    },
  });
  const tutor = await db.tutor.create({
    data: {
      tutorCode: `SEC006T${code}`,
      userId: user.id,
      name: `SEC006 Synthetic Tutor ${runId}`,
      status: "ACTIVE",
    },
  });
  const program = await db.program.create({
    data: {
      code: `SEC006P${code}`,
      name: `SEC006 Synthetic Program ${runId}`,
      learningModel: "INDIVIDUAL",
      usesQuota: true,
      defaultMeetingQuota: 24,
      isActive: true,
    },
  });
  await db.honorRate.create({
    data: {
      sessionType: "PRIVATE",
      programId: program.id,
      nominal: 1000,
      effectiveFrom: localDay(-30),
      status: "ACTIVE",
    },
  });

  let fixtureSequence = 0;
  async function fixture(quota: number, date = localDay(0)) {
    const suffix = `${code}${++fixtureSequence}`;
    const student = await db.student.create({
      data: {
        studentCode: `SEC006S${suffix}`,
        name: `SEC006 Synthetic Student ${suffix}`,
        status: "ACTIVE",
      },
    });
    await db.studentProgram.create({
      data: {
        studentId: student.id,
        programId: program.id,
        status: "ACTIVE",
      },
    });
    const pkg = await db.privatePackage.create({
      data: {
        studentId: student.id,
        programId: program.id,
        quotaTotal: quota,
        quotaUsed: 0,
        quotaRemaining: quota,
        status: "ACTIVE",
        packageName: `SEC006 Synthetic Package ${suffix}`,
      },
    });
    const session = await db.teachingSession.create({
      data: {
        tutorId: tutor.id,
        sessionType: "PRIVATE",
        sessionDate: date,
        studentId: student.id,
        privatePackageId: pkg.id,
        programId: program.id,
        status: "SCHEDULED",
        material: "Synthetic initial material",
        progressNotes: "Synthetic initial progress",
        createdBy: user.id,
      },
    });
    return { student, pkg, session };
  }

  async function ledgerCount(sessionIds: string[]) {
    return db.privatePackageUsage.count({
      where: {
        sessionId: { in: sessionIds },
        changeType: "SESSION_COMPLETED",
      },
    });
  }

  const workers = await Promise.all([
    startWorker(isolation.testDatabaseUrl),
    startWorker(isolation.testDatabaseUrl),
  ]);
  const iterations = 5;
  const summary = {
    completeVsComplete: 0,
    completeVsDraft: 0,
    completeVsCancel: 0,
    completeVsOverdue: 0,
    quotaOne: 0,
    futureRegression: 0,
  };

  try {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      {
        const item = await fixture(2);
        const results = await Promise.all(
          workers.map((worker) =>
            worker.run({
              kind: "complete",
              sessionId: item.session.id,
              actorId: user.id,
              material: "Synthetic complete-vs-complete material",
            }),
          ),
        );
        assert.equal(results.filter((result) => result.ok).length, 1);
        const [session, pkg, ledger] = await Promise.all([
          db.teachingSession.findUniqueOrThrow({
            where: { id: item.session.id },
          }),
          db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
          ledgerCount([item.session.id]),
        ]);
        assert.equal(session.status, "COMPLETED");
        assert.notEqual(session.honorRateSnapshot, null);
        assert.equal(pkg.quotaRemaining, 1);
        assert.equal(pkg.quotaUsed, 1);
        assert.equal(ledger, 1);
        summary.completeVsComplete += 1;
      }

      {
        const item = await fixture(2);
        const results = await Promise.all([
          workers[0].run({
            kind: "complete",
            sessionId: item.session.id,
            actorId: user.id,
            material: "Synthetic authoritative completion material",
          }),
          workers[1].run({
            kind: "draft",
            sessionId: item.session.id,
            material: "Synthetic stale draft material",
          }),
        ]);
        assert.equal(results[0].ok, true);
        const [session, pkg, ledger] = await Promise.all([
          db.teachingSession.findUniqueOrThrow({
            where: { id: item.session.id },
          }),
          db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
          ledgerCount([item.session.id]),
        ]);
        assert.equal(session.status, "COMPLETED");
        assert.equal(
          session.material,
          "Synthetic authoritative completion material",
        );
        assert.notEqual(session.honorRateSnapshot, null);
        assert.equal(pkg.quotaRemaining, 1);
        assert.equal(ledger, 1);
        summary.completeVsDraft += 1;
      }

      {
        const item = await fixture(2);
        const results = await Promise.all([
          workers[0].run({
            kind: "complete",
            sessionId: item.session.id,
            actorId: user.id,
            material: "Synthetic complete-vs-cancel material",
          }),
          workers[1].run({
            kind: "cancel",
            sessionId: item.session.id,
            actorId: user.id,
          }),
        ]);
        assert.equal(results.filter((result) => result.ok).length, 1);
        const [session, pkg, ledger] = await Promise.all([
          db.teachingSession.findUniqueOrThrow({
            where: { id: item.session.id },
          }),
          db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
          ledgerCount([item.session.id]),
        ]);
        assert.ok(
          ["COMPLETED", "CANCELLED_NOT_COUNTED"].includes(session.status),
        );
        if (session.status === "COMPLETED") {
          assert.notEqual(session.honorRateSnapshot, null);
          assert.equal(pkg.quotaRemaining, 1);
          assert.equal(ledger, 1);
        } else {
          assert.equal(session.honorRateSnapshot, null);
          assert.equal(pkg.quotaRemaining, 2);
          assert.equal(ledger, 0);
        }
        summary.completeVsCancel += 1;
      }

      {
        const item = await fixture(2, localDay(-4));
        await Promise.all([
          workers[0].run({
            kind: "complete",
            sessionId: item.session.id,
            actorId: user.id,
            material: "Synthetic complete-vs-overdue material",
          }),
          workers[1].run({ kind: "overdue" }),
        ]);
        const [session, pkg, ledger, validations] = await Promise.all([
          db.teachingSession.findUniqueOrThrow({
            where: { id: item.session.id },
          }),
          db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
          ledgerCount([item.session.id]),
          db.sessionValidation.count({ where: { sessionId: item.session.id } }),
        ]);
        assert.ok(["COMPLETED", "PENDING_ADMIN"].includes(session.status));
        if (session.status === "COMPLETED") {
          assert.notEqual(session.honorRateSnapshot, null);
          assert.equal(pkg.quotaRemaining, 1);
          assert.equal(ledger, 1);
          assert.equal(validations, 0);
        } else {
          assert.equal(session.honorRateSnapshot, null);
          assert.equal(pkg.quotaRemaining, 2);
          assert.equal(ledger, 0);
          assert.equal(validations, 1);
        }
        summary.completeVsOverdue += 1;
      }

      {
        const item = await fixture(1);
        const second = await db.teachingSession.create({
          data: {
            tutorId: tutor.id,
            sessionType: "PRIVATE",
            sessionDate: localDay(0),
            studentId: item.student.id,
            privatePackageId: item.pkg.id,
            programId: program.id,
            status: "SCHEDULED",
            material: "Synthetic second quota contender",
            progressNotes: "Synthetic second quota progress",
            createdBy: user.id,
          },
        });
        const ids = [item.session.id, second.id];
        const results = await Promise.all(
          ids.map((sessionId, index) =>
            workers[index].run({
              kind: "complete",
              sessionId,
              actorId: user.id,
              material: `Synthetic quota contender ${index + 1}`,
            }),
          ),
        );
        assert.equal(results.filter((result) => result.ok).length, 1);
        const [sessions, pkg, ledger] = await Promise.all([
          db.teachingSession.findMany({ where: { id: { in: ids } } }),
          db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
          ledgerCount(ids),
        ]);
        assert.equal(
          sessions.filter((session) => session.status === "COMPLETED").length,
          1,
        );
        assert.equal(
          sessions.filter((session) => session.honorRateSnapshot !== null)
            .length,
          1,
        );
        assert.equal(pkg.quotaRemaining, 0);
        assert.equal(pkg.quotaUsed, 1);
        assert.equal(ledger, 1);
        summary.quotaOne += 1;
      }
    }

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const item = await fixture(2, localDay(1));
      const result = await workers[iteration % workers.length].run({
        kind: "complete",
        sessionId: item.session.id,
        actorId: user.id,
        material: "Synthetic future completion material",
      });
      assert.equal(result.ok, false);
      const [session, pkg, ledger] = await Promise.all([
        db.teachingSession.findUniqueOrThrow({
          where: { id: item.session.id },
        }),
        db.privatePackage.findUniqueOrThrow({ where: { id: item.pkg.id } }),
        ledgerCount([item.session.id]),
      ]);
      assert.equal(session.status, "SCHEDULED");
      assert.equal(session.honorRateSnapshot, null);
      assert.equal(pkg.quotaRemaining, 2);
      assert.equal(pkg.quotaUsed, 0);
      assert.equal(ledger, 0);
      summary.futureRegression += 1;
    }

    console.log(
      JSON.stringify({
        isolation: {
          developmentDatabase: isolation.developmentDatabase,
          testDatabase: isolation.testDatabase,
          distinct: isolation.developmentDatabase !== isolation.testDatabase,
        },
        independentWorkerProcesses: workers.length,
        iterations,
        summary,
        status: "PASS",
      }),
    );
  } finally {
    for (const worker of workers) worker.child.send({ type: "shutdown" });
    await db.$disconnect();
  }
}

if (process.env.SESSION_CONCURRENCY_WORKER === "1") {
  runWorker().catch(() => process.exit(1));
} else {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Session concurrency verification failed.",
    );
    process.exitCode = 1;
  });
}
