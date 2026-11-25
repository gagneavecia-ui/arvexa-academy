#!/usr/bin/env node
/* check_v858a.js — v8.58a : cause générale du faux « problème de connexion »
 * (SW precache-first + purge cache HTML) + adaptation réseau supprimée +
 * Gérer ma promo dans ambassadeur.html + audit 4 causes cachées. */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let pass = 0, fail = 0;
function T(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function nodeCheck(f) {
  try {
    execSync(`node --check "${path.join(__dirname, '..', f)}"`, { stdio: 'pipe' });
    return true;
  } catch (e) { return false; }
}
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('[v8.58a] SW precache-first + purge cache HTML · arvexa-net supprimé · badge retiré · promo inline · 4 causes cachées');

/* ── 1. SW : cause générale (stale HTML servi en navigation) ── */
const sw = R('service-worker.js');
T('SW : version arvexa-online v8.6Xa avec let (ré-épinglé v8.66a)', /let SW_VERSION = 'arvexa-online-v8\.6\da';/.test(sw) && !/const SW_VERSION/.test(sw));
T('SW : aucune interception fetch (100 % réseau)', !/addEventListener\('fetch'/.test(sw));
T('SW : branche isSlowConnection→vieux cache supprimée de la navigation', !/cached && isSlowConnection\(\)/.test(sw));
T('SW : activate supprime TOUS les caches existants', /caches\.keys\(\)/.test(sw) && /caches\.delete\(n\)/.test(sw));
T('SW : skipWaiting + clients.claim (migration instantanée)', /skipWaiting\(\)/.test(sw) && /clients\.claim\(\)/.test(sw));
T('SW : precache sans arvexa-net.js ni ma-promo.html', !sw.includes("'./arvexa-net.js',") && !sw.includes("'./ma-promo.html',"));
T('SW : aucun precache (plus de pages en cache, jamais)', !sw.includes('PRECACHE_LIST') && !/addAll\(/.test(sw));
T('SW : syntaxe valide', nodeCheck('service-worker.js'));

/* ── 2. arvexa-net.js supprimé partout ── */
let netExists = true;
try { R('arvexa-net.js'); } catch (e) { netExists = false; }
T('arvexa-net.js supprimé du dépôt', !netExists);
const netPages = ['index.html', 'profil.html', 'notifications.html', 'abonnement.html', 'progression.html', 'arv.html',
  'auth-choice.html', 'login.html', 'register.html', 'onboarding.html', 'outils.html', 'exam.html', 'quotidien.html', 'arv-progress.html', 'planificateur.html', 'exam-history.html', 'ambassadeur.html', 'marketplace.html'];
const leftover = netPages.filter((p) => { try { return R(p).includes('arvexa-net.js'); } catch (e) { return false; } });
T('arvexa-net.js absent des 20 pages', leftover.length === 0, leftover.join(', '));

/* ── 3. Accueil : badge Nouveau retiré ── */
const ix = R('index.html');
T('accueil : badge « Nouveau » retiré de la carte Ambassadeur', !/class="amb-badge"/.test(ix) && !/\.amb-badge\s*\{/.test(ix));
T('accueil : carte Ambassadeur toujours complète', ix.includes('amb-card') && ix.includes('Deviens Ambassadeur ARVEXA') && ix.includes('href="ambassadeur.html"'));
T('accueil : plus aucun lien ma-promo.html dans le menu', !/href="ma-promo\.html"/.test(ix));

/* ── 4. Gérer ma promo DANS ambassadeur.html ── */
const amb = R('ambassadeur.html');
T('ambassadeur : ma-promo.html n\'existe plus', !fs.existsSync(path.join(__dirname, '..', 'ma-promo.html')));
T('ambassadeur : section inline #promoBody dans le dashboard', amb.includes('promo-section') && amb.includes('id="promoBody"') && amb.includes('loadPromoSection({ uid })'));
T('ambassadeur : renderDashboard reçoit uid (bug user is not defined)', /async function renderDashboard\(amb, uid\)/.test(amb) && amb.includes('renderDashboard(ambSnap.data(), user.uid)'));
T('ambassadeur : promoMode au niveau module (bug mode is not defined)', amb.includes("let promoMode = 'message';") && !/let mode = 'message';/.test(amb));
T('ambassadeur : création promo + code PROMO-XXXXXX', amb.includes('genPromoCode') && amb.includes('PROMO-'));
T('ambassadeur : composer message + PDF', amb.includes('tabMessage') && amb.includes('tabFile') && amb.includes('promo-files/'));
T('ambassadeur : fil + suppression + membres + retrait', amb.includes('loadFeed') && amb.includes('post-del') && amb.includes('loadMembers') && amb.includes('removeMember'));
T('ambassadeur : dissolution confirmée (arvexaConfirm + repli)', amb.includes('confirmDanger') && amb.includes('window.arvexaConfirm'));
T('ambassadeur : rattachement parrainage ownerCode', amb.includes('ownerCode') && amb.includes('referredBy'));
T('ambassadeur : vue membre ?promo=CODE complète', amb.includes('PROMO_PARAM') && amb.includes('renderPromoParamFlow') && amb.includes('renderPromoMemberPage') && amb.includes('renderPromoLanding'));
T('ambassadeur : lien partage promo = ambassadeur.html?promo=', /origin\)\/ambassadeur\.html\?promo=\$\{code\}/.test(amb) || amb.includes('ambassadeur.html?promo=${code}'));
T('ambassadeur : imports Storage + Firestore étendus', amb.includes('firebase/storage') && amb.includes('deleteDoc') && amb.includes('writeBatch') && amb.includes('increment') && amb.includes('orderBy'));
T('ambassadeur : importmap firebase/storage', amb.includes('"firebase/storage"'));
T('ambassadeur : arvexa-confirm + arvexa-modal inclus', amb.includes('./arvexa-confirm.js') && amb.includes('arvexa-modal.js'));
T('ambassadeur : module JS syntaxe valide (extraction)', (() => {
  const m = amb.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) return false;
  fs.writeFileSync(path.join('/tmp', 'amb_module_check.js'), m[1]);
  try { execSync('node --check /tmp/amb_module_check.js', { stdio: 'pipe' }); return true; } catch (e) { return false; }
})());
T('menu : plus aucun lien ma-promo.html dans les 7 sidebars', (() => {
  const pages = ['index.html', 'profil.html', 'notifications.html', 'abonnement.html', 'progression.html', 'arv.html'];
  const bad = pages.filter((p) => /href="ma-promo\.html"/.test(R(p)));
  return bad.length === 0;
})());

/* ── 5. login.html : redirections (2 causes cachées) ── */
const login = R('login.html');
T('login : sanitizeRedirect préserve la query (?promo= / ?ref=)', login.includes('return clean + query + hash'));
T('login : whitelist inclut ambassadeur + marketplace (proximité supprimée v8.63a)', /'ambassadeur\.html',\s*\n\s*'marketplace\.html'/.test(login) && !login.includes('localisation.html'));
T('login : sécurité intacts (protocole, //, ..)', /test\(raw\)\) return null/.test(login) && login.includes("raw.includes('..')"));

/* ── 6. Équilibre des balises des pages touchées ── */
for (const f of ['ambassadeur.html', 'index.html', 'arv.html', 'profil.html', 'abonnement.html', 'notifications.html', 'progression.html', 'login.html']) {
  const body = R(f).replace(/<script[\s\S]*?<\/script>/g, '');
  let ok = true;
  for (const tag of ['div', 'section', 'a', 'button', 'ul', 'li']) {
    const o = (body.match(new RegExp('<' + tag + '[\\s>]', 'g')) || []).length;
    const c = (body.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (o !== c) { ok = false; }
  }
  T(f + ' : balises équilibrées', ok);
}

/* ── 7. Cohérence avec v8.57a (tests précédents toujours valides) ── */
const abo = R('abonnement.html');
T('abonnement : recharges requêtes toujours en place', abo.includes('renderCreditsBalance') && abo.includes('aiCredits'));
const prog = R('arv-progress.html');
T('arv-progress : correctifs v8.57a toujours en place', prog.includes('makeBody().length < 60000') && prog.includes("localStorage.getItem('arvexa_user_data')"));

console.log(`\n[v8.58a] ${pass} PASS · ${fail} FAIL`);
process.exit(fail ? 1 : 0);
