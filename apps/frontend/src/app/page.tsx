'use client';

import { useEffect, useState } from 'react';

export default function HomePage() {
  const [status, setStatus] = useState<string>('Checking...');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(`✓ Backend connected: ${data.status}`))
      .catch(() => setStatus('✗ Backend not reachable'));
  }, []);

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>🚀 Absensiku</h1>
      <p>Sistem Absensi Pioner Class</p>
      <p>Backend status: {status}</p>
    </main>
  );
}
