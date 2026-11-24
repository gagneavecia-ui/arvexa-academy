// scripts/approve_ambassador.mjs
// 👑 v1.1 — Valide une candidature ambassadeur : crée ambassadors/{uid}
// avec un code unique ARV-XXXXXX.
// Usage :
//   node scripts/approve_ambassador.mjs <sa.json> list            → candidatures en attente
//   node scripts/approve_ambassador.mjs <sa.json> approve <uid>   → valider
//   node scripts/approve_ambassador.mjs <sa.json> reject  <uid>   → refuser
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const [, , path, action, uidArg] = process.argv;
if (!path || !action) {
  console.error('Usage : node scripts/approve_ambassador.mjs <sa.json> list|approve <uid>|reject <uid>');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  if (action === 'list') {
    const snap = await db.collection('ambassadorApplications').get();
    const pending = snap.docs.filter((d) => d.data().status === 'pending');
    console.log(`Candidatures en attente : ${pending.length}`);
    pending.forEach((d) => {
      const a = d.data();
      console.log(`- ${d.id} | ${a.phone || '?'} | ${a.establishment || '?'} | ${(a.motivation || '').substring(0, 60)}…`);
    });
    return;
  }

  if (!uidArg) { console.error('UID manquant'); process.exit(1); }
  const appRef = db.collection('ambassadorApplications').doc(uidArg);
  const appSnap = await appRef.get();
  if (!appSnap.exists) { console.error('Candidature introuvable :', uidArg); process.exit(1); }

  if (action === 'reject') {
    await appRef.update({ status: 'rejected', reviewedAt: FieldValue.serverTimestamp() });
    console.log('🚫 Candidature refusée :', uidArg);
    return;
  }

  if (action === 'approve') {
    const profile = await db.collection('users').doc(uidArg).get();
    const firstName = (profile.exists && profile.data().firstName) || 'ELV';
    const base = String(firstName).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5) || 'ELV';
    const code = `ARV-${base}-${randomBytes(2).toString('hex').toUpperCase()}`;

    await db.collection('ambassadors').doc(uidArg).set({
      uid: uidArg,
      code,
      level: 'bronze',
      commissionRate: 0.10,
      status: 'active',
      stats: { clicks: 0, signups: 0, converted: 0 },
      earnings: 0,
      totalEarned: 0,
      approvedAt: FieldValue.serverTimestamp()
    });
    await appRef.update({ status: 'approved', code, reviewedAt: FieldValue.serverTimestamp() });
    console.log('👑 Ambassadeur validé :', uidArg, '→ code', code);
    return;
  }

  console.error('Action inconnue :', action);
  process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
