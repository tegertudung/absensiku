"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import api from "@/lib/api";
import EmptyState from "@/components/EmptyState";
import { StatusBadge, TypeBadge } from "@/components/StatusBadge";
import { formatRupiah } from "@/lib/format";
import {
  IconCheckCircle,
  IconChevronRight,
  IconClasses,
  IconReport,
  IconSchedule,
  IconStudent,
  IconTutor,
} from "@/components/icons";

type FilterMode = "ALL" | "DATE" | "MONTH" | "YEAR";
type Current = {
  pendingValidationsCount: number;
  lowQuotaPackages: Array<{
    id: string;
    quotaRemaining: number;
    quotaTotal: number;
    packageName: string | null;
    student: { name: string };
  }>;
  activeTutorsCount: number;
  activeStudentsCount: number;
};
type Activity = {
  id: string;
  startTime?: string | null;
  createdAt: string;
  sessionType: string;
  status: string;
  tutor: { name: string };
  class?: { name: string } | null;
  student?: { name: string } | null;
  subject?: { name: string } | null;
  schedule?: { startTime: string } | null;
};
type PeriodSummary = {
  estimatedHonor: number;
  completedSessions: number;
  regularSessions: number;
  privateSessions: number;
  chart: Array<{ label: string; count: number }>;
  activities: Activity[];
};

const localDateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const time = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

export default function AdminDashboardPage() {
  const initialDate = new Date();
  const [filterMode, setFilterMode] = useState<FilterMode>("MONTH");
  const [selectedDate, setSelectedDate] = useState(localDateKey(initialDate));
  const [selectedMonth, setSelectedMonth] = useState({
    year: initialDate.getFullYear(),
    month: initialDate.getMonth() + 1,
  });
  const [selectedYear, setSelectedYear] = useState(initialDate.getFullYear());
  const [current, setCurrent] = useState<Current | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [error, setError] = useState("");
  const periodParams = useMemo(
    () =>
      filterMode === "ALL"
        ? { mode: "ALL" }
        : filterMode === "DATE"
          ? { mode: "DATE", date: selectedDate }
          : filterMode === "YEAR"
            ? { mode: "YEAR", year: selectedYear }
            : { mode: "MONTH", ...selectedMonth },
    [filterMode, selectedDate, selectedMonth, selectedYear],
  );

  useEffect(() => {
    api
      .get("/dashboard/admin")
      .then((response) => setCurrent(response.data.data))
      .catch(() => setError("Gagal memuat dashboard."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    setPeriodLoading(true);
    api
      .get("/dashboard/admin/period", { params: periodParams })
      .then((response) => active && setSummary(response.data.data))
      .catch(() => active && setSummary(null))
      .finally(() => active && setPeriodLoading(false));
    return () => {
      active = false;
    };
  }, [periodParams]);

  if (loading) return <DashboardSkeleton />;
  if (error || !current)
    return (
      <EmptyState
        title="Dashboard"
        message={error || "Data dashboard tidak tersedia."}
      />
    );
  const actions: Array<{
    href: string;
    label: string;
    icon: typeof IconSchedule;
  }> = [
    { href: "/admin/schedules", label: "Tambah Jadwal", icon: IconSchedule },
    { href: "/admin/students", label: "Tambah Siswa", icon: IconStudent },
    { href: "/admin/tutors", label: "Tambah Tentor", icon: IconTutor },
    { href: "/admin/classes", label: "Tambah Kelas", icon: IconClasses },
  ];
  const chartMax = Math.max(
    ...(summary?.chart.map((point) => point.count) ?? [0]),
    1,
  );
  const activityEmptyMessage =
    filterMode === "ALL"
      ? "Belum ada aktivitas mengajar."
      : "Belum ada aktivitas mengajar pada periode ini.";

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-navy-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Ringkasan aktivitas dan kondisi operasional.
          </p>
        </div>
        <DashboardPeriodFilter
          mode={filterMode}
          onModeChange={setFilterMode}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
        />
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Tentor Aktif"
          value={current.activeTutorsCount}
          helper="tentor"
          icon={<IconTutor className="h-5 w-5" />}
        />
        <Kpi
          label="Siswa Aktif"
          value={current.activeStudentsCount}
          helper="siswa"
          icon={<IconStudent className="h-5 w-5" />}
        />
        <Kpi
          label="Sesi"
          value={periodLoading ? "…" : (summary?.completedSessions ?? 0)}
          helper="sesi"
          icon={<IconSchedule className="h-5 w-5" />}
        />
        <Kpi
          highlight
          label="Estimasi Honor"
          value={
            periodLoading ? "…" : formatRupiah(summary?.estimatedHonor ?? 0)
          }
          icon={<IconReport className="h-5 w-5" />}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          title="Aktivitas Mengajar"
          link="/admin/schedules"
          className="lg:col-span-2"
        >
          {periodLoading ? (
            <LoadingBlock />
          ) : summary?.activities.length ? (
            <ActivityTable activities={summary.activities} />
          ) : (
            <EmptyState message={activityEmptyMessage} />
          )}
        </Card>
        <Card title="Perlu Perhatian">
          {current.pendingValidationsCount ||
          current.lowQuotaPackages.length ? (
            <div className="divide-y">
              {current.pendingValidationsCount > 0 && (
                <Alert
                  href="/admin/validations"
                  title={`${current.pendingValidationsCount} sesi menunggu validasi`}
                  text="Periksa sebelum masuk rekap honor."
                />
              )}
              {current.lowQuotaPackages.length > 0 && (
                <Alert
                  href="#paket-menipis"
                  title={`${current.lowQuotaPackages.length} paket privat hampir habis`}
                  text="Sisa sesi mencapai batas peringatan."
                />
              )}
            </div>
          ) : (
            <EmptyState
              title="Semua terkendali"
              message="Tidak ada item yang memerlukan tindakan."
              icon={<IconCheckCircle className="h-4 w-4" />}
            />
          )}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Ringkasan Periode" className="lg:col-span-2">
          {periodLoading ? (
            <LoadingBlock />
          ) : (
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <div>
                <p className="font-semibold">Aktivitas Mengajar</p>
                <p className="text-xs text-gray-500">
                  Sesi selesai berdasarkan periode terpilih
                </p>
                <div className="mt-5 flex h-36 items-end justify-around gap-2 overflow-x-auto pb-1">
                  {summary?.chart.map((point) => (
                    <div
                      key={point.label}
                      className="flex h-full min-w-[36px] flex-1 flex-col justify-end text-center text-xs"
                    >
                      <b>{point.count}</b>
                      <div
                        className="mt-1 rounded-t bg-blue-600"
                        style={{
                          height: `${Math.max(4, (point.count / chartMax) * 96)}px`,
                        }}
                      />
                      <span className="mt-2 whitespace-nowrap text-gray-500">
                        {point.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <SummaryValue
                  label="Total Sesi"
                  value={summary?.completedSessions ?? 0}
                />
                <SummaryValue
                  label="Reguler"
                  value={summary?.regularSessions ?? 0}
                />
                <SummaryValue
                  label="Privat"
                  value={summary?.privateSessions ?? 0}
                />
              </div>
            </div>
          )}
        </Card>
        <Card title="Aksi Cepat">
          {actions.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-3 border-b px-2 py-3 text-sm last:border-0"
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              <IconChevronRight className="h-4 w-4" />
            </Link>
          ))}
        </Card>
      </div>
      <Card
        title="Paket Privat Hampir Habis"
        subtitle="Paket siswa dengan sisa maksimal batas peringatan."
        id="paket-menipis"
      >
        {current.lowQuotaPackages.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="p-3">Siswa</th>
                  <th>Program</th>
                  <th>Paket</th>
                  <th>Terpakai</th>
                  <th>Sisa Sesi</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {current.lowQuotaPackages.map((pkg) => (
                  <tr key={pkg.id} className="border-t">
                    <td className="p-3">{pkg.student.name}</td>
                    <td>
                      <TypeBadge type="PRIVATE" />
                    </td>
                    <td>{pkg.quotaTotal} sesi</td>
                    <td>{pkg.quotaTotal - pkg.quotaRemaining} sesi</td>
                    <td className="text-red-600">{pkg.quotaRemaining} sesi</td>
                    <td>
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs text-red-600">
                        Hampir Habis
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Kuota masih aman"
            message="Belum ada paket privat yang mencapai batas peringatan."
          />
        )}
      </Card>
    </div>
  );
}

function DashboardPeriodFilter({
  mode,
  onModeChange,
  selectedDate,
  onDateChange,
  selectedMonth,
  onMonthChange,
  selectedYear,
  onYearChange,
}: {
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  selectedDate: string;
  onDateChange: (value: string) => void;
  selectedMonth: { year: number; month: number };
  onMonthChange: (value: { year: number; month: number }) => void;
  selectedYear: number;
  onYearChange: (value: number) => void;
}) {
  const years = Array.from(
    { length: 7 },
    (_, index) => new Date().getFullYear() - 5 + index,
  );
  const labels: Record<FilterMode, string> = {
    ALL: "Semua",
    DATE: "Tanggal",
    MONTH: "Bulan",
    YEAR: "Tahun",
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
        {(["ALL", "DATE", "MONTH", "YEAR"] as FilterMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onModeChange(item)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${mode === item ? "bg-navy-900 text-white" : "text-gray-600 hover:bg-slate-50"}`}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      {mode === "DATE" && (
        <input
          aria-label="Pilih tanggal"
          type="date"
          value={selectedDate}
          onChange={(event) => onDateChange(event.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
        />
      )}
      {mode === "MONTH" && (
        <input
          aria-label="Pilih bulan"
          type="month"
          value={`${selectedMonth.year}-${String(selectedMonth.month).padStart(2, "0")}`}
          onChange={(event) => {
            const [year, month] = event.target.value.split("-").map(Number);
            if (year && month) onMonthChange({ year, month });
          }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
        />
      )}
      {mode === "YEAR" && (
        <select
          aria-label="Pilih tahun"
          value={selectedYear}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
function ActivityTable({ activities }: { activities: Activity[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-xs text-gray-500">
          <tr>
            <th className="p-3">Jam</th>
            <th>Tentor</th>
            <th>Program</th>
            <th>Kelas / Siswa</th>
            <th>Mapel</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((session) => (
            <tr key={session.id} className="border-t">
              <td className="p-3">
                {time(session.startTime || session.schedule?.startTime)}
              </td>
              <td>{session.tutor.name}</td>
              <td>
                <TypeBadge type={session.sessionType} />
              </td>
              <td>
                {session.sessionType === "REGULAR"
                  ? session.class?.name
                  : session.student?.name}
              </td>
              <td>{session.subject?.name || "-"}</td>
              <td>
                <StatusBadge status={session.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Kpi({
  label,
  value,
  helper,
  icon,
  highlight = false,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 rounded-xl border p-4 ${highlight ? "border-blue-700 bg-blue-600 text-white" : "bg-white"}`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${highlight ? "bg-white/15 text-white" : "bg-navy-50 text-navy-800"}`}
      >
        {icon}
      </span>
      <div>
        <p
          className={`text-sm ${highlight ? "text-white/80" : "text-gray-500"}`}
        >
          {label}
        </p>
        <b className={`text-xl ${highlight ? "text-white" : "text-navy-900"}`}>
          {value}
        </b>
        {helper && (
          <p
            className={`text-xs ${highlight ? "text-white/75" : "text-gray-500"}`}
          >
            {helper}
          </p>
        )}
      </div>
    </div>
  );
}
function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-3 text-sm">
      <p className="text-gray-500">{label}</p>
      <b className="text-lg">{value} sesi</b>
    </div>
  );
}
function LoadingBlock() {
  return <div className="h-36 animate-pulse rounded bg-gray-100" />;
}
function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-16 w-80 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-gray-200"
          />
        ))}
      </div>
    </div>
  );
}
function Card({
  title,
  children,
  link,
  className = "",
  subtitle,
  id,
}: {
  title: string;
  children: ReactNode;
  link?: string;
  className?: string;
  subtitle?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-xl border bg-white p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-navy-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        {link && (
          <Link href={link} className="text-xs font-medium text-blue-600">
            Lihat Semua →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
function Alert({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className="flex gap-3 py-3 text-sm">
      <span className="text-red-500">●</span>
      <span className="flex-1">
        <b>{title}</b>
        <small className="mt-1 block text-gray-500">{text}</small>
      </span>
      <IconChevronRight className="h-4 w-4 text-gray-400" />
    </Link>
  );
}
