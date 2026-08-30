import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { getSettings } from './settingsService';

/**
 * Laporan Progress Siswa — same data as parentPortalService.getChildProgress
 * (private-session materi/catatan/nilai + regular-class attendance) plus
 * student identity and quota, packaged for PDF rendering. No ownership check
 * here — callers (parent portal route) are responsible for verifying the
 * student belongs to the requesting parent before calling this.
 */
export async function buildStudentReport(studentId: string) {
  const [student, settings, privateSessions, attendanceRecords, enrollments, packages] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    getSettings(),
    prisma.teachingSession.findMany({
      where: { studentId, sessionType: 'PRIVATE', status: 'COMPLETED' },
      include: { tutor: { select: { name: true } }, subject: { select: { name: true } } },
      orderBy: { sessionDate: 'desc' },
      take: 50,
    }),
    prisma.attendanceRecord.findMany({
      // Filtered to COMPLETED sessions here, not after fetching — see the
      // matching note in parentPortalService.getChildProgress.
      where: { studentId, session: { status: 'COMPLETED' } },
      include: {
        session: {
          include: {
            tutor: { select: { name: true } },
            class: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.classEnrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      include: { class: { select: { name: true, quotaTotal: true, quotaUsed: true, quotaRemaining: true } } },
    }),
    prisma.privatePackage.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { packageName: true, quotaTotal: true, quotaUsed: true, quotaRemaining: true },
    }),
  ]);
  if (!student) throw new AppError('Siswa tidak ditemukan', 404);

  const programs = [
    ...enrollments.map((e) => ({
      type: 'REGULAR' as const,
      label: e.class.name,
      quotaTotal: e.class.quotaTotal,
      quotaUsed: e.class.quotaUsed,
      quotaRemaining: e.class.quotaRemaining,
    })),
    ...packages.map((p) => ({
      type: 'PRIVATE' as const,
      label: p.packageName || 'Paket Privat',
      quotaTotal: p.quotaTotal,
      quotaUsed: p.quotaUsed,
      quotaRemaining: p.quotaRemaining,
    })),
  ];

  return {
    student,
    settings,
    programs,
    privateSessions: privateSessions.map((s) => ({
      sessionDate: s.sessionDate,
      tutorName: s.tutor.name,
      subjectName: s.subject?.name ?? null,
      material: s.material,
      progressNotes: s.progressNotes,
      score: s.score,
    })),
    regularAttendance: attendanceRecords.map((a) => ({
      sessionDate: a.session.sessionDate,
      className: a.session.class?.name ?? null,
      subjectName: a.session.subject?.name ?? null,
      tutorName: a.session.tutor.name,
      material: a.session.material,
      attendanceStatus: a.status,
    })),
  };
}

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: 'Hadir',
  ABSENT: 'Tidak Hadir',
  LATE: 'Terlambat',
  EXCUSED: 'Izin',
};

function escapePdf(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?');
}

export function renderStudentReportPdf(report: Awaited<ReturnType<typeof buildStudentReport>>) {
  const printDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date());
  const text = (x: number, y: number, value: string, size = 10, bold = false, color = '0 0 0') =>
    `BT /F${bold ? '2' : '1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`;
  const rect = (x: number, y: number, w: number, h: number, color: string) => `${color} rg ${x} ${y} ${w} ${h} re f`;
  const line = (x1: number, y1: number, x2: number, y2: number, color = '0.8 0.82 0.86') =>
    `${color} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`;

  const commands: string[] = [
    rect(0, 800, 595, 42, '0.02 0.12 0.25'),
    text(50, 815, report.settings.institutionName || report.settings.systemName, 17, true, '1 1 1'),
    text(50, 803, 'LAPORAN PROGRESS SISWA', 8, false, '0.82 0.88 0.96'),
    text(50, 765, 'LAPORAN PROGRESS SISWA', 15, true, '0.02 0.12 0.25'),
    text(50, 705, 'Nama Siswa', 9, false, '0.35 0.38 0.43'),
    text(50, 688, report.student.name, 12, true),
    text(390, 705, 'Tanggal Cetak', 9, false, '0.35 0.38 0.43'),
    text(390, 688, printDate, 10, true),
    line(50, 675, 545, 675),
  ];

  // Programs / quota
  let y = 650;
  commands.push(text(50, y, 'Program & Sisa Kuota', 11, true));
  y -= 20;
  if (report.programs.length === 0) {
    commands.push(text(50, y, 'Belum ada program aktif.', 9));
    y -= 20;
  } else {
    for (const p of report.programs) {
      commands.push(
        text(50, y, `${p.type === 'REGULAR' ? 'Reguler' : 'Privat'} - ${p.label}`, 9),
        text(430, y, `${p.quotaRemaining} / ${p.quotaTotal} sesi`, 9, true)
      );
      y -= 16;
    }
  }
  y -= 8;
  commands.push(line(50, y, 545, y));
  y -= 24;

  // Private progress
  commands.push(text(50, y, 'Progress Belajar (Privat)', 11, true));
  y -= 20;
  if (report.privateSessions.length === 0) {
    commands.push(text(50, y, 'Belum ada riwayat sesi privat.', 9));
    y -= 20;
  } else {
    for (const s of report.privateSessions.slice(0, 15)) {
      const dateStr = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(s.sessionDate));
      commands.push(
        text(50, y, `${dateStr} - ${s.subjectName || 'Tanpa Mapel'} (${s.tutorName})`, 9, true),
        text(50, y - 13, `Materi: ${s.material || '-'}`, 8, false, '0.35 0.38 0.43')
      );
      if (s.score != null) {
        commands.push(text(470, y, `Nilai: ${s.score}`, 9, true));
      }
      y -= 30;
      if (y < 100) break;
    }
  }

  y -= 8;
  commands.push(line(50, y, 545, y));
  y -= 24;

  // Regular attendance
  commands.push(text(50, y, 'Kehadiran (Kelas Reguler)', 11, true));
  y -= 20;
  if (report.regularAttendance.length === 0) {
    commands.push(text(50, y, 'Belum ada riwayat kehadiran.', 9));
  } else {
    for (const a of report.regularAttendance.slice(0, 12)) {
      const dateStr = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(a.sessionDate));
      commands.push(
        text(50, y, `${dateStr} - ${a.className || '-'} - ${a.subjectName || '-'}`, 9),
        text(470, y, ATTENDANCE_LABELS[a.attendanceStatus] || a.attendanceStatus, 9, true)
      );
      y -= 15;
      if (y < 60) break;
    }
  }

  const content = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, '0') + ' 00000 n ')
    .join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
