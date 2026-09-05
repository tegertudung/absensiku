import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { handleError } from "../utils/errors";
import {
  createProgram,
  deleteProgram,
  getProgram,
  listPrograms,
  updateProgram,
} from "../services/programService";
import { parseBusinessDate } from "../utils/businessDate";
const router = Router();
const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  learningModel: z.enum(["CLASS_BASED", "INDIVIDUAL"]),
  usesQuota: z.boolean().default(true),
  defaultMeetingQuota: z.number().int().positive().default(24),
  honorNominal: z.number().positive("Honor per sesi wajib lebih dari 0"),
  honorEffectiveFrom: z.string().min(10, "Tanggal berlaku wajib diisi"),
});
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: await listPrograms(req.query.active !== "true"),
    });
  } catch (e) {
    handleError(e, res);
  }
});
router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    res.json({ success: true, data: await getProgram(req.params.id) });
  } catch (e) {
    handleError(e, res);
  }
});
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const p = schema.safeParse(req.body);
  if (!p.success)
    return res.status(400).json({
      error: "Validation error",
      details: p.error.flatten().fieldErrors,
    });
  try {
    res.status(201).json({
      success: true,
      data: await createProgram({
        ...p.data,
        honorEffectiveFrom: parseBusinessDate(p.data.honorEffectiveFrom),
      }),
    });
  } catch (e) {
    handleError(e, res);
  }
});
router.put("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const p = schema.omit({ code: true }).partial().safeParse(req.body);
  if (!p.success)
    return res.status(400).json({
      error: "Validation error",
      details: p.error.flatten().fieldErrors,
    });
  try {
    res.json({
      success: true,
      data: await updateProgram(req.params.id, p.data),
    });
  } catch (e) {
    handleError(e, res);
  }
});
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    const p = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: "Validation error" });
    try {
      res.json({
        success: true,
        data: await updateProgram(req.params.id, p.data),
      });
    } catch (e) {
      handleError(e, res);
    }
  },
);
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    res.json({ success: true, data: await deleteProgram(req.params.id) });
  } catch (e) {
    handleError(e, res);
  }
});
export default router;
