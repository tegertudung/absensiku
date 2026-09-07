export interface TutorScheduleDateRule {
  dayOfWeek: number;
  startDate: string;
  endDate?: string | null;
  occurrenceDate?: string | null;
  status: string;
}

/** Local calendar key shared by Tentor Beranda and Jadwal (never UTC). */
export function tutorDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tutorScheduleOccursOn(
  schedule: TutorScheduleDateRule,
  date: Date,
) {
  const dateKey = tutorDateKey(date);
  if (schedule.occurrenceDate) {
    return (
      tutorDateKey(schedule.occurrenceDate) === dateKey &&
      schedule.status === "ACTIVE"
    );
  }
  if (schedule.dayOfWeek !== date.getDay() || schedule.status !== "ACTIVE") {
    return false;
  }
  if (tutorDateKey(schedule.startDate) > dateKey) return false;
  if (schedule.endDate && tutorDateKey(schedule.endDate) < dateKey)
    return false;
  return true;
}

export function tutorCombineScheduleTime(date: Date, timeIso: string) {
  const time = new Date(timeIso);
  const result = new Date(date);
  result.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return result.toISOString();
}
