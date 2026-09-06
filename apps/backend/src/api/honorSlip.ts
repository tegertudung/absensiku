import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { handleError } from '../utils/errors';
import { resolveTutorIdForUser } from '../services/sessionService';
import { buildHonorSlip } from '../services/honorSlipService';
const router=Router();
// slip-summary is the only endpoint now — the old /slip.pdf route rendered
// through a hand-rolled raw-PDF byte generator that only ever drew text
// (no logo/signature image support), while the frontend's print-preview
// pages (admin/recap/slip/[tutorId], tentor/recap/slip) already render
// this same data as HTML and use the browser's own print-to-PDF, which
// picks up Settings' logo/signature correctly. See honorSlipService.ts.
router.get('/slip-summary', requireAuth, async(req:Request,res:Response)=>{ let tutorId=typeof req.query.tutorId==='string'?req.query.tutorId:''; const month=Number(req.query.month),year=Number(req.query.year); if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<2000)return res.status(400).json({error:'Validation error',message:'Bulan dan tahun tidak valid.'}); try { if(req.user!.role==='TENTOR') { const own=await resolveTutorIdForUser(req.user!.userId); if(!own || (tutorId && tutorId!==own)) return res.status(403).json({error:'Forbidden',message:'Anda hanya dapat melihat honor sendiri.'}); tutorId=own; } if(req.user!.role!=='ADMIN'&&req.user!.role!=='TENTOR') return res.status(403).json({error:'Forbidden'}); if(!tutorId)return res.status(400).json({error:'Validation error',message:'Tentor wajib diisi.'}); res.json({success:true,data:await buildHonorSlip(tutorId,month,year)}); }catch(e){handleError(e,res);} });
export default router;
