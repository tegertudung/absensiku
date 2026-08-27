import type { Metadata, Viewport } from 'next';
import './globals.css';
import AuthHydrator from '@/components/AuthHydrator';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: 'Absensiku - Sistem Absensi Pioner Class',
  description: 'Sistem manajemen absensi, sesi mengajar, dan honor tentor Pioner Class',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Absensiku',
  },
  other: {
    // Next's `appleWebApp.capable` only emits the (now-deprecated per Chrome)
    // apple-mobile-web-app-capable tag. The standard tag is separate and not
    // covered by the typed Metadata API, so it's added here directly.
    'mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <AuthHydrator />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
