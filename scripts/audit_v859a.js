#!/usr/bin/env node
// scripts/audit_v859a.js — AUDIT COMPLET v8.59a (plus puissant que le précédent)
// Vérifie : intégrité HTML, endpoints API ↔ fichiers, liens de pages, precache SW,
// requêtes Firestore sans index requis, salutation supprimée, cohérence paiement.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ═══ 1. PAGES HTML : balises équilibrées ═══
console.log('\n═══ 1. INTÉGRITÉ HTML (balises équilibrées) ═══');
// Scanner <script> conforme au parsing HTML : après un <script\b…>, le SEUL
// token qui le ferme est </script> (les <script littéraux dans le JS n'ouvrent
// rien, et <\/script> échappé ne ferme pas) — évite les faux positifs des
// regex/commentaires contenant ces balises.
function scanScriptBalance(src) {
  // Conforme à la spécification HTML : en dehors d'un script, seul <script\b
  // ouvre ; DANS un script, seul </script ferme (les « <script » littéraux du
  // JS et les <\/script> échappés n'ont aucun effet de parsing).
  let opens = 0, closes = 0, i = 0, inside = false;
  while (i < src.length) {
    if (!inside) {
      const m = /<script(?![A-Za-z0-9])/.exec(src.slice(i));
      if (!m) break;
      opens++; inside = true;
      i += m.index + m[0].length;
    } else {
      const c = src.indexOf('</script', i);
      if (c === -1) break;
      closes++; inside = false;
      i = c + 8;
    }
  }
  return { opens, closes };
}
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
for (const p of pages) {
  const src = read(p);
  const { opens, closes } = scanScriptBalance(src);
  let bad = [];
  if (opens !== closes) bad.push(`script: ${opens}≠${closes}`);
  for (const t of ['div', 'section', 'header', 'button', 'form']) {
    const o = (src.match(new RegExp(`<${t}(\\s|>)`, 'g')) || []).length;
    const c = (src.match(new RegExp(`</${t}>`, 'g')) || []).length;
    if (o !== c) bad.push(`${t}: ${o}≠${c}`);
  }
  check(p, bad.length === 0, bad.join(', '));
}

// ═══ 2. REQUÊTES FIRESTORE CLIENT : aucun where+orderBy sans index ═══
console.log('\n═══ 2. REQUÊTES CLIENT (where+orderBy = index composite requis) ═══');
for (const p of pages) {
  const src = read(p);
  // détecte where(...) ... orderBy( dans le même query(
  const queries = src.match(/query\([\s\S]{0,400}?\)/g) || [];
  const risky = queries.filter((q) => /where\(/.test(q) && /orderBy\(/.test(q));
  check(`${p} : aucune requête where+orderBy`, risky.length === 0, `${risky.length} requête(s) risquée(s)`);
}
const swCode = read('service-worker.js').replace(/^\s*\/\/.*$/gm, ''); // hors commentaires (changelog)
check('service-worker.js : aucun orderBy', !/orderBy\(/.test(swCode));

// ═══ 3. ENDPOINTS API : chaque fetch('/api/...') a son fichier ═══
console.log('\n═══ 3. ENDPOINTS /api/* ↔ FICHIERS ═══');
const apiFiles = new Set(fs.readdirSync(path.join(ROOT, 'api')));
for (const p of pages) {
  const src = read(p);
  const endpoints = [...src.matchAll(/['"`]\/api\/([a-z-]+)/g)].map((m) => m[1]);
  for (const ep of [...new Set(endpoints)]) {
    const found = [...apiFiles].some((f) => f.replace(/\.(m?js)$/, '') === ep || f.startsWith(ep));
    check(`${p} → /api/${ep}`, found, 'fichier api absent');
  }
}
// count fonctions Vercel (hors _helpers)
const fnCount = [...apiFiles].filter((f) => !f.startsWith('_')).length;
check('Fonctions serverless ≤ 12 (plan Hobby)', fnCount <= 12, `compte: ${fnCount}`);

// ═══ 4. LIENS INTERNES : chaque href="*.html" existe ═══
console.log('\n═══ 4. LIENS INTERNES ═══');
const repoFiles = new Set(fs.readdirSync(ROOT));
let badLinks = 0;
for (const p of pages) {
  const src = read(p);
  const hrefs = [...src.matchAll(/href="([a-z0-9-]+\.html)/g)].map((m) => m[1]);
  for (const h of [...new Set(hrefs)]) {
    if (!repoFiles.has(h)) { badLinks++; console.log(`    ⚠️ ${p} → ${h} ABSENT`); }
  }
}
check('Tous les href .html résolvent', badLinks === 0, `${badLinks} lien(s) cassé(s)`);

// ═══ 5. SW 100 % EN LIGNE : AUCUN precache (v8.61a, demande propriétaire — ré-épinglé v8.66a) ═══
console.log('\n═══ 5. SERVICE WORKER 100 % EN LIGNE ═══');
const sw = read('service-worker.js');
const precacheBlock = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
check('Aucun bloc PRECACHE (mode 100 % en ligne)', !precacheBlock);
check('Aucune interception fetch (réseau frais, zéro page périmée)', !sw.includes("addEventListener('fetch'"));
check('SW_VERSION >= v8.59a (online, bump à chaque version)', /SW_VERSION = 'arvexa-online-v8\.(59a|6\da)'/.test(sw));

// ═══ 6. CORRECTIFS SPÉCIFIQUES V8.59A ═══
console.log('\n═══ 6. CORRECTIFS V8.59A ═══');
const mkt = read('marketplace.html');
const abo = read('abonnement.html');
const prog = read('arv-progress.html');

check('marketplace : requête sans orderBy', !/where\('type', '==', 'credits'\),\s*\n\s*where\('status', '==', 'approved'\),\s*\n\s*orderBy/.test(mkt) && !/orderBy\('price'/.test(mkt));
check('marketplace : tri client présent', mkt.includes(".sort((a, b) => (Number(a.price) || 0)"));
check('marketplace : cartes abonnements Premium', mkt.includes('Premium Mensuel') && mkt.includes('Premium Annuel'));
check('marketplace : prix mensuel 3 000 F', mkt.includes('3&nbsp;000'));
check('marketplace : prix annuel 18 000 F', mkt.includes('18&nbsp;000'));
check('marketplace : buyMonthly/buyAnnual → startCheckout', mkt.includes("startCheckout({ kind: 'subscription', plan: 'monthly' }") && mkt.includes("startCheckout({ kind: 'subscription', plan: 'annual' }"));
check('marketplace : verifier-paiement appelé', mkt.includes('/api/verifier-paiement'));
check('abonnement : requête sans orderBy', !/orderBy\('price'/.test(abo));
check('abonnement : tri client présent', abo.includes(".sort((a, b) => (Number(a.price) || 0)"));
check('abonnement : verifier-paiement appelé', abo.includes('/api/verifier-paiement'));
check('arv-progress : salutation supprimée', !prog.includes('getGreeting') && !prog.includes('Bonjour'));
check('arv-progress : fil de reprise retiré (v8.60a, demande propriétaire)', !prog.includes('Continue là où tu t'));
check('webhook : module partagé _activation', read('api/saspay-webhook.mjs').includes("from './_activation.mjs'"));
check('verifier-paiement : fail-closed (référence inconnue refusée)', read('api/verifier-paiement.mjs').includes("reason: 'unknown_reference'"));
check('verifier-paiement : montant relu chez SasPay', read('api/verifier-paiement.mjs').includes('checkout-sessions/'));
check('creer-checkout : saspaySessionId persisté', read('api/creer-checkout.mjs').includes('saspaySessionId'));

// ═══ 7. COHÉRENCE PRIX (serveur = page) ═══
console.log('\n═══ 7. COHÉRENCE DES PRIX ═══');
const checkout = read('api/creer-checkout.mjs');
check('Prix serveur mensuel 3000 F', /PRICES = \{ monthly: 3000, annual: 18000 \}/.test(checkout));
check('Prix page abonnement alignés', abo.includes('3000') || abo.includes('3&nbsp;000'));

// ═══ 8. SÉCURITÉ : aucun secret en dur dans le client ═══
console.log('\n═══ 8. SÉCURITÉ ═══');
const secrets = ['sk_live', 'gsk_', 'OPENROUTER', 'private_key', 'FIREBASE_ADMIN_CREDENTIALS'];
let leaked = 0;
for (const p of pages) {
  const src = read(p);
  for (const s of secrets) {
    if (src.includes(s)) { leaked++; console.log(`    ⚠️ ${p} contient « ${s} »`); }
  }
}
check('Aucun secret serveur dans les pages HTML', leaked === 0, `${leaked} fuite(s)`);

// ═══ RÉSUMÉ ═══
console.log(`\n════════ RÉSULTAT : ${pass} PASS / ${fail} FAIL ════════`);
if (failures.length) {
  console.log('ÉCHECS:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('🎉 AUDIT COMPLET AU VERT');
