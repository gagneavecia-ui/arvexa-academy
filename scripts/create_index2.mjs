// scripts/create_index2.mjs — crée les index composites via l'API v1beta2 collectionGroups
import { readFileSync } from 'fs';
import crypto from 'crypto';

const serviceAccount = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PROJECT = serviceAccount.project_id;
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
const claims = Buffer.from(JSON.stringify({
  iss: serviceAccount.client_email,
  scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
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
const bearer = { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' };

// Index demandés : [collection, [champs ASC]]
const INDEXES = [
  ['products', [
    { fieldPath: 'status', order: 'ASCENDING' },
    { fieldPath: 'type', order: 'ASCENDING' },
    { fieldPath: 'price', order: 'ASCENDING' }
  ]]
];

for (const [col, fields] of INDEXES) {
  const url = `https://firestore.googleapis.com/v1beta2/projects/${PROJECT}/databases/(default)/collectionGroups/${col}/indexes`;
  const res = await fetch(url, { method: 'POST', headers: bearer, body: JSON.stringify({ queryScope: 'COLLECTION', fields }) });
  const text = await res.text();
  let out;
  try { const j = JSON.parse(text); out = j.name ? `créé: ${j.name} [${j.state}]` : JSON.stringify(j).slice(0, 200); }
  catch (e) { out = text.slice(0, 150); }
  console.log(`[${res.status}] ${col} (${fields.map((f) => f.fieldPath).join('+')}) → ${out}`);
}
process.exit(0);
