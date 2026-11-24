// scripts/audit_v860a.js
// ⚡ v8.60a — audit des demandes du propriétaire après la v8.59a :
// salutation Résumé, cercle de chargement, menu instantané, cartes
// marketplace compactes à 2 boutons, confidentialité du fournisseur de
// paiement, notifications Telegram (avis + candidatures + paiements).
const fs = require('fs');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name); }
}
const read = (p) => fs.readFileSync(p, 'utf8');

console.log('— 1. RÉSUMÉ (arv-progress.html) —');
const rp = read('arv-progress.html');
check('phrase « Continue là où tu t\'es arrêté » supprimée', !rp.includes("Continue là où tu t\\'es arrêté") && !rp.includes('Continue là où tu t\'es arrêté'));
check('aucune div .greeting dans le rendu du dashboard', !rp.includes('<div class="greeting">'));
check('loader instantané présent (boot-loader)', rp.includes('id="bootLoader"') && rp.includes('.boot-spinner'));
check('loader retiré à la 1re peinture du cahier', rp.includes('__arvexaBootHide') && rp.split('__arvexaBootHide').length >= 4);
check('filet de sécurité 10 s', rp.includes('setTimeout(hideBoot, 10000)'));
check('variante thème clair du loader', rp.includes('html[data-theme="light"] .boot-loader'));
check('retiré aussi à onStale et onNoUser', (rp.match(/__arvexaBootHide/g) || []).length >= 5);

console.log('— 2. MENU INSTANTANÉ —');
const menu = read('arvexa-menu.js');
check('arvexa-menu.js existe (script classique, pas de module)', !menu.includes('import ') && menu.includes('menuToggle'));
check('garde anti double-lier', menu.includes('arvexaMenuBound') || menu.includes('dataset.arvexaMenuBound'));
check('Échap ferme le menu', menu.includes("e.key === 'Escape'"));
check('aria-expanded tenu à jour', menu.includes('aria-expanded'));
for (const f of ['index.html', 'abonnement.html', 'notifications.html', 'profil.html', 'localisation.html', 'progression.html']) {
  const s = read(f);
  check(`${f} charge arvexa-menu.js`, s.includes('arvexa-menu.js'));
  check(`${f} : plus d'écouteur module sur menuToggle`, !s.includes("menuToggle').addEventListener") && !s.includes("menuToggle\").addEventListener"));
}

console.log('— 3. MARKETPLACE —');
const mk = read('marketplace.html');
check('footer sans « SasPay »', !/SasPay/i.test(mk.split('footer-note')[1] || ''));
check('aucun « SasPay » visible dans le corps (hors commentaires JS)', !mk.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '').includes('SasPay'));
check('cartes compactes : pack-actions à 2 boutons', mk.includes('pack-actions') && mk.includes('pk-auto') && mk.includes('pk-manual'));
check('ancien gros bouton unique supprimé', !mk.includes('pack-buy'));
check('boutons Auto des packs reliés au paiement automatique', mk.includes("kind: 'credits'") && mk.includes("startCheckout({ kind: 'credits', productId }"));
check('bouton Manuel = WhatsApp prérempli (source unique contact)', mk.includes('manualWhatsApp') && mk.includes('ARVEXA_CONTACT'));
check('Premium mensuel : Auto + Manuel', mk.includes('buyMonthly') && mk.includes('manualMonthly'));
check('Premium annuel : Auto + Manuel', mk.includes('buyAnnual') && mk.includes('manualAnnual'));
check('bandeau de confiance (accueil, pousse à acheter)', mk.includes('trust-chip') && mk.includes('Activation instantanée') && mk.includes('Sans engagement'));
check('loader instantané présent', mk.includes('id="bootLoader"'));
check('loader retiré après chargement des packs', mk.includes('finally') && mk.includes('__arvexaBootHide'));

console.log('— 4. ABONNEMENT —');
const ab = read('abonnement.html');
check('note crédits sans nom de fournisseur', !ab.includes('Paiement sécurisé SasPay'));
check('loader instantané présent', ab.includes('id="bootLoader"'));
check('charge arvexa-menu.js', ab.includes('arvexa-menu.js'));

console.log('— 5. TELEGRAM (avis + candidatures + paiements) —');
const tg = read('api/telegram.js');
const act = read('api/_activation.mjs');
const amb = read('ambassadeur.html');
const tgm = read('api/_telegram.mjs');
check('module partagé _telegram.mjs (token jamais en dur)', tgm.includes('TELEGRAM_BOT_TOKEN') && tgm.includes('TELEGRAM_CHAT_ID') && !tg.includes('8283625921'));
check('api/telegram.js : kind « ambassadeur » accepté', tg.includes("kind === 'ambassadeur'"));
check('api/telegram.js : avis rétrocompatibles (rating 1-5)', tg.includes('rating < 1 || rating > 5'));
check('api/telegram.js : réutilise le module partagé', tg.includes("_telegram.mjs"));
check('webhook/vérif : alerte paiement non bloquante', act.includes('notifyTelegramBestEffort') && act.includes('NOUVEAU PAIEMENT'));
check('candidature ambassadeur → /api/telegram kind ambassadeur', amb.includes("kind: 'ambassadeur'") && amb.includes('/api/telegram'));
check('candidature : notification strictement non bloquante', amb.includes('notification jamais bloquante') || amb.includes('non bloquant'));
check('aucun token en dur côté client', !amb.includes('AAEF--QKS9'));

console.log('— 6. SERVICE WORKER —');
const sw = read('service-worker.js');
check('SW_VERSION = v8.60a (let)', sw.includes("let SW_VERSION = 'arvexa-offline-v8.60a'"));
check('arvexa-menu.js précaché', sw.includes("'./arvexa-menu.js'"));

console.log('— 7. HYGIÈNE —');
check('12 fonctions serverless max', fs.readdirSync('api').filter((f) => !f.startsWith('_')).length === 12);
check('progression.html : logout conservé après retrait du menu', read('progression.html').includes("getElementById('logoutBtn')"));
check('index.html : notifBtn/profileBtn/refreshBtn conservés', ['notifBtn', 'profileBtn', 'refreshBtn'].every((id) => read('index.html').includes(`getElementById('${id}')`)));

console.log(`\n══════ RÉSULTAT : ${pass} PASS / ${fail} FAIL ══════`);
process.exit(fail ? 1 : 0);
