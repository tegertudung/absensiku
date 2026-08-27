import ExcelJS from 'exceljs';
import { listSessions } from './sessionService';

// Matches the status labels from the spec (section I), except TERKUNCI which
// isn't implemented yet (Phase 2+: 3-day auto-lock background job).
const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Dalam Proses',
  PENDING_ADMIN: 'Menunggu Admin',
  COMPLETED: 'Selesai',
  CANCELLED_NOT_COUNTED: 'Dibatalkan Tidak Dihitung',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Reguler',
  PRIVATE: 'Privat',
};

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/**
 * BR-10/BR-12: one combined REGULAR+PRIVATE spreadsheet, honoring whatever
 * filters are currently active. Honor/tarif columns use the immutable
 * historical snapshot (honorRateSnapshot) — never a live re-lookup of the
 * current master rate (BR-09/AC-09).
 */
export async function generateRecapExcel(filters: {
  tutorId?: string;
  status?: string;
  sessionType?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  dayOfWeek?: number;
  hour?: string;
}) {
  const sessions = await listSessions(filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Absensiku';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Rekap Mengajar');

  sheet.columns = [
    { header: 'Tanggal', key: 'tanggal', width: 14 },
    { header: 'Hari', key: 'hari', width: 10 },
    { header: 'Tentor', key: 'tentor', width: 22 },
    { header: 'Jenis', key: 'jenis', width: 10 },
    { header: 'Kelas/Siswa', key: 'kelasSiswa', width: 24 },
    { header: 'Mata Pelajaran', key: 'mapel', width: 18 },
    { header: 'Status', key: 'status', width: 20 },
    { header: 'Tarif Sesi (Rp)', key: 'tarif', width: 16 },
    { header: 'Honor (Rp)', key: 'honor', width: 16 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } };

  let totalSessions = 0;
  let totalHonor = 0;

  for (const s of sessions) {
    const dayName = DAY_NAMES[new Date(s.sessionDate).getUTCDay()];
    const isCompleted = s.status === 'COMPLETED';
    const honorValue = isCompleted ? toNumber(s.honorRateSnapshot) : 0;

    sheet.addRow({
      tanggal: new Date(s.sessionDate).toLocaleDateString('id-ID'),
      hari: dayName,
      tentor: s.tutor?.name ?? '-',
      jenis: SESSION_TYPE_LABELS[s.sessionType] ?? s.sessionType,
      kelasSiswa: s.sessionType === 'REGULAR' ? s.class?.name ?? '-' : s.student?.name ?? '-',
      mapel: s.subject?.name ?? '-',
      status: STATUS_LABELS[s.status] ?? s.status,
      tarif: honorValue,
      honor: honorValue,
    });

    if (isCompleted) {
      totalSessions += 1;
      totalHonor += honorValue;
    }
  }

  sheet.addRow({});
  const totalRow = sheet.addRow({
    tentor: `Total sesi selesai: ${totalSessions}`,
    honor: totalHonor,
  });
  totalRow.font = { bold: true };

  sheet.getColumn('tarif').numFmt = '#,##0';
  sheet.getColumn('honor').numFmt = '#,##0';

  return workbook.xlsx.writeBuffer();
}
