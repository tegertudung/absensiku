import assert from 'assert/strict';

const baseUrl = process.env.BACKEND_BASE_URL || 'http://127.0.0.1:3001';
const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@pionerclass.com';
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';
const tutorEmail = process.env.TEST_TUTOR_EMAIL || 'tentor1@pionerclass.com';
const tutorPassword = process.env.TEST_TUTOR_PASSWORD || 'tentor123';

async function login(email: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `Login gagal untuk ${email}`);
  return (await response.json()).data.token as string;
}

async function upload(path: string, token: string, type: string, bytes: Uint8Array) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type }), 'client-name-is-not-used.png');
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
}

async function main() {
  const adminToken = await login(adminEmail, adminPassword);
  const tutorToken = await login(tutorEmail, tutorPassword);
  const validPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  assert.equal((await upload('/api/settings/logo', adminToken, 'text/plain', validPng)).status, 400);
  assert.equal((await upload('/api/settings/logo', adminToken, 'image/png', new Uint8Array(2 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await upload('/api/settings/logo', tutorToken, 'image/png', validPng)).status, 403);

  const logoResponse = await upload('/api/settings/logo', adminToken, 'image/png', validPng);
  assert.equal(logoResponse.status, 200);
  const logoSettings = (await logoResponse.json()).data;
  assert.match(logoSettings.logoPath, /^\/uploads\/settings\/logo\/logo-\d+-[a-f0-9]{24}\.png$/);
  assert.equal((await fetch(`${baseUrl}${logoSettings.logoPath}`)).status, 200);

  const signatureResponse = await upload('/api/settings/signature', adminToken, 'image/png', validPng);
  assert.equal(signatureResponse.status, 200);
  const signatureSettings = (await signatureResponse.json()).data;
  assert.match(signatureSettings.signaturePath, /^\/uploads\/settings\/signature\/signature-\d+-[a-f0-9]{24}\.png$/);
  assert.equal((await fetch(`${baseUrl}${signatureSettings.signaturePath}`)).status, 200);

  const programs = await fetch(`${baseUrl}/api/programs`, { headers: { authorization: `Bearer ${adminToken}` } });
  const regular = (await programs.json()).data.find((program: { code: string }) => program.code === 'REGULAR');
  assert.ok(regular);
  assert.equal((await fetch(`${baseUrl}/api/programs/${regular.id}`, { headers: { authorization: `Bearer ${adminToken}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/programs/not-a-real-id`, { headers: { authorization: `Bearer ${adminToken}` } })).status, 404);

  const created = await fetch(`${baseUrl}/api/programs`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ code: `TEST_${Date.now()}`, name: 'Program Uji Hapus', learningModel: 'INDIVIDUAL', usesQuota: true, defaultMeetingQuota: 24 }) });
  assert.equal(created.status, 201);
  const unused = (await created.json()).data;
  assert.equal((await fetch(`${baseUrl}/api/programs/${unused.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${adminToken}` } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/programs/${regular.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${adminToken}` } })).status, 409);
  console.log('Settings Phase 1 integration tests passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
