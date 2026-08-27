'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace('/login');
    } else if (user.role === 'ADMIN') {
      router.replace('/admin/dashboard');
    } else {
      router.replace('/tentor');
    }
  }, [isHydrated, user, router]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-400">Memuat...</p>
    </main>
  );
}
