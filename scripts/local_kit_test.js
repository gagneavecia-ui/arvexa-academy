/* Test local du kit IA v8.39 — OCR réel via la cascade (OpenRouter d'abord).
   ⚠️ AUCUNE clé dans le repo : lancer avec  OPENROUTER_API_KEY=sk-or-... node scripts/local_kit_test.js */
if (!process.env.OPENROUTER_API_KEY) {
  console.error('Définis OPENROUTER_API_KEY dans l\'environnement avant de lancer ce test.');
  process.exit(1);
}
const fs = require('fs');
const { EventEmitter } = require('events');
const handler = require('../_shared/arvx-ai-handler.js');

function makeReq(body) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/arv?kit=1';
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': 'sandbox-test' };
  req.socket = { remoteAddress: 'sandbox-test' };
  process.nextTick(() => { req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end'); });
  return req;
}
function makeRes() {
  return {
    code: 0, raw: '',
    writeHead(c, h) { this.code = c; this.headers = h || {}; },
    end(b) { this.raw = String(b || ''); },
  };
}

(async () => {
  const b64 = fs.readFileSync('/home/z/my-project/kit/arvx-ia-kit/assets/test-image.png').toString('base64');
  const dataUrl = 'data:image/png;base64,' + b64;
  const t0 = Date.now();
  const res = makeRes();
  await handler(makeReq({ task: 'image', mode: 'ocr', lang: 'fr', images: [dataUrl] }), res);
  const ms = Date.now() - t0;
  let body = {};
  try { body = JSON.parse(res.raw); } catch (e) {}
  console.log(`status=${res.code} elapsed=${ms}ms provider=${body.provider || '-'}`);
  const text = body?.data?.text || '';
  console.log('OCR extrait :', JSON.stringify(text.slice(0, 200)));
  console.log(text.toUpperCase().includes('BAKO') ? '✅ OCR OK (BAKO-47 lu)' : '⚠️ code secret absent du texte');
})().catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
