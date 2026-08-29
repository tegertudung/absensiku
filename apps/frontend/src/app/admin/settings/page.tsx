"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";

type Settings = Record<string, string>;
type Program = {
  id: string;
  code: string;
  name: string;
  learningModel: string;
  usesQuota: boolean;
  defaultMeetingQuota: number;
  isActive: boolean;
};
const initial: Settings = {
  systemName: "",
  institutionName: "",
  signatoryName: "",
  signatoryTitle: "",
  location: "",
  minimumScheduleStartGapMinutes: "30",
  lowQuotaWarningThreshold: "3",
};
type Tab = "identity" | "programs" | "operations" | "document";
const nav: [Tab, string][] = [
  ["identity", "Identitas Sistem"],
  ["programs", "Program"],
  ["operations", "Operasional"],
  ["document", "Slip Honor"],
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("identity"),
    [settings, setSettings] = useState<Settings>(initial),
    [programs, setPrograms] = useState<Program[]>([]),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([api.get("/settings"), api.get("/programs")])
      .then(([s, p]) => {
        setSettings({ ...initial, ...s.data.data });
        setPrograms(p.data.data);
      })
      .catch(() => setMessage("Gagal memuat pengaturan."));
  }, []);
  async function save(
    path: "identity" | "session" | "document",
    data: Record<string, unknown>,
  ) {
    setSaving(true);
    setMessage("");
    try {
      const res = await api.patch(`/settings/${path}`, data);
      setSettings({ ...initial, ...res.data.data });
      setMessage("Pengaturan berhasil disimpan.");
    } catch (err: any) {
      setMessage(err.response?.data?.message || "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }
  const field = (name: string, label: string, type = "text", help?: string) => (
    <label className="block text-xs font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={settings[name] || ""}
        onChange={(e) => setSettings({ ...settings, [name]: e.target.value })}
        className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-navy-500"
      />
      {help && (
        <span className="mt-1.5 block text-xs leading-5 text-gray-500">
          {help}
        </span>
      )}
    </label>
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengaturan"
        description="Kelola konfigurasi sistem Pioner Class dengan mudah dan terpusat."
      />
      {message && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${message.startsWith("Gagal") ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
        >
          {message}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav className="h-fit rounded-lg border border-gray-200 bg-white p-2">
          {nav.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex w-full rounded-md px-3 py-2.5 text-left text-sm ${tab === id ? "bg-navy-50 font-medium text-navy-900" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <main>
          {tab === "identity" && (
            <section className="max-w-2xl rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">
                Identitas Sistem
              </h2>
              <div className="my-5 flex items-center justify-between rounded-md border border-gray-100 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-900 text-lg font-semibold text-white">
                    P
                  </span>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {settings.systemName || "Pioner Class"}
                    </p>
                    <p className="text-xs text-gray-500">Logo Sistem</p>
                  </div>
                </div>
                <button className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700">
                  Ubah Logo
                </button>
              </div>
              <div className="space-y-4">
                {field("systemName", "Nama Sistem")}
                {field("institutionName", "Nama Lembaga")}
              </div>
              <button
                onClick={() =>
                  save("identity", {
                    systemName: settings.systemName,
                    institutionName: settings.institutionName,
                  })
                }
                disabled={saving}
                className="mt-5 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </section>
          )}
          {tab === "programs" && (
            <section className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Program
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Kelola program yang tersedia dalam sistem.
                  </p>
                </div>
                <button className="rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white">
                  Tambah Program
                </button>
              </div>
              <div className="space-y-3">
                {programs.map((program) => (
                  <div
                    key={program.id}
                    className="grid items-center gap-3 rounded-lg border border-gray-200 p-4 md:grid-cols-[1.2fr_.8fr_1fr_1fr_auto]"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {program.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Kode: {program.code}
                      </p>
                    </div>
                    <Info
                      label="Model"
                      value={
                        program.learningModel === "CLASS_BASED"
                          ? "Berbasis Kelas"
                          : "Individual"
                      }
                    />
                    <Info
                      label="Kuota Standar"
                      value={
                        program.usesQuota
                          ? `${program.defaultMeetingQuota} pertemuan`
                          : "Tanpa kuota"
                      }
                    />
                    <span
                      className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${program.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                    >
                      {program.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                    <button
                      className="rounded-md px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
                      aria-label={`Aksi ${program.name}`}
                    >
                      •••
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {tab === "operations" && (
            <section className="max-w-2xl rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">
                Operasional
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Atur aturan operasional yang berlaku di sistem.
              </p>
              <div className="mt-5 space-y-5">
                <NumberField
                  label="Jarak Minimum Antar Jam Mulai"
                  value={settings.minimumScheduleStartGapMinutes}
                  suffix="menit"
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      minimumScheduleStartGapMinutes: value,
                    })
                  }
                  help="Minimal waktu jeda antar jam mulai sesi dalam satu hari untuk tentor yang sama."
                />
                <NumberField
                  label="Peringatan Kuota Menipis"
                  value={settings.lowQuotaWarningThreshold}
                  suffix="sesi"
                  onChange={(value) =>
                    setSettings({
                      ...settings,
                      lowQuotaWarningThreshold: value,
                    })
                  }
                  help="Sistem akan memberikan peringatan ketika sisa kuota tentor mencapai nilai ini."
                />
              </div>
              <button
                onClick={() =>
                  save("session", {
                    minimumScheduleStartGapMinutes: Number(
                      settings.minimumScheduleStartGapMinutes,
                    ),
                    lowQuotaWarningThreshold: Number(
                      settings.lowQuotaWarningThreshold,
                    ),
                  })
                }
                disabled={saving}
                className="mt-5 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </section>
          )}
          {tab === "document" && (
            <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="text-base font-semibold text-gray-900">
                  Informasi Dokumen
                </h2>
                <div className="mt-5 space-y-4">
                  {field("signatoryName", "Penanggung Jawab")}
                  {field("signatoryTitle", "Jabatan")}
                  {field("location", "Kota Penerbitan")}
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      Tanda Tangan
                    </p>
                    <div className="mt-1.5 flex items-center justify-between rounded-md border border-gray-200 p-3">
                      <span className="font-serif text-2xl italic text-gray-700">
                        {settings.signatoryName || "Tanda tangan"}
                      </span>
                      <button className="rounded-md border border-gray-300 px-3 py-2 text-xs">
                        Ganti Tanda Tangan
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">
                      Tanda tangan akan ditampilkan pada Slip Honor Tentor.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    save("document", {
                      signatoryName: settings.signatoryName,
                      signatoryTitle: settings.signatoryTitle,
                      location: settings.location,
                    })
                  }
                  disabled={saving}
                  className="mt-5 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
              <SlipPreview settings={settings} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}
function NumberField({
  label,
  value,
  suffix,
  onChange,
  help,
}: {
  label: string;
  value: string;
  suffix: string;
  onChange: (value: string) => void;
  help: string;
}) {
  return (
    <label className="block text-xs font-medium text-gray-700">
      {label}
      <div className="mt-1.5 flex h-10 overflow-hidden rounded-md border border-gray-300">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 px-3 text-sm outline-none"
        />
        <span className="flex items-center border-l border-gray-200 bg-slate-50 px-3 text-xs text-gray-500">
          {suffix}
        </span>
      </div>
      <span className="mt-1.5 block text-xs leading-5 text-gray-500">
        {help}
      </span>
    </label>
  );
}
function SlipPreview({ settings }: { settings: Settings }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-base font-semibold text-gray-900">
        Preview Slip Honor
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Pratinjau tampilan Slip Honor berdasarkan pengaturan saat ini.
      </p>
      <div className="mt-5 rounded-md border border-gray-200 p-5 text-xs text-gray-600">
        <div className="flex items-center justify-between border-b border-gray-300 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 font-semibold text-white">
              P
            </span>
            <strong className="text-sm text-navy-950">
              {settings.institutionName ||
                settings.systemName ||
                "Pioner Class"}
            </strong>
          </div>
          <span>{settings.location || "Kota Penerbitan"}</span>
        </div>
        <h3 className="my-5 text-center text-sm font-bold text-navy-950">
          SLIP HONOR TENTOR
        </h3>
        <div className="grid grid-cols-2 gap-y-2">
          <span>Periode</span>
          <strong>Periode berjalan</strong>
          <span>Tentor</span>
          <strong>-</strong>
          <span>Program</span>
          <strong>-</strong>
          <span>Total Sesi</span>
          <strong>-</strong>
          <span>Total Honor</span>
          <strong>-</strong>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-8 text-center">
          <div>
            <p>Penanggung Jawab</p>
            <p className="my-7 font-serif text-xl italic">
              {settings.signatoryName || "-"}
            </p>
            <strong>{settings.signatoryName || "-"}</strong>
            <p>{settings.signatoryTitle || "-"}</p>
          </div>
          <div>
            <p>Tentor</p>
            <p className="my-7">&nbsp;</p>
            <strong>-</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
