import { ReactNode } from 'react';

export default function SectionCard({ title, description, action, children, className = '' }: { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-gray-200 bg-white p-4 md:p-5 ${className}`}>{title && <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-gray-900">{title}</h2>{description && <p className="mt-1 text-xs text-gray-500">{description}</p>}</div>{action}</div>}{children}</section>;
}
