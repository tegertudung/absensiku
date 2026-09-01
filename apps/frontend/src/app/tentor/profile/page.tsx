"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import {
  IconBook,
  IconChevronRight,
  IconLogout,
  IconSettings,
} from "@/components/icons";

interface TutorProfile {
  name: string;
  title: string | null;
  user: { email: string };
  subjects: Array<{ id: string; name: string }>;
}

const roleLabel = (role?: string) =>
  ({ TENTOR: "Tentor", ADMIN: "Admin", PARENT: "Orang Tua" })[role || ""] ||
  role ||
  "-";

export default function TentorProfilePage() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [profile, setProfile] = useState<TutorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get("/tutors/me");
      setProfile(response.data.data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function handleChangePassword() {
    setPwError(null);
    setPwSuccess(null);
    if (pwForm.newPassword.length < 6)
      return setPwError("Password baru minimal 6 karakter.");
    if (pwForm.newPassword !== pwForm.confirmPassword)
      return setPwError("Konfirmasi password tidak cocok.");
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess("Password berhasil diubah.");
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setShowPasswordForm(false), 1200);
    } catch (error: any) {
      setPwError(error.response?.data?.message || "Gagal mengubah password.");
    } finally {
      setPwSaving(false);
    }
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const initial = (profile?.name || user?.email || "T")
    .trim()
    .charAt(0)
    .toUpperCase();
  const subjects =
    profile?.subjects.map((subject) => subject.name).join(", ") ||
    "Belum ada mata pelajaran dari jadwal aktif.";
  const accountRows = [
    ["Nama", profile?.name || "-"],
    ["Email", profile?.user.email || user?.email || "-"],
    ["Peran", roleLabel(user?.role)],
  ];

  return (
    <div className="mx-auto w-full max-w-md space-y-6 pb-8">
      <h1 className="text-[22px] font-bold tracking-tight text-navy-900">
        Profil Saya
      </h1>

      {loadError ? (
        <section className="rounded-2xl border border-red-200 bg-white p-5 text-center">
          <p className="text-sm text-red-700">Gagal memuat profil.</p>
          <button
            type="button"
            onClick={loadProfile}
            className="mt-3 min-h-11 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white"
          >
            Coba Lagi
          </button>
        </section>
      ) : (
        <>
          <section className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white px-5 py-7 text-center shadow-sm">
            <span
              aria-hidden="true"
              className="absolute -left-14 -top-14 h-36 w-36 rounded-full bg-navy-50"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-20 -right-12 h-40 w-40 rounded-full bg-blue-50"
            />
            <span
              aria-hidden="true"
              className="absolute right-6 top-16 grid grid-cols-3 gap-1.5 opacity-60"
            >
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
              <i className="h-1.5 w-1.5 rounded-full bg-blue-200" />
            </span>
            <div className="relative">
              <div
                className={`mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-navy-900 text-3xl font-bold text-white ${loading ? "animate-pulse" : ""}`}
              >
                {loading ? "" : initial}
              </div>
              <div className="mx-auto mt-4 h-6 max-w-[15rem] rounded bg-gray-100 px-2 text-[21px] font-bold text-navy-900">
                <span className={loading ? "invisible" : ""}>
                  {profile?.name || user?.email || "-"}
                </span>
              </div>
              <span className="mt-3 inline-flex rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-800">
                {roleLabel(user?.role)}
              </span>
              <p
                className={`mx-auto mt-3 max-w-[18rem] break-words text-[13px] text-gray-500 ${loading ? "h-4 animate-pulse rounded bg-gray-100 text-transparent" : ""}`}
              >
                {profile?.user.email || user?.email}
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-navy-900">
              Informasi Mengajar
            </h2>
            <div className="flex min-h-[82px] items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-800">
                <IconBook className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">
                  Mata Pelajaran
                </p>
                <p
                  className={`mt-1 break-words text-sm text-gray-500 ${loading ? "h-4 w-36 animate-pulse rounded bg-gray-100 text-transparent" : ""}`}
                >
                  {subjects}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-navy-900">
              Informasi Akun
            </h2>
            <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white px-4 shadow-sm">
              {accountRows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-h-[58px] flex-col justify-center gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="text-sm text-gray-500">{label}</span>
                  <span
                    className={`break-all text-sm font-medium text-navy-900 sm:max-w-[65%] sm:text-right ${loading ? "h-4 w-32 animate-pulse rounded bg-gray-100 text-transparent" : ""}`}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-semibold text-navy-900">
              Pengaturan Akun
            </h2>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowPasswordForm((value) => !value)}
                aria-expanded={showPasswordForm}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-navy-900 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-700"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 text-navy-800">
                  <IconSettings className="h-5 w-5" />
                </span>
                <span className="flex-1">Ubah Password</span>
                <IconChevronRight
                  className={`h-5 w-5 text-gray-400 transition-transform ${showPasswordForm ? "rotate-90" : ""}`}
                />
              </button>
              {showPasswordForm && (
                <div className="border-t border-gray-100 px-4 py-4">
                  <div className="space-y-3">
                    {pwError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                      >
                        {pwError}
                      </p>
                    )}
                    {pwSuccess && (
                      <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                        {pwSuccess}
                      </p>
                    )}
                    <input
                      aria-label="Password saat ini"
                      type="password"
                      placeholder="Password saat ini"
                      value={pwForm.currentPassword}
                      onChange={(event) =>
                        setPwForm({
                          ...pwForm,
                          currentPassword: event.target.value,
                        })
                      }
                      className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
                    />
                    <input
                      aria-label="Password baru"
                      type="password"
                      placeholder="Password baru (min. 6 karakter)"
                      value={pwForm.newPassword}
                      onChange={(event) =>
                        setPwForm({
                          ...pwForm,
                          newPassword: event.target.value,
                        })
                      }
                      className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
                    />
                    <input
                      aria-label="Konfirmasi password baru"
                      type="password"
                      placeholder="Konfirmasi password baru"
                      value={pwForm.confirmPassword}
                      onChange={(event) =>
                        setPwForm({
                          ...pwForm,
                          confirmPassword: event.target.value,
                        })
                      }
                      className="min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-100"
                    />
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={pwSaving}
                      className="min-h-11 w-full rounded-xl bg-navy-900 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {pwSaving ? "Menyimpan..." : "Simpan Password Baru"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar dari Akun"
              className="inline-flex min-h-[50px] w-[82%] items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-red-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            >
              <IconLogout className="h-5 w-5" />
              Keluar dari Akun
            </button>
          </div>
        </>
      )}
    </div>
  );
}
