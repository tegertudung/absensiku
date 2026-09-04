import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { getSettings, replaceSettingsImage, updateSettings } from '../services/settingsService';
import { uploadSettingsImage } from '../middleware/settingsUpload';
const router=Router();
const identity=z.object({systemName:z.string().min(1).optional(),institutionName:z.string().min(1).optional(),address:z.string().optional(),email:z.string().email().or(z.literal('')).optional(),phone:z.string().optional(),signatoryName:z.string().optional(),signatoryTitle:z.string().optional(),location:z.string().optional(),domain:z.string().optional(),logoPath:z.string().optional()});
const session=z.object({minimumScheduleStartGapMinutes:z.number().int().min(0).optional(),lowQuotaWarningThreshold:z.number().int().min(0).optional(),zeroQuotaBlocking:z.boolean().optional(),dailyBatchCompletionEnabled:z.boolean().optional()});
const document=z.object({institutionName:z.string().min(1).optional(),signatoryName:z.string().optional(),signatoryTitle:z.string().optional(),location:z.string().optional(),footerText:z.string().optional(),logoPath:z.string().optional(),signaturePath:z.string().optional()});
router.get('/',requireAuth,async(_req:Request,res:Response)=>{try{res.json({success:true,data:await getSettings()});}catch(e){handleError(e,res)}});
for(const [path,validator] of [['/identity',identity],['/session',session],['/document',document]] as const) router.patch(path,requireAuth,requireRole('ADMIN'),async(req,res)=>{const p=validator.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Validation error',details:p.error.flatten().fieldErrors});try{res.json({success:true,data:await updateSettings(p.data)});}catch(e){handleError(e,res)}});
router.post('/logo', requireAuth, requireRole('ADMIN'), uploadSettingsImage('logo'), async (req, res) => {
  if (!req.settingsImage) return res.status(400).json({ error: 'Request failed', message: 'File gambar tidak ditemukan.' });
  try { res.json({ success: true, data: await replaceSettingsImage('logo', req.settingsImage) }); }
  catch { res.status(500).json({ error: 'Request failed', message: 'Gagal menyimpan logo.' }); }
});
router.post('/signature', requireAuth, requireRole('ADMIN'), uploadSettingsImage('signature'), async (req, res) => {
  if (!req.settingsImage) return res.status(400).json({ error: 'Request failed', message: 'File gambar tidak ditemukan.' });
  try { res.json({ success: true, data: await replaceSettingsImage('signature', req.settingsImage) }); }
  catch { res.status(500).json({ error: 'Request failed', message: 'Gagal menyimpan tanda tangan.' }); }
});
export default router;
