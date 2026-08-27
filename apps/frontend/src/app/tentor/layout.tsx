'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { useAuthStore } from '@/store/authStore';

const NAV_ITEMS = [
  { href: '/tentor', label: 'Beranda' },
  { href: '/tentor/schedule', label: 'Jadwal' },
  { href: '/tentor/recap', label: 'Rekap' },
];

export default function TentorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return (
    <RequireAuth role="TENTOR">
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <p className="font-semibold text-gray-900">Absensiku</p>
          <button
            onClick={() => {
              logout();
              router.push('/login');
            }}
            className="text-xs text-red-600"
          >
            Keluar
          </button>
        </header>

        <main className="flex-1 px-4 py-4 pb-20">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center py-3 text-xs ${
                pathname === item.href ? 'text-blue-600 font-medium' : 'text-gray-500'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </RequireAuth>
  );
}
