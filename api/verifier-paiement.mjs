// api/verifier-paiement.mjs
// ═══════════════════════════════════════════════════════════════════
// ⚡ v8.59a — VÉRIFICATION SERVEUR D'UN PAIEMENT SASPAY (canal de secours)
//
// Au retour du paiement (?statut=succes&ref=ARV-...), les pages
// marketplace.html / abonnement.html appellent cette API. Elle relit la
// session SasPay CÔTÉ SERVEUR (Authorization: Bearer sk_live) et active
// les crédits / l'abonnement même si le webhook SasPay est retardé, mal
// configuré ou perdu. C'est le canal qui garantit le « paiement
// automatique » demandé par le propriétaire.
//
// 🔒 SÉCURITÉ (fail-closed) :
//  - la référence DOIT exister dans saspayPendingCheckouts (créée par
//    api/creer-checkout avec le montant calculé côté serveur) ;
//  - le statut PAID vient de SasPay (serveur → serveur), jamais du client ;
//  - le montant payé est relu depuis SasPay et comparé (>= attendu) ;
//  - idempotence : un checkout déjà processed renvoie déjà activé ;
//  - rate limit simple en mémoire (30 req/min/IP).
//
// Doc SasPay : GET /api/v1/checkout-sessions/{id}/status/ (léger, statut)
//              GET /api/v1/checkout-sessions/{id}/ (détail avec amount)
// ═══════════════════════════════════════════════════════════════════

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { activateCheckout } from './_activation.mjs';
import { notifyTelegramBestEffort } from './_telegram.mjs'; /* ✅ v8.69a — alertes rattrapage */

const SASPAY_BASE = 'https://api.saspay.me/api/v1';

// Statuts SasPay considérés comme payés (session + transaction)
const PAID_STATUS = new Set(['PAID', 'SUCCESS', 'COMPLETED', 'SUCCESSFUL']);

let _db = null;
let _initError = null;

function ensureFirebase() {
  if (_db) return _db;
  if (_initError) throw _initError;
  try {
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
  } catch (e) {
    _initError = e;
    throw e;
  }
}

// ── Rate limit mémoire (par instance — suffisant comme garde douce) ──
const RATE = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;
function rateLimited(ip) {
  const now = Date.now();
  const entry = RATE.get(ip);
  if (!entry || now > entry.reset) {
    RATE.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function resolveOrigin(req) {
  const envOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (envOrigin) return envOrigin.startsWith('http') ? envOrigin : `https://${envOrigin}`;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  return 'https://arvexa-academy.vercel.app';
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
  const ORIGIN = resolveOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ✅ v8.69a — RATTRAPAGE AUTOMATIQUE des paiements (audit P2) : le webhook
     ET le poll navigateur peuvent tous deux manquer un paiement (confirmation
     mobile money lente + webhook perdu). Le cron Vercel quotidien appelle
     GET /api/verifier-paiement → rescan de tous les checkouts « pending »
     côté SasPay (serveur → serveur) et active ce qui est payé.
     Fusionné DANS ce fichier : la limite Hobby de 12 Serverless Functions
     interdit un 13ᵉ fichier d'API. Configurer CRON_SECRET dans Vercel pour
     verrouiller ce endpoint (le cron l'envoie en Authorization: Bearer). */
  if (req.method === 'GET') return rescanPaiements(req, res);

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'ip').split(',')[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Trop de vérifications — patiente un instant.' });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    let db;
    try {
      db = ensureFirebase();
    } catch (cfgErr) {
      console.error('🔴 Config Firebase admin invalide (verifier-paiement) :', cfgErr.message);
      return res.status(500).json({ ok: false, error: 'server_config' });
    }

    const { ref } = req.body || {};
    if (!ref || typeof ref !== 'string' || ref.length > 80 || !/^ARV-[0-9]+-[A-Za-z0-9]{1,20}$/.test(ref)) {
      return res.status(400).json({ ok: false, error: 'Référence invalide' });
    }

    // 🔒 1. Le checkout DOIT avoir été créé par creer-checkout (fail-closed)
    const pendingRef = db.collection('saspayPendingCheckouts').doc(ref);
    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      return res.status(200).json({ ok: false, activated: false, reason: 'unknown_reference' });
    }
    const pending = pendingSnap.data();

    // 🔒 2. Idempotence : déjà activé (webhook ou vérification précédente)
    if (pending.status === 'processed') {
      return res.status(200).json({ ok: true, activated: true, already: true, kind: pending.kind || null });
    }
    if (pending.status === 'failed') {
      return res.status(200).json({ ok: true, activated: false, reason: 'failed' });
    }

    // 🔒 3. Identifiant de session SasPay (stocké à la création du checkout)
    let sessionId = pending.saspaySessionId || null;
    if (!sessionId) {
      // Compat : les anciens checkouts le stockaient sur le document user
      try {
        const uSnap = await db.collection('users').doc(pending.uid).get();
        sessionId = uSnap.data()?.saspayCheckoutSessionId || null;
      } catch (e) { /* ignorer */ }
    }
    if (!sessionId) {
      return res.status(200).json({ ok: true, activated: false, reason: 'no_session_id' });
    }

    // 🔒 4. Statut de la session chez SasPay (serveur → serveur)
    const statusRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
    if (statusRes.status !== 200 || !statusRes.json) {
      console.warn('verifier-paiement : statut SasPay illisible', sessionId, statusRes.status);
      return res.status(200).json({ ok: true, activated: false, reason: 'status_unavailable' });
    }
    const s = statusRes.json.data || statusRes.json;
    const sessionStatus = String(s.status || '').toUpperCase();
    const txStatus = String(s.transaction_status || '').toUpperCase();
    const isPaid = PAID_STATUS.has(sessionStatus) || PAID_STATUS.has(txStatus);

    if (!isPaid) {
      return res.status(200).json({
        ok: true, activated: false, reason: 'not_paid',
        sessionStatus: sessionStatus || null, transactionStatus: txStatus || null
      });
    }

    // 🔒 5. Montant réel relu depuis le détail SasPay (champ amount)
    let paidAmount = 0;
    const detailRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/`);
    if (detailRes.status === 200 && detailRes.json) {
      const d = detailRes.json.data || detailRes.json;
      paidAmount = parseFloat(d.amount || '0');
    }
    const expectedAmount = Number(pending.amount || 0);
    if (!paidAmount || paidAmount < expectedAmount) {
      // Statut payé mais montant illisible/insuffisant → on refuse par sécurité
      console.error(`🚫 verifier-paiement montant : payé=${paidAmount}, attendu=${expectedAmount} (${ref})`);
      return res.status(200).json({ ok: true, activated: false, reason: 'amount_mismatch' });
    }

    // 🔒 6. Idempotence ré-contrôlée avant activation (double-clic / appels parallèles)
    const reSnap = await pendingRef.get();
    if (reSnap.exists && reSnap.data().status === 'processed') {
      return res.status(200).json({ ok: true, activated: true, already: true, kind: pending.kind || null });
    }

    // ⚡ 7. Activation partagée (crédits ou abonnement + parrainage)
    const result = await activateCheckout(db, pendingRef, reSnap.exists ? reSnap.data() : pending, paidAmount, {
      transactionId: s.transaction_id || null,
      processedVia: 'verifier'
    });
    if (!result.activated) {
      return res.status(200).json({ ok: true, activated: false, reason: result.reason });
    }

    return res.status(200).json({ ok: true, activated: true, kind: result.kind });

  } catch (err) {
    console.error('Erreur verifier-paiement :', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur', detail: err.message });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ✅ v8.69a — RESCAN QUOTIDIEN (cron Vercel → GET)
   Même fail-closed que le POST : référence serveur obligatoire, statut
   PAID relu chez SasPay, montant relu et comparé, idempotence totale.
   CRON_SECRET configurée dans Vercel → exigée en Bearer ; sinon ouvert
   (aucune donnée client exposée, activations légitimes seulement).
   ═══════════════════════════════════════════════════════════════════ */
const RESCAN_MAX = 50; // garde-fou : jamais plus de 50 checkouts par passage

async function rescanPaiements(req, res) {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (cronSecret) {
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }

  try {
    let db;
    try {
      db = ensureFirebase();
    } catch (cfgErr) {
      console.error('🔴 Config Firebase admin invalide (rescan) :', cfgErr.message);
      return res.status(500).json({ ok: false, error: 'server_config' });
    }

    const pendingSnap = await db.collection('saspayPendingCheckouts')
      .where('status', '==', 'pending')
      .limit(RESCAN_MAX)
      .get();

    let activated = 0;
    let stillPending = 0;
    let failed = 0;

    for (const doc of pendingSnap.docs) {
      const pending = doc.data();
      const ref = doc.id;
      try {
        const fresh = await doc.ref.get();
        if (fresh.exists && fresh.data().status !== 'pending') { continue; }

        const sessionId = pending.saspaySessionId || null;
        if (!sessionId) { failed++; continue; }

        const statusRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
        if (statusRes.status !== 200 || !statusRes.json) { stillPending++; continue; }
        const s = statusRes.json.data || statusRes.json;
        const sessionStatus = String(s.status || '').toUpperCase();
        const txStatus = String(s.transaction_status || '').toUpperCase();

        if (!PAID_STATUS.has(sessionStatus) && !PAID_STATUS.has(txStatus)) {
          // Session expirée/annulée depuis longtemps → on la ferme pour
          // arrêter de la rescanner ; sinon elle reste « pending ».
          if (['EXPIRED', 'CANCELLED', 'FAILED', 'CANCELED'].includes(sessionStatus) ||
              ['EXPIRED', 'CANCELLED', 'FAILED', 'CANCELED'].includes(txStatus)) {
            await doc.ref.update({ status: 'failed', processedAt: FieldValue.serverTimestamp(), rescanClosedAt: new Date() });
            failed++;
          } else {
            stillPending++;
          }
          continue;
        }

        // Payé → montant réel relu depuis le détail SasPay
        let paidAmount = 0;
        const detailRes = await saspayGet(`/checkout-sessions/${encodeURIComponent(sessionId)}/`);
        if (detailRes.status === 200 && detailRes.json) {
          const d = detailRes.json.data || detailRes.json;
          paidAmount = parseFloat(d.amount || '0');
        }
        const expectedAmount = Number(pending.amount || 0);
        if (!paidAmount || paidAmount < expectedAmount) {
          console.error(`🚫 rescan montant : payé=${paidAmount}, attendu=${expectedAmount} (${ref})`);
          await notifyTelegramBestEffort(`🚨 ARVEXA — RESCAN : montant illisible/insuffisant ${ref} (payé=${paidAmount}, attendu=${expectedAmount}). À activer manuellement.`);
          failed++;
          continue;
        }

        const result = await activateCheckout(db, doc.ref, pending, paidAmount, {
          transactionId: s.transaction_id || null,
          processedVia: 'rescan'
        });
        if (result.activated) activated++;
        else {
          failed++;
          await notifyTelegramBestEffort(`🚨 ARVEXA — RESCAN : activation échouée ${ref} (${result.reason || 'raison inconnue'}).`);
        }
      } catch (itemErr) {
        console.error('rescan item error:', ref, itemErr.message);
        failed++;
      }
    }

    if (pendingSnap.size > 0) {
      await notifyTelegramBestEffort(`🔍 ARVEXA — RESCAN paiements : ${pendingSnap.size} pending scanné(s), ${activated} activé(s), ${stillPending} toujours pending, ${failed} fermé(s)/échec(s).`);
    }

    return res.status(200).json({
      ok: true, scanned: pendingSnap.size, activated, stillPending, failed
    });
  } catch (err) {
    console.error('Erreur rescan-paiements :', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur', detail: err.message });
  }
}
