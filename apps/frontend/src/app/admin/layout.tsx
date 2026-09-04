"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { assetUrl } from "@/lib/api";
import { useSystemIdentityStore } from "@/store/systemIdentityStore";
import {
  IconDashboard,
  IconStudent,
  IconTutor,
  IconClasses,
  IconPrivate,
  IconParent,
  IconSchedule,
  IconReport,
  IconSettings,
  IconBell,
  IconMenu,
  IconX,
  IconLogout,
} from "@/components/icons";

const PAGE_CONTEXT: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/tutors": "Tentor",
  "/admin/students": "Data Siswa",
  "/admin/parents": "Orang Tua",
  "/admin/classes": "Kelas & Mapel",
  "/admin/schedules": "Jadwal",
  "/admin/validations": "Validasi",
  "/admin/recap": "Rekap & Honor",
  "/admin/honor-rates": "Program",
  "/admin/audit-log": "Audit Log",
  "/admin/settings": "Pengaturan",
  "/admin/student-letters": "Surat Siswa",
};

// NOTE: only the "Orang Tua" entry is new here — everything else is
// untouched, existing admin navigation.
const NAV_ITEMS = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: IconDashboard,
    section: null,
  },
  {
    href: "/admin/tutors",
    label: "Tentor",
    icon: IconTutor,
    section: "AKADEMIK",
  },
  {
    href: "/admin/students",
    label: "Siswa",
    icon: IconStudent,
    section: "AKADEMIK",
  },
  {
    href: "/admin/parents",
    label: "Orang Tua",
    icon: IconParent,
    section: "AKADEMIK",
  },
  {
    href: "/admin/classes",
    label: "Kelas & Mapel",
    icon: IconClasses,
    section: "AKADEMIK",
  },
  {
    href: "/admin/schedules",
    label: "Jadwal",
    icon: IconSchedule,
    section: "AKADEMIK",
  },
  {
    href: "/admin/validations",
    label: "Validasi",
    icon: IconPrivate,
    section: "AKADEMIK",
  },
  {
    href: "/admin/student-letters",
    label: "Surat Siswa",
    icon: IconReport,
    section: "ADMINISTRASI",
  },
  {
    href: "/admin/recap",
    label: "Rekap & Honor",
    icon: IconReport,
    section: "LAPORAN",
  },
  {
    href: "/admin/honor-rates",
    label: "Program",
    icon: IconReport,
    section: "LAPORAN",
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    icon: IconSettings,
    section: "LAPORAN",
  },
  {
    href: "/admin/settings",
    label: "Pengaturan",
    icon: IconSettings,
    section: "PENGATURAN",
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const identity = useSystemIdentityStore((state) => state.identity);
  const loadIdentity = useSystemIdentityStore((state) => state.load);
  const pageContext =
    PAGE_CONTEXT[pathname] ||
    (pathname.startsWith("/admin/students/") ? "Detail Siswa" : "Admin");

  // A printable letter is a standalone document. Keeping it under the admin
  // URL preserves authorization and links, but it must not inherit the visual
  // application shell (sidebar, topbar, dashboard padding) in either screen
  // preview or browser print.
  const isStudentLetterPrint = /^\/admin\/student-letters\/[^/]+\/print$/.test(pathname);

  useEffect(() => {
    api
      .get("/dashboard/admin")
      .then((res) => setPendingCount(res.data.data.pendingValidationsCount))
      .catch(() => {});
  }, [pathname]);
  useEffect(() => {
    loadIdentity();
  }, [loadIdentity]);

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  let lastSection: string | null = null;

  const navList = (
    <nav className="flex-1 py-3 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const showSection = item.section && item.section !== lastSection;
        lastSection = item.section;
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <div key={item.href}>
            {showSection && (
              <p className="px-5 pt-5 pb-2 text-[10px] font-semibold tracking-[0.14em] text-navy-300">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              className={`mx-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-white/12 text-white font-medium shadow-sm"
                  : "text-navy-200 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {item.label}
              </span>
              {item.href === "/admin/validations" && pendingCount > 0 && (
                <span className="text-[11px] bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {pendingCount}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );

  const accountFooter = (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <div className="w-9 h-9 rounded-full bg-navy-700 text-white flex items-center justify-center text-xs font-semibold shrink-0 ring-1 ring-white/10">
          {(user?.email || "A").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">
            {user?.email}
          </p>
          <p className="text-[11px] text-navy-300">ADMIN</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.push("/login");
          }}
          aria-label="Keluar"
          className="rounded-md p-1.5 text-navy-300 hover:bg-white/10 hover:text-white shrink-0"
        >
          <IconLogout className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (isStudentLetterPrint) {
    return <RequireAuth role="ADMIN">{children}</RequireAuth>;
  }

  return (
    <RequireAuth role="ADMIN">
      <div className="min-h-screen flex bg-slate-50">
        {/* Desktop sidebar — static, always visible from md breakpoint up */}
        <aside className="hidden md:flex md:w-64 bg-navy-900 flex-col shrink-0">
          <div className="px-5 py-5 border-b border-white/10 flex items-center gap-2.5">
            <BrandMark logoPath={identity.logoPath} />
            <p className="font-semibold tracking-tight text-white">
              {identity.systemName}
            </p>
          </div>
          {navList}
          {accountFooter}
        </aside>

        {/* Mobile drawer — overlay, only exists below md and only while open */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-navy-900 flex flex-col shadow-xl">
              <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandMark logoPath={identity.logoPath} />
                  <p className="font-semibold text-white">
                    {identity.systemName}
                  </p>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Tutup menu"
                  className="text-navy-300 hover:text-white"
                >
                  <IconX className="w-5 h-5" />
                </button>
              </div>
              {navList}
              {accountFooter}
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar — breadcrumb + notification bell, matches mockup header */}
          <header className="min-h-[65px] bg-white border-b border-gray-200 px-4 md:px-6 flex items-center gap-3 sticky top-0 z-30">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              className="text-gray-600 shrink-0 md:hidden"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">Admin</p>
              <p className="truncate text-sm font-medium text-gray-800">
                {pageContext}
              </p>
            </div>
            <button
              onClick={() => router.push("/admin/validations")}
              aria-label="Notifikasi — validasi menunggu tindakan"
              className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <IconBell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          </header>

          {/* min-w-0 lets this flex child actually shrink instead of forcing
              the page wider than the viewport when wide tables live inside */}
          <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-7">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}

// Static /public/logo.png ships with the app itself (no per-environment
// upload needed — local and production are separate databases, so a
// Settings-driven logo would need re-uploading in each). A logo set via
// Admin > Pengaturan > Identitas Sistem still overrides it, drawn on top.
function BrandMark({ logoPath }: { logoPath: string }) {
  const logo = assetUrl(logoPath);
  return (
    <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/10">
      <img src="/logo.png" alt="Logo sistem" className="h-full w-full object-cover" />
      {logo && (
        <img
          src={logo}
          alt="Logo sistem"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}
