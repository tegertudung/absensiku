import { ReactNode } from 'react';

export default function EmptyState({ message, title, icon }: { message: string; title?: string; icon?: ReactNode }) { return <div className="rounded-md border border-dashed border-gray-200 bg-slate-50 px-4 py-4 text-center text-sm text-gray-500">{icon && <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-700">{icon}</span>}{title && <p className="text-sm font-medium text-gray-800">{title}</p>}<p className={title ? 'mt-1 text-xs' : ''}>{message}</p></div>; }
