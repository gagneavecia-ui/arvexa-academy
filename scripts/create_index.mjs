// scripts/create_index.mjs — crée l'index composite products (status, type, price)
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
if (!tokenData.access_token) { console.error('❌ OAuth échoué', JSON.stringify(tokenData).slice(0, 200)); process.exit(1); }
const bearer = { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' };

const INDEX = {
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'status', order: 'ASCENDING' },
    { fieldPath: 'type', order: 'ASCENDING' },
    { fieldPath: 'price', order: 'ASCENDING' }
  ]
};

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/indexes`;
console.log('POST', url);
const res = await fetch(url, { method: 'POST', headers: bearer, body: JSON.stringify(INDEX) });
const text = await res.text();
console.log('status:', res.status);
try { console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 500)); }
catch (e) { console.log('réponse non-JSON:', text.slice(0, 300)); }
process.exit(0);
