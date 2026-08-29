'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function RequireAuth({
  role,
  children,
}: {
  role: 'ADMIN' | 'TENTOR' | 'PARENT';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== role) {
      const home = user.role === 'ADMIN' ? '/admin/dashboard' : user.role === 'TENTOR' ? '/tentor' : '/parent';
      router.replace(home);
    }
  }, [isHydrated, user, role, router]);

  if (!isHydrated || !user || user.role !== role) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
        Memuat...
      </div>
    );
  }

  return <>{children}</>;
}
