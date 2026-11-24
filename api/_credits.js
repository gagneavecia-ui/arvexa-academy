// api/_credits.js
// ═══════════════════════════════════════════════════════════════════
// ⚡ v1.1 — MOTEUR DE CRÉDITS IA PARTAGÉ (Marketplace / Packs de requêtes)
//
// Modèle économie ARVEXA :
//  - Premium (abonnement 3 000 F/mois, 18 000 F/an) → IA illimitée
//    (les plafonds anti-abus par page restent en place, très généreux)
//  - Quota gratuit journalier par page (chat 10/j, examens 2/j) → inchangé,
//    c'est l'accroche : personne n'est dégradé
//  - QUOTA DU JOUR ÉPUISÉ → le serveur tente de consommer des CRÉDITS
//    achetés dans la Marketplace (packs) au lieu de bloquer l'élève
//  - Planificateur (réservé Premium avant) → accessible avec 5 crédits
//
// Les crédits vivent dans users/{uid} :
//  - aiCredits      : nombre de requêtes restantes
//  - creditsExpiry  : date d'expiration du pack (Timestamp Firestore)
//
// 🔒 SÉCURITÉ : toute la décrémentation se fait ici, en TRANSACTION Firestore,
// côté serveur. Le client ne peut ni lire-modifier-écrire, ni descendre
// sous zéro, ni contourner le premium. Le rechargement se fait UNIQUEMENT
// par le webhook SasPay (api/saspay-webhook.mjs) après vérification du
// montant réellement payé.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ─── Coût en crédits de chaque action IA (grille validée par le propriétaire) ───
const COSTS = {
  chat: 1,     // 1 message Chat ARV
  exam: 5,     // 1 examen généré (2-4 appels IA réels côté serveur)
  correct: 2,  // 1 correction IA d'une copie
  planner: 5   // 1 plan d'études IA
};

// ─── Premium : même sémantique que arv.js / exam.js / planner.js ───
function isPremiumUser(data) {
  if (!data) return false;
  const hasPremium =
    data.premium === true ||
    data.isUnlocked === true ||
    data.hasDeposited === true;
  let end = null;
  if (data.subscriptionEndDate?.toDate) end = data.subscriptionEndDate.toDate();
  else if (data.subscriptionEndDate?.seconds)
    end = new Date(data.subscriptionEndDate.seconds * 1000);
  if (hasPremium && end) return end.getTime() > Date.now();
  if (hasPremium && !end) return true;
  return false;
}

// ─── Lecture du solde (sans décrémenter) ───
// Retourne { credits, expiryMs, active }
function readCreditsBalance(data) {
  const credits = Math.max(0, Number(data?.aiCredits || 0));
  let expiryMs = 0;
  if (data?.creditsExpiry?.toDate) expiryMs = data.creditsExpiry.toDate().getTime();
  else if (data?.creditsExpiry?.seconds) expiryMs = data.creditsExpiry.seconds * 1000;
  else if (data?.creditsExpiry instanceof Date) expiryMs = data.creditsExpiry.getTime();
  const active = credits > 0 && (!expiryMs || expiryMs > Date.now());
  return { credits, expiryMs, active };
}

// ─── Consommation atomique ───
// consumeCredits(db, uid, cost) →
//   { allowed: true,  mode: 'premium', remaining: null }   — premium, rien décrémenté
//   { allowed: true,  mode: 'credits', remaining: n }      — n crédits décrémentés
//   { allowed: false, mode: 'none',    remaining: n, code: 'NO_CREDITS' }
// Ne lève JAMAIS pour une raison métier (quota) : renvoie allowed=false.
// Peut lever une exception technique (Firebase indisponible) — l'appelant
// doit la traiter en 503 « fail-closed », pas en autorisation gratuite.
async function consumeCredits(db, uid, cost) {
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    if (!snap.exists) {
      return { allowed: false, mode: 'none', remaining: 0, code: 'NO_CREDITS' };
    }
    const data = snap.data();
    if (isPremiumUser(data)) {
      return { allowed: true, mode: 'premium', remaining: null };
    }
    const { credits, active } = readCreditsBalance(data);
    if (!active || credits < cost) {
      return { allowed: false, mode: 'none', remaining: credits, code: 'NO_CREDITS' };
    }
    const remaining = credits - cost;
    transaction.update(userRef, {
      aiCredits: remaining,
      creditsUpdatedAt: new Date()
    });
    return { allowed: true, mode: 'credits', remaining };
  });
}

// ─── Crédit d'un achat (utilisé par le webhook SasPay uniquement) ───
// addCredits(db, uid, { credits, validityDays }) → { credits, expiryMs }
// Expiration cumulée : si un pack actif existe déjà, la nouvelle validité
// s'ajoute à la fin du pack courant (jamais de perte d'argent pour l'élève).
async function addCredits(db, uid, { credits, validityDays }) {
  const amount = Math.max(1, Math.floor(Number(credits) || 0));
  const days = Math.max(1, Math.floor(Number(validityDays) || 30));
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    const data = snap.exists ? snap.data() : {};
    const { credits: current, expiryMs } = readCreditsBalance(data);
    const now = Date.now();
    const base = expiryMs > now ? expiryMs : now;
    const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000);
    transaction.update(userRef, {
      aiCredits: current + amount,
      creditsExpiry: newExpiry,
      creditsUpdatedAt: new Date()
    });
    return { credits: current + amount, expiryMs: newExpiry.getTime() };
  });
}

// ─── Remboursement (fallback local après débit, planificateur uniquement) ───
// refundCredits(db, uid, amount) → ne touche PAS à l'expiration : l'élève
// récupère ses crédits sans perdre de validité.
async function refundCredits(db, uid, amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!n) return;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    const data = snap.exists ? snap.data() : {};
    const { credits } = readCreditsBalance(data);
    transaction.update(userRef, {
      aiCredits: credits + n,
      creditsUpdatedAt: new Date()
    });
    return { credits: credits + n };
  });
}

module.exports = { COSTS, isPremiumUser, readCreditsBalance, consumeCredits, addCredits, refundCredits };
