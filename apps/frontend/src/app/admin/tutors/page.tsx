"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";
import EmptyState from "@/components/EmptyState";
import AdminTableActions from "@/components/TableActionMenu";
import ImportModal from "@/components/ImportModal";
import { IconPlus, IconSearch } from "@/components/icons";
type Subject = { id: string; name: string; isActive: boolean };
type TutorSubject = { subject: Pick<Subject, "id" | "name"> };
type Tutor = {
  id: string;
  tutorCode: string;
  name: string;
  phone: string | null;
  title: string | null;
  subjects: TutorSubject[];
  user: { email: string; isActive: boolean; lastLogin: string | null };
};
const initial = {
  name: "",
  title: "",
  phone: "",
  email: "",
  subjectIds: [] as string[],
};
export default function AdminTutorsPage() {
  const [tutors, setTutors] = useState<Tutor[]>([]),
    [subjects, setSubjects] = useState<Subject[]>([]),
    [loading, setLoading] = useState(true),
    [subjectLoading, setSubjectLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [form, setForm] = useState(initial),
    [query, setQuery] = useState(""),
    [formError, setFormError] = useState(""),
    [saving, setSaving] = useState(false),
    [removing, setRemoving] = useState<Tutor | null>(null),
    [deleteError, setDeleteError] = useState(""),
    [deleting, setDeleting] = useState(false),
    [deleteSuccess, setDeleteSuccess] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [createdAccount, setCreatedAccount] = useState<{
      email: string;
      temporaryPassword: string;
      action: "CREATED" | "RESTORED" | "RESET";
    } | null>(null),
    [passwordCopied, setPasswordCopied] = useState(false),
    [restoreCandidate, setRestoreCandidate] = useState<{
      tutorId: string;
      email: string;
      profile: typeof initial;
    } | null>(null),
    [restoring, setRestoring] = useState(false),
    [restoreError, setRestoreError] = useState(""),
    [resetTarget, setResetTarget] = useState<Tutor | null>(null),
    [resettingPassword, setResettingPassword] = useState(false),
    [resetError, setResetError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTutors((await api.get("/tutors")).data.data);
    } catch {
      setError("Gagal memuat data tentor.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function openCreate() {
    setForm(initial);
    setFormError("");
    setOpen(true);
    setSubjectLoading(true);
    try {
      setSubjects(
        (await api.get("/subjects")).data.data.filter(
          (s: Subject) => s.isActive,
        ),
      );
    } catch {
      setFormError("Gagal memuat mata pelajaran.");
    } finally {
      setSubjectLoading(false);
    }
  }
  function toggle(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id)
        ? f.subjectIds.filter((x) => x !== id)
        : [...f.subjectIds, id],
    }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim() || !form.email)
      return setFormError("Nama dan email wajib diisi.");
    if (!form.phone) return setFormError("Nomor telepon wajib diisi.");
    if (form.phone.length < 10 || form.phone.length > 13)
      return setFormError(
        "Nomor telepon harus terdiri dari 10–13 digit angka.",
      );
    if (!form.subjectIds.length)
      return setFormError("Pilih minimal satu mata pelajaran.");
    setSaving(true);
    try {
      const response = await api.post("/tutors", form);
      setOpen(false);
      setCreatedAccount({
        email: response.data.data.tutor.user?.email || form.email,
        temporaryPassword: response.data.data.temporaryPassword,
        action: "CREATED",
      });
      setPasswordCopied(false);
      setForm(initial);
      await load();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.code === "TUTOR_ARCHIVED" && data?.details?.tutorId) {
        setRestoreCandidate({
          tutorId: data.details.tutorId,
          email: form.email,
          profile: { ...form },
        });
        setRestoreError("");
        setOpen(false);
      } else {
        setFormError(data?.message || "Gagal menambah tentor.");
      }
    } finally {
      setSaving(false);
    }
  }
  async function restoreArchivedTutor() {
    if (!restoreCandidate) return;
    setRestoring(true);
    setRestoreError("");
    try {
      const { email: _email, ...profile } = restoreCandidate.profile;
      const response = await api.post(
        `/tutors/${restoreCandidate.tutorId}/restore`,
        profile,
      );
      setCreatedAccount({
        email: response.data.data.tutor.user?.email || restoreCandidate.email,
        temporaryPassword: response.data.data.temporaryPassword,
        action: "RESTORED",
      });
      setPasswordCopied(false);
      setRestoreCandidate(null);
      setForm(initial);
      await load();
    } catch (err: any) {
      setRestoreError(
        err.response?.data?.message || "Gagal memulihkan akun Tentor.",
      );
    } finally {
      setRestoring(false);
    }
  }
  async function removeTutor() {
    if (!removing) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete(`/tutors/${removing.id}`);
      setRemoving(null);
      setDeleteSuccess(
        `${removing.name} berhasil dihapus dari daftar pengajar aktif.`,
      );
      await load();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || "Gagal menghapus tentor.");
    } finally {
      setDeleting(false);
    }
  }
  async function resetTutorPassword() {
    if (!resetTarget) return;
    setResettingPassword(true);
    setResetError("");
    try {
      const response = await api.patch(`/tutors/${resetTarget.id}/password`);
      setCreatedAccount({
        email: resetTarget.user.email,
        temporaryPassword: response.data.data.temporaryPassword,
        action: "RESET",
      });
      setPasswordCopied(false);
      setResetTarget(null);
    } catch (err: any) {
      setResetError(
        err.response?.data?.message || "Gagal mereset password Tentor.",
      );
    } finally {
      setResettingPassword(false);
    }
  }
  const visible = useMemo(
    () =>
      tutors.filter((t) =>
        `${t.tutorCode} ${t.name} ${t.user.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [tutors, query],
  );
  const selected = subjects.filter((s) => form.subjectIds.includes(s.id));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tentor"
        description="Kelola data dan informasi pengajar Pioneer Class."
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Import Data
            </button>
            <button
              onClick={openCreate}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"
            >
              <IconPlus className="h-4 w-4" />
              Tambah Tentor
            </button>
          </div>
        }
      />
      <SectionCard
        title="Data Tentor"
        description={`${tutors.length} tentor terdaftar.`}
      >
        {deleteSuccess && (
          <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {deleteSuccess}
          </p>
        )}
        {error ? (
          <EmptyState message={error} />
        ) : (
          <>
            <div className="relative mb-4">
              <IconSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari kode, nama, atau email tentor"
                className="h-10 w-full rounded-lg border pl-9 pr-3 text-sm"
              />
            </div>
            {loading ? (
              <p className="py-8 text-center text-sm text-gray-400">
                Memuat...
              </p>
            ) : !visible.length ? (
              <EmptyState
                title="Belum ada tentor"
                message="Tambahkan tentor untuk mulai mengelola pengajar."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-gray-500">
                    <tr>
                      <th className="p-3">Tentor</th>
                      <th>Email</th>
                      <th>No. Telepon</th>
                      <th>Login Terakhir</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr
                        key={t.id}
                        className="border-t border-gray-100 hover:bg-slate-50/70"
                      >
                        <td className="p-3 font-medium">
                          <span className="block text-xs font-semibold text-navy-700">
                            {t.tutorCode}
                          </span>
                          {t.name}
                        </td>
                        <td>{t.user.email}</td>
                        <td>{t.phone || "-"}</td>
                        <td>
                          {t.user.lastLogin
                            ? new Intl.DateTimeFormat("id-ID", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(t.user.lastLogin))
                            : "Belum pernah login"}
                        </td>
                        <td className="p-3 text-right">
                          <AdminTableActions
                            ariaLabel={`Menu aksi untuk ${t.name}`}
                            detailHref={`/admin/tutors/${t.id}`}
                            editHref={`/admin/tutors/${t.id}/edit`}
                            overflowActions={[
                              {
                                label: "Reset Password",
                                onClick: () => {
                                  setResetError("");
                                  setResetTarget(t);
                                },
                              },
                              {
                                label: "Hapus Tentor",
                                tone: "destructive",
                                dividerBefore: true,
                                onClick: () => {
                                  setDeleteError("");
                                  setRemoving(t);
                                },
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </SectionCard>
      {open && (
        <Modal title="Tambah Tentor" onClose={() => !saving && setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Input
              label="Nama *"
              value={form.name}
              change={(v) => setForm({ ...form, name: v })}
            />
            <Input
              label="Gelar (opsional)"
              value={form.title}
              change={(v) => setForm({ ...form, title: v })}
            />
            <Input
              label="No. Telepon *"
              value={form.phone}
              numeric
              change={(phone) => setForm({ ...form, phone })}
            />
            <Input
              label="Email *"
              value={form.email}
              type="email"
              change={(v) => setForm({ ...form, email: v })}
            />
            <div>
              <label className="text-sm font-medium">
                Mata Pelajaran yang Diajar *
              </label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari mata pelajaran..."
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
              <div className="mt-2 max-h-36 overflow-y-auto rounded border">
                {subjectLoading ? (
                  <p className="p-3 text-sm text-gray-400">
                    Memuat mata pelajaran...
                  </p>
                ) : subjects.length ? (
                  subjects
                    .filter((s) =>
                      s.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 border-b px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.subjectIds.includes(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        {s.name}
                      </label>
                    ))
                ) : (
                  <p className="p-3 text-sm text-gray-500">
                    Belum ada mata pelajaran. Tambahkan melalui Kelas & Mapel
                    terlebih dahulu.
                  </p>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {selected.length
                  ? selected.map((s) => s.name).join(", ")
                  : "Belum ada mata pelajaran dipilih."}
              </p>
            </div>
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Sistem akan membuat password sementara acak dan menampilkannya
              satu kali setelah akun berhasil dibuat.
            </p>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={saving || subjectLoading}
                className="rounded bg-navy-900 px-4 py-2 text-sm text-white"
              >
                {saving ? "Menyimpan..." : "Simpan Tentor"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {createdAccount && (
        <Modal
          title={
            createdAccount.action === "RESTORED"
              ? "Tentor berhasil dipulihkan"
              : createdAccount.action === "RESET"
                ? "Password berhasil direset"
                : "Akun tentor berhasil dibuat"
          }
          onClose={() => setCreatedAccount(null)}
        >
          <div className="space-y-4 text-sm">
            <p className="text-gray-600">
              Password sementara baru ini hanya ditampilkan sekali. Simpan dan
              bagikan kepada Tentor secara aman.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">{createdAccount.email}</p>
              <p className="mt-2 break-all font-mono text-base font-semibold text-navy-900">
                {createdAccount.temporaryPassword}
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Tentor wajib mengganti password saat login pertama.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    createdAccount.temporaryPassword,
                  );
                  setPasswordCopied(true);
                }}
                className="rounded border px-4 py-2"
              >
                {passwordCopied ? "Tersalin" : "Salin Password"}
              </button>
              <button
                type="button"
                onClick={() => setCreatedAccount(null)}
                className="rounded bg-navy-900 px-4 py-2 text-white"
              >
                Selesai
              </button>
            </div>
          </div>
        </Modal>
      )}
      {resetTarget && (
        <Modal
          title="Reset Password Tentor?"
          onClose={() => !resettingPassword && setResetTarget(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Sistem akan membuat password sementara baru. Password sebelumnya
              dan seluruh sesi login Tentor akan dinonaktifkan. Tentor wajib
              mengganti password setelah login.
            </p>
            {resetError && <p className="text-red-600">{resetError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={resettingPassword}
                onClick={() => setResetTarget(null)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={resettingPassword}
                onClick={resetTutorPassword}
                className="rounded bg-navy-900 px-4 py-2 text-white disabled:opacity-60"
              >
                {resettingPassword ? "Mereset..." : "Reset Password"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {restoreCandidate && (
        <Modal
          title="Tentor pernah terdaftar"
          onClose={() => !restoring && setRestoreCandidate(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Akun dengan email ini pernah dihapus. Apakah Anda ingin memulihkan
              akun Tentor tersebut?
            </p>
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Riwayat mengajar dan honor tetap dipertahankan. Sistem akan
              membuat password sementara baru yang hanya ditampilkan sekali.
            </p>
            {restoreError && <p className="text-red-600">{restoreError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreCandidate(null)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={restoreArchivedTutor}
                className="rounded bg-navy-900 px-4 py-2 text-white disabled:opacity-60"
              >
                {restoring ? "Memulihkan..." : "Pulihkan Tentor"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {removing && (
        <Modal
          title="Hapus Tentor"
          onClose={() => !deleting && setRemoving(null)}
        >
          <div className="space-y-4 text-sm text-gray-600">
            <p>
              Anda akan menghapus <strong>{removing.name}</strong> dari daftar
              pengajar aktif.
            </p>
            <p>
              Tentor tidak dapat menerima jadwal baru atau mengakses sistem
              setelah dihapus. Riwayat mengajar, validasi, rekap honor, dan slip
              yang telah tercatat tetap disimpan.
            </p>
            {deleteError && <p className="text-red-600">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setRemoving(null)}
                className="rounded border px-4 py-2"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={removeTutor}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {deleting ? "Menghapus..." : "Hapus Tentor"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {importOpen && (
        <ImportModal
          title="Import Data Tentor"
          instructions='File harus berformat .xlsx dengan kolom: Nama, Gelar, No.Telepon, Email, Mata Pelajaran yang diajar. Untuk lebih dari satu mata pelajaran, pisahkan dengan koma (contoh: "Matematika, Fisika"). Password sementara acak untuk setiap akun akan ditampilkan satu kali setelah import.'
          columns={[
            { key: "name", label: "Nama" },
            { key: "title", label: "Gelar" },
            { key: "phone", label: "No.Telepon" },
            { key: "email", label: "Email" },
            { key: "subjectNames", label: "Mata Pelajaran" },
          ]}
          previewUrl="/tutors/import/preview"
          commitUrl="/tutors/import"
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
function Input({
  label,
  value,
  change,
  type = "text",
  numeric = false,
}: {
  label: string;
  value: string;
  change: (v: string) => void;
  type?: string;
  numeric?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) =>
          change(numeric ? e.target.value.replace(/\D/g, "") : e.target.value)
        }
        inputMode={numeric ? "numeric" : undefined}
        pattern={numeric ? "[0-9]*" : undefined}
        className="mt-1 h-10 w-full rounded border px-3"
      />
    </label>
  );
}
