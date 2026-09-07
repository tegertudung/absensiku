import { prisma } from "../utils/prisma";
import { AppError } from "../utils/errors";

const ACTIVE_MASCOT_KEY = "activeTutorMascotId";
const DISPLAY_CONFIG_KEY = "tutorMascotDisplayConfig";

const STATE_KEYS = [
  "NO_SESSION",
  "ONE_SESSION",
  "NORMAL",
  "BUSY",
  "STARTING_SOON",
  "ALL_DONE",
] as const;

type MascotStateKey = (typeof STATE_KEYS)[number];
type MascotDisplayState = { mascotId: string | null; template: string };
export type TutorMascotDisplayConfig = {
  mode: "MANUAL" | "AUTO";
  states: Record<MascotStateKey, MascotDisplayState>;
};

export const DEFAULT_TUTOR_MASCOT_DISPLAY_CONFIG: TutorMascotDisplayConfig = {
  mode: "MANUAL",
  states: {
    NO_SESSION: {
      mascotId: null,
      template: "Santaimi dulu, belum ada sesi ji hari ini.",
    },
    ONE_SESSION: {
      mascotId: null,
      template: "Jangan ki lupa, ada {jumlahSesi} sesi hari ini.",
    },
    NORMAL: {
      mascotId: null,
      template: "Semangat ki, ada {jumlahSesi} sesi hari ini!",
    },
    BUSY: {
      mascotId: null,
      template: "Jadwal ta padat hari ini. Semangat ki, jangan lupa makan!",
    },
    STARTING_SOON: {
      mascotId: null,
      template: "Gas ki, sebentar lagi sesi ta mulai jam {jamBerikutnya}.",
    },
    ALL_DONE: {
      mascotId: null,
      template: "Mantap ji, semua sesi hari ini sudah selesai!",
    },
  },
};

const ALLOWED_PLACEHOLDERS = new Set([
  "nama",
  "jumlahSesi",
  "jamBerikutnya",
  "mapelBerikutnya",
  "kelasBerikutnya",
]);

function defaultDisplayConfig(): TutorMascotDisplayConfig {
  return JSON.parse(JSON.stringify(DEFAULT_TUTOR_MASCOT_DISPLAY_CONFIG));
}

function isDisplayConfig(value: unknown): value is TutorMascotDisplayConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<TutorMascotDisplayConfig>;
  if (
    Object.keys(config).length !== 2 ||
    !("mode" in config) ||
    !("states" in config)
  ) {
    return false;
  }
  if (config.mode !== "MANUAL" && config.mode !== "AUTO") return false;
  if (!config.states || typeof config.states !== "object") return false;
  const states = config.states as Record<string, unknown>;
  if (
    Object.keys(states).length !== STATE_KEYS.length ||
    !STATE_KEYS.every((key) => key in states)
  ) {
    return false;
  }
  return STATE_KEYS.every((key) => {
    const state = states[key] as Partial<MascotDisplayState> | null;
    return (
      !!state &&
      (typeof state.mascotId === "string" || state.mascotId === null) &&
      typeof state.template === "string"
    );
  });
}

function validateTemplate(template: string, state: MascotStateKey) {
  const normalized = template.trim();
  if (!normalized) {
    throw new AppError(`Pesan untuk ${state} tidak boleh kosong.`, 400);
  }
  if (normalized.length > 200) {
    throw new AppError(`Pesan untuk ${state} maksimal 200 karakter.`, 400);
  }
  const placeholders = normalized.matchAll(/\{([^{}]+)\}/g);
  for (const match of placeholders) {
    if (!ALLOWED_PLACEHOLDERS.has(match[1])) {
      throw new AppError(`Placeholder {${match[1]}} tidak didukung.`, 400);
    }
  }
  return normalized;
}

function imageUrl(id: string) {
  return `/api/tutor-mascots/${id}/image`;
}

async function activeMascotId() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: ACTIVE_MASCOT_KEY },
    select: { value: true },
  });
  return setting?.value || null;
}

export async function getTutorMascotDisplayConfig() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: DISPLAY_CONFIG_KEY },
    select: { value: true },
  });
  if (!setting) return defaultDisplayConfig();

  try {
    const parsed: unknown = JSON.parse(setting.value);
    return isDisplayConfig(parsed) ? parsed : defaultDisplayConfig();
  } catch {
    return defaultDisplayConfig();
  }
}

export async function updateTutorMascotDisplayConfig(input: unknown) {
  if (!isDisplayConfig(input)) {
    throw new AppError("Struktur konfigurasi maskot tidak valid.", 400);
  }

  const config: TutorMascotDisplayConfig = {
    mode: input.mode,
    states: {} as TutorMascotDisplayConfig["states"],
  };
  const mascotIds = new Set<string>();
  for (const key of STATE_KEYS) {
    const state = input.states[key];
    const mascotId = state.mascotId;
    if (
      mascotId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        mascotId,
      )
    ) {
      throw new AppError(`Maskot untuk ${key} tidak valid.`, 400);
    }
    if (mascotId) mascotIds.add(mascotId);
    config.states[key] = {
      mascotId,
      template: validateTemplate(state.template, key),
    };
  }

  if (mascotIds.size > 0) {
    const mascots = await prisma.tutorMascot.findMany({
      where: { id: { in: [...mascotIds] } },
      select: { id: true },
    });
    if (mascots.length !== mascotIds.size) {
      throw new AppError(
        "Salah satu maskot yang dipilih tidak ditemukan.",
        400,
      );
    }
  }

  await prisma.systemSetting.upsert({
    where: { key: DISPLAY_CONFIG_KEY },
    update: { value: JSON.stringify(config) },
    create: { key: DISPLAY_CONFIG_KEY, value: JSON.stringify(config) },
  });
  return config;
}

export async function listTutorMascots() {
  const activeId = await activeMascotId();
  const mascots = await prisma.tutorMascot.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      mimeType: true,
      originalFileName: true,
      createdAt: true,
    },
  });
  return mascots.map((mascot) => ({
    ...mascot,
    isActive: mascot.id === activeId,
  }));
}

export async function createTutorMascot(input: {
  name: string;
  originalFileName: string;
  mimeType: "image/png" | "image/webp";
  imageData: Buffer;
}) {
  return prisma.tutorMascot.create({
    data: input,
    select: {
      id: true,
      name: true,
      mimeType: true,
      originalFileName: true,
      createdAt: true,
    },
  });
}

export async function setActiveTutorMascot(mascotId: string) {
  const mascot = await prisma.tutorMascot.findUnique({
    where: { id: mascotId },
    select: { id: true, name: true, mimeType: true, originalFileName: true },
  });
  if (!mascot) throw new AppError("Maskot tidak ditemukan.", 404);
  await prisma.systemSetting.upsert({
    where: { key: ACTIVE_MASCOT_KEY },
    update: { value: mascot.id },
    create: { key: ACTIVE_MASCOT_KEY, value: mascot.id },
  });
  return { ...mascot, imageUrl: imageUrl(mascot.id) };
}

export async function deleteTutorMascot(id: string) {
  if (id === (await activeMascotId())) {
    throw new AppError(
      "Maskot aktif tidak dapat dihapus. Pilih maskot aktif lain terlebih dahulu.",
      400,
    );
  }
  const mascot = await prisma.tutorMascot.findUnique({ where: { id } });
  if (!mascot) throw new AppError("Maskot tidak ditemukan.", 404);
  await prisma.tutorMascot.delete({ where: { id } });
}

export async function getTutorMascotImage(id: string) {
  const mascot = await prisma.tutorMascot.findUnique({
    where: { id },
    select: { mimeType: true, imageData: true, updatedAt: true },
  });
  if (!mascot) throw new AppError("Maskot tidak ditemukan.", 404);
  return mascot;
}

export async function getActiveTutorMascot() {
  const id = await activeMascotId();
  if (!id) return null;
  const mascot = await prisma.tutorMascot.findUnique({
    where: { id },
    select: { id: true, name: true, mimeType: true, updatedAt: true },
  });
  if (!mascot) return null;
  return { ...mascot, imageUrl: imageUrl(mascot.id) };
}
