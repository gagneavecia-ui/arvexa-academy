// scripts/diag_firestore.mjs
// 🔎 Diagnostic Firestore : products, règles déployées, index composites
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const serviceAccount = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PROJECT = serviceAccount.project_id;

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── 1. Contenu de products ──
console.log('═══ 1. COLLECTION products ═══');
const snap = await db.collection('products').get();
console.log(`documents: ${snap.size}`);
snap.forEach((d) => console.log(`  · ${d.id} →`, JSON.stringify(d.data())));

// ── 2. Jeton OAuth2 via JWT manuel (pour API Rules + Indexes) ──
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
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  })
});
const tokenData = await tokenRes.json();
if (!tokenData.access_token) {
  console.error('❌ Jeton OAuth échoué:', JSON.stringify(tokenData).slice(0, 300));
  process.exit(1);
}
const bearer = { Authorization: `Bearer ${tokenData.access_token}` };

// ── 3. Règles déployées ──
console.log('\n═══ 2. RÈGLES FIRESTORE DÉPLOYÉES ═══');
const relRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, { headers: bearer });
const relData = await relRes.json();
const release = (relData.release || [])[0];
if (!release) {
  console.log('⚠️ aucune release trouvée', JSON.stringify(relData).slice(0, 300));
} else {
  console.log('release:', release.name);
  const rsRes = await fetch(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`, { headers: bearer });
  const rs = await rsRes.json();
  const src = rs.source?.files?.[0]?.content || '';
  console.log('taille règles déployées:', src.length, 'caractères');
  const interesting = ['products', 'purchases', 'users/{uid}/purchases', 'aiCredits', 'creditsExpiry', 'ambassadorApplications', 'referrals', 'promos'];
  for (const kw of interesting) {
    const found = src.includes(kw);
    console.log(`  ${found ? '✅' : '❌'} règle contient « ${kw} »`);
  }
  // dernière ligne de version si commentée
  const vMark = src.match(/v\d+\.\d+[a-z]?/g);
  if (vMark) console.log('  marqueurs de version trouvés:', [...new Set(vMark)].join(', '));
}

// ── 4. Index composites ──
console.log('\n═══ 3. INDEX COMPOSITES FIRESTORE ═══');
const idxRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/indexes?pageSize=100`, { headers: bearer });
const idxData = await idxRes.json();
const indexes = idxData.indexes || [];
console.log(`index composites: ${indexes.length}`);
indexes.forEach((ix) => {
  const fields = (ix.fields || []).map((f) => `${f.fieldPath}(${f.order || f.arrayConfig})`).join(' + ');
  console.log(`  · ${fields} [${ix.state}] ${ix.queryScope}`);
});
process.exit(0);
