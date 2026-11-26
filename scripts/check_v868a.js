// scripts/check_v868a.js — audit statique de la v8.68a
// (entrée < 0,5 s : cache de données ARVData + levée anticipée ;
//  porte données avant disparition ; graphismes tracés à la révélation ;
//  préconnexions Firebase/fonts).
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
const KEYS = PAGES.map(f => f.replace('.html', ''));

console.log('— 1. Boot v3 : porte données + révélation + levée anticipée (19 pages) —');
for (const f of PAGES) {
  const s = R(f);
  T(s.includes('window.__arvexaBootRequireData'), f + ' : porte données (__arvexaBootRequireData)');
  T(s.includes('window.__arvexaBootOnReveal'), f + ' : callbacks de révélation');
  T(s.includes('arvexa:revealed'), f + ' : évènement arvexa:revealed à la levée');
  T(s.includes('function replayTrace'), f + ' : tracé des graphismes à la révélation');
  T(/__ARVEXA_PAGE_RESTORED__ && looksDone\(\)/.test(s), f + ' : levée anticipée si snapshot restaurée');
  T(s.includes('ARVData.save(PAGE_KEY)'), f + ' : snapshot mémorisée à la levée');
  T(s.includes('window.__arvexaBootHide = verifiedHide'), f + ' : sortie vérifiée conservée (v8.67a)');
  T(s.includes('setTimeout(hideBoot, 10000)'), f + ' : filet 10 s conservé');
}

console.log('— 2. Restore instantané des données (19 pages, clé propre) —');
PAGES.forEach((f, i) => {
  const s = R(f);
  T(s.includes('<script src="arvexa-data.js"></script>'), f + ' : arvexa-data.js chargé');
  T(s.includes(`ARVData.restore('${KEYS[i]}')`), f + ' : restore synchrone avant modules Firebase');
  T(/<script>try\{ARVData\.restore\('/.test(s),
    f + ' : restore CLASSIQUE au parsing (avant les modules type="module" différés par spec — pages sans module : trivialement satisfait)');
});

console.log('— 3. arvexa-data.js : cache lié à l\'uid —');
const d = R('arvexa-data.js');
T(d.includes("sessionStorage.getItem('arvexa_session')"), 'arvexa-data.js : uid lu depuis la session');
T(d.includes('p.uid !== uid'), 'arvexa-data.js : snapshot jamais restaurée pour un autre élève');
T(d.includes('MAX_AGE'), 'arvexa-data.js : TTL 12 h');
T(d.includes('MAX_BYTES'), 'arvexa-data.js : garde-fou quota');
T(d.includes('window.__ARVEXA_PAGE_RESTORED__ = true'), 'arvexa-data.js : signal de levée anticipée');

console.log('— 4. Graphismes tracés à la révélation —');
const pg = R('progression.html');
T(pg.includes('__arvexaBootOnReveal(function(){') && pg.includes('.pg-bar-fill'),
  'progression : barres re-tracées à la révélation');
T(/prefers-reduced-motion: reduce/.test(R('progression.html')) || /prefers-reduced-motion: reduce/.test(d),
  'replayTrace : respect de prefers-reduced-motion');

console.log('— 5. Snippets v8.67a conservés —');
T(/__arvexaBootReady\(function\(\)\{\s*var g = document\.getElementById\('packsGrid'\)/.test(R('marketplace.html')),
  'marketplace : complétude packsGrid conservée');
T(/__arvexaBootReady\(function\(\)\{\s*var m = document\.getElementById\('mainArea'\)/.test(R('ambassadeur.html')),
  'ambassadeur : complétude mainArea conservée');

console.log('— 6. Préconnexions (20 pages) —');
for (const f of [...PAGES, 'index.html']) {
  const s = R(f);
  T(s.includes('rel="preconnect" href="https://firestore.googleapis.com"'), f + ' : préconnexion Firestore');
  T(s.includes('rel="preconnect" href="https://fonts.gstatic.com"'), f + ' : préconnexion fonts');
}

console.log('— 7. Version —');
T(/let SW_VERSION = 'arvexa-online-v8\.(68|69|[789]\d)a';/.test(R('service-worker.js')), 'SW : version ≥ v8.68a');

console.log('— 8. Syntaxe —');
let syn = 0, synKo = 0;
const files = [...PAGES.map(f => [f, 'boot']), ...PAGES.map(f => [f, 'restore'])];
for (const [f, kind] of files) {
  const s = R(f);
  let a, b;
  if (kind === 'boot') {
    const i = s.indexOf('window.__arvexaBootHide = verifiedHide');
    a = s.lastIndexOf('<script>', i); b = s.indexOf('</script>', i);
  } else {
    const i = s.indexOf('ARVData.restore(');
    a = s.lastIndexOf('<script>', i); b = s.indexOf('</script>', i);
  }
  const tmp = `/tmp/v868a_${f.replace(/[^\w]/g, '_')}_${kind}.js`;
  fs.writeFileSync(tmp, s.slice(a + 8, b), 'utf8');
  try { execSync(`node --check ${tmp}`, { stdio: 'pipe' }); syn++; }
  catch (e) { synKo++; console.log(`  ❌ ${f} (${kind}) : syntaxe invalide`); }
  fs.unlinkSync(tmp);
}
T(synKo === 0, `blocs inline : ${syn}/38 syntaxe valide`);

console.log(`\n═══ AUDIT v8.68a : ${ok} PASS / ${ko} FAIL — taux ${(100 * ok / (ok + ko)).toFixed(1)} % ═══`);
process.exit(ko ? 1 : 0);
