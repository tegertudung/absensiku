import { NextFunction, Request, Response } from "express";

export interface UploadedFile {
  fieldName: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}

declare global {
  namespace Express {
    interface Request {
      uploadedFile?: UploadedFile;
      uploadedFields?: Record<string, string>;
    }
  }
}

function uploadError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: "Request failed", message });
}

/**
 * Same hand-rolled `multipart/form-data` parsing approach as
 * settingsUpload.ts (no multer dependency for a single-file field), just
 * generalized: any field name, no mimetype allowlist baked in (callers
 * check `req.uploadedFile.mimeType`/filename themselves), and the file is
 * kept in memory (`req.uploadedFile.content`) rather than written to disk —
 * import endpoints only need the buffer for ExcelJS to parse, nothing is
 * persisted as an asset.
 */
export function parseUploadedFile(options: {
  fieldName: string;
  maxSize: number;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch =
      /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(
        contentType,
      );
    if (!boundaryMatch) return uploadError(res, 400, "File tidak ditemukan.");

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const requestLimit = options.maxSize + 16 * 1024;
    try {
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buffer.length;
        if (totalSize > requestLimit)
          return uploadError(
            res,
            413,
            `Ukuran file maksimal ${Math.floor(options.maxSize / (1024 * 1024))} MB.`,
          );
        chunks.push(buffer);
      }
    } catch {
      return uploadError(res, 400, "Gagal membaca file.");
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const raw = Buffer.concat(chunks);
    const delimiter = `--${boundary}`;
    const parts = raw.toString("latin1").split(delimiter).slice(1, -1);
    const files: UploadedFile[] = [];
    const fields: Record<string, string> = {};

    for (const part of parts) {
      const normalized = part.startsWith("\r\n") ? part.slice(2) : part;
      const separator = normalized.indexOf("\r\n\r\n");
      if (separator < 0) continue;
      const headers = normalized.slice(0, separator);
      const content = normalized.slice(separator + 4).replace(/\r\n$/, "");
      const disposition =
        /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers)?.[0] || "";
      const fieldName = /name="([^"]+)"/i.exec(disposition)?.[1];
      const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
      if (filename === undefined) {
        if (fieldName) fields[fieldName] = content;
        continue;
      }
      if (fieldName !== options.fieldName) continue;
      const mimeType =
        /content-type:\s*([^\r\n;]+)/i
          .exec(headers)?.[1]
          ?.trim()
          .toLowerCase() || "application/octet-stream";
      files.push({
        fieldName,
        filename,
        mimeType,
        content: Buffer.from(content, "latin1"),
      });
    }

    if (files.length === 0)
      return uploadError(res, 400, "File tidak ditemukan.");
    if (files.length !== 1)
      return uploadError(res, 400, "Hanya satu file yang dapat diunggah.");
    const file = files[0];
    if (file.content.length > options.maxSize)
      return uploadError(
        res,
        413,
        `Ukuran file maksimal ${Math.floor(options.maxSize / (1024 * 1024))} MB.`,
      );
    if (file.content.length === 0) return uploadError(res, 400, "File kosong.");

    req.uploadedFile = file;
    req.uploadedFields = fields;
    next();
  };
}
