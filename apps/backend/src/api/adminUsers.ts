import { Request, Response, Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requirePrimaryAdmin,
  requireRole,
} from "../middleware/auth";
import {
  createAdminUser,
  listAdminUsers,
  resetAdminPassword,
  deleteAdminUser,
} from "../services/adminUserService";
import { handleError } from "../utils/errors";

const router = Router();

const createAdminSchema = z
  .object({
    email: z.string().trim().email("Email tidak valid."),
    password: z.string().min(8, "Password minimal 8 karakter."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi password tidak cocok.",
  });

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password minimal 8 karakter."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi password tidak cocok.",
  });

router.use(requireAuth, requireRole("ADMIN"), requirePrimaryAdmin);

router.get("/users", async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await listAdminUsers() });
  } catch (error) {
    handleError(error, res);
  }
});

router.post("/users", async (req: Request, res: Response) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const data = await createAdminUser(
      parsed.data.email,
      parsed.data.password,
      {
        id: req.user!.userId,
        email: req.user!.email,
      },
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(error, res);
  }
});

router.patch("/users/:id/password", async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Validation error",
      details: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    await resetAdminPassword(req.params.id, parsed.data.password, {
      id: req.user!.userId,
      email: req.user!.email,
    });
    res.json({ success: true });
  } catch (error) {
    handleError(error, res);
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    await deleteAdminUser(req.params.id, {
      id: req.user!.userId,
      email: req.user!.email,
    });
    res.json({ success: true });
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
