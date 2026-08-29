'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { IconLogout } from '@/components/icons';

interface TutorProfile {
  name: string;
  phone: string | null;
  title: string | null;
  user: { email: string };
  subjects: Array<{ id: string; name: string }>;
}

export default function TentorProfilePage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [totalCompleted, setTotalCompleted] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/tutors/me'), api.get('/dashboard/tentor')])
      .then(([profileRes, dashRes]) => {
        setProfile(profileRes.data.data);
        setTotalCompleted(dashRes.data.data.totalCompletedSessions);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleChangePassword() {
    setPwError(null);
    setPwSuccess(null);
    if (pwForm.newPassword.length < 6) return setPwError('Password baru minimal 6 karakter.');
    if (pwForm.newPassword !== pwForm.confirmPassword) return setPwError('Konfirmasi password tidak cocok.');

    setPwSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Password berhasil diubah.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowPasswordForm(false), 1200);
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Gagal mengubah password.');
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400">Memuat...</p>;

  const initial = (profile?.name || 'T').slice(0, 1).toUpperCase();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-navy-900 text-white flex items-center justify-center text-xl font-semibold">
          {initial}
        </div>
        <p className="text-base font-semibold text-gray-900 mt-3">{profile?.name || 'Tentor'}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-[11px] font-medium text-navy-800">
            {profile?.title || 'Tentor'}
          </span>
        </div>
        {profile?.phone && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{profile.phone}</div>
        )}
        <p className="mt-2 text-xs text-gray-400">{profile?.user.email}</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-xs text-gray-500">Total Sesi Selesai</p>
        <p className="text-2xl font-semibold text-gray-900 mt-1">{totalCompleted ?? '-'}</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Mata Pelajaran</h2>
        <p className="text-xs text-gray-500 mb-3">Subjek yang Anda ajarkan berdasarkan jadwal aktif.</p>
        {profile?.subjects.length ? (
          <div className="grid grid-cols-2 gap-2">
            {profile.subjects.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-800">
                {s.name}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Belum ada mata pelajaran dari jadwal aktif.</p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Pengaturan Akun</h2>
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          <button
            onClick={() => setShowPasswordForm((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left text-sm text-gray-800"
          >
            Ubah Password
            <span className="text-gray-400">{showPasswordForm ? '︿' : '﹀'}</span>
          </button>
          {showPasswordForm && (
            <div className="px-4 py-4 space-y-3">
              {pwError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{pwSuccess}</p>}
              <input
                type="password"
                placeholder="Password saat ini"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              <input
                type="password"
                placeholder="Password baru (min. 6 karakter)"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              <input
                type="password"
                placeholder="Konfirmasi password baru"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
              />
              <button
                onClick={handleChangePassword}
                disabled={pwSaving}
                className="w-full rounded-lg bg-navy-900 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {pwSaving ? 'Menyimpan...' : 'Simpan Password Baru'}
              </button>
            </div>
          )}
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="w-full flex items-center gap-2 px-4 py-3.5 text-left text-sm font-medium text-red-600"
          >
            <IconLogout className="w-4 h-4" />
            Keluar Akun
          </button>
        </div>
      </div>
    </div>
  );
}
