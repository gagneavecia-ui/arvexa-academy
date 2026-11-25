// scripts/check_v866a_inline.js — node --check de chaque bloc <script> inline
// des pages touchées par la v8.66a (cache de chargement plein écran).
// Méthode identique à check_v860a_inline.js (modules ES en .mjs).
const fs = require('fs');
const { execSync } = require('child_process');
const files = [
  'index.html',
  'abonnement.html', 'ambassadeur.html', 'arv-progress.html', 'calculatrice.html',
  'chapitre.html', 'exam-history.html', 'exam.html', 'formulaires.html',
  'marketplace.html', 'mathmind.html', 'matiere.html', 'notifications.html',
  'outils.html', 'planificateur.html', 'profil.html', 'progression.html',
  'quotidien.html', 'tableau-periodique.html', 'whatsapp.html'
];
let ok = 0, ko = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<script(?![^>]*src=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const code = m[2];
    if (!code.trim()) continue;
    if (/application\/json|importmap/.test(attrs)) continue;
    const isModule = /type\s*=\s*["']module["']/.test(attrs);
    const tmp = `/tmp/v866a_${f.replace(/[^\w]/g, '_')}_${i++}${isModule ? '.mjs' : '.js'}`;
    fs.writeFileSync(tmp, code, 'utf8');
    try {
      execSync(`node --check ${tmp}`, { stdio: 'pipe' });
      ok++;
    } catch (e) {
      ko++;
      console.log(`❌ ${f} bloc #${i - 1} (${isModule ? 'module' : 'classic'}) :`);
      console.log(String(e.stderr).split('\n').slice(0, 6).join('\n'));
    }
    fs.unlinkSync(tmp);
  }
}
console.log(`\nBlocs inline v8.66a vérifiés : ${ok} OK / ${ko} ERREUR`);
process.exit(ko ? 1 : 0);
