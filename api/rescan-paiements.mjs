// api/rescan-paiements.mjs
// ═══════════════════════════════════════════════════════════════════
// ✅ v8.69a — RATTRAPAGE AUTOMATIQUE DES PAIEMENTS (audit paiements P2)
//
// Le webhook SasPay et le poll navigateur (30-45 s) peuvent tous deux
// manquer un paiement : confirmation mobile money lente + webhook perdu.
// Avant, l'argent était encaissé sans produit livré, sans filet.
// Ce rescan (cron Vercel quotidien) relit TOUS les checkouts encore
// « pending » côté SasPay (serveur → serveur) et active ce qui est payé.
//
// 🔒 Même fail-closed que verifier-paiement :
//  - référence issue de saspayPendingCheckouts (créée par creer-checkout) ;
//  - statut PAID relu chez SasPay, jamais du client ;
//  - montant réel relu et comparé (>= attendu) ;
//  - idempotence totale (activateCheckout est ré-contrôlé).
//
// Vercel crons envoie Authorization: Bearer $CRON_SECRET si configurée —
// si la variable n'existe pas, le rescan reste accessible (lecture seule
// + activations légitimes seulement, aucune donnée client exposée).
// ═══════════════════════════════════════════════════════════════════

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { activateCheckout } from './_activation.mjs';
import { notifyTelegramBestEffort } from './_telegram.mjs';

const SASPAY_BASE = 'https://api.saspay.me/api/v1';
const PAID_STATUS = new Set(['PAID', 'SUCCESS', 'COMPLETED', 'SUCCESSFUL']);
const MAX_SCAN = 50; // garde-fou : jamais plus de 50 checkouts par passage

let _db = null;
function ensureFirebase() {
  if (_db) return _db;
  const raw = (process.env.FIREBASE_ADMIN_CREDENTIALS
           || process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new Error('FIREBASE_ADMIN_CREDENTIALS manquante dans Vercel');
  let sa;
  try { sa = JSON.parse(raw); }
  catch (e) { sa = JSON.parse(raw.replace(/\\n/g, '\n')); }
  if (!sa || !sa.project_id || !sa.private_key || !sa.client_email) {
    throw new Error('Service account incomplet');
  }
  if (!getApps().length) initializeApp({ credential: cert(sa) });
  _db = getFirestore();
  return _db;
}

async function saspayGet(path) {
  const apiKey = process.env.SASPAY_API_KEY;
  if (!apiKey) throw new Error('SASPAY_API_KEY manquante');
  const res = await fetch(`${SASPAY_BASE}${path}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; }
  catch (e) { return { status: res.status, json: null, raw: text.slice(0, 200) }; }
}

export default async function handler(req, res) {
  // Secret cron : si CRON_SECRET est configurée dans Vercel, elle est exigée.
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (cronSecret) {
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  let db;
  try {
    db = ensureFirebase();
  } catch (cfgErr) {
    console.error('🔴 Config Firebase admin invalide (rescan-paiements) :', cfgErr.message);
    return res.status(500).json({ ok: false, error: 'server_config' });
  }

  try {
    const pendingSnap = await db.collection('saspayPendingCheckouts')
      .where('status', '==', 'pending')
      .limit(MAX_SCAN)
      .get();

    const scan = [];
    let activated = 0;
    let stillPending = 0;
    let failed = 0;

    for (const doc of pendingSnap.docs) {
      const pending = doc.data();
      const ref = doc.id;
      const entry = { ref, kind: pending.kind || null, result: null };

      try {
        // Idempotence ré-contrôlée (un autre canal a pu activer entre-temps)
        const fresh = await doc.ref.get();
        if (fresh.exists && fresh.data().status !== 'pending') {
          entry.result = 'already_' + fresh.data().status;
          scan.push(entry);
          continue;
        }

        const sessionId = pending.saspaySessionId || null;
        if (!sessionId) { entry.result = 'no_session_id'; failed++; scan.push(entry); continue; }

        const statusRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
        if (statusRes.status !== 200 || !statusRes.json) {
          entry.result = 'status_unavailable'; stillPending++; scan.push(entry); continue;
        }
        const s = statusRes.json.data || statusRes.json;
        const sessionStatus = String(s.status || '').toUpperCase();
        const txStatus = String(s.transaction_status || '').toUpperCase();

        if (!PAID_STATUS.has(sessionStatus) && !PAID_STATUS.has(txStatus)) {
          // Toujours pas payé : si la session SasPay est expirée/annulée depuis
          // longtemps, on la marque failed pour arrêter de la rescanner.
          if (['EXPIRED', 'CANCELLED', 'FAILED', 'CANCELED'].includes(sessionStatus) ||
              ['EXPIRED', 'CANCELLED', 'FAILED', 'CANCELED'].includes(txStatus)) {
            await doc.ref.update({ status: 'failed', processedAt: FieldValue.serverTimestamp(), rescanClosedAt: new Date() });
            entry.result = 'closed_' + (sessionStatus || txStatus).toLowerCase();
            failed++;
          } else {
            entry.result = 'not_paid'; stillPending++;
          }
          scan.push(entry);
          continue;
        }

        // Payé → montant relu depuis le détail SasPay
        let paidAmount = 0;
        const detailRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/`);
        if (detailRes.status === 200 && detailRes.json) {
          const d = detailRes.json.data || detailRes.json;
          paidAmount = parseFloat(d.amount || '0');
        }
        const expectedAmount = Number(pending.amount || 0);
        if (!paidAmount || paidAmount < expectedAmount) {
          console.error(`🚫 rescan montant : payé=${paidAmount}, attendu=${expectedAmount} (${ref})`);
          entry.result = 'amount_mismatch'; failed++;
          await notifyTelegramBestEffort(`🚨 ARVEXA — RESCAN : montant illisible/insuffisant ${ref} (payé=${paidAmount}, attendu=${expectedAmount}). À activer manuellement.`);
          scan.push(entry);
          continue;
        }

        const result = await activateCheckout(db, doc.ref, pending, paidAmount, {
          transactionId: s.transaction_id || null,
          processedVia: 'rescan'
        });
        entry.result = result.activated ? 'activated' : ('failed_' + (result.reason || 'unknown'));
        if (result.activated) activated++;
        else failed++;
      } catch (itemErr) {
        console.error('rescan item error:', ref, itemErr.message);
        entry.result = 'error';
        failed++;
      }
      scan.push(entry);
    }

    const summary = `🔍 ARVEXA — RESCAN paiements : ${pendingSnap.size} pending scanné(s), ${activated} activé(s), ${stillPending} toujours pending, ${failed} fermé(s)/échec(s).`;
    if (pendingSnap.size > 0) await notifyTelegramBestEffort(summary);

    return res.status(200).json({
      ok: true, scanned: pendingSnap.size, activated, stillPending, failed, scan
    });
  } catch (err) {
    console.error('Erreur rescan-paiements :', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur', detail: err.message });
  }
}
