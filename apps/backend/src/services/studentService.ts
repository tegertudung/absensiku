import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";

export async function createStudent(data: {
  name: string;
  phone?: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
  nis?: string;
  school?: string;
  schoolClass?: string;
}) {
  return prisma.student.create({ data: { ...data, status: "ACTIVE" } });
}

export async function listStudents() {
  const students = await prisma.student.findMany({
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        include: {
          class: {
            select: {
              id: true,
              name: true,
              quotaTotal: true,
              quotaUsed: true,
              quotaRemaining: true,
            },
          },
        },
        orderBy: { enrollmentDate: "asc" },
      },
      packages: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          packageName: true,
          quotaTotal: true,
          quotaUsed: true,
          quotaRemaining: true,
          activationDate: true,
        },
        orderBy: { activationDate: "asc" },
      },
      _count: {
        select: {
          enrollments: true,
          packages: true,
          schedules: true,
          sessions: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return students.map(({ enrollments, packages, _count, ...student }) => ({
    ...student,
    hasOperationalHistory:
      _count.enrollments > 0 ||
      _count.packages > 0 ||
      _count.schedules > 0 ||
      _count.sessions > 0,
    programs: [
      ...enrollments.map((enrollment) => ({
        type: "REGULAR" as const,
        label: enrollment.class.name,
        quotaTotal: enrollment.class.quotaTotal,
        quotaUsed: enrollment.class.quotaUsed,
        quotaRemaining: enrollment.class.quotaRemaining,
      })),
      ...packages.map((pkg) => ({
        type: "PRIVATE" as const,
        label: pkg.packageName || "Paket Privat",
        quotaTotal: pkg.quotaTotal,
        quotaUsed: pkg.quotaUsed,
        quotaRemaining: pkg.quotaRemaining,
      })),
    ],
  }));
}

/**
 * Explicit admin-only hard delete. The operation is deliberately scoped to
 * student-owned data: private sessions/schedules/packages and enrollments.
 * Shared regular classes, tutors, subjects, and honor configuration are never
 * selected here. All work is contained in one transaction.
 */
export async function deleteStudentPermanently(id: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            enrollments: true,
            packages: true,
            schedules: true,
            sessions: true,
          },
        },
      },
    });
    if (!student) throw new AppError("Siswa tidak ditemukan", 404);

    // Delete only private sessions owned solely by this student. A group
    // private session can retain this student as the legacy primary id, but
    // must survive for the other AttendanceRecord participants.
    await tx.teachingSession.deleteMany({
      where: {
        studentId: id,
        sessionType: "PRIVATE",
        NOT: { attendanceRecords: { some: { studentId: { not: id } } } },
      },
    });

    // AttendanceRecord stores studentId without a database FK. After group
    // sessions have been protected above, remove this student's participant
    // rows while preserving the shared teaching history for other students.
    await tx.attendanceRecord.deleteMany({ where: { studentId: id } });

    // Private schedules belong to the individual student; deleting them also
    // clears any remaining schedule-owned sessions through the schema cascade.
    await tx.schedule.deleteMany({
      where: { studentId: id, sessionType: "PRIVATE" },
    });

    // Package usage is an auditable package ledger, but it is owned by this
    // student's packages and must not survive a deliberate hard delete.
    await tx.privatePackageUsage.deleteMany({
      where: { package: { studentId: id } },
    });
    await tx.privatePackage.deleteMany({ where: { studentId: id } });

    // Remove membership only; never delete the shared regular class, quota,
    // class schedule, or regular class teaching history.
    await tx.classEnrollment.deleteMany({ where: { studentId: id } });

    await tx.student.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        tableName: "students",
        recordId: id,
        action: "DELETE",
        oldValues: {
          name: student.name,
          phone: student.phone,
          status: student.status,
        },
        changedBy: adminId,
        reason: `STUDENT_DELETED permanen; enrollments=${student._count.enrollments}, packages=${student._count.packages}, schedules=${student._count.schedules}, sessions=${student._count.sessions}`,
      },
    });

    return { id };
  });
}

export async function getStudentById(id: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      packages: { orderBy: { activationDate: "desc" } },
      enrollments: {
        where: { status: "ACTIVE" },
        include: {
          class: {
            select: {
              id: true,
              name: true,
              level: true,
              quotaTotal: true,
              quotaRemaining: true,
            },
          },
        },
        orderBy: { enrollmentDate: "asc" },
      },
    },
  });
  if (!student) throw new AppError("Siswa tidak ditemukan", 404);
  return student;
}

export async function updateStudent(
  id: string,
  data: Partial<{
    name: string;
    phone: string;
    email: string;
    guardianName: string;
    guardianPhone: string;
    nis: string;
    school: string;
    schoolClass: string;
    classId: string | null;
  }>,
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new AppError("Siswa tidak ditemukan", 404);
  return prisma.$transaction(async (tx) => {
    if (data.classId !== undefined) {
      if (data.classId) {
        const kelas = await tx.class.findFirst({
          where: { id: data.classId, status: "ACTIVE" },
        });
        if (!kelas)
          throw new AppError("Kelas tidak ditemukan atau tidak aktif.", 404);
      }
      await tx.classEnrollment.updateMany({
        where: { studentId: id, status: "ACTIVE" },
        data: { status: "INACTIVE" },
      });
      if (data.classId) {
        const prior = await tx.classEnrollment.findUnique({
          where: {
            classId_studentId: { classId: data.classId, studentId: id },
          },
        });
        if (prior)
          await tx.classEnrollment.update({
            where: { id: prior.id },
            data: { status: "ACTIVE" },
          });
        else
          await tx.classEnrollment.create({
            data: { classId: data.classId, studentId: id, status: "ACTIVE" },
          });
      }
    }
    const { classId: _classId, ...profile } = data;
    return tx.student.update({ where: { id }, data: profile });
  });
}

export async function setStudentStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE" | "GRADUATED",
  adminId: string,
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new AppError("Siswa tidak ditemukan", 404);

  const updated = await prisma.student.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    tableName: "students",
    recordId: id,
    action: "UPDATE",
    oldValues: { status: student.status },
    newValues: { status: updated.status },
    changedBy: adminId,
    reason: `Ubah status siswa menjadi ${status}`,
  });

  return updated;
}
