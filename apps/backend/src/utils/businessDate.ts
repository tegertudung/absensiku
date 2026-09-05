/**
 * Date-only values (such as an honor rate's effective date) represent a
 * calendar day in the Pioner Class business timezone, not a precise instant.
 * Keep all date-only parsing and day-boundary comparisons in one place.
 */
export function parseBusinessDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Format tanggal bisnis harus YYYY-MM-DD");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Tanggal bisnis tidak valid");
  }
  return date;
}

export function startOfBusinessDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function endOfBusinessDate(value: Date): Date {
  const end = startOfBusinessDate(value);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}

export function addBusinessDays(value: Date, days: number): Date {
  const result = startOfBusinessDate(value);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatBusinessDate(value: Date): string {
  const date = startOfBusinessDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isAfterBusinessDate(left: Date, right: Date): boolean {
  return (
    startOfBusinessDate(left).getTime() > startOfBusinessDate(right).getTime()
  );
}
