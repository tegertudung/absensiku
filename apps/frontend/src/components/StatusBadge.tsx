// Semantic status/type pill colors, matched to the mockups: green = completed,
// amber = in-progress/pending, red = cancelled/conflict, navy = private,
// light blue = regular/scheduled.

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  PENDING_ADMIN: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED_NOT_COUNTED: 'bg-red-50 text-red-600',
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Berlangsung',
  PENDING_ADMIN: 'Menunggu Admin',
  COMPLETED: 'Selesai',
  CANCELLED_NOT_COUNTED: 'Dibatalkan',
};

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${style} ${className}`}>
      {label}
    </span>
  );
}

export function TypeBadge({ type, className = '' }: { type: string; className?: string }) {
  const isPrivate = type === 'PRIVATE';
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
        isPrivate ? 'bg-navy-900 text-white' : 'bg-blue-100 text-navy-800'
      } ${className}`}
    >
      {isPrivate ? 'Privat' : 'Reguler'}
    </span>
  );
}
