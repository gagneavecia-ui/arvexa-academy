// scripts/diag2.mjs — test requête marketplace + règles + index
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const serviceAccount = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PROJECT = serviceAccount.project_id;
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── 1. Requête EXACTE de marketplace.html (loadPacks) ──
console.log('═══ 1. REQUÊTE EXACTE marketplace (type==credits, status==approved, orderBy price) ═══');
try {
  const q = db.collection('products')
    .where('type', '==', 'credits')
    .where('status', '==', 'approved')
    .orderBy('price', 'asc');
  const snap = await q.get();
  console.log(`✅ requête OK — ${snap.size} documents:`, snap.docs.map((d) => d.id).join(', '));
} catch (e) {
  console.log('❌ requête ÉCHOUÉE:', e.message.slice(0, 400));
}

// ── 2. Jeton OAuth2 ──
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
const claims = Buffer.from(JSON.stringify({
  iss: serviceAccount.client_email,
  scope: 'https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now, exp: now + 3600
})).toString('base64url');
const signer = crypto.createSign('RSA-SHA256');
signer.update(`${header}.${claims}`);
const signature = signer.sign(serviceAccount.private_key).toString('base64url');
const jwt = `${header}.${claims}.${signature}`;
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
});
const tokenData = await tokenRes.json();
if (!tokenData.access_token) { console.error('❌ OAuth échoué'); process.exit(1); }
const bearer = { Authorization: `Bearer ${tokenData.access_token}` };

async function getJson(url) {
  const r = await fetch(url, { headers: bearer });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { _httpError: r.status, _body: t.slice(0, 200) }; }
}

// ── 3. Règles déployées (releases correct) ──
console.log('\n═══ 2. RÈGLES DÉPLOYÉES ═══');
const relData = await getJson(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`);
const release = (relData.releases || [])[0];
if (!release) { console.log('⚠️ aucune release', JSON.stringify(relData).slice(0, 200)); }
else {
  const rs = await getJson(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const src = rs.source?.files?.[0]?.content || '';
  console.log('ruleset:', release.rulesetName, '| taille:', src.length);
  for (const kw of ['products', 'purchases', 'ambassadorApplications', 'referrals', 'promos', 'aiCredits', 'marketplace']) {
    console.log(`  ${src.includes(kw) ? '✅' : '❌'} « ${kw} »`);
  }
  const vMark = [...new Set(src.match(/v\d+\.\d+[a-z]?/g) || [])];
  console.log('  versions mentionnées:', vMark.join(', ') || 'aucune');
}

// ── 4. Index composites ──
console.log('\n═══ 3. INDEX COMPOSITES ═══');
const idxData = await getJson(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/indexes`);
if (idxData._httpError) {
  console.log('⚠️ API indexes inaccessible:', idxData._httpError, idxData._body);
} else {
  const indexes = idxData.indexes || [];
  console.log(`index composites: ${indexes.length}`);
  indexes.forEach((ix) => {
    const fields = (ix.fields || []).map((f) => `${f.fieldPath}(${f.order || f.arrayConfig})`).join(' + ');
    console.log(`  · ${fields} [${ix.state}]`);
  });
  if (!indexes.length) console.log('⚠️ AUCUN index composite → toute requête where+orderBy échoue !');
}
process.exit(0);
