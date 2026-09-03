"use client";
import { useEffect, useRef, useState } from "react";
import api, { assetUrl } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { useSystemIdentityStore } from "@/store/systemIdentityStore";
type Settings = Record<string, string>;
type Tab = "identity" | "operations" | "document";
const initial: Settings = {
  systemName: "",
  institutionName: "",
  signatoryName: "",
  signatoryTitle: "",
  location: "",
  minimumScheduleStartGapMinutes: "30",
  lowQuotaWarningThreshold: "3",
};
const nav: [Tab, string][] = [
  ["identity", "Identitas Sistem"],
  ["operations", "Operasional"],
  ["document", "Slip Honor"],
];
export default function SettingsPage() {
  const refresh = useSystemIdentityStore((s) => s.refresh);
  const [tab, setTab] = useState<Tab>("identity"),
    [settings, setSettings] = useState<Settings>(initial),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [logoUploading, setLogoUploading] = useState(false),
    [signatureUploading, setSignatureUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null),
    signatureRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api
      .get("/settings")
      .then((r) => setSettings({ ...initial, ...r.data.data }))
      .catch(() => setMessage("Gagal memuat pengaturan."));
  }, []);
  async function save(
    path: "identity" | "session" | "document",
    data: Record<string, unknown>,
  ) {
    setSaving(true);
    try {
      const r = await api.patch(`/settings/${path}`, data);
      setSettings({ ...initial, ...r.data.data });
      if (path === "identity") await refresh();
      setMessage("Pengaturan berhasil disimpan.");
    } catch (e: any) {
      setMessage(e.response?.data?.message || "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }
  async function upload(kind: "logo" | "signature", file: File) {
    const set = kind === "logo" ? setLogoUploading : setSignatureUploading;
    set(true);
    try {
      const f = new FormData();
      f.append("file", file);
      const r = await api.post(`/settings/${kind}`, f, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSettings({ ...initial, ...r.data.data });
      if (kind === "logo") await refresh();
      setMessage(
        kind === "logo"
          ? "Logo berhasil diperbarui."
          : "Tanda tangan berhasil diperbarui.",
      );
    } catch (e: any) {
      setMessage(e.response?.data?.message || "Gagal mengunggah gambar.");
    } finally {
      set(false);
    }
  }
  const field = (key: string, label: string, type = "text") => (
    <label className="block text-xs font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={settings[key] || ""}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
        className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
      />
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
            <section className="max-w-2xl rounded-lg border bg-white p-5">
              <h2 className="text-base font-semibold">Identitas Sistem</h2>
              <div className="my-5 flex items-center justify-between rounded-md border bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  {settings.logoPath ? (
                    <img
                      src={assetUrl(settings.logoPath) || undefined}
                      alt="Logo"
                      className="h-11 w-11 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-md bg-navy-900 text-white">
                      P
                    </span>
                  )}
                  <div>
                    <p className="font-semibold">
                      {settings.systemName || "Pioner Class"}
                    </p>
                    <p className="text-xs text-gray-500">Logo Sistem</p>
                  </div>
                </div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload("logo", f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => logoRef.current?.click()}
                  disabled={logoUploading}
                  className="rounded-md border px-3 py-2 text-xs"
                >
                  {logoUploading ? "Mengunggah..." : "Ubah Logo"}
                </button>
              </div>
              <div className="space-y-4">
                {field("systemName", "Nama Sistem")}
                {field("institutionName", "Nama Lembaga")}
              </div>
              <Save
                saving={saving}
                onClick={() =>
                  save("identity", {
                    systemName: settings.systemName,
                    institutionName: settings.institutionName,
                  })
                }
              />
            </section>
          )}
          {tab === "operations" && (
            <section className="max-w-2xl rounded-lg border bg-white p-5">
              <h2 className="text-base font-semibold">Operasional</h2>
              <p className="mt-1 text-xs text-gray-500">
                Atur aturan operasional yang berlaku di sistem.
              </p>
              <div className="mt-5 space-y-5">
                {field(
                  "minimumScheduleStartGapMinutes",
                  "Jarak Minimum Antar Jam Mulai",
                  "number",
                )}
                {field(
                  "lowQuotaWarningThreshold",
                  "Peringatan Kuota Menipis",
                  "number",
                )}
              </div>
              <Save
                saving={saving}
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
              />
            </section>
          )}
          {tab === "document" && (
            <section className="max-w-2xl rounded-lg border bg-white p-5">
              <h2 className="text-base font-semibold">Informasi Dokumen</h2>
              <div className="mt-5 space-y-4">
                {field("signatoryName", "Penanggung Jawab")}
                {field("signatoryTitle", "Jabatan")}
                {field("location", "Kota Penerbitan")}
                <div>
                  <p className="text-xs font-medium">Tanda Tangan</p>
                  <div className="mt-1.5 flex items-center justify-between rounded-md border p-3">
                    {settings.signaturePath ? (
                      <img
                        src={assetUrl(settings.signaturePath) || undefined}
                        alt="Tanda tangan"
                        className="h-10 object-contain"
                      />
                    ) : (
                      <span className="font-serif italic">
                        {settings.signatoryName || "Tanda tangan"}
                      </span>
                    )}
                    <input
                      ref={signatureRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload("signature", f);
                        e.target.value = "";
                      }}
                    />
                    <button
                      onClick={() => signatureRef.current?.click()}
                      disabled={signatureUploading}
                      className="rounded-md border px-3 py-2 text-xs"
                    >
                      {signatureUploading
                        ? "Mengunggah..."
                        : "Ganti Tanda Tangan"}
                    </button>
                  </div>
                </div>
              </div>
              <Save
                saving={saving}
                onClick={() =>
                  save("document", {
                    signatoryName: settings.signatoryName,
                    signatoryTitle: settings.signatoryTitle,
                    location: settings.location,
                  })
                }
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
function Save({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="mt-5 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {saving ? "Menyimpan..." : "Simpan Perubahan"}
    </button>
  );
}
