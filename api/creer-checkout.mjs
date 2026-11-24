// api/creer-checkout.mjs
// 🔒 Version sécurisée (v2) :
//  - Le montant est TOUJOURS calculé côté serveur (clientAmount ignoré/supprimé)
//  - Remises promo plafonnées (-90 % max) et code sanitisé
//  - Le checkout est enregistré côté serveur (saspayPendingCheckouts) :
//    le webhook vérifie montant + plan contre cette référence avant d'activer

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ⚡ v1.1 — prix mensuel porté de 2 000 à 3 000 FCFA (décision propriétaire),
// annuel inchangé (18 000 F = l'offre mise en avant).
const PRICES = { monthly: 3000, annual: 18000 };
const BASE = 'https://api.saspay.me/api/v1';

// ✅ FIX (2026-10-26) — SITE_URL n'est plus codée en dur : l'ancien domaine
// arvexaschool.vercel.app est mort (404), ce qui cassait success_url,
// cancel_url et surtout webhook_url (SasPay ne pouvait plus joindre le
// webhook → abonnement jamais activé). L'origine est maintenant déduite
// de la requête (x-forwarded-host), avec APP_ORIGIN en priorité.
function resolveSiteUrl(req) {
  const envOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (envOrigin) {
    return envOrigin.startsWith('http') ? envOrigin : `https://${envOrigin}`;
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  // ✅ v8.55a — repli sur le domaine vivant (l'ancien arvexaschool.vercel.app est mort)
  return 'https://arvexa-academy.vercel.app';
}

// ✅ FIX CRITIQUE (2026-10-26) — même correction que le webhook : init
// paresseuse + FIREBASE_ADMIN_CREDENTIALS (la variable réellement présente
// dans Vercel, comme les autres API) au lieu de FIREBASE_SERVICE_ACCOUNT
// (inexistante). Sans ça, la fonction crashait au chargement du module.
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
    catch (e) {
      // Piège classique Vercel : clé privée collée avec \n littéraux
      sa = JSON.parse(raw.replace(/\\n/g, '\n'));
    }
    if (!sa || !sa.project_id || !sa.private_key || !sa.client_email) {
      throw new Error('Service account incomplet (project_id / private_key / client_email)');
    }

    if (!getApps().length) initializeApp({ credential: cert(sa) });
    _db = getFirestore();
    return _db;
  } catch (e) {
    _initError = e;
    throw e;
  }
}

export default async function handler(req, res) {
  const SITE_URL = resolveSiteUrl(req);
  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ✅ FIX — vérification de la config Firebase AVANT de contacter SasPay :
    // si elle est cassée, on refuse d'encaisser un paiement qui ne pourrait
    // jamais être activé par le webhook (fail-closed).
    let db;
    try {
      db = ensureFirebase();
    } catch (cfgErr) {
      console.error('🔴 Config Firebase admin invalide :', cfgErr.message);
      return res.status(500).json({
        error: 'server_config',
        detail: 'Paiement temporairement indisponible — contacte le support'
      });
    }

    // 🔒 clientAmount volontairement ignoré : seul le serveur décide du prix
    // ⚡ v1.1 — kind : 'subscription' (défaut) | 'credits' (packs Marketplace)
    const { uid, plan, kind, productId, promoCode, customerEmail, customerName } = req.body || {};
    const checkoutKind = kind === 'credits' ? 'credits' : 'subscription';

    if (!uid) return res.status(400).json({ error: 'Champs manquants' });
    if (typeof uid !== 'string' || uid.length > 128) return res.status(400).json({ error: 'UID invalide' });

    let amount = 0;
    let planValue = null;
    let productInfo = null;

    if (checkoutKind === 'credits') {
      // ─── Pack de crédits : le prix vient TOUJOURS du produit Firestore ───
      if (!productId || typeof productId !== 'string' || productId.length > 64) {
        return res.status(400).json({ error: 'Produit invalide' });
      }
      const productSnap = await db.collection('products').doc(productId).get();
      const product = productSnap.exists ? productSnap.data() : null;
      if (!product || product.status !== 'approved' || product.type !== 'credits') {
        return res.status(400).json({ error: 'Produit indisponible' });
      }
      amount = Math.round(Number(product.price) || 0);
      if (!amount || amount <= 0 || amount > 1000000) {
        return res.status(400).json({ error: 'Produit mal configuré' });
      }
      productInfo = {
        productId,
        title: String(product.title || 'Pack').substring(0, 80),
        credits: Math.max(1, Math.floor(Number(product.credits) || 0)),
        validityDays: Math.max(1, Math.floor(Number(product.validityDays) || 30))
      };
    } else {
      if (!plan) return res.status(400).json({ error: 'Champs manquants' });
      if (!PRICES[plan]) return res.status(400).json({ error: 'Plan invalide' });
      planValue = plan;
      amount = PRICES[plan];
    }

    let promoApplied = null;

    // 1. Vérification du code promo (lecture directe via SDK admin)
    if (promoCode && checkoutKind === 'subscription' && plan === 'annual') {
      try {
        const codeUpper = String(promoCode).toUpperCase().trim().replace(/[^A-Z0-9_-]/g, '');
        if (codeUpper && codeUpper.length <= 40) {
          const promoSnap = await db.collection('promoCodes').doc(codeUpper).get();
          if (promoSnap.exists) {
            const discount = Number(promoSnap.data()?.discount || 0);
            // 🔒 Plafond de sécurité : jamais plus de 90 % de remise
            if (discount > 0 && discount <= 90) {
              amount = Math.round(amount * (1 - discount / 100));
              promoApplied = { code: codeUpper, discount };
            }
          }
        }
      } catch (e) {
        console.warn('Erreur promo :', e.message);
      }
    }

    // 2. Référence générée côté serveur
    const reference = `ARV-${Date.now()}-${String(uid).slice(0, 6)}`;

    // 3. Appel SasPay
    const API_KEY = process.env.SASPAY_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'SASPAY_API_KEY manquante' });

    const payload = {
      amount,
      currency: 'XOF',
      country: 'NE', // Force le Niger
      reference,
      description: checkoutKind === 'credits'
        ? `Pack ARVEXA ${productInfo.title}${promoApplied ? ` (promo ${promoApplied.code})` : ''}`
        : `Abonnement ARVEXA ${planValue}${promoApplied ? ` (promo ${promoApplied.code})` : ''}`,
      customer_name: String(customerName || 'Élève ARVEXA').substring(0, 80),
      customer_email: String(customerEmail || 'eleve@arvexaschool.com').substring(0, 120),
      success_url: checkoutKind === 'credits'
        ? `${SITE_URL}/marketplace.html?statut=succes&ref=${reference}`
        : `${SITE_URL}/abonnement.html?statut=succes&ref=${reference}`,
      cancel_url: checkoutKind === 'credits'
        ? `${SITE_URL}/marketplace.html?statut=annule`
        : `${SITE_URL}/abonnement.html?statut=annule`,
      webhook_url: `${SITE_URL}/api/saspay-webhook`
    };

    const saspayRes = await fetch(`${BASE}/checkout-sessions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify(payload)
    });

    const responseText = await saspayRes.text();
    let data;
    try { data = JSON.parse(responseText); } catch (e) {
      return res.status(500).json({ error: 'SasPay non-JSON', raw: responseText.substring(0, 300) });
    }

    if (!data.success) {
      return res.status(500).json({ error: 'Erreur SasPay', sasPayRaw: data });
    }

    const checkoutUrl = data.data?.checkout_url || data.data?.payment_url || data.data?.url;
    if (!checkoutUrl) return res.status(500).json({ error: 'URL absente', raw: data.data });

    // 4. 🔒 Enregistrement serveur du checkout attendu :
    //    le webhook comparera le montant réellement payé à `amount` ci-dessous.
    try {
      const batch = db.batch();
      batch.set(db.collection('saspayPendingCheckouts').doc(reference), {
        uid,
        kind: checkoutKind,
        plan: planValue,
        productId: productInfo ? productInfo.productId : null,
        productTitle: productInfo ? productInfo.title : null,
        credits: productInfo ? productInfo.credits : null,
        validityDays: productInfo ? productInfo.validityDays : null,
        amount,
        // ⚡ v8.59a — id de session SasPay : permet à /api/verifier-paiement
        // de relire le statut de paiement côté serveur (canal de secours)
        saspaySessionId: data.data?.id || null,
        promo: promoApplied ? promoApplied.code : null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp()
      });
      batch.set(db.collection('users').doc(uid), {
        saspayCheckoutReference: reference,
        saspayCheckoutSessionId: data.data?.id || null,
        saspayCheckoutStartedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
    } catch (e) {
      // Échec d'écriture : le paiement peut continuer, mais le webhook refusera
      // d'activer l'abonnement sans enregistrement serveur (fail-closed).
      console.error('🔴 Écriture Firestore impossible pour', reference, ':', e.message);
    }

    return res.status(200).json({ ok: true, reference, checkoutUrl, amount, promoApplied });

  } catch (err) {
    console.error('Erreur:', err);
    return res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
}
