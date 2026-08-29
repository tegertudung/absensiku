'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { useAuthStore } from '@/store/authStore';
import { IconHome, IconStudent } from '@/components/icons';

const NAV_ITEMS = [
  { href: '/parent', label: 'Beranda', icon: IconHome },
  { href: '/parent/profile', label: 'Profil', icon: IconStudent },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  return (
    <RequireAuth role="PARENT">
      <div className="min-h-screen bg-canvas flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-navy-900 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <p className="font-semibold text-gray-900">Pioneer Class</p>
          </div>
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

        <main className="flex-1 px-4 py-4 pb-24">{children}</main>

        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-20">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] ${
                  active ? 'text-navy-900 font-medium' : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </RequireAuth>
  );
}
