"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import NotificationBell from "@/components/NotificationBell";
import { useAuthStore } from "@/store/authStore";
import {
  IconHome,
  IconSchedule,
  IconReport,
  IconStudent,
  IconPlus,
} from "@/components/icons";
import { assetUrl } from "@/lib/api";
import { useSystemIdentityStore } from "@/store/systemIdentityStore";

const NAV_ITEMS = [
  { href: "/tentor", label: "Beranda", icon: IconHome },
  { href: "/tentor/schedule", label: "Jadwal", icon: IconSchedule },
  { href: "/tentor/recap", label: "Rekap", icon: IconReport },
  { href: "/tentor/profile", label: "Profil", icon: IconStudent },
];

export default function TentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const identity = useSystemIdentityStore((state) => state.identity);
  const loadIdentity = useSystemIdentityStore((state) => state.load);
  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);
  const isPrivateScheduleForm = pathname === "/tentor/private/new";
  // Print-preview document (Slip Honor) — same reasoning as admin's honor
  // slip / student letter print routes: no app chrome, or window.print()
  // captures the header/bottom nav along with the document.
  const isSlipPrint = pathname === "/tentor/recap/slip";

  // First login on a default/reset password: force the change-password
  // screen before anything else in the app is reachable.
  const forcedPasswordChange = Boolean(user?.mustChangePassword);
  useEffect(() => {
    if (forcedPasswordChange && pathname !== "/tentor/profile") {
      router.replace("/tentor/profile?forced=1");
    }
  }, [forcedPasswordChange, pathname, router]);

  // Split nav items around the center FAB slot (Beranda, Jadwal | + | Rekap, Profil)
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <RequireAuth role="TENTOR">
      <div className="min-h-screen bg-canvas flex flex-col">
        {!isPrivateScheduleForm && !isSlipPrint && (
          <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3.5 backdrop-blur">
            <div className="mx-auto flex max-w-md items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-navy-900 shadow-sm">
                  <img
                    src="/logo.png"
                    alt="Logo sistem"
                    className="h-full w-full object-cover"
                  />
                  {identity.logoPath && (
                    <img
                      src={assetUrl(identity.logoPath) || undefined}
                      alt="Logo sistem"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>
                <p className="text-sm font-semibold tracking-tight text-navy-900">
                  {identity.systemName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <NotificationBell href="/tentor/notifications" />
                <button
                  onClick={async () => {
                    await logout();
                    router.push("/login");
                  }}
                  className="min-h-9 rounded-lg px-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50"
                >
                  Keluar
                </button>
              </div>
            </div>
          </header>
        )}

        <main
          className={
            isSlipPrint
              ? ""
              : `flex-1 px-4 py-4 ${isPrivateScheduleForm || forcedPasswordChange ? "" : "pb-28"}`
          }
        >
          {children}
        </main>

        {!isPrivateScheduleForm && !isSlipPrint && !forcedPasswordChange && (
          <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(15,40,70,0.04)] backdrop-blur">
            {left.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${
                    active ? "text-navy-900 font-medium" : "text-gray-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            {/* Floating "+" FAB — record a completed manual teaching session. */}
            <div className="w-16 flex items-center justify-center relative">
              <Link
                href="/tentor/sessions/direct"
                aria-label="Catat Sesi Mengajar"
                className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-navy-900 text-white shadow-lg transition hover:bg-navy-800"
              >
                <IconPlus className="w-6 h-6" />
              </Link>
            </div>

            {right.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${
                    active ? "text-navy-900 font-medium" : "text-gray-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </RequireAuth>
  );
}
