'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/tutors', label: 'Tentor' },
  { href: '/admin/students', label: 'Siswa' },
  { href: '/admin/classes', label: 'Kelas & Mapel' },
  { href: '/admin/schedules', label: 'Jadwal' },
  { href: '/admin/validations', label: 'Validasi' },
  { href: '/admin/recap', label: 'Rekap & Honor' },
  { href: '/admin/honor-rates', label: 'Master Honor' },
  { href: '/admin/audit-log', label: 'Audit Log' },
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

  const navList = (
    <nav className="flex-1 py-2 overflow-y-auto">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center justify-between px-4 py-2 text-sm ${
            pathname === item.href ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <span>{item.label}</span>
          {item.href === '/admin/validations' && pendingCount > 0 && (
            <span className="text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  const accountFooter = (
    <div className="border-t border-gray-200 p-4">
      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
      <button
        onClick={() => {
          logout();
          router.push('/login');
        }}
        className="mt-2 text-xs text-red-600 hover:underline"
      >
        Keluar
      </button>
    </div>
  );

  return (
    <RequireAuth role="ADMIN">
      <div className="min-h-screen flex bg-gray-50">
        {/* Desktop sidebar — static, always visible from md breakpoint up */}
        <aside className="hidden md:flex md:w-56 bg-white border-r border-gray-200 flex-col shrink-0">
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="font-semibold text-gray-900">Absensiku</p>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
          {navList}
          {accountFooter}
        </aside>

        {/* Mobile drawer — overlay, only exists below md and only while open */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl">
              <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">Absensiku</p>
                  <p className="text-xs text-gray-500">Admin Panel</p>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Tutup menu"
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              {navList}
              {accountFooter}
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar — hamburger trigger, hidden from md up */}
          <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
            <button
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu"
              className="text-gray-600 shrink-0"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
              </svg>
            </button>
            <p className="font-semibold text-gray-900 text-sm">Absensiku</p>
          </header>

          {/* min-w-0 lets this flex child actually shrink instead of forcing
              the page wider than the viewport when wide tables live inside */}
          <main className="flex-1 p-4 md:p-6 min-w-0">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
