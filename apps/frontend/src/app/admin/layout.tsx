'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { useAuthStore } from '@/store/authStore';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/tutors', label: 'Tentor' },
  { href: '/admin/students', label: 'Siswa' },
  { href: '/admin/schedules', label: 'Jadwal' },
  { href: '/admin/recap', label: 'Rekap & Honor' },
  { href: '/admin/honor-rates', label: 'Master Honor' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  return (
    <RequireAuth role="ADMIN">
      <div className="min-h-screen flex bg-gray-50">
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-gray-200">
            <p className="font-semibold text-gray-900">Absensiku</p>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
          <nav className="flex-1 py-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 text-sm ${
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
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
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </RequireAuth>
  );
}
