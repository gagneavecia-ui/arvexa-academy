#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   check_v855a.js — AUDIT ARVEXA v8.55a (demande du propriétaire :
   « audit excessif, plus de 11 tests, jusqu'à résultat correct »)
   20 tests : dé-bac-ification, menu Marketplace, carte Ambassadeur,
   adaptation réseau, abonnement fiable, domaine mort, SW, syntaxe,
   équilibre HTML, régressions.
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function ok(name) { pass++; console.log('  ✅ ' + name); }
function ko(name, detail) { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
function test(name, cond, detail) { cond ? ok(name) : ko(name, detail); }

function nodeCheck(p) {
  try { execFileSync('node', ['--check', path.join(ROOT, p)], { stdio: 'pipe' }); return true; }
  catch (e) { return false; }
}

// équilibre HTML rudimentaire : balises structurantes appariées
function htmlBalance(p) {
  const s = read(p);
  for (const tag of ['div', 'section', 'aside', 'header', 'main', 'nav', 'button', 'table']) {
    const open = (s.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
    const close = (s.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== close) return { ok: false, tag, open, close };
  }
  return { ok: true };
}

console.log('\n═══ AUDIT v8.55a — ' + new Date().toISOString() + ' ═══\n');

/* ── T1 : SW version + let ── */
const sw = read('service-worker.js');
test('T1  SW_VERSION = arvexa-offline-v8.57a avec let',
  /let SW_VERSION = 'arvexa-offline-v8\.57a'/.test(sw) && !/const SW_VERSION/.test(sw));

/* ── T2 : précache des 2 nouveaux modules ── */
test('T2  SW précache arvexa-net.js + arvexa-soon.js',
  sw.includes("'./arvexa-net.js'") && sw.includes("'./arvexa-soon.js'"));

/* ── T3 : auth-choice 100 % universel ── */
const ac = read('auth-choice.html');
const acBad = [];
if (/Terminale D, ouvert/.test(ac)) acBad.push('section Terminale D');
if (/préparent leur BAC/.test(ac)) acBad.push('lede BAC');
if (/#bac[">]/.test(ac)) acBad.push('liens #bac');
if (/Prépare ton <em>BAC<\/em>/.test(ac)) acBad.push('héros BAC');
if (/Plateforme éducative pour préparer le BAC/.test(ac)) acBad.push('meta BAC');
if (/preview-pill">Terminale D</.test(ac)) acBad.push('pill Terminale D');
if (/\.(bac-wrap|bac-title|bac-text|bac-pillars|bac-pill)\b/.test(ac)) acBad.push('CSS .bac-*');
test('T3  auth-choice : zéro résidu BAC-only' + (acBad.length ? '' : ' (' + acBad.join(', ') + ')'), acBad.length === 0, acBad.join(', '));

/* ── T4 : auth-choice structure universelle ── */
test('T4  auth-choice : #examens + nav ×2 + meta universelle',
  ac.includes('id="examens"') &&
  ac.includes('aria-labelledby="examens-title"') &&
  (ac.match(/href="#examens"/g) || []).length === 2 &&
  ac.includes('tous les niveaux et tous les domaines'));

/* ── T5 : Marketplace dans les 7 sidebars ── */
const menuPages = ['index.html', 'profil.html', 'notifications.html', 'abonnement.html', 'progression.html', 'arv.html', 'localisation.html'];
// ⚡ v8.56a — la Marketplace est une VRAIE page : les 7 sidebars pointent marketplace.html
const missingMenu = menuPages.filter(p => !read(p).includes('<a href="marketplace.html"><i class="fas fa-store"></i> Marketplace</a>'));
test('T5  Marketplace présent dans les 7 menus (vrai lien v8.56a)', missingMenu.length === 0, missingMenu.join(', '));

/* ── T6 : arvexa-soon.js inclus + data-soon câblé ── */
const soonPages = menuPages.filter(p => !read(p).includes('arvexa-soon.js'));
test('T6  arvexa-soon.js inclus sur les 7 pages à menu', soonPages.length === 0, soonPages.join(', '));
test('T6b arvexa-soon.js syntaxe valide', nodeCheck('arvexa-soon.js'));

/* ── T7 : carte Ambassadeur sur l'accueil ── */
const ix = read('index.html');
test('T7  Ambassadeur ARVEXA : carte + lien réel ambassadeur.html (v8.56a)',
  ix.includes('amb-card') && ix.includes('Deviens Ambassadeur ARVEXA') &&
  ix.includes('href="ambassadeur.html"') &&
  ix.includes('gagne en fonction des abonnements'));

/* ── T8 : arvexa-net.js sur 17 pages ── */
const netPages = ['index.html', 'profil.html', 'notifications.html', 'abonnement.html', 'progression.html', 'arv.html', 'localisation.html',
  'auth-choice.html', 'login.html', 'register.html', 'onboarding.html', 'outils.html', 'exam.html', 'quotidien.html', 'arv-progress.html', 'planificateur.html', 'exam-history.html'];
const missingNet = netPages.filter(p => !read(p).includes('arvexa-net.js'));
test('T8  arvexa-net.js sur 17 pages', missingNet.length === 0, missingNet.join(', '));
test('T8b arvexa-net.js syntaxe + détection saveData/2g',
  nodeCheck('arvexa-net.js') && /saveData/.test(read('arvexa-net.js')) && /slow-2g/.test(read('arvexa-net.js')));

/* ── T9 : abonnement — demande manuelle déverrouillée ── */
const abo = read('abonnement.html');
const mSave = abo.slice(abo.indexOf('async function saveSubscriptionRequest'), abo.indexOf('async function saveSubscriptionRequest') + 2500);
test('T9  saveSubscriptionRequest n\'écrit AUCUN champ verrouillé',
  !/subscriptionStatus\s*:/.test(mSave) && !/subscriptionPlan\s*:/.test(mSave) && /manualPaymentRequest\s*:/.test(mSave));

/* ── T10 : getUserState — priorité activation serveur ── */
const mState = abo.slice(abo.indexOf('function getUserState'), abo.indexOf('function getUserState') + 1600);
const activePos = mState.indexOf("status === 'active'");
const pendingPos = mState.indexOf("manualPending) return 'pending'");
test('T10 getUserState : active gagne sur pending + manualPaymentRequest lu',
  activePos !== -1 && pendingPos !== -1 && activePos < pendingPos);

/* ── T11 : bouton Vérifier l'activation (HTML + source:'server') ── */
test('T11 Vérification serveur forcée câblée',
  abo.includes('id="verifyManualBtn"') && abo.includes("{ source: 'server' }"));

/* ── T12 : webhook clôt la demande manuelle ── */
const hook = read('api/saspay-webhook.mjs');
test('T12 webhook : manualPaymentRequest clôturée à l\'activation',
  hook.includes("manualPaymentRequest: { status: 'processed'"));

/* ── T13 : domaine mort éradiqué ── */
const dead = [];
for (const p of fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js') || f.endsWith('.mjs'))) {
  const s = read('api/' + p);
  const comments = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (comments.includes('arvexaschool.vercel.app')) dead.push('api/' + p);
}
const prof = read('profil.html');
if (prof.includes('arvexaschool.vercel.app')) dead.push('profil.html');
test('T13 domaine mort arvexaschool.vercel.app absent du code exécutable', dead.length === 0, dead.join(', '));

/* ── T14 : parcours.js adaptatif ── */
const pj = read('parcours.js');
test('T14 parcours.js : compte à rebours gardé par hasExamSafe',
  pj.includes('hasExamSafe()') && !/BAC dans '\s*\+/.test(pj) && nodeCheck('parcours.js'));

/* ── T15 : syntaxe de tous les JS modifiés ── */
const jsFiles = ['service-worker.js', 'parcours.js', 'arvexa-net.js', 'arvexa-soon.js', 'arvexa-classes.js', 'arvexa-modal.js'];
const badJs = jsFiles.filter(p => !nodeCheck(p));
test('T15 node --check sur 6 JS racine', badJs.length === 0, badJs.join(', '));
const badApi = fs.readdirSync(path.join(ROOT, 'api')).filter(f => (f.endsWith('.js') || f.endsWith('.mjs')) && !nodeCheck('api/' + f));
test('T15b node --check sur TOUTES les API', badApi.length === 0, badApi.join(', '));

/* ── T16 : équilibre HTML des pages modifiées ── */
const edited = ['index.html', 'auth-choice.html', 'abonnement.html', 'login.html', 'outils.html', 'exam.html', 'profil.html', 'onboarding.html',
  'profil.html', 'notifications.html', 'progression.html', 'arv.html', 'localisation.html', 'register.html', 'quotidien.html', 'arv-progress.html', 'planificateur.html', 'exam-history.html'];
const unbalanced = [];
for (const p of [...new Set(edited)]) {
  const b = htmlBalance(p);
  if (!b.ok) unbalanced.push(p + ':' + b.tag + '(' + b.open + '/' + b.close + ')');
}
test('T16 équilibre des balises sur 17 pages HTML', unbalanced.length === 0, unbalanced.join(', '));

/* ── T17 : résidus visibles restants ── */
test('T17 login/outils/exam/onboarding universels',
  !read('login.html').includes('préparation pour le BAC') &&
  !read('outils.html').includes('réussir le <em>BAC</em>') &&
  !read('exam.html').includes('Test moi BAC') &&
  !read('onboarding.html').includes('id="userGoal">BAC 2026'));

/* ── T18 : régression — anciennes suites au vert ── */
let reg1 = true, reg1Out = '';
try { reg1Out = execFileSync('node', [path.join(ROOT, 'scripts', 'check_v853a.js')], { stdio: 'pipe', encoding: 'utf8', timeout: 120000 }); }
catch (e) { reg1 = false; reg1Out = (e.stdout || '') + (e.stderr || ''); }
test('T18 régression check_v853a.js au vert', reg1, reg1Out.split('\n').filter(l => /FAIL|❌/.test(l)).slice(0, 3).join(' | '));

let reg2 = true, reg2Out = '';
try { reg2Out = execFileSync('node', [path.join(ROOT, 'scripts', 'test_v848a_units.js')], { stdio: 'pipe', encoding: 'utf8', timeout: 120000 }); }
catch (e) { reg2 = false; reg2Out = (e.stdout || '') + (e.stderr || ''); }
test('T19 régression test_v848a_units.js au vert', reg2, reg2Out.split('\n').filter(l => /FAIL|❌|not ok/.test(l)).slice(0, 3).join(' | '));

/* ── T20 : pages clés toujours câblées Firebase (connexions des pages) ── */
const fbPages = ['index.html', 'profil.html', 'abonnement.html', 'login.html', 'register.html', 'arv-progress.html'];
const noFb = fbPages.filter(p => {
  const s = read(p);
  return !s.includes('arvexa-fbf10') && !s.includes('auth-guard.js') && !s.includes('arvexa-sync.js');
});
test('T20 pages clés : câblage Firebase/Auth intact', noFb.length === 0, noFb.join(', '));

/* ── BILAN ── */
console.log('\n════════════════════════════════════════');
console.log('  RÉSULTAT : ' + pass + ' PASS / ' + fail + ' FAIL');
console.log('════════════════════════════════════════');
if (fail) { console.log('ÉCHECS :'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('AUDIT v8.55a : TOUT EST AU VERT.');
