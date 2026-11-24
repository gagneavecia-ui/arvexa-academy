#!/usr/bin/env node
/* check_v857a.js — vérifications spécifiques v8.57a */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function T(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

console.log('[v8.57a] faux problème de connexion + nom Résumé + ambassadeur + ma-promo + requêtes abonnement');

const prog = R('arv-progress.html');
T('arv-progress : keepalive plafonné à 60 Ko', prog.includes('makeBody().length < 60000'));
T('arv-progress : retente silencieuse sans keepalive', prog.includes('doProgressFetch(false)'));
T('arv-progress : semage nom depuis arvexa_user_data', prog.includes("localStorage.getItem('arvexa_user_data')"));
T('arv-progress : semage nom depuis arvexa_session', prog.includes("localStorage.getItem('arvexa_session')"));
T('arv-progress : re-cache local du profil au snapshot', prog.includes("localStorage.setItem('arvexa_user_data'"));

const amb = R('ambassadeur.html');
T('ambassadeur : sélecteur pays 54 pays', amb.includes("'NE','🇳🇪','+227','Niger'") && amb.includes('54 pays'));
T('ambassadeur : indicatif intelligent', amb.includes('countryByDial'));
T('ambassadeur : préremplissage whatsapp inscription', amb.includes("u.whatsapp || u.phone || ''"));
T('ambassadeur : champ promo candidature', amb.includes('appPromoName') && amb.includes('appPromoSize') && amb.includes('appInviteCount'));
T('ambassadeur : Gérer ma promo inline (v8.58a)', amb.includes('promo-sec-title') && amb.includes('loadPromoSection'));
T('ambassadeur : CSS .amb-cta défini', amb.includes('.amb-cta {'));

// ✅ v8.58a — ma-promo.html SUPPRIMÉE : toute la gestion vit dans ambassadeur.html
T('ambassadeur : création promo + code PROMO-XXXXXX', amb.includes('PROMO-') && amb.includes('genPromoCode'));
T('ambassadeur : rejoindre par code', amb.includes('joinPromoByCode'));
T('ambassadeur : composer message/fichier', amb.includes('tabMessage') && amb.includes('tabFile'));
T('ambassadeur : upload Storage promo-files', amb.includes('promo-files/'));
T('ambassadeur : liste membres + retrait', amb.includes('removeMember'));
T('ambassadeur : rattachement parrainage ownerCode', amb.includes('ownerCode'));
T('ambassadeur : auto-détachement membre retiré', amb.includes("uData.promoRole === 'member'") && amb.includes('mSnap.exists()'));
T('ambassadeur : publication sans ReferenceError mode', amb.includes("let promoMode = 'message'") && !/let mode = 'message'/.test(amb));
T('ambassadeur : vue membre ?promo=CODE', amb.includes('PROMO_PARAM') && amb.includes('renderPromoParamFlow'));
T('menu : plus aucun lien ma-promo.html', !/href="ma-promo\.html"/.test(amb));

const abo = R('abonnement.html');
T('abonnement : section recharges requêtes', abo.includes('Recharges de requêtes'));
T('abonnement : carte solde aiCredits', abo.includes('renderCreditsBalance') && abo.includes('aiCredits'));
T('abonnement : achat pack kind:credits', abo.includes("kind: 'credits'") && abo.includes('productId'));
T('abonnement : garde retour paiement rafraîchit solde', abo.includes('renderCreditsBalance(snap.data())'));

const sw = R('service-worker.js');
T('SW : version v8.58a avec let', /let SW_VERSION = 'arvexa-offline-v8\.59a';/.test(sw));
T('SW : ma-promo.html retiré du precache (v8.58a)', !sw.includes("'./ma-promo.html',") && !sw.includes("'./arvexa-net.js',"));

const rules = R('firestore.rules');
T('règles : promos read public', /match \/promos\/\{promoId\} \{/.test(rules) && /allow read: if true;/.test(rules));
T('règles : members auto-inscription', rules.includes("request.resource.data.role in ['owner', 'member']"));
T('règles : posts réservés au responsable', rules.includes('.data.ownerUid == request.auth.uid'));
T('règles : memberCount ±1 borné', rules.includes('hasOnly([\'memberCount\'])'));

const srules = R('storage.rules');
T('storage : chemin promo-files ouvert (cross-service)', srules.includes('promo-files/{promoId}/{fileName}') && srules.includes('firestore.get('));

// Doublons marketplace supprimés
for (const f of ['notifications.html', 'profil.html', 'progression.html', 'arv.html']) {
  const c = (R(f).match(/href="marketplace.html"/g) || []).length;
  T(f + ' : doublon Marketplace supprimé (' + c + ' lien)', c === 1);
}

console.log('\n══════════════════════════════');
console.log('RÉSULTAT : ' + pass + ' PASS / ' + fail + ' FAIL');
console.log('══════════════════════════════');
process.exit(fail ? 1 : 0);
