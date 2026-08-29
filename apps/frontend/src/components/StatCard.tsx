import { ReactNode } from 'react';

export default function StatCard({ label, value, helper, icon, emphasized = false }: { label: string; value: ReactNode; helper?: string; icon: ReactNode; emphasized?: boolean }) {
  return <div className={`flex min-w-0 items-center gap-3 rounded-lg border p-4 ${emphasized ? 'border-navy-800 bg-navy-900 text-white' : 'border-gray-200 bg-white text-gray-900'}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${emphasized ? 'bg-white/10 text-white' : 'bg-navy-50 text-navy-900'}`}>{icon}</span><div className="min-w-0"><p className={`text-xs ${emphasized ? 'text-navy-200' : 'text-gray-500'}`}>{label}</p><p className="mt-1 truncate text-xl font-semibold">{value}</p>{helper && <p className={`mt-0.5 text-xs ${emphasized ? 'text-navy-200' : 'text-gray-500'}`}>{helper}</p>}</div></div>;
}
