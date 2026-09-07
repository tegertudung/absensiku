export type TutorMascotStateKey =
  | "NO_SESSION"
  | "ONE_SESSION"
  | "NORMAL"
  | "BUSY"
  | "STARTING_SOON"
  | "ALL_DONE";

export type TutorMascotScheduleItem = {
  status: string;
  startTime?: string | null;
  schedule?: { startTime: string } | null;
};

export type TutorMascotTemplateVariables = {
  nama: string;
  jumlahSesi: string | number;
  jamBerikutnya: string;
  mapelBerikutnya: string;
  kelasBerikutnya: string;
};

const CANCELLED_STATUSES = new Set(["CANCELLED", "CANCELLED_NOT_COUNTED"]);
export const STARTING_SOON_THRESHOLD_MINUTES = 30;

function sessionStart(item: TutorMascotScheduleItem) {
  return item.startTime || item.schedule?.startTime || null;
}

export function selectTutorMascotState<T extends TutorMascotScheduleItem>(
  sessions: T[],
  now: Date,
): {
  state: TutorMascotStateKey;
  activeSessions: T[];
  nextSession: T | null;
} {
  const activeSessions = sessions.filter(
    (session) => !CANCELLED_STATUSES.has(session.status),
  );
  const allDone =
    activeSessions.length > 0 &&
    activeSessions.every((session) => session.status === "COMPLETED");
  const nextSession =
    activeSessions
      .filter((session) => {
        if (session.status === "COMPLETED") return false;
        const start = sessionStart(session);
        return !!start && new Date(start).getTime() >= now.getTime();
      })
      .sort((a, b) => {
        const startA = new Date(sessionStart(a)!).getTime();
        const startB = new Date(sessionStart(b)!).getTime();
        return startA - startB;
      })[0] ?? null;

  if (allDone) return { state: "ALL_DONE", activeSessions, nextSession: null };

  if (nextSession) {
    const minutesUntilStart =
      (new Date(sessionStart(nextSession)!).getTime() - now.getTime()) / 60000;
    if (
      minutesUntilStart >= 0 &&
      minutesUntilStart <= STARTING_SOON_THRESHOLD_MINUTES
    ) {
      return { state: "STARTING_SOON", activeSessions, nextSession };
    }
  }

  if (activeSessions.length === 0) {
    return { state: "NO_SESSION", activeSessions, nextSession };
  }
  if (activeSessions.length === 1) {
    return { state: "ONE_SESSION", activeSessions, nextSession };
  }
  if (activeSessions.length <= 3) {
    return { state: "NORMAL", activeSessions, nextSession };
  }
  return { state: "BUSY", activeSessions, nextSession };
}

export function renderTutorMascotTemplate(
  template: string,
  variables: TutorMascotTemplateVariables,
) {
  return template.replace(
    /\{(nama|jumlahSesi|jamBerikutnya|mapelBerikutnya|kelasBerikutnya)\}/g,
    (_, key: keyof TutorMascotTemplateVariables) =>
      String(variables[key] ?? ""),
  );
}
