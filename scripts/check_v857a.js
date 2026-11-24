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
T('ambassadeur : CTA Gérer ma promo', amb.includes('ma-promo.html'));
T('ambassadeur : CSS .amb-cta défini', amb.includes('.amb-cta {'));

const promo = R('ma-promo.html');
T('ma-promo : création promo + code PROMO-XXXXXX', promo.includes('PROMO-') && promo.includes('genPromoCode'));
T('ma-promo : rejoindre par code', promo.includes('joinPromo'));
T('ma-promo : composer message/fichier', promo.includes("tabMessage") && promo.includes("tabFile"));
T('ma-promo : upload Storage promo-files', promo.includes('promo-files/'));
T('ma-promo : liste membres + retrait', promo.includes('removeMember'));
T('ma-promo : rattachement parrainage ownerCode', promo.includes('ownerCode'));
T('ma-promo : auto-détachement membre retiré', promo.includes("uData.promoRole === 'member'") && promo.includes("mSnap.exists()"));

const abo = R('abonnement.html');
T('abonnement : section recharges requêtes', abo.includes('Recharges de requêtes'));
T('abonnement : carte solde aiCredits', abo.includes('renderCreditsBalance') && abo.includes('aiCredits'));
T('abonnement : achat pack kind:credits', abo.includes("kind: 'credits'") && abo.includes('productId'));
T('abonnement : garde retour paiement rafraîchit solde', abo.includes('renderCreditsBalance(snap.data())'));

const sw = R('service-worker.js');
T('SW : version v8.57a avec let', /let SW_VERSION = 'arvexa-offline-v8\.57a';/.test(sw));
T('SW : ma-promo.html précaché', sw.includes("'./ma-promo.html',"));

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
