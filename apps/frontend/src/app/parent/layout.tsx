'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import NotificationBell from '@/components/NotificationBell';
import { useAuthStore } from '@/store/authStore';
import { IconHome, IconStudent } from '@/components/icons';
import { assetUrl } from '@/lib/api';
import { useSystemIdentityStore } from '@/store/systemIdentityStore';

const NAV_ITEMS = [
  { href: '/parent', label: 'Beranda', icon: IconHome },
  { href: '/parent/profile', label: 'Profil', icon: IconStudent },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const identity = useSystemIdentityStore((state) => state.identity);
  const loadIdentity = useSystemIdentityStore((state) => state.load);
  useEffect(() => { loadIdentity(); }, [loadIdentity]);

  return (
    <RequireAuth role="PARENT">
      <div className="min-h-screen bg-canvas flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-navy-900 text-xs font-bold text-white">P{identity.logoPath && <img src={assetUrl(identity.logoPath) || undefined} alt="Logo sistem" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
            <p className="font-semibold text-gray-900">{identity.systemName}</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="text-xs text-red-600"
            >
              Keluar
            </button>
          </div>
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
