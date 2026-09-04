import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { handleError } from "../utils/errors";
import { createStudentLetter, deleteStudentLetter, getNextStudentLetterNumber, getStudentLetter, listStudentLetters, updateStudentLetter, verifyStudentLetter } from "../services/studentLetterService";

const router = Router();
const scheduleSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/) });
const createSchema = z.object({ studentId: z.string().uuid(), studentNis: z.string().trim().min(1), studentSchool: z.string().trim().min(1), studentSchoolClass: z.string().trim().min(1), letterDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), programName: z.string().trim().min(1), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), schedules: z.array(scheduleSchema).min(1) });
const updateSchema = createSchema.omit({ studentId: true });

// Public, read-only verification intentionally exposes only safe document metadata.
router.get("/verify/:code", async (req: Request, res: Response) => { try { const data = await verifyStudentLetter(req.params.code); if (!data) return res.status(404).json({ error: "Not found", message: "Dokumen tidak ditemukan atau kode verifikasi tidak valid." }); res.json({ success: true, data }); } catch (error) { handleError(error, res); } });

router.use(requireAuth, requireRole("ADMIN"));
router.get("/next-number", async (req, res) => { const date = typeof req.query.date === "string" ? req.query.date : ""; if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Validation error", message: "Tanggal surat tidak valid." }); try { res.json({ success: true, data: { letterNumber: await getNextStudentLetterNumber(date) } }); } catch (error) { handleError(error, res); } });
router.get("/", async (req, res) => { try { res.json({ success: true, data: await listStudentLetters(typeof req.query.search === "string" ? req.query.search : "") }); } catch (error) { handleError(error, res); } });
router.get("/:id", async (req, res) => { try { res.json({ success: true, data: await getStudentLetter(req.params.id) }); } catch (error) { handleError(error, res); } });
router.post("/", async (req, res) => { const parsed = createSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.flatten().fieldErrors }); try { res.status(201).json({ success: true, data: await createStudentLetter(parsed.data) }); } catch (error) { handleError(error, res); } });
router.put("/:id", async (req, res) => { const parsed = updateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.flatten().fieldErrors }); try { res.json({ success: true, data: await updateStudentLetter(req.params.id, parsed.data) }); } catch (error) { handleError(error, res); } });
router.delete("/:id", async (req, res) => { try { res.json({ success: true, data: await deleteStudentLetter(req.params.id) }); } catch (error) { handleError(error, res); } });
export default router;
