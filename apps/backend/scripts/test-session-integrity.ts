import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  formatBusinessDate,
  isAfterBusinessDate,
} from "../src/utils/businessDate";

// Database-free contract regression. Runtime concurrency needs an isolated
// PostgreSQL database and is intentionally not pointed at local development.
// These assertions keep the security boundaries in the real source wired to
// the same transaction-scoped session lock.
const sourceRoot = path.resolve(__dirname, "..");
const sessionSource = fs.readFileSync(
  path.join(sourceRoot, "src/services/sessionService.ts"),
  "utf8",
);
const overdueSource = fs.readFileSync(
  path.join(sourceRoot, "src/jobs/lockOverdueSessions.ts"),
  "utf8",
);
const schedulesApiSource = fs.readFileSync(
  path.join(sourceRoot, "src/api/schedules.ts"),
  "utf8",
);

function section(source: string, start: string, end?: string) {
  const offset = source.indexOf(start);
  assert.notEqual(offset, -1, `missing ${start}`);
  const tail = source.slice(offset);
  return end ? tail.slice(0, tail.indexOf(end)) : tail;
}

function mustInclude(source: string, needle: string, label: string) {
  assert.ok(source.includes(needle), label);
}

function main() {
  const finalizer = section(
    sessionSource,
    "async function finalizeTeachingSession",
    "export async function completeSession",
  );
  mustInclude(
    finalizer,
    "await lockTeachingSession(tx, sessionId)",
    "finalizer locks the session",
  );
  mustInclude(
    finalizer,
    "isAfterBusinessDate(session.sessionDate, new Date())",
    "finalizer rejects future dates",
  );
  assert.ok(
    finalizer.indexOf("isAfterBusinessDate(session.sessionDate, new Date())") <
      finalizer.indexOf("getApplicableHonorRate("),
    "future rejection occurs before honor lookup and side effects",
  );

  const batch = section(
    sessionSource,
    "export async function completeSessionsBatch",
    "export async function reportCancellation",
  );
  mustInclude(
    batch,
    "finalizeTeachingSession(",
    "batch uses the central finalizer",
  );
  const direct = section(
    sessionSource,
    "export async function createDirectSession",
    "async function notifyOfCompletion",
  );
  mustInclude(
    direct,
    "isAfterBusinessDate(params.sessionDate, new Date())",
    "direct session keeps its future-date protection",
  );
  mustInclude(
    direct,
    "finalizeTeachingSession(",
    "direct session uses the central finalizer",
  );
  assert.ok(
    finalizer.indexOf("isAfterBusinessDate(session.sessionDate, new Date())") <
      finalizer.indexOf("privatePackageUsage.create"),
    "future rejection occurs before private quota ledger creation",
  );

  for (const name of [
    "saveSessionDraft",
    "reportCancellation",
    "cancelScheduledSessionByAdmin",
    "decideValidation",
  ]) {
    const mutation = section(sessionSource, `export async function ${name}`);
    mustInclude(
      mutation,
      "lockTeachingSession",
      `${name} uses the shared session lock`,
    );
  }
  const draft = section(
    sessionSource,
    "export async function saveSessionDraft",
    "export async function completeSessionsBatch",
  );
  assert.ok(
    draft.indexOf("await lockTeachingSession") <
      draft.indexOf("tx.teachingSession.findUnique"),
    "draft re-reads after acquiring the lock",
  );
  mustInclude(
    draft,
    "!OPEN_STATUSES.includes(session.status)",
    "draft rejects terminal/non-editable state",
  );

  // Ordinary admin reschedule/delete are stateful TeachingSession mutations,
  // so they must participate in the same lock boundary as completion.
  mustInclude(
    schedulesApiSource,
    "lockTeachingSession",
    "meeting routes import shared session lock",
  );
  const updateMeeting = section(
    schedulesApiSource,
    'router.put(\n  "/meetings/:id"',
    "// DELETE /api/schedules/meetings/:id",
  );
  mustInclude(
    updateMeeting,
    "await lockTeachingSession(tx, current.id)",
    "meeting edit locks session",
  );
  mustInclude(
    updateMeeting,
    "const latest = await tx.teachingSession.findUnique",
    "meeting edit re-reads state",
  );
  const deleteMeeting = section(
    schedulesApiSource,
    'router.delete(\n  "/meetings/:id"',
  );
  mustInclude(
    deleteMeeting,
    "await lockTeachingSession(tx, req.params.id)",
    "meeting delete locks session",
  );
  assert.ok(
    deleteMeeting.indexOf("await lockTeachingSession") <
      deleteMeeting.indexOf("tx.teachingSession.findUnique"),
    "meeting delete re-reads only after acquiring the lock",
  );

  const adminCancel = section(
    sessionSource,
    "export async function cancelScheduledSessionByAdmin",
    "async function notifyOfCancellation",
  );
  assert.ok(
    adminCancel.indexOf("await lockTeachingSession") <
      adminCancel.indexOf("tx.teachingSession.findUnique"),
    "admin cancellation re-reads after acquiring the lock",
  );
  mustInclude(
    adminCancel,
    "!OPEN_STATUSES.includes(current.status)",
    "admin cancellation rejects completed state",
  );

  mustInclude(
    overdueSource,
    "addBusinessDays(new Date(), -OVERDUE_DAYS)",
    "overdue cutoff uses business date",
  );
  mustInclude(
    overdueSource,
    "session:${candidate.id}",
    "overdue uses the shared session lock key",
  );
  mustInclude(
    overdueSource,
    "![" + '"SCHEDULED", "IN_PROGRESS"' + "].includes(current.status)",
    "overdue rechecks current open state",
  );
  mustInclude(
    overdueSource,
    "return lockedCount",
    "overdue reports actual, idempotent transitions",
  );

  // Date-only comparisons are local-business-calendar comparisons: today and
  // past are valid, tomorrow is future. This guards against a UTC date shift.
  const today = new Date(2026, 8, 8, 23, 30);
  assert.equal(isAfterBusinessDate(new Date(2026, 8, 8, 0, 1), today), false);
  assert.equal(isAfterBusinessDate(new Date(2026, 8, 7, 23, 59), today), false);
  assert.equal(isAfterBusinessDate(new Date(2026, 8, 9, 0, 0), today), true);
  assert.equal(formatBusinessDate(new Date(2026, 8, 8, 23, 30)), "2026-09-08");

  console.log(
    "Session integrity static tests passed (future, state, lock, and overdue contracts).",
  );
}

main();
