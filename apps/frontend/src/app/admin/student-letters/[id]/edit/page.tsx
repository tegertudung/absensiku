"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api, { errorMessage } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
type Schedule = { date: string; startTime: string; endTime: string };
type Letter = { id: string; letterNumber: string; letterDate: string; studentName: string; studentNis: string; studentSchool: string; studentSchoolClass: string; programName: string; startDate: string; endDate: string; schedules: { meetingNumber: number; date: string; startTime: string; endTime: string }[] };
const toInputDate = (v: string) => v.slice(0, 10);
export default function EditStudentLetterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [letterNumber, setLetterNumber] = useState("");
  const [form, setForm] = useState({ studentNis: "", studentSchool: "", studentSchoolClass: "", letterDate: "", programName: "", startDate: "", endDate: "", schedules: [] as Schedule[] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/student-letters/${id}`);
      const letter: Letter = r.data.data;
      setStudentName(letter.studentName);
      setLetterNumber(letter.letterNumber);
      setForm({
        studentNis: letter.studentNis,
        studentSchool: letter.studentSchool,
        studentSchoolClass: letter.studentSchoolClass,
        letterDate: toInputDate(letter.letterDate),
        programName: letter.programName,
        startDate: toInputDate(letter.startDate),
        endDate: toInputDate(letter.endDate),
        schedules: letter.schedules.map((s) => ({ date: toInputDate(s.date), startTime: s.startTime, endTime: s.endTime })),
      });
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Surat tidak ditemukan."));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  function updateSchedule(index: number, key: keyof Schedule, value: string) {
    const schedules = [...form.schedules];
    schedules[index] = { ...schedules[index], [key]: value };
    setForm({ ...form, schedules });
  }
  const scheduleError = form.schedules.some((s) => !s.date || !s.startTime || !s.endTime || s.startTime >= s.endTime);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleError) return setError("Setiap baris jadwal wajib lengkap dan jam selesai harus setelah jam mulai.");
    setSaving(true);
    setError(null);
    try {
      await api.put(`/student-letters/${id}`, form);
      router.push(`/admin/student-letters/${id}`);
    } catch (cause) {
      setError(errorMessage(cause, "Gagal menyimpan perubahan surat."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="space-y-4"><div className="h-8 w-40 animate-pulse rounded bg-gray-200" /><div className="h-80 animate-pulse rounded-xl bg-gray-100" /></div>;

  return (
    <div>
      <nav className="mb-3 flex gap-2 text-xs text-gray-400">
        <span>Admin</span><span>/</span>
        <Link href="/admin/student-letters">Surat Siswa</Link><span>/</span>
        <Link href={`/admin/student-letters/${id}`}>Detail Surat</Link><span>/</span>
        <span className="text-gray-600">Edit</span>
      </nav>
      <button onClick={() => router.push(`/admin/student-letters/${id}`)} className="mb-3 text-xs text-blue-600">← Kembali ke Detail Surat</button>
      <PageHeader title="Edit Surat Siswa" description="Perbarui data surat keterangan. Nomor surat dan siswa tidak dapat diubah." />
      <form onSubmit={submit} className="space-y-4">
        <Card title="1. Informasi Surat">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nomor Surat"><input value={letterNumber} readOnly className="input bg-gray-50 text-gray-600" /></Field>
            <Field label="Tanggal Surat *"><input required type="date" value={form.letterDate} onChange={(e) => setForm({ ...form, letterDate: e.target.value })} className="input" /></Field>
          </div>
        </Card>
        <Card title="2. Data Siswa">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Siswa"><input value={studentName} readOnly className="input bg-gray-50" /></Field>
            <Field label="NIS *"><input required value={form.studentNis} onChange={(e) => setForm({ ...form, studentNis: e.target.value })} className="input" /></Field>
            <Field label="Sekolah *"><input required value={form.studentSchool} onChange={(e) => setForm({ ...form, studentSchool: e.target.value })} className="input" /></Field>
            <Field label="Kelas *"><input required value={form.studentSchoolClass} onChange={(e) => setForm({ ...form, studentSchoolClass: e.target.value })} className="input" /></Field>
          </div>
        </Card>
        <Card title="3. Program">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nama Program *"><input required value={form.programName} onChange={(e) => setForm({ ...form, programName: e.target.value })} className="input" /></Field>
            <Field label="Tanggal Mulai *"><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" /></Field>
            <Field label="Tanggal Selesai *"><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" /></Field>
          </div>
        </Card>
        <Card title="4. Jadwal Pertemuan">
          <p className="mb-3 text-xs text-gray-500">Ubah tanggal atau jam tiap pertemuan bila perlu (misalnya menyesuaikan tanggal merah).</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-500"><th className="p-2">No.</th><th className="p-2">Tanggal</th><th className="p-2">Jam Mulai</th><th className="p-2">Jam Selesai</th></tr></thead>
              <tbody>
                {form.schedules.map((s, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2"><input type="date" value={s.date} onChange={(e) => updateSchedule(i, "date", e.target.value)} className="input" /></td>
                    <td className="p-2"><input type="time" value={s.startTime} onChange={(e) => updateSchedule(i, "startTime", e.target.value)} className="input" /></td>
                    <td className="p-2">
                      <input type="time" value={s.endTime} onChange={(e) => updateSchedule(i, "endTime", e.target.value)} className="input" />
                      {s.startTime && s.endTime && s.startTime >= s.endTime && <p className="mt-1 text-xs text-red-700">Harus setelah jam mulai.</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-between border-t border-gray-200 pt-4">
          <Link href={`/admin/student-letters/${id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Batal</Link>
          <button disabled={saving || scheduleError} className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan Perubahan"}</button>
        </div>
      </form>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><h2 className="mb-4 text-sm font-semibold text-navy-900">{title}</h2>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-gray-700">{label}{children}</label>; }
