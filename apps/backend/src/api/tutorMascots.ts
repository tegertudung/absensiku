import { Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseUploadedFile } from "../middleware/fileUpload";
import { handleError } from "../utils/errors";
import {
  createTutorMascot,
  deleteTutorMascot,
  getActiveTutorMascot,
  getTutorMascotDisplayConfig,
  getTutorMascotImage,
  listTutorMascots,
  setActiveTutorMascot,
  updateTutorMascotDisplayConfig,
} from "../services/tutorMascotService";

const router = Router();
const MAX_MASCOT_SIZE = 3 * 1024 * 1024;
const idSchema = z.object({ mascotId: z.string().uuid() });

function isValidImage(file: { mimeType: string; content: Buffer }) {
  if (file.mimeType === "image/png") {
    return file.content
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return (
    file.mimeType === "image/webp" &&
    file.content.subarray(0, 4).toString("ascii") === "RIFF" &&
    file.content.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

router.get("/config", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  try {
    res.json({ success: true, data: await getTutorMascotDisplayConfig() });
  } catch (error) {
    handleError(error, res);
  }
});

router.patch("/config", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    res.json({
      success: true,
      data: await updateTutorMascotDisplayConfig(req.body),
    });
  } catch (error) {
    handleError(error, res);
  }
});

router.get(
  "/display-config",
  requireAuth,
  requireRole("ADMIN", "TENTOR"),
  async (_req, res) => {
    try {
      res.json({ success: true, data: await getTutorMascotDisplayConfig() });
    } catch (error) {
      handleError(error, res);
    }
  },
);

router.get(
  "/active",
  requireAuth,
  requireRole("ADMIN", "TENTOR"),
  async (_req, res) => {
    try {
      res.json({ success: true, data: await getActiveTutorMascot() });
    } catch (error) {
      handleError(error, res);
    }
  },
);

router.get(
  "/:id/image",
  requireAuth,
  requireRole("ADMIN", "TENTOR"),
  async (req, res) => {
    try {
      const mascot = await getTutorMascotImage(req.params.id);
      res.setHeader("Content-Type", mascot.mimeType);
      res.setHeader("Content-Length", mascot.imageData.length);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(mascot.imageData);
    } catch (error) {
      handleError(error, res);
    }
  },
);

router.get("/", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  try {
    res.json({ success: true, data: await listTutorMascots() });
  } catch (error) {
    handleError(error, res);
  }
});

router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  parseUploadedFile({ fieldName: "image", maxSize: MAX_MASCOT_SIZE }),
  async (req: Request, res: Response) => {
    const name = req.uploadedFields?.name?.trim();
    const file = req.uploadedFile;
    if (!name) {
      return res.status(400).json({
        error: "Validation error",
        message: "Nama maskot wajib diisi.",
      });
    }
    if (!file || !isValidImage(file)) {
      return res.status(400).json({
        error: "Validation error",
        message: "File maskot harus berupa PNG atau WEBP yang valid.",
      });
    }
    try {
      const mascot = await createTutorMascot({
        name,
        originalFileName: file.filename || "maskot",
        mimeType: file.mimeType as "image/png" | "image/webp",
        imageData: file.content,
      });
      res.status(201).json({ success: true, data: mascot });
    } catch (error) {
      handleError(error, res);
    }
  },
);

router.patch("/active", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = idSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    res.json({
      success: true,
      data: await setActiveTutorMascot(parsed.data.mascotId),
    });
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    await deleteTutorMascot(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
