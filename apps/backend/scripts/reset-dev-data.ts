import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const expectedDatabase = 'db_absensiku';

function assertSafeTarget() {
  if (process.env.NODE_ENV === 'production') throw new Error('Reset diblokir: NODE_ENV=production.');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Reset diblokir: DATABASE_URL tidak tersedia.');
  const target = new URL(databaseUrl);
  const database = target.pathname.replace(/^\//, '');
  if (database !== expectedDatabase || !['localhost', '127.0.0.1'].includes(target.hostname)) {
    throw new Error(`Reset diblokir: target harus database lokal ${expectedDatabase}, bukan ${target.hostname}/${database}.`);
  }
}

async function counts() {
  const [admins, tutors, tutorSubjects, students, parents, parentStudents, classes, enrollments, subjects, schedules, patterns, sessions, changeRequests, validations, attendance, packages, packageUsages, notifications, pushSubscriptions, auditLogs, honorRates, honorRateHistory, settings, programs] = await Promise.all([
    prisma.user.count({ where: { role: 'ADMIN' } }), prisma.tutor.count(), prisma.tutorSubject.count(), prisma.student.count(), prisma.parent.count(), prisma.parentStudent.count(), prisma.class.count(), prisma.classEnrollment.count(), prisma.subject.count(), prisma.schedule.count(), prisma.schedule.count({ where: { isPattern: true } }), prisma.teachingSession.count(), prisma.scheduleChangeRequest.count(), prisma.sessionValidation.count(), prisma.attendanceRecord.count(), prisma.privatePackage.count(), prisma.privatePackageUsage.count(), prisma.notification.count(), prisma.pushSubscription.count(), prisma.auditLog.count(), prisma.honorRate.count(), prisma.honorRateHistory.count(), prisma.systemSetting.count(), prisma.program.count(),
  ]);
  return { admins, tutors, tutorSubjects, students, parents, parentStudents, classes, enrollments, subjects, schedules, patterns, sessions, changeRequests, validations, attendance, packages, packageUsages, notifications, pushSubscriptions, auditLogs, honorRates, honorRateHistory, settings, programs };
}

async function main() {
  assertSafeTarget();
  const before = await counts();
  if (!process.argv.includes('--execute')) {
    console.log('Dry run (reset tidak dijalankan):', JSON.stringify(before));
    return;
  }
  if (before.admins < 1) throw new Error('Reset diblokir: tidak ada akun Admin yang dapat dipertahankan.');
  const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  if (activeAdmins < 1) throw new Error('Reset diblokir: tidak ada Admin aktif yang dapat dipertahankan.');
  console.log('Before:', JSON.stringify(before));
  await prisma.$transaction(async (tx) => {
    await tx.pushSubscription.deleteMany();
    await tx.notification.deleteMany();
    await tx.scheduleChangeRequest.deleteMany();
    await tx.attendanceRecord.deleteMany();
    await tx.sessionValidation.deleteMany();
    await tx.privatePackageUsage.deleteMany();
    await tx.teachingSession.deleteMany();
    await tx.schedule.deleteMany();
    await tx.parentStudent.deleteMany();
    await tx.classEnrollment.deleteMany();
    await tx.privatePackage.deleteMany();
    await tx.tutorSubject.deleteMany();
    await tx.parent.deleteMany();
    await tx.tutor.deleteMany();
    await tx.student.deleteMany();
    await tx.class.deleteMany();
    await tx.subject.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
  });
  const after = await counts();
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, select: { id: true, email: true, role: true, isActive: true } });
  console.log('After:', JSON.stringify(after));
  console.log('Preserved active admin:', JSON.stringify(admin));
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
