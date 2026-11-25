// api/_credits.js
// ═══════════════════════════════════════════════════════════════════
// ⚡ v8.64a — MOTEUR DE CRÉDITS IA PAR PAGE (demande du propriétaire :
// « au lieu de vendre des requêtes globales, on divise par différentes
// pages — tout ce qui utilise l'IA aura sa réserve à part, l'abonnement
// global qui reste le même »).
//
// TROIS RÉSERVES distinctes dans users/{uid} :
//  - aiCreditsResume : résumés/sections analysés par la page Résumé
//  - aiCreditsChat   : messages/questionnaires de la discussion (Chat ARV)
//  - aiCreditsExam   : examens générés par la page Épreuves
//  + aiCredits (héritage v1.1) : réserve globale des anciens packs —
//    consommée EN DERNIER RECOURS, après épuisement de la réserve de page,
//    pour que personne ne perde un seul crédit acheté avant la division.
//
// Ordre de consommation (page « p », coût c) :
//   1. Premium  → illimité (abonnement global inchangé)
//   2. Réserve de page (aiCreditsResume/Chat/Exam) ≥ c → débitée
//   3. Réserve globale héritée (aiCredits) ≥ c → débitée
//   4. Sinon → NO_CREDITS
//
// ⚡ v1.1 (historique) — packs Marketplace : au-delà des quotas gratuits
//    journaliers, chaque action IA coûte des crédits, débités en
//    TRANSACTION serveur. Le rechargement se fait UNIQUEMENT par le
//    webhook SasPay (api/saspay-webhook.mjs) / verifier-paiement.mjs,
//    après vérification du montant réellement payé.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ─── Coût en crédits de chaque action IA (grille validée par le propriétaire) ───
const COSTS = {
  chat: 1,     // 1 message Chat ARV (réserve « chat »)
  exam: 5,     // 1 examen généré (2-4 appels IA réels côté serveur) — réserve « exam »
  correct: 2,  // 1 correction IA d'une copie (réserve « exam », incluse dans l'examen)
  planner: 5,  // 1 plan d'études IA (réserve globale héritée / Premium)
  resume: 1    // 1 section résumée par la page Résumé — réserve « resume »
};

// ─── Pages à réserve dédiée ───
const PAGES = new Set(['resume', 'chat', 'exam']);
// Le champ users/{uid} correspondant à chaque page :
const PAGE_FIELD = { resume: 'aiCreditsResume', chat: 'aiCreditsChat', exam: 'aiCreditsExam' };

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

// ─── Lecture d'un solde (sans décrémenter) ───
// page = 'resume' | 'chat' | 'exam' | null (global hérité)
// Retourne { credits, expiryMs, active } — pour les pages, `credits` est le
// total page + global hérité (le global reste consommable en secours) et
// `pageCredits`/`globalCredits` détaillent les deux poches.
function readCreditsBalance(data, page) {
  let expiryMs = 0;
  if (data?.creditsExpiry?.toDate) expiryMs = data.creditsExpiry.toDate().getTime();
  else if (data?.creditsExpiry?.seconds) expiryMs = data.creditsExpiry.seconds * 1000;
  else if (data?.creditsExpiry instanceof Date) expiryMs = data.creditsExpiry.getTime();
  const expired = expiryMs && expiryMs <= Date.now();
  const globalCredits = expired ? 0 : Math.max(0, Number(data?.aiCredits || 0));
  const pageField = page && PAGE_FIELD[page] ? PAGE_FIELD[page] : null;
  // ✅ v8.64a — l'expiration touche TOUTES les poches (date de validité unique).
  const pageCredits = (pageField && !expired) ? Math.max(0, Number(data?.[pageField] || 0)) : 0;
  return {
    credits: pageField ? pageCredits + globalCredits : globalCredits,
    pageCredits,
    globalCredits,
    expiryMs,
    active: (pageField ? pageCredits + globalCredits : globalCredits) > 0 && !expired
  };
}

// ─── Consommation atomique ───
// consumeCredits(db, uid, cost, page) →
//   { allowed: true,  mode: 'premium', remaining: null }            — premium
//   { allowed: true,  mode: 'page',    remaining: n, remainingPage: n, remainingGlobal: g }
//   { allowed: true,  mode: 'credits', remaining: n }               — global hérité
//   { allowed: false, mode: 'none',    remaining, code: 'NO_CREDITS' }
// `page` ∈ 'resume' | 'chat' | 'exam' | null (planner → global hérité).
// Ne lève JAMAIS pour une raison métier (quota) : renvoie allowed=false.
// Peut lever une exception technique (Firebase indisponible) — l'appelant
// doit la traiter en 503 « fail-closed », pas en autorisation gratuite.
async function consumeCredits(db, uid, cost, page) {
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
    let expiryMs = 0;
    if (data?.creditsExpiry?.toDate) expiryMs = data.creditsExpiry.toDate().getTime();
    else if (data?.creditsExpiry?.seconds) expiryMs = data.creditsExpiry.seconds * 1000;
    const expired = expiryMs && expiryMs <= Date.now();
    const globalCredits = expired ? 0 : Math.max(0, Number(data?.aiCredits || 0));
    const pageField = page && PAGE_FIELD[page] ? PAGE_FIELD[page] : null;
    // ✅ v8.64a — l'expiration touche TOUTES les poches (une seule date de
    // validité par utilisateur : packs page et global expirent ensemble).
    const pageCredits = (pageField && !expired) ? Math.max(0, Number(data?.[pageField] || 0)) : 0;

    // 1) Réserve de page D'ABORD, puis reliquat sur la réserve globale héritée
    //    (scission : page 3 + global 4 couvrent un coût 5 → 3 de page + 2 de
    //    global — personne ne perd d'argent).
    if (pageField && pageCredits + globalCredits >= cost) {
      const fromPage = Math.min(pageCredits, cost);
      const fromGlobal = Math.min(globalCredits, cost - fromPage);
      const remainingPage = pageCredits - fromPage;
      const remainingGlobal = globalCredits - fromGlobal;
      const update = { creditsUpdatedAt: new Date() };
      update[pageField] = remainingPage;
      update.aiCredits = remainingGlobal;
      transaction.update(userRef, update);
      return {
        allowed: true, mode: fromPage > 0 ? 'page' : 'credits',
        remaining: remainingPage + remainingGlobal,
        remainingPage, remainingGlobal
      };
    }
    // 2) Page absente (planner…) : réserve globale héritée seule
    if (!pageField && globalCredits >= cost) {
      const remainingGlobal = globalCredits - cost;
      transaction.update(userRef, { aiCredits: remainingGlobal, creditsUpdatedAt: new Date() });
      return { allowed: true, mode: 'credits', remaining: remainingGlobal, remainingPage: 0, remainingGlobal };
    }
    // 3) Aucune poche suffisante
    return {
      allowed: false, mode: 'none',
      remaining: pageCredits + globalCredits,
      remainingPage: pageCredits, remainingGlobal: globalCredits,
      code: 'NO_CREDITS'
    };
  });
}

// ─── Crédit d'un achat (utilisé par le webhook SasPay / verifier-paiement) ───
// addCredits(db, uid, { credits, validityDays, page }) → { credits, expiryMs }
// page ∈ 'resume' | 'chat' | 'exam' → crédite la réserve DÉDIÉE (aiCreditsResume/
// Chat/Exam). Sans page → réserve globale héritée (compatibilité anciens packs).
// Expiration cumulée : si un pack actif existe déjà, la nouvelle validité
// s'ajoute à la fin du pack courant (jamais de perte d'argent pour l'élève).
async function addCredits(db, uid, { credits, validityDays, page } = {}) {
  const amount = Math.max(1, Math.floor(Number(credits) || 0));
  const days = Math.max(1, Math.floor(Number(validityDays) || 30));
  const pageField = page && PAGE_FIELD[page] ? PAGE_FIELD[page] : null;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    const data = snap.exists ? snap.data() : {};
    let expiryMs = 0;
    if (data?.creditsExpiry?.toDate) expiryMs = data.creditsExpiry.toDate().getTime();
    else if (data?.creditsExpiry?.seconds) expiryMs = data.creditsExpiry.seconds * 1000;
    const now = Date.now();
    const base = expiryMs > now ? expiryMs : now;
    const newExpiry = new Date(base + days * 24 * 60 * 60 * 1000);
    if (pageField) {
      const current = Math.max(0, Number(data?.[pageField] || 0));
      transaction.update(userRef, {
        [pageField]: current + amount,
        creditsExpiry: newExpiry,
        creditsUpdatedAt: new Date()
      });
      return { credits: current + amount, pageCredits: current + amount, expiryMs: newExpiry.getTime() };
    }
    const current = Math.max(0, Number(data?.aiCredits || 0));
    transaction.update(userRef, {
      aiCredits: current + amount,
      creditsExpiry: newExpiry,
      creditsUpdatedAt: new Date()
    });
    return { credits: current + amount, expiryMs: newExpiry.getTime() };
  });
}

// ─── Remboursement (fallback local après débit) ───
// refundCredits(db, uid, amount, page) → rembourse dans la MÊME poche que
// celle qui a pu être débitée (page d'abord, global sinon). Ne touche PAS à
// l'expiration : l'élève récupère ses crédits sans perdre de validité.
async function refundCredits(db, uid, amount, page) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (!n) return;
  const pageField = page && PAGE_FIELD[page] ? PAGE_FIELD[page] : null;
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
    const data = snap.exists ? snap.data() : {};
    const update = { creditsUpdatedAt: new Date() };
    if (pageField) {
      const pageCredits = Math.max(0, Number(data?.[pageField] || 0));
      update[pageField] = pageCredits + n;
    } else {
      const credits = Math.max(0, Number(data?.aiCredits || 0));
      update.aiCredits = credits + n;
    }
    transaction.update(userRef, update);
    return update;
  });
}

module.exports = { COSTS, PAGES, PAGE_FIELD, isPremiumUser, readCreditsBalance, consumeCredits, addCredits, refundCredits };
