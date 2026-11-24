// scripts/probe_rest.mjs — sonde les endpoints REST Firestore
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
const bearer = { Authorization: `Bearer ${tokenData.access_token}` };

const tests = [
  ['GET documents (données)', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/products?pageSize=3`],
  ['GET databases (liste)', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases`],
  ['GET indexes v1', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/indexes`],
  ['GET indexes v1beta2', `https://firestore.googleapis.com/v1beta2/projects/${PROJECT}/databases/(default)/indexes`],
  ['GET indexes collectionGroups', `https://firestore.googleapis.com/v1beta2/projects/${PROJECT}/databases/(default)/collectionGroups/products/indexes`]
];
for (const [label, url] of tests) {
  const r = await fetch(url, { headers: bearer });
  const t = await r.text();
  let short;
  try { const j = JSON.parse(t); short = JSON.stringify(j).slice(0, 220); }
  catch (e) { short = `HTML ${r.status}: ${t.slice(0, 100).replace(/\n/g, ' ')}`; }
  console.log(`[${r.status}] ${label} → ${short}\n`);
}
process.exit(0);
