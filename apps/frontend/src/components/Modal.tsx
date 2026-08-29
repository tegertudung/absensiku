'use client';

export default function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/35 px-4 py-6">
      <div className={`w-full max-w-[600px] max-h-[calc(100vh-48px)] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl ${className}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
