import { prisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { getSettings } from './settingsService';

export async function buildHonorSlip(tutorId: string, month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [tutor, settings, sessions] = await Promise.all([
    prisma.tutor.findUnique({ where: { id: tutorId } }), getSettings(),
    prisma.teachingSession.findMany({ where: { tutorId, status: 'COMPLETED', sessionDate: { gte: start, lt: end }, honorRateSnapshot: { not: null } }, include: { program: true }, orderBy: { sessionDate: 'asc' } }),
  ]);
  if (!tutor) throw new AppError('Tentor tidak ditemukan', 404);
  if (!sessions.length) throw new AppError('Belum ada sesi selesai pada periode tersebut.', 404);
  const rows = new Map<string, { program: string; sessions: number; rate: string; subtotal: number }>();
  for (const s of sessions) { const rate = s.honorRateSnapshot!.toString(); const program = s.program?.name ?? (s.sessionType === 'REGULAR' ? 'Reguler' : 'Privat'); const key=`${program}:${rate}`; const row=rows.get(key) ?? {program,sessions:0,rate,subtotal:0}; row.sessions++; row.subtotal += Number(rate); rows.set(key,row); }
  return { tutor, settings, month, year, rows: [...rows.values()], totalSessions: sessions.length, totalHonor: [...rows.values()].reduce((total,row)=>total+row.subtotal,0) };
}

function escapePdf(value: string) { return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,'?'); }
const rupiah = (value: number | string) => `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(value))}`;
export function renderHonorSlipPdf(slip: Awaited<ReturnType<typeof buildHonorSlip>>) {
  const monthName = new Intl.DateTimeFormat('id-ID',{month:'long'}).format(new Date(Date.UTC(slip.year, slip.month-1,1)));
  const printDate = new Intl.DateTimeFormat('id-ID',{dateStyle:'long'}).format(new Date());
  const text = (x:number,y:number,value:string,size=10,bold=false,color='0 0 0') => `BT /F${bold?'2':'1'} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${escapePdf(value)}) Tj ET`;
  const rect = (x:number,y:number,w:number,h:number,color:string) => `${color} rg ${x} ${y} ${w} ${h} re f`;
  const line = (x1:number,y1:number,x2:number,y2:number,color='0.8 0.82 0.86') => `${color} RG 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`;
  let y=650;
  const commands=[rect(0,800,595,42,'0.02 0.12 0.25'),text(50,815,slip.settings.institutionName||slip.settings.systemName,17,true,'1 1 1'),text(50,803,'SLIP HONOR TENTOR',8,false,'0.82 0.88 0.96'),text(50,765,'SLIP HONOR TENTOR',15,true,'0.02 0.12 0.25'),text(50,744,`Periode: ${monthName} ${slip.year}`,10),line(50,730,545,730),text(50,705,'Tentor',9,false,'0.35 0.38 0.43'),text(50,688,`${slip.tutor.name}${slip.tutor.title ? `, ${slip.tutor.title}` : ''}`,11,true),text(390,705,'Tanggal Cetak',9,false,'0.35 0.38 0.43'),text(390,688,printDate,10,true),rect(50,660,495,22,'0.93 0.95 0.98'),text(58,667,'No',8,true),text(86,667,'Program',8,true),text(220,667,'Jumlah Sesi',8,true),text(320,667,'Honor / Sesi',8,true),text(440,667,'Subtotal',8,true)];
  slip.rows.forEach((row,index)=>{commands.push(line(50,y,545,y),text(58,y-16,String(index+1),9),text(86,y-16,row.program,9),text(230,y-16,`${row.sessions} sesi`,9),text(330,y-16,rupiah(row.rate),9),text(445,y-16,rupiah(row.subtotal),9));y-=28;});
  commands.push(line(50,y,545,y),text(50,y-28,'TOTAL SESI',10,true),text(470,y-28,`${slip.totalSessions} sesi`,10,true),rect(50,y-64,495,30,'0.02 0.12 0.25'),text(62,y-53,'TOTAL HONOR',11,true,'1 1 1'),text(430,y-53,rupiah(slip.totalHonor),11,true,'1 1 1'),text(335,y-96,`${slip.settings.location || ''}, ${printDate}`,9),text(50,y-130,'Penanggung Jawab',9),text(420,y-130,'Tentor',9),line(50,y-198,210,y-198),line(385,y-198,545,y-198),text(50,y-214,slip.settings.signatoryName||'',10,true),text(50,y-230,slip.settings.signatoryTitle||'',9),text(420,y-214,slip.tutor.name,10,true),text(420,y-230,slip.tutor.title||'',9) );
  const content = commands.join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  let pdf='%PDF-1.4\n'; const offsets=[0]; objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}); const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf);
}
