import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Absensiku - Sistem Absensi Pioner Class',
  description: 'Sistem manajemen absensi, sesi mengajar, dan honor tentor Pioner Class',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
