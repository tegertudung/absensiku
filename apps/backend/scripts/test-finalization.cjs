/* Runtime API regression. All fixtures use ASTRA TEST - and are created via HTTP.
 * QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD are required. Never logs credentials.
 * Keeps a manifest for safe cleanup after browser verification is complete.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const base = process.env.QA_API_URL || 'http://localhost:3001/api';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\/api$/.test(base)) throw Error('Local development API required');
const runId = process.env.QA_RUN_ID || Date.now().toString();
const prefix = `ASTRA TEST - ${runId}`;
const password = crypto.randomBytes(24).toString('base64url');
const manifest = { runId, created: [], results: [] };
const output = path.resolve('.cache', `finalization-${runId}.json`);
fs.mkdirSync(path.dirname(output), {recursive:true});
function persist(){fs.writeFileSync(output,JSON.stringify(manifest,null,2));}
async function request(route, token, method='GET', body) {
 const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const bytes=Buffer.from(await res.arrayBuffer()); let json;
 try{json=JSON.parse(bytes.toString());}catch{json=undefined;}
 if(json) assert(!JSON.stringify(json).includes('passwordHash'),'Password hash leaked');
 return {status:res.status, data:json?.data, json, bytes, headers:res.headers};
}
async function login(email,pw){const r=await request('/auth/login',null,'POST',{email,password:pw});assert.equal(r.status,200,'Login failed');return r.data.token;}
async function created(route,token,body){const r=await request(route,token,'POST',body);assert.equal(r.status,201,`${route}: ${r.json?.message||r.json?.error}`);manifest.created.push({route,id:r.data.id});persist();return r.data;}
async function check(test,fn){try{await fn();manifest.results.push({test,status:'PASS'});console.log('PASS',test);}catch(e){manifest.results.push({test,status:'FAIL',reason:e.message});console.log('FAIL',test,e.message);}persist();}
const day=new Date();const date=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
async function main(){
 const admin=await login(process.env.QA_ADMIN_EMAIL,process.env.QA_ADMIN_PASSWORD);
 const subject=await created('/subjects',admin,{name:prefix+' Mapel'});
 async function program(suffix,learningModel,rate,quota=24){return created('/programs',admin,{name:prefix+' '+suffix,code:`QA${runId}${suffix}`,learningModel,usesQuota:true,defaultMeetingQuota:quota,honorNominal:rate,honorEffectiveFrom:date});}
 const cb=await program('CB','CLASS_BASED',100000,3),cb2=await program('CB2','CLASS_BASED',120000,3),ind=await program('IN','INDIVIDUAL',75000),ind2=await program('IN2','INDIVIDUAL',85000);
 const cls=await created('/classes',admin,{name:prefix+' Kelas',programId:cb.id});
 const phone=String(Date.now()).slice(-10);
 const enrollment=[{programId:cb.id,classId:cls.id},{programId:cb2.id,classId:cls.id},{programId:ind.id},{programId:ind2.id}];
 const a=await created('/students',admin,{name:prefix+' Student A',phone,programEnrollments:enrollment});
 const b=await created('/students',admin,{name:prefix+' Student B',phone:phone.slice(0,-1)+'7',programEnrollments:enrollment});
 async function tutor(letter){return created('/tutors',admin,{name:prefix+' Tutor '+letter,email:`qa-${runId}-t${letter}@example.test`,password,phone:'080000000012',subjectIds:[subject.id]});}
 const ta=await tutor('a'),tb=await tutor('b');
 const at=await login(ta.email,password),bt=await login(tb.email,password);
 const pa=await created('/parents',admin,{name:prefix+' Parent A',email:`qa-${runId}-pa@example.test`,password,studentIds:[a.id]});
 const pb=await created('/parents',admin,{name:prefix+' Parent B',email:`qa-${runId}-pb@example.test`,password,studentIds:[b.id]});
 const pt=await login(pa.user.email,password);
 const pattern={programId:cb.id,startDate:date,slots:[{dayOfWeek:day.getDay(),startTime:'08:00',endTime:'09:00'},{dayOfWeek:(day.getDay()+2)%7,startTime:'08:00',endTime:'09:00'},{dayOfWeek:(day.getDay()+4)%7,startTime:'08:00',endTime:'09:00'}]};
 const occurrences=async()=> (await request('/schedules',admin)).data.filter(s=>s.programId===cb.id&&!s.isPattern);
 let occurrence,session;
 await check('pattern concurrent generation exactly quota',async()=>{const r=await Promise.all([1,2].map(()=>request('/schedules/patterns/'+cls.id,admin,'PUT',pattern)));assert(r.every(x=>x.status===200));const rows=await occurrences();assert.equal(rows.length,3);occurrence=rows.sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate))[0];});
 await check('unassigned is not personal schedule',async()=>{const r=await request('/schedules',at);assert(r.data.every(s=>s.tutorId===ta.id));});
 await check('admin completes same occurrence without duplicate',async()=>{const r=await request('/schedules/occurrences/'+occurrence.id+'/complete',admin,'PUT',{tutorId:ta.id,subjectId:subject.id,mode:'OFFLINE'});assert.equal(r.status,200);assert.equal(r.data.id,occurrence.id);assert.equal((await occurrences()).length,3);});
 await check('open session concurrently and reopen same id',async()=>{const rs=await Promise.all([1,2].map(()=>request('/sessions',at,'POST',{scheduleId:occurrence.id,sessionDate:date})));assert(rs.every(r=>r.status===201));assert.equal(rs[0].data.id,rs[1].data.id);session=rs[0].data;});
 const student=async id=>(await request('/students/'+id,admin)).data;
 const quota=async(id,pid)=>(await student(id)).programSummaries.find(e=>e.programId===pid).quota.quotaRemaining;
 await check('save preserves quota and draft',async()=>{const r=await request('/sessions/'+session.id+'/draft',at,'PATCH',{material:prefix+' materi',teachingNotes:'Catatan opsional'});assert.equal(r.status,200);assert.equal(await quota(a.id,cb.id),3);const reopened=await request('/sessions',at,'POST',{scheduleId:occurrence.id,sessionDate:date});assert.equal(reopened.data.material,prefix+' materi');});
 await check('Tutor IDOR read/write attendance and complete',async()=>{for(const [route,method,body] of [[`/sessions/${session.id}/attendance`,'GET'],[`/sessions/${session.id}/draft`,'PATCH',{material:'intrusion'}],[`/sessions/${session.id}/complete`,'POST',{}],[`/schedules/${occurrence.id}`,'GET']])assert([403,404].includes((await request(route,bt,method,body)).status));});
 await check('complete once under concurrency, honor 1x',async()=>{const rs=await Promise.all([1,2].map(()=>request('/sessions/'+session.id+'/complete',at,'POST',{})));assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);assert.equal(Number(rs.find(r=>r.status===200).data.honorRateSnapshot),100000);assert.equal(await quota(a.id,cb.id),2);assert.equal(await quota(b.id,cb.id),2);assert.equal(await quota(a.id,cb2.id),3);});
 const direct=(pid,ids,start='10:00',end='11:00',extra={})=>({programId:pid,subjectId:subject.id,studentIds:ids,sessionDate:date,startTime:start,endTime:end,mode:'OFFLINE',material:prefix+' materi',progressNotes:'Perkembangan tercatat',...extra});
 await check('private single only selected student/program consumed',async()=>{const r=await request('/sessions/direct',at,'POST',direct(ind2.id,[a.id]));assert.equal(r.status,201);assert.equal(Number(r.data.honorRateSnapshot),85000);assert.equal(await quota(a.id,ind2.id),23);assert.equal(await quota(a.id,ind.id),24);assert.equal(await quota(b.id,ind2.id),24);});
 let multi;
 await check('private multi consumes once each, honor 2x, retry blocked',async()=>{const body=direct(ind.id,[a.id,b.id],'11:00','12:00');const r=await request('/sessions/direct',at,'POST',body);assert.equal(r.status,201);multi=r.data;assert.equal(Number(multi.honorRateSnapshot),150000);assert.equal(await quota(a.id,ind.id),23);assert.equal(await quota(b.id,ind.id),23);assert.equal((await request('/sessions/direct',at,'POST',body)).status,409);assert.equal(await quota(a.id,ind.id),23);});
 await check('second private participant has history',async()=>{assert((await student(b.id)).sessionHistory.some(s=>s.id===multi.id));});
 await check('class detail and Parent agree on quota/history',async()=>{const c=(await request('/classes/'+cls.id,admin)).data;assert.equal(c.enrollments.length,c._count.studentPrograms);assert.equal(c.programQuotas.find(q=>q.programId===cb.id).quotaRemaining,2);const p=(await request('/parent/children/'+a.id+'/progress?date='+date,pt)).data;assert(p.regularAttendance.some(s=>s.id===session.id));assert(p.privateSessions.some(s=>s.id===multi.id));});
 await check('Parent RBAC/IDOR including PDF and exports',async()=>{for(const route of ['/students','/sessions','/schedules','/classes','/export/recap.xlsx','/sessions/validations'])assert.equal((await request(route,pt)).status,403,route);for(const suffix of ['/progress','/report.pdf'])assert.equal((await request('/parent/children/'+b.id+suffix,pt)).status,404);assert.equal((await request('/programs',pt,'POST',{})).status,403);});
 await check('Parent own PDF is valid',async()=>{const r=await request('/parent/children/'+a.id+'/report.pdf',pt);assert.equal(r.status,200);assert(r.bytes.toString().startsWith('%PDF-'));});
 await check('student duplicate concurrent and whitespace normalized',async()=>{const body={name:prefix+' Duplicate',phone:'080000000099'};const rs=await Promise.all([1,2].map(()=>request('/students',admin,'POST',body)));rs.filter(r=>r.data?.id).forEach(r=>manifest.created.push({route:'/students',id:r.data.id}));assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal((await request('/students',admin,'POST',{...body,name:body.name.replace(/ /g,'  ')})).status,409);});
 await check('student edit excludes self, immutable code',async()=>{const before=await student(a.id);const r=await request('/students/'+a.id,admin,'PUT',{name:a.name,phone,studentCode:'SIS-FORGED'});assert.equal(r.status,200);assert.equal((await student(a.id)).studentCode,before.studentCode);});
 await check('duplicate private selection rejected',async()=>{assert.equal((await request('/sessions/direct',at,'POST',direct(ind.id,[a.id,a.id],'12:00','13:00'))).status,400);});
 await check('inactive enrollment rejected',async()=>{await request('/students/'+b.id,admin,'PUT',{phone:b.phone,programEnrollments:enrollment.filter(e=>e.programId!==ind.id)});assert([409,422,404].includes((await request('/sessions/direct',at,'POST',direct(ind.id,[b.id],'12:00','13:00'))).status));});
 await check('auth invalid, wrong password, open registration blocked',async()=>{assert.equal((await request('/auth/me','invalid')).status,401);assert.equal((await request('/auth/register',null,'POST',{})).status,401);assert.equal((await request('/auth/login',null,'POST',{email:ta.email,password:'incorrect-password'})).status,401);});
 await check('disabled user token rejected, restore test account',async()=>{await request('/tutors/'+tb.id+'/deactivate',admin,'PATCH',{});assert.equal((await request('/auth/me',bt)).status,401);await request('/tutors/'+tb.id+'/activate',admin,'PATCH',{});});
 await check('two Tutors claim one occurrence: one winner',async()=>{
   await request('/schedules/patterns/'+cls.id,admin,'PUT',{...pattern,programId:cb2.id,slots:[{dayOfWeek:day.getDay(),startTime:'13:00',endTime:'14:00'}]});
   const rows=(await request('/schedules',admin)).data.filter(s=>s.programId===cb2.id&&!s.isPattern).sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate));
   const body=direct(cb2.id,undefined,'13:00','14:00',{classId:cls.id,scheduleId:rows[0].id});
   const rs=await Promise.all([at,bt].map(t=>request('/sessions/direct',t,'POST',body)));
   assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);
   assert.equal((await request('/schedules',admin)).data.filter(s=>s.programId===cb2.id&&!s.isPattern).length,3);
 });
 await check('class quota zero blocks, other Program unchanged',async()=>{
   for(const start of ['14:00','15:00'])assert.equal((await request('/sessions/direct',at,'POST',direct(cb2.id,undefined,start,start==='14:00'?'15:00':'16:00',{classId:cls.id}))).status,201);
   assert.equal(await quota(a.id,cb2.id),0);assert.equal(await quota(a.id,cb.id),2);
   assert.equal((await request('/sessions/direct',at,'POST',direct(cb2.id,undefined,'16:00','17:00',{classId:cls.id}))).status,409);
 });
 async function cancellation(start,decision){
   const end=String(Number(start.slice(0,2))+1).padStart(2,'0')+':00';
   const m=await created('/schedules/meetings',admin,{sessionType:'PRIVATE',programId:ind2.id,studentId:a.id,subjectId:subject.id,tutorId:ta.id,sessionDate:date,startTime:start,endTime:end,mode:'OFFLINE'});
   const before=await quota(a.id,ind2.id);
   const c=await request('/sessions/'+m.id+'/cancel',at,'POST',{reason:prefix+' batal hari H'});assert.equal(c.status,200);
   assert.equal(await quota(a.id,ind2.id),before);
   assert.equal((await request('/sessions/validations/'+c.data.id+'/decide',at,'POST',{decision})).status,403);
   const rs=await Promise.all([1,2].map(()=>request('/sessions/validations/'+c.data.id+'/decide',admin,'POST',{decision})));
   assert.deepEqual(rs.map(r=>r.status).sort(),[200,409]);
   assert.equal(await quota(a.id,ind2.id),before-(decision==='APPROVED'?1:0));
 }
 await check('day-of cancellation approved atomically counts once',()=>cancellation('18:00','APPROVED'));
 await check('day-of cancellation rejected does not count',()=>cancellation('20:00','REJECTED'));
 await check('daily completion restricted to Tutor and selected date',async()=>{assert.equal((await request('/sessions/complete-batch',bt,'POST',{date,sessionIds:[session.id]})).status,403);});
 await check('historical honor remains unchanged after new rate',async()=>{
   const before=(await request('/sessions',at)).data.find(s=>s.id===multi.id).honorRateSnapshot;
   const nextDay=new Date(day);nextDay.setDate(day.getDate()+1);const effective=[nextDay.getFullYear(),String(nextDay.getMonth()+1).padStart(2,'0'),String(nextDay.getDate()).padStart(2,'0')].join('-');
   const r=await request('/honor-rates',admin,'POST',{programId:ind.id,nominal:99000,effectiveFrom:effective});assert.equal(r.status,201);
   const after=(await request('/sessions',at)).data.find(s=>s.id===multi.id).honorRateSnapshot;assert.equal(after,before);
 });
 await check('reset password keeps Tutor/User/history and excludes secrets',async()=>{const next=crypto.randomBytes(24).toString('hex');assert.equal((await request('/tutors/'+ta.id+'/password',admin,'PATCH',{newPassword:next})).status,200);assert.equal((await request('/auth/login',null,'POST',{email:ta.email,password})).status,401);await login(ta.email,next);const t=(await request('/tutors/'+ta.id,admin)).data;assert.equal(t.id,ta.id);assert.equal(t.userId,ta.userId);});
 await check('malformed and oversized JSON use 400/413, no stack',async()=>{for(const [body,expected]of [['{',400],[JSON.stringify({x:'a'.repeat(150000)}),413]]){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,expected);assert(!(await r.text()).includes('SyntaxError'));}});
 await check('date validation and security headers',async()=>{assert.equal((await request('/programs',admin,'POST',{name:prefix+' BadDate',code:runId+'BAD',learningModel:'INDIVIDUAL',honorNominal:1,honorEffectiveFrom:'2026-02-31'})).status,400);const r=await request('/health');assert.equal(r.headers.get('x-content-type-options'),'nosniff');});
 manifest.finishedAt=new Date().toISOString();persist();
 console.log(JSON.stringify({pass:manifest.results.filter(r=>r.status==='PASS').length,fail:manifest.results.filter(r=>r.status==='FAIL').length,manifest:output}));
 if(manifest.results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
main().catch(e=>{console.error('Setup failed:',e.message);persist();process.exitCode=1;});

