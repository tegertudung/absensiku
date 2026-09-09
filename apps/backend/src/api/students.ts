import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { handleError } from "../utils/errors";
import {
  createStudent,
  listStudents,
  listTutorStudentDirectory,
  getStudentById,
  updateStudent,
  setStudentStatus,
  deleteStudentPermanently,
} from "../services/studentService";
import { listEnrollmentsForStudent } from "../services/enrollmentService";
import { parseUploadedFile } from "../middleware/fileUpload";
import {
  previewStudentImport,
  commitStudentImport,
} from "../services/studentImportService";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "TENTOR"));

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

// POST /api/students/import/preview — upload an .xlsx, get back every row
// with its validation errors (empty = importable) for the admin to review.
router.post(
  "/import/preview",
  requireAuth,
  requireRole("ADMIN"),
  parseUploadedFile({ fieldName: "file", maxSize: MAX_IMPORT_SIZE }),
  async (req: Request, res: Response) => {
    try {
      const rows = await previewStudentImport(req.uploadedFile!.content);
      res.json({ success: true, data: { rows } });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const studentImportCommitSchema = z.object({
  rows: z
    .array(
      z.object({
        rowNumber: z.number(),
        name: z.string(),
        phone: z.string(),
        guardianName: z.string(),
        guardianPhone: z.string(),
      }),
    )
    .min(1, "Tidak ada baris untuk diimpor."),
});

// POST /api/students/import — commits rows the admin reviewed (and possibly
// hand-corrected) in the preview step; every row is re-validated here too.
router.post(
  "/import",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = studentImportCommitSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    try {
      const result = await commitStudentImport(parsed.data.rows);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const studentPhoneSchema = z
  .string({ required_error: "Nomor telepon wajib diisi" })
  .min(1, "Nomor telepon wajib diisi")
  .regex(/^\d+$/, "Nomor telepon hanya boleh berisi angka 0-9")
  .max(13, "Nomor telepon maksimal 13 digit");

const createSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  phone: studentPhoneSchema,
  email: z.string().email("Email tidak valid").optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  nis: z.string().trim().max(100).optional(),
  school: z.string().trim().max(200).optional(),
  schoolClass: z.string().trim().max(100).optional(),
  classId: z.string().uuid().nullable().optional(),
  programEnrollments: z
    .array(
      z.object({
        programId: z.string().uuid(),
        classId: z.string().uuid().nullable().optional(),
      }),
    )
    .optional(),
});

// POST /api/students
router.post(
  "/",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const student = await createStudent(parsed.data);
      res.status(201).json({ success: true, data: student });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /api/students — role-aware: Admin keeps the administrative response;
// Tentor gets only the minimal directory needed by direct private sessions.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const students =
      req.user!.role === "ADMIN"
        ? await listStudents()
        : await listTutorStudentDirectory();
    res.json({ success: true, data: students });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/students/:id — includes private package history
router.get(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await getStudentById(req.params.id) });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /api/students/:id/classes — module 4: "kelas reguler" from the student's side
router.get(
  "/:id/classes",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await listEnrollmentsForStudent(req.params.id),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: studentPhoneSchema,
  email: z.string().email().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  nis: z.string().trim().max(100).optional(),
  school: z.string().trim().max(200).optional(),
  schoolClass: z.string().trim().max(100).optional(),
  programEnrollments: z
    .array(
      z.object({
        programId: z.string().uuid(),
        classId: z.string().uuid().nullable().optional(),
      }),
    )
    .optional(),
});

// PUT /api/students/:id
router.put(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json({
        success: true,
        data: await updateStudent(req.params.id, parsed.data),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED"]),
});

// PATCH /api/students/:id/status
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Validation error",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      res.json({
        success: true,
        data: await setStudentStatus(
          req.params.id,
          parsed.data.status,
          req.user!.userId,
        ),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// DELETE /api/students/:id — explicit, admin-only permanent deletion.
router.delete(
  "/:id",
  requireAuth,
  requireRole("ADMIN"),
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await deleteStudentPermanently(req.params.id, req.user!.userId),
      });
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default router;
