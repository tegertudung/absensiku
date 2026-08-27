export function formatRupiah(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(num || 0);
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('id-ID');
}

export const SESSION_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Terjadwal',
  IN_PROGRESS: 'Dalam Proses',
  PENDING_ADMIN: 'Menunggu Admin',
  COMPLETED: 'Selesai',
  CANCELLED_NOT_COUNTED: 'Dibatalkan Tidak Dihitung',
};

export const SESSION_TYPE_LABELS: Record<string, string> = {
  REGULAR: 'Reguler',
  PRIVATE: 'Privat',
};
