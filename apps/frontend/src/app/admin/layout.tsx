'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import {
  IconDashboard,
  IconStudent,
  IconTutor,
  IconClasses,
  IconPrivate,
  IconSchedule,
  IconReport,
  IconSettings,
  IconBell,
  IconMenu,
  IconX,
  IconLogout,
} from '@/components/icons';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: IconDashboard, section: null },
  { href: '/admin/tutors', label: 'Tentor', icon: IconTutor, section: 'AKADEMIK' },
  { href: '/admin/students', label: 'Siswa', icon: IconStudent, section: 'AKADEMIK' },
  { href: '/admin/classes', label: 'Kelas & Mapel', icon: IconClasses, section: 'AKADEMIK' },
  { href: '/admin/schedules', label: 'Jadwal', icon: IconSchedule, section: 'AKADEMIK' },
  { href: '/admin/validations', label: 'Validasi', icon: IconPrivate, section: 'AKADEMIK' },
  { href: '/admin/recap', label: 'Rekap & Honor', icon: IconReport, section: 'LAPORAN' },
  { href: '/admin/honor-rates', label: 'Master Honor', icon: IconReport, section: 'LAPORAN' },
  { href: '/admin/audit-log', label: 'Audit Log', icon: IconSettings, section: 'LAPORAN' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    api
      .get('/dashboard/admin')
      .then((res) => setPendingCount(res.data.data.pendingValidationsCount))
      .catch(() => {});
  }, [pathname]);

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  let lastSection: string | null = null;

  const navList = (
    <nav className="flex-1 py-2 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const showSection = item.section && item.section !== lastSection;
        lastSection = item.section;
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <div key={item.href}>
            {showSection && (
              <p className="px-4 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-navy-300">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              className={`mx-2 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                active ? 'bg-navy-800 text-white font-medium' : 'text-navy-200 hover:bg-navy-800/60 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {item.label}
              </span>
              {item.href === '/admin/validations' && pendingCount > 0 && (
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
    <div className="border-t border-navy-800 p-3">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
        <div className="w-8 h-8 rounded-full bg-navy-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
          {(user?.email || 'A').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white truncate">{user?.email}</p>
          <p className="text-[11px] text-navy-300">ADMIN</p>
        </div>
        <button
          onClick={() => {
            logout();
            router.push('/login');
          }}
          aria-label="Keluar"
          className="text-navy-300 hover:text-white shrink-0"
        >
          <IconLogout className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <RequireAuth role="ADMIN">
      <div className="min-h-screen flex bg-gray-50">
        {/* Desktop sidebar — static, always visible from md breakpoint up */}
        <aside className="hidden md:flex md:w-60 bg-navy-900 flex-col shrink-0">
          <div className="px-4 py-4 border-b border-navy-800 flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <p className="font-semibold text-white">Pioneer Class</p>
          </div>
          {navList}
          {accountFooter}
        </aside>

        {/* Mobile drawer — overlay, only exists below md and only while open */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-navy-900 flex flex-col shadow-xl">
              <div className="px-4 py-4 border-b border-navy-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                    P
                  </div>
                  <p className="font-semibold text-white">Pioneer Class</p>
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
          <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 sticky top-0 z-30">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              className="text-gray-600 shrink-0 md:hidden"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            <p className="font-semibold text-gray-900 text-sm flex-1 md:flex-none">Pioneer Class</p>
            <div className="hidden md:flex flex-1" />
            <button aria-label="Notifikasi" className="relative text-gray-500 hover:text-gray-800">
              <IconBell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
              )}
            </button>
          </header>

          {/* min-w-0 lets this flex child actually shrink instead of forcing
              the page wider than the viewport when wide tables live inside */}
          <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
