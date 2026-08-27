import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function findOrCreateStudent(name: string) {
  const existing = await prisma.student.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.student.create({ data: { name, status: 'ACTIVE' } });
}

async function main() {
  console.log('🌱 Seeding development data...\n');

  // --- Subject & Class ---
  const subject = await prisma.subject.upsert({
    where: { name: 'Matematika' },
    update: {},
    create: { name: 'Matematika', description: 'Pelajaran Matematika' },
  });

  const kelas = await prisma.class.upsert({
    where: { name: 'Kelas 7A' },
    update: {},
    create: { name: 'Kelas 7A', level: 'SMP', subjectId: subject.id, maxStudents: 20 },
  });

  // --- Tutor (user + profile) ---
  const tutorEmail = 'tentor1@pionerclass.com';
  const tutorPassword = 'tentor123';

  let tutorUser = await prisma.user.findUnique({ where: { email: tutorEmail } });
  if (!tutorUser) {
    const passwordHash = await bcrypt.hash(tutorPassword, 10);
    tutorUser = await prisma.user.create({
      data: { email: tutorEmail, passwordHash, role: 'TENTOR', isActive: true },
    });
  }

  let tutor = await prisma.tutor.findUnique({ where: { userId: tutorUser.id } });
  if (!tutor) {
    tutor = await prisma.tutor.create({
      data: { userId: tutorUser.id, name: 'Budi Tentor', email: tutorEmail, status: 'ACTIVE' },
    });
  }

  // --- Student ---
  const student = await findOrCreateStudent('Siswa Contoh');

  // --- Honor rates (BR-08) ---
  const regularRate = await prisma.honorRate.findFirst({
    where: { sessionType: 'REGULAR', status: 'ACTIVE' },
  });
  if (!regularRate) {
    await prisma.honorRate.create({
      data: {
        sessionType: 'REGULAR',
        nominal: 100000,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  const privateRate = await prisma.honorRate.findFirst({
    where: { sessionType: 'PRIVATE', status: 'ACTIVE' },
  });
  if (!privateRate) {
    await prisma.honorRate.create({
      data: {
        sessionType: 'PRIVATE',
        nominal: 150000,
        effectiveFrom: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  // --- Private package (BR-02: 24 sessions) ---
  let pkg = await prisma.privatePackage.findFirst({
    where: { studentId: student.id, status: 'ACTIVE' },
  });
  if (!pkg) {
    pkg = await prisma.privatePackage.create({
      data: {
        studentId: student.id,
        quotaTotal: 24,
        quotaUsed: 0,
        quotaRemaining: 24,
        status: 'ACTIVE',
        packageName: 'Paket 24 Sesi',
      },
    });
  }

  // --- Schedules (regular + private) ---
  let regularSchedule = await prisma.schedule.findFirst({
    where: { tutorId: tutor.id, sessionType: 'REGULAR', classId: kelas.id },
  });
  if (!regularSchedule) {
    regularSchedule = await prisma.schedule.create({
      data: {
        tutorId: tutor.id,
        sessionType: 'REGULAR',
        classId: kelas.id,
        subjectId: subject.id,
        dayOfWeek: 1,
        startTime: new Date('2026-01-01T09:00:00'),
        endTime: new Date('2026-01-01T10:30:00'),
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  let privateSchedule = await prisma.schedule.findFirst({
    where: { tutorId: tutor.id, sessionType: 'PRIVATE', studentId: student.id },
  });
  if (!privateSchedule) {
    privateSchedule = await prisma.schedule.create({
      data: {
        tutorId: tutor.id,
        sessionType: 'PRIVATE',
        studentId: student.id,
        subjectId: subject.id,
        dayOfWeek: 3,
        startTime: new Date('2026-01-01T14:00:00'),
        endTime: new Date('2026-01-01T15:30:00'),
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });
  }

  console.log('✓ Seed complete!\n');
  console.log('Login sebagai tentor untuk testing:');
  console.log(`  email:    ${tutorEmail}`);
  console.log(`  password: ${tutorPassword}\n`);
  console.log('IDs untuk testing endpoint sessions:');
  console.table({
    regularScheduleId: regularSchedule.id,
    privateScheduleId: privateSchedule.id,
    studentId: student.id,
    privatePackageId: pkg.id,
  });
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
