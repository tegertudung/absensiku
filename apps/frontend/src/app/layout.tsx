import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import AuthHydrator from '@/components/AuthHydrator';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

// Self-hosted at build time by next/font (no runtime request to Google, so
// it still works offline once cached) — the mobile design system's only
// typeface. Exposed as a CSS variable so Tailwind's `font-sans` (see
// tailwind.config.js) resolves to it with a normal-sans fallback.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

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
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#001936',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={plusJakartaSans.variable}>
      <body className="font-sans">
        <AuthHydrator />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
