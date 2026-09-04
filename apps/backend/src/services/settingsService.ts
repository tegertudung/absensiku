import { prisma } from '../utils/prisma';
import { promises as fs } from 'fs';
import path from 'path';
import { SETTINGS_UPLOAD_ROOT, SettingsImageKind, SettingsUploadedImage } from '../middleware/settingsUpload';

export const DEFAULT_SETTINGS: Record<string, string> = {
  systemName: 'Pioner Class', institutionName: 'Pioner Class', address: '', email: '', phone: '', signatoryName: '', signatoryTitle: '', location: '', domain: '', logoPath: '', signaturePath: '', footerText: '',
  minimumScheduleStartGapMinutes: '30', lowQuotaWarningThreshold: '3', zeroQuotaBlocking: 'true', dailyBatchCompletionEnabled: 'true',
};
export async function getSettings() {
  const rows = await prisma.systemSetting.findMany(); const values = { ...DEFAULT_SETTINGS };
  rows.forEach((row) => { values[row.key] = row.value; }); return values;
}
export async function updateSettings(values: Record<string, string | number | boolean>) {
  await prisma.$transaction(Object.entries(values).map(([key, value]) => prisma.systemSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })));
  return getSettings();
}

function managedImagePath(value: string, kind: SettingsImageKind) {
  const prefix = `/uploads/settings/${kind}/`;
  if (!value.startsWith(prefix)) return null;
  const filename = value.slice(prefix.length);
  if (!/^[a-z]+-\d+-[a-f0-9]{24}\.(png|jpg|webp)$/.test(filename)) return null;
  const candidate = path.resolve(SETTINGS_UPLOAD_ROOT, kind, filename);
  const allowedDirectory = `${path.resolve(SETTINGS_UPLOAD_ROOT, kind)}${path.sep}`;
  return candidate.startsWith(allowedDirectory) ? candidate : null;
}

export async function replaceSettingsImage(kind: SettingsImageKind, image: SettingsUploadedImage) {
  const key = kind === 'logo' ? 'logoPath' : 'signaturePath';
  const settings = await getSettings();
  const oldFile = managedImagePath(settings[key] || '', kind);
  let persisted = false;
  try {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: image.publicPath },
      create: { key, value: image.publicPath },
    });
    persisted = true;
    if (oldFile) await fs.unlink(oldFile).catch(() => undefined);
    return getSettings();
  } catch (error) {
    if (!persisted) await fs.unlink(image.absolutePath).catch(() => undefined);
    throw error;
  }
}
export async function getMinimumScheduleStartGapMinutes() {
  const settings = await getSettings(); const value = Number(settings.minimumScheduleStartGapMinutes);
  return Number.isFinite(value) && value >= 0 ? value : 30;
}
