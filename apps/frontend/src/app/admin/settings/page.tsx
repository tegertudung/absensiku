"use client";
import { useEffect, useRef, useState } from "react";
import api, { assetUrl } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import MascotImage from "@/components/MascotImage";
import { IconTrash } from "@/components/icons";
import { useSystemIdentityStore } from "@/store/systemIdentityStore";
import { useAuthStore } from "@/store/authStore";
type Settings = Record<string, string>;
type Tab = "identity" | "operations" | "document" | "tutorDisplay" | "admins";
type AdminUser = {
  id: string;
  email: string;
  isPrimaryAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
type Mascot = {
  id: string;
  name: string;
  mimeType: string;
  originalFileName: string;
  createdAt: string;
  isActive?: boolean;
};
type MascotDisplayMode = "MANUAL" | "AUTO";
type MascotDisplayStateKey =
  | "NO_SESSION"
  | "ONE_SESSION"
  | "NORMAL"
  | "BUSY"
  | "STARTING_SOON"
  | "ALL_DONE";
type MascotDisplayConfig = {
  mode: MascotDisplayMode;
  states: Record<
    MascotDisplayStateKey,
    { mascotId: string | null; template: string }
  >;
};
const MAX_MASCOT_FILE_SIZE = 3 * 1024 * 1024;
const MASCOT_STATE_ROWS: {
  key: MascotDisplayStateKey;
  label: string;
  description?: string;
}[] = [
  {
    key: "NO_SESSION",
    label: "Tidak ada sesi",
    description: "Digunakan ketika tentor tidak memiliki jadwal hari ini.",
  },
  { key: "ONE_SESSION", label: "1 sesi" },
  { key: "NORMAL", label: "2–3 sesi" },
  { key: "BUSY", label: "4 sesi atau lebih" },
  { key: "STARTING_SOON", label: "Sesi akan dimulai" },
  { key: "ALL_DONE", label: "Semua sesi selesai" },
];
const MASCOT_PLACEHOLDERS = [
  "{nama}",
  "{jumlahSesi}",
  "{jamBerikutnya}",
  "{mapelBerikutnya}",
  "{kelasBerikutnya}",
];
const MASCOT_PREVIEW_VALUES: Record<string, string> = {
  nama: "Amriyadi",
  jumlahSesi: "3",
  jamBerikutnya: "10.00",
  mapelBerikutnya: "Matematika",
  kelasBerikutnya: "Kelas 6A",
};
const DEFAULT_MASCOT_DISPLAY_CONFIG: MascotDisplayConfig = {
  mode: "MANUAL",
  states: {
    NO_SESSION: {
      mascotId: null,
      template: "Santaimi dulu, belum ada sesi ji hari ini.",
    },
    ONE_SESSION: {
      mascotId: null,
      template: "Jangan ki lupa, ada {jumlahSesi} sesi hari ini.",
    },
    NORMAL: {
      mascotId: null,
      template: "Semangat ki, ada {jumlahSesi} sesi hari ini!",
    },
    BUSY: {
      mascotId: null,
      template: "Jadwal ta padat hari ini. Semangat ki, jangan lupa makan!",
    },
    STARTING_SOON: {
      mascotId: null,
      template: "Gas ki, sebentar lagi sesi ta mulai jam {jamBerikutnya}.",
    },
    ALL_DONE: {
      mascotId: null,
      template: "Mantap ji, semua sesi hari ini sudah selesai!",
    },
  },
};
const mascotConfigCopy = (config: MascotDisplayConfig) =>
  JSON.parse(JSON.stringify(config)) as MascotDisplayConfig;
const mascotConfigSignature = (config: MascotDisplayConfig) =>
  JSON.stringify(config);
const previewMascotTemplate = (template: string) =>
  template.replace(
    /\{(nama|jumlahSesi|jamBerikutnya|mapelBerikutnya|kelasBerikutnya)\}/g,
    (_, key: string) => MASCOT_PREVIEW_VALUES[key],
  );
const initial: Settings = {
  systemName: "",
  institutionName: "",
  address: "",
  email: "",
  phone: "",
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
  ["tutorDisplay", "Tampilan Tentor"],
  ["admins", "Kelola Admin"],
];
export default function SettingsPage() {
  const refresh = useSystemIdentityStore((s) => s.refresh);
  const currentUser = useAuthStore((s) => s.user);
  const isPrimaryAdmin = currentUser?.isPrimaryAdmin === true;
  const [tab, setTab] = useState<Tab>("identity"),
    [settings, setSettings] = useState<Settings>(initial),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [logoUploading, setLogoUploading] = useState(false),
    [signatureUploading, setSignatureUploading] = useState(false),
    [mascots, setMascots] = useState<Mascot[]>([]),
    [activeMascot, setActiveMascot] = useState<Mascot | null>(null),
    [mascotsLoading, setMascotsLoading] = useState(false),
    [mascotBusyId, setMascotBusyId] = useState<string | null>(null),
    [uploadOpen, setUploadOpen] = useState(false),
    [deleteTarget, setDeleteTarget] = useState<Mascot | null>(null),
    [mascotName, setMascotName] = useState(""),
    [mascotFile, setMascotFile] = useState<File | null>(null),
    [mascotPreview, setMascotPreview] = useState<string | null>(null),
    [mascotFormError, setMascotFormError] = useState(""),
    [mascotUploading, setMascotUploading] = useState(false),
    [mascotDisplayConfig, setMascotDisplayConfig] =
      useState<MascotDisplayConfig>(DEFAULT_MASCOT_DISPLAY_CONFIG),
    [savedMascotDisplayConfig, setSavedMascotDisplayConfig] =
      useState<MascotDisplayConfig>(DEFAULT_MASCOT_DISPLAY_CONFIG),
    [mascotConfigSaving, setMascotConfigSaving] = useState(false),
    [adminUsers, setAdminUsers] = useState<AdminUser[]>([]),
    [adminUsersLoading, setAdminUsersLoading] = useState(false),
    [adminBusyId, setAdminBusyId] = useState<string | null>(null),
    [addAdminOpen, setAddAdminOpen] = useState(false),
    [resetAdminTarget, setResetAdminTarget] = useState<AdminUser | null>(null),
    [deleteAdminTarget, setDeleteAdminTarget] = useState<AdminUser | null>(
      null,
    ),
    [adminFormError, setAdminFormError] = useState(""),
    [adminForm, setAdminForm] = useState({
      email: "",
      password: "",
      confirmPassword: "",
    });
  const logoRef = useRef<HTMLInputElement>(null),
    signatureRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api
      .get("/settings")
      .then((r) => setSettings({ ...initial, ...r.data.data }))
      .catch(() => setMessage("Gagal memuat pengaturan."));
  }, []);
  useEffect(() => {
    if (!mascotFile) {
      setMascotPreview(null);
      return;
    }
    const url = URL.createObjectURL(mascotFile);
    setMascotPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [mascotFile]);
  const loadMascots = async () => {
    setMascotsLoading(true);
    try {
      const [list, active, config] = await Promise.all([
        api.get("/tutor-mascots"),
        api.get("/tutor-mascots/active"),
        api.get("/tutor-mascots/config"),
      ]);
      setMascots(list.data.data);
      setActiveMascot(active.data.data);
      const displayConfig = config.data.data as MascotDisplayConfig;
      setMascotDisplayConfig(displayConfig);
      setSavedMascotDisplayConfig(mascotConfigCopy(displayConfig));
    } catch (e: any) {
      setMessage(e.response?.data?.message || "Gagal memuat koleksi maskot.");
    } finally {
      setMascotsLoading(false);
    }
  };
  useEffect(() => {
    if (tab === "tutorDisplay") void loadMascots();
  }, [tab]);
  const loadAdminUsers = async () => {
    setAdminUsersLoading(true);
    try {
      const response = await api.get("/admin/users");
      setAdminUsers(response.data.data);
    } catch (error) {
      setMessage("Gagal memuat akun Admin.");
    } finally {
      setAdminUsersLoading(false);
    }
  };
  useEffect(() => {
    if (tab === "admins") void loadAdminUsers();
  }, [tab]);
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
  function closeMascotUpload() {
    setUploadOpen(false);
    setMascotName("");
    setMascotFile(null);
    setMascotFormError("");
  }
  function chooseMascotFile(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/webp"].includes(file.type)) {
      setMascotFormError("Gambar maskot harus berupa PNG atau WebP.");
      return;
    }
    if (file.size > MAX_MASCOT_FILE_SIZE) {
      setMascotFormError("Ukuran gambar maskot maksimal 3 MB.");
      return;
    }
    setMascotFormError("");
    setMascotFile(file);
  }
  async function submitMascot() {
    const name = mascotName.trim();
    if (!name) return setMascotFormError("Nama maskot wajib diisi.");
    if (!mascotFile) return setMascotFormError("Gambar maskot wajib dipilih.");
    if (!(mascotFile instanceof File)) {
      return setMascotFormError("File maskot tidak valid. Pilih ulang gambar.");
    }
    setMascotUploading(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("image", mascotFile);
      await api.post("/tutor-mascots", form);
      closeMascotUpload();
      await loadMascots();
      setMessage("Maskot berhasil ditambahkan ke koleksi.");
    } catch (e: any) {
      setMascotFormError(
        e.response?.data?.message || "Gagal menyimpan maskot.",
      );
    } finally {
      setMascotUploading(false);
    }
  }
  async function activateMascot(mascot: Mascot) {
    setMascotBusyId(mascot.id);
    try {
      const response = await api.patch("/tutor-mascots/active", {
        mascotId: mascot.id,
      });
      const active = response.data.data as Mascot;
      setActiveMascot(active);
      setMascots((current) =>
        current.map((item) => ({ ...item, isActive: item.id === mascot.id })),
      );
      setMessage("Maskot Beranda Tentor berhasil diperbarui.");
    } catch (e: any) {
      setMessage(
        e.response?.data?.message || "Gagal memperbarui maskot aktif.",
      );
    } finally {
      setMascotBusyId(null);
    }
  }
  async function deleteMascot() {
    if (!deleteTarget) return;
    setMascotBusyId(deleteTarget.id);
    try {
      await api.delete(`/tutor-mascots/${deleteTarget.id}`);
      setMascots((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      setMessage("Maskot berhasil dihapus dari koleksi.");
    } catch (e: any) {
      setMessage(e.response?.data?.message || "Gagal menghapus maskot.");
    } finally {
      setMascotBusyId(null);
    }
  }
  function updateMascotDisplayState(
    key: MascotDisplayStateKey,
    value: Partial<MascotDisplayConfig["states"][MascotDisplayStateKey]>,
  ) {
    setMascotDisplayConfig((current) => ({
      ...current,
      states: {
        ...current.states,
        [key]: { ...current.states[key], ...value },
      },
    }));
  }
  async function saveMascotDisplayConfig() {
    setMascotConfigSaving(true);
    try {
      const response = await api.patch(
        "/tutor-mascots/config",
        mascotDisplayConfig,
      );
      const saved = response.data.data as MascotDisplayConfig;
      setMascotDisplayConfig(saved);
      setSavedMascotDisplayConfig(mascotConfigCopy(saved));
      setMessage("Pengaturan maskot Beranda Tentor berhasil disimpan.");
    } catch (e: any) {
      setMessage(
        e.response?.data?.message || "Gagal menyimpan pengaturan maskot.",
      );
    } finally {
      setMascotConfigSaving(false);
    }
  }
  function closeAdminModal() {
    setAddAdminOpen(false);
    setResetAdminTarget(null);
    setDeleteAdminTarget(null);
    setAdminFormError("");
    setAdminForm({ email: "", password: "", confirmPassword: "" });
  }
  function validateAdminPassword() {
    if (adminForm.password.length < 8) {
      setAdminFormError("Password minimal 8 karakter.");
      return false;
    }
    if (adminForm.password !== adminForm.confirmPassword) {
      setAdminFormError("Konfirmasi password tidak cocok.");
      return false;
    }
    return true;
  }
  async function createAdmin() {
    const email = adminForm.email.trim();
    if (!email) {
      return setAdminFormError("Email wajib diisi.");
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return setAdminFormError("Email tidak valid.");
    }
    if (!validateAdminPassword()) return;
    setAdminBusyId("create");
    setAdminFormError("");
    try {
      await api.post("/admin/users", { ...adminForm, email });
      closeAdminModal();
      await loadAdminUsers();
      setMessage("Akun Admin berhasil ditambahkan.");
    } catch (error) {
      setAdminFormError(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Gagal menambahkan akun Admin.",
      );
    } finally {
      setAdminBusyId(null);
    }
  }
  async function resetAdminPassword() {
    if (!resetAdminTarget || !validateAdminPassword()) return;
    setAdminBusyId(resetAdminTarget.id);
    setAdminFormError("");
    try {
      await api.patch(`/admin/users/${resetAdminTarget.id}/password`, {
        password: adminForm.password,
        confirmPassword: adminForm.confirmPassword,
      });
      closeAdminModal();
      setMessage("Password Admin berhasil diperbarui.");
    } catch (error) {
      setAdminFormError(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Gagal memperbarui password Admin.",
      );
    } finally {
      setAdminBusyId(null);
    }
  }
  async function deleteAdmin() {
    if (!deleteAdminTarget) return;
    setAdminBusyId(deleteAdminTarget.id);
    try {
      await api.delete(`/admin/users/${deleteAdminTarget.id}`);
      setAdminUsers((users) =>
        users.filter((user) => user.id !== deleteAdminTarget.id),
      );
      closeAdminModal();
      setMessage("Akun Admin berhasil dihapus.");
    } catch (error) {
      closeAdminModal();
      setMessage(
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Gagal menghapus akun Admin.",
      );
    } finally {
      setAdminBusyId(null);
    }
  }
  const mascotConfigChanged =
    mascotConfigSignature(mascotDisplayConfig) !==
    mascotConfigSignature(savedMascotDisplayConfig);
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
          {nav
            .filter(([id]) => id !== "admins" || isPrimaryAdmin)
            .map(([id, label]) => (
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
                {field("address", "Alamat")}
                {field("email", "Email", "email")}
                {field("phone", "Nomor Telepon")}
              </div>
              <Save
                saving={saving}
                onClick={() =>
                  save("identity", {
                    systemName: settings.systemName,
                    institutionName: settings.institutionName,
                    address: settings.address,
                    email: settings.email,
                    phone: settings.phone,
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
                      <span className="text-xs text-gray-500">
                        Belum ada tanda tangan diunggah.
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
          {tab === "admins" && isPrimaryAdmin && (
            <section className="max-w-4xl rounded-lg border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Kelola Admin</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Kelola akun tambahan yang dapat mengakses dashboard Admin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAdminFormError("");
                    setAddAdminOpen(true);
                  }}
                  className="rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white hover:bg-navy-800"
                >
                  + Tambah Admin
                </button>
              </div>
              <div className="mt-5 overflow-x-auto rounded-md border border-gray-200">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Dibuat</th>
                      <th className="px-4 py-3 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {adminUsersLoading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-sm text-gray-500"
                        >
                          Memuat akun Admin...
                        </td>
                      </tr>
                    ) : adminUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-8 text-center text-sm text-gray-500"
                        >
                          Belum ada akun Admin.
                        </td>
                      </tr>
                    ) : (
                      adminUsers.map((admin) => {
                        const isCurrentUser = admin.id === currentUser?.id;
                        return (
                          <tr key={admin.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {admin.email}
                              {isCurrentUser && (
                                <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-medium text-navy-800">
                                  Anda
                                </span>
                              )}
                              {admin.isPrimaryAdmin && (
                                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  Admin Utama
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${admin.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                              >
                                {admin.isActive ? "Aktif" : "Nonaktif"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {new Date(admin.createdAt).toLocaleDateString(
                                "id-ID",
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {!admin.isPrimaryAdmin && !isCurrentUser && (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={adminBusyId === admin.id}
                                    onClick={() => {
                                      setAdminFormError("");
                                      setAdminForm({
                                        email: "",
                                        password: "",
                                        confirmPassword: "",
                                      });
                                      setResetAdminTarget(admin);
                                    }}
                                    className="text-xs font-medium text-navy-800 hover:underline disabled:opacity-50"
                                  >
                                    Reset Password
                                  </button>
                                  <button
                                    type="button"
                                    disabled={adminBusyId === admin.id}
                                    onClick={() => setDeleteAdminTarget(admin)}
                                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {tab === "tutorDisplay" && (
            <section className="max-w-4xl rounded-lg border bg-white p-5">
              <h2 className="text-base font-semibold">
                Tampilan Beranda Tentor
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Atur maskot yang tampil pada halaman Beranda Tentor.
              </p>

              <div className="mt-5 border-t border-gray-100 pt-5">
                <h3 className="text-sm font-semibold text-gray-900">
                  Mode Maskot Beranda
                </h3>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {(
                    [
                      ["MANUAL", "Gunakan satu maskot"],
                      ["AUTO", "Otomatis berdasarkan jadwal"],
                    ] as [MascotDisplayMode, string][]
                  ).map(([mode, label]) => (
                    <label
                      key={mode}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm ${mascotDisplayConfig.mode === mode ? "border-navy-300 bg-navy-50 text-navy-900" : "border-gray-200 text-gray-700"}`}
                    >
                      <input
                        type="radio"
                        name="mascot-display-mode"
                        checked={mascotDisplayConfig.mode === mode}
                        onChange={() =>
                          setMascotDisplayConfig((current) => ({
                            ...current,
                            mode,
                          }))
                        }
                        className="accent-navy-900"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {mascotDisplayConfig.mode === "AUTO" && (
                  <div className="mt-5 border-t border-gray-100 pt-5">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Aturan Maskot Otomatis
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Atur maskot dan pesan untuk setiap kondisi jadwal tentor.
                    </p>
                    {mascots.length === 0 && !mascotsLoading && (
                      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Tambahkan maskot ke Koleksi Maskot terlebih dahulu.
                      </p>
                    )}
                    <div className="mt-4 divide-y divide-gray-100 border-y border-gray-100">
                      {MASCOT_STATE_ROWS.map(({ key, label, description }) => {
                        const state = mascotDisplayConfig.states[key];
                        return (
                          <div key={key} className="py-4 first:pt-4 last:pb-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-medium text-gray-900">
                                  {label}
                                </h4>
                                {description && (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {description}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateMascotDisplayState(key, {
                                    template:
                                      DEFAULT_MASCOT_DISPLAY_CONFIG.states[key]
                                        .template,
                                  })
                                }
                                className="text-xs font-medium text-navy-800 hover:underline"
                              >
                                Kembalikan Default
                              </button>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                              <label className="block text-xs font-medium text-gray-700">
                                Maskot
                                <select
                                  value={state.mascotId || ""}
                                  disabled={mascots.length === 0}
                                  onChange={(event) =>
                                    updateMascotDisplayState(key, {
                                      mascotId: event.target.value || null,
                                    })
                                  }
                                  className="mt-1.5 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                                >
                                  <option value="">Tidak memilih maskot</option>
                                  {mascots.map((mascot) => (
                                    <option key={mascot.id} value={mascot.id}>
                                      {mascot.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">
                                  Pesan
                                  <textarea
                                    value={state.template}
                                    maxLength={200}
                                    onChange={(event) =>
                                      updateMascotDisplayState(key, {
                                        template: event.target.value,
                                      })
                                    }
                                    className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
                                  />
                                </label>
                                <p className="mt-1.5 text-[11px] text-gray-500">
                                  Placeholder tersedia:{" "}
                                  {MASCOT_PLACEHOLDERS.join(" ")}
                                </p>
                                <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-gray-600">
                                  <span className="font-medium text-gray-700">
                                    Preview:
                                  </span>{" "}
                                  {previewMascotTemplate(state.template)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!mascotConfigChanged || mascotConfigSaving}
                  onClick={saveMascotDisplayConfig}
                  className="mt-5 rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mascotConfigSaving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-5">
                <h3 className="text-sm font-semibold text-gray-900">
                  Maskot Aktif
                </h3>
                {activeMascot ? (
                  <div className="mt-3 flex items-center gap-4 rounded-lg border border-gray-200 bg-slate-50 p-4">
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center bg-white p-2">
                      <MascotImage
                        mascotId={activeMascot.id}
                        alt={activeMascot.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {activeMascot.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Digunakan pada Beranda Tentor
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        Aktif
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-gray-200 px-4 py-5">
                    <p className="text-sm font-medium text-gray-700">
                      Belum ada maskot aktif
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Pilih salah satu maskot dari koleksi di bawah.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-7 border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Koleksi Maskot
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Kelola asset maskot yang dapat digunakan oleh Beranda
                      Tentor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadOpen(true)}
                    className="shrink-0 rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white hover:bg-navy-800"
                  >
                    + Tambah Maskot
                  </button>
                </div>
                {mascotsLoading ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-48 animate-pulse rounded-lg border bg-slate-50"
                      />
                    ))}
                  </div>
                ) : mascots.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-gray-200 px-5 py-8 text-center">
                    <p className="text-sm font-medium text-gray-700">
                      Koleksi maskot masih kosong
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Tambahkan maskot pertama untuk digunakan pada Beranda
                      Tentor.
                    </p>
                    <button
                      type="button"
                      onClick={() => setUploadOpen(true)}
                      className="mt-3 text-xs font-medium text-navy-800 hover:underline"
                    >
                      + Tambah Maskot
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {mascots.map((mascot) => (
                      <article
                        key={mascot.id}
                        className="rounded-lg border border-gray-200 p-3"
                      >
                        <div className="flex h-32 items-center justify-center bg-slate-50 p-3">
                          <MascotImage
                            mascotId={mascot.id}
                            alt={mascot.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="mt-3 flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium text-gray-900">
                            {mascot.name}
                          </p>
                          {mascot.isActive && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              Aktif
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          {mascot.isActive ? (
                            <span className="text-xs text-gray-500">
                              Sedang digunakan
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={mascotBusyId === mascot.id}
                              onClick={() => activateMascot(mascot)}
                              className="rounded-md border border-navy-200 px-2.5 py-1.5 text-xs font-medium text-navy-800 hover:bg-navy-50 disabled:opacity-50"
                            >
                              {mascotBusyId === mascot.id
                                ? "Memproses..."
                                : "Gunakan"}
                            </button>
                          )}
                          {!mascot.isActive && (
                            <button
                              type="button"
                              disabled={mascotBusyId === mascot.id}
                              onClick={() => setDeleteTarget(mascot)}
                              aria-label={`Hapus ${mascot.name}`}
                              className="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <IconTrash className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
      {uploadOpen && (
        <Modal
          title="Tambah Maskot"
          onClose={closeMascotUpload}
          className="max-w-md"
        >
          <div className="space-y-4">
            <label className="block text-xs font-medium text-gray-700">
              Nama Maskot *
              <input
                value={mascotName}
                onChange={(event) => setMascotName(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Gambar Maskot *
              <input
                type="file"
                accept="image/png,image/webp"
                onChange={(event) => chooseMascotFile(event.target.files?.[0])}
                className="mt-1.5 block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-navy-800"
              />
            </label>
            <p className="text-xs leading-5 text-gray-500">
              PNG atau WebP, maksimal 3 MB. Disarankan menggunakan background
              transparan.
            </p>
            {mascotPreview && (
              <div className="flex h-40 items-center justify-center bg-slate-50 p-3">
                <img
                  src={mascotPreview}
                  alt="Preview maskot"
                  className="h-full w-full object-contain"
                />
              </div>
            )}
            {mascotFormError && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {mascotFormError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                disabled={mascotUploading}
                onClick={closeMascotUpload}
                className="rounded-md border px-3 py-2 text-xs"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={mascotUploading}
                onClick={submitMascot}
                className="rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {mascotUploading ? "Menyimpan..." : "Simpan Maskot"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Hapus maskot?"
          onClose={() => !mascotBusyId && setDeleteTarget(null)}
          className="max-w-sm"
        >
          <p className="text-sm text-gray-600">
            Maskot ini akan dihapus dari koleksi.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={mascotBusyId === deleteTarget.id}
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border px-3 py-2 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={mascotBusyId === deleteTarget.id}
              onClick={deleteMascot}
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {mascotBusyId === deleteTarget.id ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        </Modal>
      )}
      {addAdminOpen && (
        <AdminPasswordModal
          title="Tambah Admin"
          form={adminForm}
          error={adminFormError}
          saving={adminBusyId === "create"}
          submitLabel="Tambah Admin"
          onClose={() => !adminBusyId && closeAdminModal()}
          onChange={setAdminForm}
          onSubmit={createAdmin}
          showEmail
        />
      )}
      {resetAdminTarget && (
        <AdminPasswordModal
          title="Reset Password Admin"
          accountEmail={resetAdminTarget.email}
          form={adminForm}
          error={adminFormError}
          saving={adminBusyId === resetAdminTarget.id}
          submitLabel="Simpan Password Baru"
          onClose={() => !adminBusyId && closeAdminModal()}
          onChange={setAdminForm}
          onSubmit={resetAdminPassword}
        />
      )}
      {deleteAdminTarget && (
        <Modal
          title="Hapus akun Admin?"
          onClose={() => !adminBusyId && closeAdminModal()}
          className="max-w-sm"
        >
          <p className="text-sm text-gray-600">
            Akun tidak lagi dapat masuk ke dashboard Admin. Riwayat aktivitasnya
            tetap disimpan.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAdminModal}
              className="rounded-md border px-3 py-2 text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={adminBusyId === deleteAdminTarget.id}
              onClick={deleteAdmin}
              className="rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {adminBusyId === deleteAdminTarget.id
                ? "Menghapus..."
                : "Hapus Admin"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function AdminPasswordModal({
  title,
  accountEmail,
  form,
  error,
  saving,
  submitLabel,
  onClose,
  onChange,
  onSubmit,
  showEmail = false,
}: {
  title: string;
  accountEmail?: string;
  form: { email: string; password: string; confirmPassword: string };
  error: string;
  saving: boolean;
  submitLabel: string;
  onClose: () => void;
  onChange: (form: {
    email: string;
    password: string;
    confirmPassword: string;
  }) => void;
  onSubmit: () => void;
  showEmail?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} className="max-w-md">
      <div className="space-y-4">
        {accountEmail && (
          <p className="text-sm text-gray-600">
            Akun:{" "}
            <span className="font-medium text-gray-900">{accountEmail}</span>
          </p>
        )}
        {showEmail && (
          <label className="block text-xs font-medium text-gray-700">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                onChange({ ...form, email: event.target.value })
              }
              className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            />
          </label>
        )}
        <label className="block text-xs font-medium text-gray-700">
          {showEmail ? "Password Awal" : "Password Baru"}
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              onChange({ ...form, password: event.target.value })
            }
            className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-gray-700">
          {showEmail ? "Konfirmasi Password" : "Konfirmasi Password Baru"}
          <input
            type="password"
            value={form.confirmPassword}
            onChange={(event) =>
              onChange({ ...form, confirmPassword: event.target.value })
            }
            className="mt-1.5 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
          />
        </label>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border px-3 py-2 text-xs"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSubmit}
            className="rounded-md bg-navy-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : submitLabel}
          </button>
        </div>
      </div>
    </Modal>
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
