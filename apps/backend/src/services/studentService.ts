import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";
import { logAudit } from "../utils/auditLog";
import { nextBusinessCode } from "../utils/businessCode";

function normalizeStudentName(name: string) {
  return name.trim();
}

function normalizeStudentPhone(phone: string | undefined) {
  return phone?.replace(/\D/g, "") || "";
}

async function assertStudentIdentityAvailable(
  tx: Pick<typeof prisma, "student">,
  name: string,
  phone: string | undefined,
  excludeStudentId?: string,
) {
  const normalizedPhone = normalizeStudentPhone(phone);
  if (!normalizedPhone) return;
  const duplicate = await tx.student.findFirst({
    where: {
      name: { equals: normalizeStudentName(name), mode: "insensitive" },
      phone: normalizedPhone,
      ...(excludeStudentId ? { id: { not: excludeStudentId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate)
    throw new AppError(
      "Data siswa dengan nama dan nomor telepon tersebut sudah terdaftar.",
      409,
    );
}

export async function createStudent(data: {
  name: string;
  phone?: string;
  email?: string;
  guardianName?: string;
  guardianPhone?: string;
  nis?: string;
  school?: string;
  schoolClass?: string;
  programEnrollments?: Array<{ programId: string; classId?: string | null }>;
}) {
  return prisma.$transaction(async (tx) => {
    await assertStudentIdentityAvailable(tx, data.name, data.phone);
    const enrollments = data.programEnrollments ?? [];
    const programIds = [...new Set(enrollments.map((item) => item.programId))];
    if (programIds.length !== enrollments.length)
      throw new AppError("Program tidak boleh dipilih lebih dari sekali.", 400);
    const programs = await tx.program.findMany({
      where: { id: { in: programIds }, isActive: true },
    });
    if (programs.length !== programIds.length)
      throw new AppError(
        "Satu atau lebih program tidak ditemukan atau tidak aktif.",
        400,
      );
    for (const item of enrollments) {
      const program = programs.find((value) => value.id === item.programId)!;
      if (program.learningModel === "CLASS_BASED" && !item.classId)
        throw new AppError("Pilih kelas untuk program berbasis kelas.", 400);
      if (program.learningModel === "CLASS_BASED" && item.classId) {
        const kelas = await tx.class.findFirst({
          where: { id: item.classId, status: "ACTIVE" },
        });
        if (!kelas)
          throw new AppError("Kelas tidak ditemukan atau tidak aktif.", 400);
      }
      if (program.learningModel !== "CLASS_BASED" && item.classId)
        throw new AppError("Program individual tidak menggunakan kelas.", 400);
    }
    const { programEnrollments: _programEnrollments, ...profile } = data;
    const student = await tx.student.create({
      data: {
        ...profile,
        studentCode: await nextBusinessCode(tx, "student"),
        status: "ACTIVE",
      },
    });
    const enrolledClassIds = new Set<string>();
    for (const item of enrollments) {
      const program = programs.find((value) => value.id === item.programId)!;
      await tx.studentProgram.create({
        data: {
          studentId: student.id,
          programId: item.programId,
          classId: item.classId || null,
        },
      });
      if (item.classId && !enrolledClassIds.has(item.classId)) {
        await tx.classEnrollment.create({
          data: {
            studentId: student.id,
            classId: item.classId,
            status: "ACTIVE",
          },
        });
        enrolledClassIds.add(item.classId);
      }
      if (program.learningModel === "INDIVIDUAL") {
        await tx.privatePackage.create({
          data: {
            studentId: student.id,
            programId: program.id,
            quotaTotal: program.defaultMeetingQuota,
            quotaRemaining: program.defaultMeetingQuota,
            status: "ACTIVE",
          },
        });
      }
    }
    return tx.student.findUniqueOrThrow({
      where: { id: student.id },
      include: {
        programEnrollments: { include: { program: true, class: true } },
      },
    });
  });
}

export async function listStudents() {
  const students = await prisma.student.findMany({
    include: {
      programEnrollments: {
        where: { status: "ACTIVE" },
        include: { program: true, class: true },
      },
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

  return students.map(
    ({ enrollments, packages, programEnrollments, _count, ...student }) => ({
      ...student,
      programEnrollments,
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
    }),
  );
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
      programEnrollments: {
        include: { program: true, class: true },
        orderBy: { createdAt: "asc" },
      },
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

  const activeProgramEnrollments = student.programEnrollments.filter(
    (enrollment) => enrollment.status === "ACTIVE",
  );
  const programIds = activeProgramEnrollments.map(
    (enrollment) => enrollment.programId,
  );
  const classIds = activeProgramEnrollments
    .map((enrollment) => enrollment.classId)
    .filter((classId): classId is string => Boolean(classId));
  const sessions = await prisma.teachingSession.findMany({
    where: {
      status: "COMPLETED",
      programId: { in: programIds },
      OR: [
        { studentId: id },
        { attendanceRecords: { some: { studentId: id } } },
        ...(classIds.length ? [{ classId: { in: classIds } }] : []),
      ],
    },
    include: {
      program: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      tutor: { select: { name: true } },
      subject: { select: { name: true } },
    },
    orderBy: { sessionDate: "desc" },
  });
  const programSummaries = await Promise.all(
    activeProgramEnrollments.map(async (enrollment) => {
      const packageForProgram = student.packages.find(
        (pkg) =>
          pkg.programId === enrollment.programId && pkg.status === "ACTIVE",
      );
      const completedSessions =
        enrollment.program.learningModel === "CLASS_BASED"
          ? enrollment.classId
            ? await prisma.teachingSession.count({
                where: {
                  status: "COMPLETED",
                  programId: enrollment.programId,
                  classId: enrollment.classId,
                },
              })
            : 0
          : sessions.filter(
              (session) =>
                session.programId === enrollment.programId &&
                session.studentId === id,
            ).length;
      const quota =
        enrollment.program.learningModel === "CLASS_BASED" && enrollment.class
          ? {
              quotaTotal: enrollment.program.defaultMeetingQuota,
              quotaRemaining: Math.max(
                0,
                enrollment.program.defaultMeetingQuota - completedSessions,
              ),
            }
          : packageForProgram
            ? {
                quotaTotal: packageForProgram.quotaTotal,
                quotaRemaining: packageForProgram.quotaRemaining,
              }
            : {
                quotaTotal: enrollment.program.defaultMeetingQuota,
                quotaRemaining: Math.max(
                  0,
                  enrollment.program.defaultMeetingQuota - completedSessions,
                ),
              };
      return { ...enrollment, quota };
    }),
  );
  const sessionHistory = sessions.filter((session) =>
    activeProgramEnrollments.some(
      (enrollment) =>
        session.programId === enrollment.programId &&
        (enrollment.program.learningModel === "CLASS_BASED"
          ? session.classId === enrollment.classId
          : session.studentId === id),
    ),
  );
  return { ...student, programSummaries, sessionHistory };
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
    programEnrollments: Array<{ programId: string; classId?: string | null }>;
  }>,
) {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) throw new AppError("Siswa tidak ditemukan", 404);
  return prisma.$transaction(async (tx) => {
    await assertStudentIdentityAvailable(
      tx,
      data.name ?? student.name,
      data.phone ?? student.phone ?? undefined,
      id,
    );
    if (data.programEnrollments !== undefined) {
      const requested = data.programEnrollments;
      const ids = [...new Set(requested.map((item) => item.programId))];
      if (ids.length !== requested.length)
        throw new AppError(
          "Program tidak boleh dipilih lebih dari sekali.",
          400,
        );
      const programs = await tx.program.findMany({
        where: { id: { in: ids } },
      });
      if (programs.length !== ids.length)
        throw new AppError("Program tidak ditemukan.", 404);
      for (const item of requested) {
        const existing = await tx.studentProgram.findUnique({
          where: {
            studentId_programId: { studentId: id, programId: item.programId },
          },
        });
        const program = programs.find((value) => value.id === item.programId)!;
        if (!program.isActive && !existing)
          throw new AppError(
            "Program tidak aktif tidak dapat ditambahkan.",
            400,
          );
        if (program.learningModel === "CLASS_BASED" && !item.classId)
          throw new AppError("Pilih kelas untuk program berbasis kelas.", 400);
        if (program.learningModel === "CLASS_BASED" && item.classId) {
          const kelas = await tx.class.findFirst({
            where: { id: item.classId, status: "ACTIVE" },
          });
          if (!kelas)
            throw new AppError("Kelas tidak ditemukan atau tidak aktif.", 400);
        }
        await tx.studentProgram.upsert({
          where: {
            studentId_programId: { studentId: id, programId: item.programId },
          },
          create: {
            studentId: id,
            programId: item.programId,
            classId: item.classId || null,
          },
          update: { status: "ACTIVE", classId: item.classId || null },
        });
      }
      await tx.studentProgram.updateMany({
        where: { studentId: id, programId: { notIn: ids }, status: "ACTIVE" },
        data: { status: "INACTIVE" },
      });
    }
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
    const {
      classId: _classId,
      programEnrollments: _programEnrollments,
      ...profile
    } = data;
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
