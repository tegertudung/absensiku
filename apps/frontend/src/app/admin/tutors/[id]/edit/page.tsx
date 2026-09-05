"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import SectionCard from "@/components/SectionCard";

type Subject = { id: string; name: string; isActive: boolean };
type Tutor = {
  id: string;
  tutorCode: string;
  name: string;
  title: string | null;
  phone: string | null;
  user: { email: string };
  subjects: { subject: { id: string; name: string } }[];
};

function toLocalPhone(phone: string | null) {
  const value = phone || "";
  return value.startsWith("+62")
    ? `0${value.slice(3).replace(/^0+/, "")}`
    : value.replace(/\D/g, "");
}

export default function EditTutorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectQuery, setSubjectQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    title: "",
    phone: "",
    subjectIds: [] as string[],
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const [tutorRes, subjectsRes] = await Promise.all([
          api.get(`/tutors/${id}`),
          api.get("/subjects"),
        ]);
        const loadedTutor = tutorRes.data.data as Tutor;
        setTutor(loadedTutor);
        setSubjects(
          subjectsRes.data.data.filter((subject: Subject) => subject.isActive),
        );
        setForm({
          name: loadedTutor.name,
          title: loadedTutor.title || "",
          phone: toLocalPhone(loadedTutor.phone),
          subjectIds: loadedTutor.subjects.map((item) => item.subject.id),
        });
      } catch {
        setError("Gagal memuat data tentor.");
      }
    }
    load();
  }, [id]);

  const visibleSubjects = useMemo(
    () =>
      subjects.filter((subject) =>
        subject.name.toLowerCase().includes(subjectQuery.toLowerCase()),
      ),
    [subjectQuery, subjects],
  );

  function toggleSubject(subjectId: string) {
    setForm((current) => ({
      ...current,
      subjectIds: current.subjectIds.includes(subjectId)
        ? current.subjectIds.filter((item) => item !== subjectId)
        : [...current.subjectIds, subjectId],
    }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError("Nama tentor wajib diisi.");
    if (!form.phone) return setError("Nomor telepon wajib diisi.");
    if (form.phone.length < 10 || form.phone.length > 13)
      return setError("Nomor telepon harus terdiri dari 10–13 digit angka.");
    if (!form.subjectIds.length)
      return setError("Pilih minimal satu mata pelajaran.");

    setSaving(true);
    setError("");
    try {
      await api.put(`/tutors/${id}`, {
        name: form.name.trim(),
        title: form.title || undefined,
        phone: form.phone,
        subjectIds: form.subjectIds,
      });
      router.push(`/admin/tutors/${id}`);
      router.refresh();
    } catch (requestError: any) {
      setError(
        requestError.response?.data?.message || "Gagal memperbarui tentor.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitResetPassword(event: React.FormEvent) {
    event.preventDefault();
    setResetError("");
    if (resetPassword.length < 6)
      return setResetError("Password minimal 6 karakter.");
    if (resetPassword !== confirmPassword)
      return setResetError("Konfirmasi password tidak cocok.");
    setResetSaving(true);
    try {
      await api.patch(`/tutors/${id}/password`, { newPassword: resetPassword });
      setShowReset(false);
      setResetPassword("");
      setConfirmPassword("");
      setResetSuccess("Password tentor berhasil direset.");
    } catch (requestError: any) {
      setResetError(
        requestError.response?.data?.message ||
          "Gagal mereset password tentor.",
      );
    } finally {
      setResetSaving(false);
    }
  }

  if (!tutor && !error)
    return <p className="text-sm text-gray-400">Memuat...</p>;
  if (!tutor) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="Edit Tentor"
        description="Perbarui profil dan mata pelajaran yang dapat diajar oleh tentor."
      />
      <SectionCard title="Informasi Tentor">
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Nama *">
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className="h-10 w-full rounded-lg border px-3 text-sm"
            />
          </FormField>
          <FormField label="Kode Tentor">
            <input
              value={tutor.tutorCode}
              disabled
              className="h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm text-gray-500"
            />
          </FormField>
          <FormField label="Gelar (opsional)">
            <input
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              className="h-10 w-full rounded-lg border px-3 text-sm"
            />
          </FormField>
          <FormField label="No. Telepon *">
            <input
              value={form.phone}
              onChange={(event) =>
                setForm({
                  ...form,
                  phone: event.target.value.replace(/\D/g, ""),
                })
              }
              inputMode="numeric"
              pattern="[0-9]*"
              className="h-10 w-full rounded-lg border px-3 text-sm"
            />
          </FormField>
          <FormField label="Email *">
            <input
              value={tutor.user.email}
              disabled
              className="h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Email tidak dapat diubah melalui pengaturan profil tentor.
            </p>
          </FormField>
          <div>
            <label className="text-sm font-medium">
              Mata Pelajaran yang Diajar *
            </label>
            <input
              value={subjectQuery}
              onChange={(event) => setSubjectQuery(event.target.value)}
              placeholder="Cari mata pelajaran..."
              className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
            />
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border">
              {visibleSubjects.length ? (
                visibleSubjects.map((subject) => (
                  <label
                    key={subject.id}
                    className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={form.subjectIds.includes(subject.id)}
                      onChange={() => toggleSubject(subject.id)}
                    />
                    {subject.name}
                  </label>
                ))
              ) : (
                <p className="p-3 text-sm text-gray-500">
                  Mata pelajaran tidak ditemukan.
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {form.subjectIds.length} mata pelajaran dipilih.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              disabled={saving}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Batal
            </button>
            <button
              disabled={saving}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </SectionCard>
      <SectionCard
        title="Keamanan Akun"
        description="Kelola akses login tanpa mengubah profil tentor."
      >
        <div className="space-y-4">
          {resetSuccess && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {resetSuccess}
            </p>
          )}
          <FormField label="Email Akun">
            <input
              value={tutor.user.email}
              disabled
              className="h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm text-gray-500"
            />
          </FormField>
          <FormField label="Password">
            <input
              value="••••••••••••"
              disabled
              className="h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm text-gray-500"
            />
          </FormField>
          <button
            type="button"
            onClick={() => {
              setResetError("");
              setShowReset(true);
            }}
            className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-800 hover:bg-navy-50"
          >
            Reset Password
          </button>
        </div>
      </SectionCard>
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={submitResetPassword}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Reset Password Tentor
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Atur password baru untuk {tutor.name}.
            </p>
            <div className="mt-5 space-y-4">
              <FormField label="Password Baru *">
                <input
                  autoFocus
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  disabled={resetSaving}
                  className="h-10 w-full rounded-lg border px-3 text-sm"
                />
              </FormField>
              <FormField label="Konfirmasi Password Baru *">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={resetSaving}
                  className="h-10 w-full rounded-lg border px-3 text-sm"
                />
              </FormField>
              {resetError && (
                <p className="text-sm text-red-600">{resetError}</p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !resetSaving && setShowReset(false)}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                disabled={resetSaving}
                className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {resetSaving ? "Mereset..." : "Reset Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
