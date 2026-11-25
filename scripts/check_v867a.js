// scripts/check_v867a.js — vérifications statiques de la v8.67a
// (sortie VÉRIFIÉE du cache sur les 19 pages + splash accueil uniforme,
//  visible uniquement au premier chargement de la session).
const fs = require('fs');
const { execSync } = require('child_process');
let ok = 0, ko = 0;
const T = (cond, label) => { if (cond) { ok++; console.log('  ✅ ' + label); } else { ko++; console.log('  ❌ ' + label); } };
const R = (f) => fs.readFileSync(f, 'utf8');

const PAGES = [
  'abonnement.html', 'ambassadeur.html', 'arv-progress.html', 'calculatrice.html',
  'chapitre.html', 'exam-history.html', 'exam.html', 'formulaires.html',
  'marketplace.html', 'mathmind.html', 'matiere.html', 'notifications.html',
  'outils.html', 'planificateur.html', 'profil.html', 'progression.html',
  'quotidien.html', 'tableau-periodique.html', 'whatsapp.html'
];

console.log('— 1. Cache de chargement : sortie VÉRIFIÉE sur les 19 pages —');
for (const f of PAGES) {
  const s = R(f);
  T(s.includes('window.__arvexaBootHide = verifiedHide'), f + ' : sortie page = VÉRIFIÉE');
  T(s.includes('window.__arvexaBootReady'), f + ' : API __arvexaBootReady déclarée');
  T(s.includes('function pageLooksReady'), f + ' : test générique de complétude présent');
  T(s.includes("setTimeout(hideBoot, 10000)"), f + ' : filet 10 s conservé (sortie forcée)');
  T(/\.arv-boot\{position:fixed;inset:0/.test(s), f + ' : cache plein écran intact (CSS)');
}

console.log('— 2. Vérifications propres aux pages à zone async —');
const mk = R('marketplace.html');
T(/__arvexaBootReady\(function\(\)\{\s*var g = document\.getElementById\('packsGrid'\)/.test(mk),
  'marketplace : complétude = grille des packs peinte');
const amb = R('ambassadeur.html');
T(/__arvexaBootReady\(function\(\)\{\s*var m = document\.getElementById\('mainArea'\)/.test(amb),
  'ambassadeur : complétude = tableau de bord peint (état Chargement du programme… non prêt)');

console.log('— 3. Accueil : modèle uniforme + 1er chargement uniquement —');
const ix = R('index.html');
T(/<script[^>]*><\/script><script>.*arvexa_splash_seen/.test(ix) && ix.includes("classList.add('arv-return')"),
  'index : porte head pose la marque de retour AVANT la 1ʳᵉ peinture');
T(/html\.arv-return #appSplash \{ opacity: 0; visibility: hidden; pointer-events: none; animation: none; \}/.test(ix),
  'index : retours = splash invisible (opacité 0 + désactivé)');
T(ix.includes('.splash-ring::after') && ix.includes('splashSpinRev'),
  'index : contre-anneau doré (modèle uniforme v8.66a)');
T(ix.includes('.splash-bar') && ix.includes('splashShimmer'),
  'index : barre shimmer (modèle uniforme v8.66a)');
T(ix.includes('class="splash-label"') && ix.includes('>Chargement...</div>'),
  'index : libellé Chargement... (modèle uniforme v8.66a)');
T(/#appSplash \{[\s\S]*?opacity: 1;/.test(ix), 'index : splash opaque dès la 1ʳᵉ peinture (1er chargement)');
T(ix.includes('arvexa_splash_seen') && ix.includes("firstLoad = sessionStorage.getItem('arvexa_splash_seen') !== '1'"),
  'index : mécanique 1er chargement de session intacte (v8.3)');
T(ix.includes('GATES_FORCE_MS = 6000'), 'index : filet 6 s des trois portes intact (v8.51a)');
T(/@keyframes arvSplashNet/.test(ix), 'index : filet CSS pur conservé');

console.log('— 4. Syntaxe des scripts boot v2 (extraction) —');
let synOk = 0, synKo = 0;
for (const f of PAGES) {
  const s = R(f);
  const i = s.indexOf('window.__arvexaBootHide = verifiedHide');
  const a = s.lastIndexOf('<script>', i);
  const b = s.indexOf('</script>', i);
  const tmp = `/tmp/v867a_${f.replace(/[^\w]/g, '_')}.js`;
  fs.writeFileSync(tmp, s.slice(a + 8, b), 'utf8');
  try { execSync(`node --check ${tmp}`, { stdio: 'pipe' }); synOk++; }
  catch (e) { synKo++; console.log(`  ❌ ${f} : syntaxe boot invalide`); }
  fs.unlinkSync(tmp);
}
T(synKo === 0, `scripts boot v2 : ${synOk}/19 syntaxe valide`);

console.log('— 5. Version —');
T(/let SW_VERSION = 'arvexa-online-v8\.67a';/.test(R('service-worker.js')), 'SW : version v8.67a');

console.log(`\n═══ AUDIT v8.67a : ${ok} PASS / ${ko} FAIL — taux ${(100 * ok / (ok + ko)).toFixed(1)} % ═══`);
process.exit(ko ? 1 : 0);
