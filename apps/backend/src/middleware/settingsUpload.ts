import { NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

export type SettingsImageKind = 'logo' | 'signature';

export interface SettingsUploadedImage {
  publicPath: string;
  absolutePath: string;
  mimeType: string;
}

declare global {
  namespace Express {
    interface Request {
      settingsImage?: SettingsUploadedImage;
    }
  }
}

// This resolves to apps/backend/uploads/settings in both ts-node (src/) and
// compiled JavaScript (dist/), keeping generated assets outside source output.
export const SETTINGS_UPLOAD_ROOT = path.resolve(__dirname, '..', '..', 'uploads', 'settings');
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function uploadError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: 'Request failed', message });
}

/**
 * Handles the deliberately small multipart surface used by Settings uploads:
 * exactly one file named `file`. The file is persisted only after all upload
 * constraints have been checked and never uses a client-provided filename.
 */
export function uploadSettingsImage(kind: SettingsImageKind) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
    if (!boundaryMatch) return uploadError(res, 400, 'File gambar tidak ditemukan.');

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const requestLimit = MAX_IMAGE_SIZE + 16 * 1024;
    try {
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buffer.length;
        if (totalSize > requestLimit) return uploadError(res, 413, 'Ukuran gambar maksimal 2 MB.');
        chunks.push(buffer);
      }
    } catch {
      return uploadError(res, 400, 'Gagal membaca file gambar.');
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const raw = Buffer.concat(chunks);
    const delimiter = `--${boundary}`;
    const parts = raw.toString('latin1').split(delimiter).slice(1, -1);
    const files: Array<{ mimeType: string; content: Buffer }> = [];

    for (const part of parts) {
      const normalized = part.startsWith('\r\n') ? part.slice(2) : part;
      const separator = normalized.indexOf('\r\n\r\n');
      if (separator < 0) continue;
      const headers = normalized.slice(0, separator);
      const content = normalized.slice(separator + 4).replace(/\r\n$/, '');
      const disposition = /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers)?.[0] || '';
      const fieldName = /name="([^"]+)"/i.exec(disposition)?.[1];
      const hasFileName = /filename=/i.test(disposition);
      if (!hasFileName) continue;
      if (fieldName !== 'file') return uploadError(res, 400, 'File gambar tidak ditemukan.');
      const mimeType = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.trim().toLowerCase() || '';
      files.push({ mimeType, content: Buffer.from(content, 'latin1') });
    }

    if (files.length === 0) return uploadError(res, 400, 'File gambar tidak ditemukan.');
    if (files.length !== 1) return uploadError(res, 400, 'Hanya satu file gambar yang dapat diunggah.');
    const file = files[0];
    if (!imageExtensions[file.mimeType]) return uploadError(res, 400, 'File gambar harus berupa PNG, JPG, JPEG, atau WEBP.');
    if (file.content.length > MAX_IMAGE_SIZE) return uploadError(res, 413, 'Ukuran gambar maksimal 2 MB.');

    const extension = imageExtensions[file.mimeType];
    const filename = `${kind}-${Date.now()}-${randomBytes(12).toString('hex')}.${extension}`;
    const directory = path.join(SETTINGS_UPLOAD_ROOT, kind);
    const absolutePath = path.join(directory, filename);
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(absolutePath, file.content, { flag: 'wx' });
      req.settingsImage = { publicPath: `/uploads/settings/${kind}/${filename}`, absolutePath, mimeType: file.mimeType };
      next();
    } catch {
      return uploadError(res, 500, kind === 'logo' ? 'Gagal menyimpan logo.' : 'Gagal menyimpan tanda tangan.');
    }
  };
}
