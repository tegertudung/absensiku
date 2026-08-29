'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { StatusBadge, TypeBadge } from '@/components/StatusBadge';
import {
  IconWarning,
  IconBook,
  IconStar,
  IconStudent,
  IconSchedule,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
} from '@/components/icons';

interface Quota {
  quotaTotal: number;
  quotaRemaining: number;
}

interface SessionItem {
  id: string;
  sessionType: string;
  sessionDate: string;
  status: string;
  class?: (Quota & { name: string }) | null;
  student?: { name: string; packages?: Quota[] } | null;
  subject?: { name: string } | null;
  schedule?: { startTime: string; endTime: string } | null;
}

interface TentorDashboard {
  tutorName: string | null;
  todaySessions: SessionItem[];
  unfinishedSessions: SessionItem[];
  totalCompletedSessions: number;
}

const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELLED_NOT_COUNTED']);
const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sessionQuota(s: SessionItem): Quota | null {
  return s.sessionType === 'REGULAR' ? s.class ?? null : s.student?.packages?.[0] ?? null;
}

function sessionMinutes(s: SessionItem): number | null {
  if (!s.schedule) return null;
  const diff = new Date(s.schedule.endTime).getTime() - new Date(s.schedule.startTime).getTime();
  return Math.max(0, Math.round(diff / 60000));
}

function formatHours(totalMinutes: number) {
  const hours = totalMinutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Monday of the week containing `date`.
function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function sessionTitle(s: SessionItem) {
  return s.sessionType === 'REGULAR' ? s.class?.name : s.student?.name;
}

export default function TentorHomePage() {
  const [data, setData] = useState<TentorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    api
      .get('/dashboard/tentor')
      .then((res) => setData(res.data.data))
      .catch(() => setError('Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;
  if (error || !data) return <p className="text-sm text-red-500">{error ?? 'Data tidak tersedia.'}</p>;

  const now = new Date();
  const monday = startOfWeek(now);
  monday.setDate(monday.getDate() + weekOffset * 7);
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const monthLabel = monday.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const activeToday = data.todaySessions.filter((s) => !CANCELLED_STATUSES.has(s.status));
  const totalMinutesToday = activeToday.reduce((sum, s) => sum + (sessionMinutes(s) ?? 0), 0);

  const sortedToday = [...data.todaySessions].sort((a, b) => {
    const ta = a.schedule ? new Date(a.schedule.startTime).getTime() : new Date(a.sessionDate).getTime();
    const tb = b.schedule ? new Date(b.schedule.startTime).getTime() : new Date(b.sessionDate).getTime();
    return ta - tb;
  });
  const isUpcoming = (s: SessionItem) =>
    !CANCELLED_STATUSES.has(s.status) && s.schedule != null && new Date(s.schedule.startTime) > now;
  const upcomingSessions = sortedToday.filter(isUpcoming);
  const pastSessions = sortedToday.filter((s) => !isUpcoming(s));
  const nextSession = upcomingSessions[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Greeting card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 p-5 text-white shadow-sm">
        <span className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium">
          Tentor
        </span>
        <p className="text-sm text-navy-200">Selamat datang,</p>
        <p className="mt-0.5 text-lg font-semibold">{data.tutorName || 'Tentor'}</p>

        <div className="mt-4 flex items-center gap-6 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <IconSchedule className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold leading-none">{data.todaySessions.length}</p>
              <p className="mt-1 text-[11px] text-navy-200">Sesi Hari Ini</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <IconClock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-base font-semibold leading-none">{formatHours(totalMinutesToday)}</p>
              <p className="mt-1 text-[11px] text-navy-200">Jam Mengajar</p>
            </div>
          </div>
        </div>
      </div>

      {/* Week strip */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium capitalize text-gray-900">{monthLabel}</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label="Minggu sebelumnya"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label="Minggu berikutnya"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {weekDays.map((d, i) => {
            const isToday = d.toDateString() === now.toDateString();
            return (
              <div
                key={i}
                className={`flex flex-col items-center gap-1.5 rounded-xl py-2.5 ${
                  isToday ? 'bg-navy-900 text-white' : 'border border-gray-100 bg-white text-gray-500'
                }`}
              >
                <span className="text-[11px]">{DAY_LABELS[i]}</span>
                <span className="text-sm font-semibold">{d.getDate()}</span>
                {isToday && <span className="h-1 w-1 rounded-full bg-white/80" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Jadwal Berikutnya */}
      {nextSession && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <IconStar className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-gray-900">Jadwal Berikutnya</h2>
          </div>
          <NextSessionCard session={nextSession} />
        </div>
      )}

      {/* Jadwal Hari Ini */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Jadwal Hari Ini</h2>
          <Link href="/tentor/schedule" className="text-xs font-medium text-navy-700 hover:underline">
            Lihat Semua
          </Link>
        </div>
        {data.todaySessions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center">
            <p className="text-sm text-gray-400">Tidak ada jadwal mengajar hari ini.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pastSessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
            {pastSessions.length > 0 && upcomingSessions.length > 0 && (
              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 border-t border-dashed border-gray-200" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Sesi Berikutnya
                </span>
                <div className="h-px flex-1 border-t border-dashed border-gray-200" />
              </div>
            )}
            {upcomingSessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>

      {data.unfinishedSessions.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Sesi Belum Selesai</h2>
          <ul className="space-y-2">
            {data.unfinishedSessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sessionTitle(s)}</p>
                    <p className="text-xs text-gray-500">{new Date(s.sessionDate).toLocaleDateString('id-ID')}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-navy-900 px-4 py-3">
        <span className="text-xs text-navy-200">Total sesi selesai</span>
        <span className="text-xl font-semibold text-white">{data.totalCompletedSessions}</span>
      </div>

      <Link
        href="/tentor/private/new"
        className="block rounded-xl border border-navy-200 py-2.5 text-center text-sm font-medium text-navy-900"
      >
        + Tambah Jadwal Privat
      </Link>
    </div>
  );
}

function NextSessionCard({ session: s }: { session: SessionItem }) {
  const quota = sessionQuota(s);
  const isEmpty = quota != null && quota.quotaRemaining === 0;
  const canFillNow = s.status === 'IN_PROGRESS' || s.status === 'SCHEDULED';
  const minutes = sessionMinutes(s);

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${isEmpty ? 'border-red-200 bg-red-50/40' : 'border-navy-100'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TypeBadge type={s.sessionType} />
          <StatusBadge status={s.status} />
        </div>
        {s.schedule && (
          <span className="text-xs font-medium text-gray-500">
            {formatTime(s.schedule.startTime)}–{formatTime(s.schedule.endTime)}
            {minutes != null && ` · ${minutes} Menit`}
          </span>
        )}
      </div>

      <p className="mt-2.5 flex items-center gap-1.5 text-base font-semibold text-gray-900">
        {s.sessionType === 'PRIVATE' && <IconStudent className="h-4 w-4 shrink-0 text-gray-400" />}
        {sessionTitle(s)}
      </p>
      {s.subject?.name && (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-500">
          <IconBook className="h-3.5 w-3.5 shrink-0" /> {s.subject.name}
        </p>
      )}

      {isEmpty ? (
        <div className="mt-3.5 flex gap-2 rounded-lg bg-red-100/70 px-3 py-2.5">
          <IconWarning className="h-4 w-4 shrink-0 text-red-600" />
          <p className="text-xs text-red-700">
            {s.sessionType === 'REGULAR' ? 'Pertemuan kelas habis.' : 'Paket pertemuan habis.'} Hubungi Admin untuk
            menambah kuota.
          </p>
        </div>
      ) : (
        <Link
          href={`/tentor/sessions/${s.id}`}
          className={`mt-3.5 block rounded-xl bg-navy-900 py-2.5 text-center text-sm font-medium text-white hover:bg-navy-800 ${
            canFillNow ? '' : 'pointer-events-none opacity-40'
          }`}
        >
          Mulai Kelas
        </Link>
      )}
    </div>
  );
}

function SessionRow({ session: s }: { session: SessionItem }) {
  const quota = sessionQuota(s);
  const isEmpty = quota != null && quota.quotaRemaining === 0;
  const canFillNow = s.status === 'IN_PROGRESS' || s.status === 'SCHEDULED';
  const content = (
    <div
      className={`flex gap-3 rounded-xl border bg-white p-3 ${isEmpty ? 'border-red-200 bg-red-50/40' : 'border-gray-200'}`}
    >
      <div className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-gray-700">
        {s.schedule ? formatTime(s.schedule.startTime) : '-'}
      </div>
      <div className="min-w-0 flex-1 border-l border-gray-100 pl-3">
        <div className="flex items-center justify-between gap-2">
          <TypeBadge type={s.sessionType} />
          <StatusBadge status={s.status} />
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 truncate text-sm font-medium text-gray-900">
          {s.sessionType === 'PRIVATE' && <IconStudent className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
          {sessionTitle(s)}
        </p>
        {isEmpty ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600">
            <IconWarning className="h-3 w-3 shrink-0" /> Kuota habis
          </p>
        ) : (
          <p className="truncate text-xs text-gray-500">
            {s.subject?.name}
            {s.schedule && ` • ${formatTime(s.schedule.startTime)}–${formatTime(s.schedule.endTime)}`}
          </p>
        )}
      </div>
    </div>
  );

  if (!canFillNow || isEmpty) return content;
  return (
    <Link href={`/tentor/sessions/${s.id}`} className="block">
      {content}
    </Link>
  );
}
