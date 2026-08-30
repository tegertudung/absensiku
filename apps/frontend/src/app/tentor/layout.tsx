'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import NotificationBell from '@/components/NotificationBell';
import { useAuthStore } from '@/store/authStore';
import { IconHome, IconSchedule, IconReport, IconStudent, IconPlus } from '@/components/icons';

const NAV_ITEMS = [
  { href: '/tentor', label: 'Beranda', icon: IconHome },
  { href: '/tentor/schedule', label: 'Jadwal', icon: IconSchedule },
  { href: '/tentor/recap', label: 'Rekap', icon: IconReport },
  { href: '/tentor/profile', label: 'Profil', icon: IconStudent },
];

export default function TentorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const isPrivateScheduleForm = pathname === '/tentor/private/new';

  // Split nav items around the center FAB slot (Beranda, Jadwal | + | Rekap, Profil)
  const left = NAV_ITEMS.slice(0, 2);
  const right = NAV_ITEMS.slice(2);

  return (
    <RequireAuth role="TENTOR">
      <div className="min-h-screen bg-canvas flex flex-col">
        {!isPrivateScheduleForm && <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-navy-900 flex items-center justify-center text-white text-xs font-bold">
              P
            </div>
            <p className="font-semibold text-gray-900">Pioneer Class</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell href="/tentor/notifications" />
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
        </header>}

        <main className={`flex-1 px-4 py-4 ${isPrivateScheduleForm ? '' : 'pb-24'}`}>{children}</main>

        {!isPrivateScheduleForm && <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-20">
          {left.map((item) => {
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

          {/* Floating "+" FAB — record a completed manual teaching session. */}
          <div className="w-16 flex items-center justify-center relative">
            <Link
              href="/tentor/sessions/direct"
              aria-label="Catat Sesi Mengajar"
              className="absolute -top-6 w-14 h-14 rounded-full bg-navy-900 text-white flex items-center justify-center shadow-lg hover:bg-navy-800"
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
                  active ? 'text-navy-900 font-medium' : 'text-gray-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>}
      </div>
    </RequireAuth>
  );
}
