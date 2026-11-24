#!/usr/bin/env node
/* ✅ v8.52a — Tests : splines monotones (zéro sur-saut), fenêtre 14 jours,
   gabarit statTimeChart, pipeline renderStatsCard, extraction des scripts
   inline des 2 pages éditées pour node --check. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
// stubs de portée module — visibles des fonctions eval()ées (comme dans la page)
const safeArray = (v) => (Array.isArray(v) ? v : []);
const escapeHtml = (s) => String(s == null ? '' : s);
function ok(cond, label) {
  if (cond) { pass++; console.log('  PASS — ' + label); }
  else { fail++; console.log('  FAIL — ' + label); }
}

// ── extraction d'une fonction par accolades équilibrées ──
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return null;
}

const resumeSrc = fs.readFileSync(path.join(ROOT, 'arv-progress.html'), 'utf8');
const progSrc = fs.readFileSync(path.join(ROOT, 'progression.html'), 'utf8');

// ── sandbox commune ──
const sandbox = {};
for (const fn of ['lastNDays', 'niceStatMax', 'fmtStatMin', 'monotoneStatPath', 'statTimeChart', 'dayLabel', 'renderStatsCard']) {
  const code = extractFn(resumeSrc, fn);
  ok(code != null, 'arv-progress : fonction ' + fn + ' extraite');
  if (code) { try { sandbox[fn] = eval('(' + code + ')'); } catch (e) { ok(false, 'eval ' + fn + ' : ' + e.message); } }
}
for (const fn of ['monotonePath', 'pgLastNDays', 'pgNiceMax']) {
  const code = extractFn(progSrc, fn);
  ok(code != null, 'progression : fonction ' + fn + ' extraite');
  if (code) { try { sandbox[fn] = eval('(' + code + ')'); } catch (e) { ok(false, 'eval ' + fn + ' : ' + e.message); } }
}
const { monotoneStatPath, lastNDays, niceStatMax, fmtStatMin, statTimeChart, dayLabel, renderStatsCard, monotonePath, pgLastNDays, pgNiceMax } = sandbox;

console.log('\n── 1. SPLINE MONOTONE (les 2 pages) : zéro sur-saut ──');
function checkMonotone(name, fn) {
  // scénario qui cassait l'ancien Catmull-Rom : pic isolé dans des zéros
  const vals = [0, 0, 0, 80, 0, 0, 0, 0, 30, 30, 0, 0, 12, 0];
  const n = vals.length, W = 640, H = 150, PAD_T = 16, PAD_B = 10, PAD_L = 10;
  const maxV = 80, innerH = H - PAD_T - PAD_B;
  const pts = vals.map((v, i) => [PAD_L + (i * (W - 20)) / (n - 1), PAD_T + innerH - (v / maxV) * (innerH - 6) - 3]);
  const ys = pts.map((p) => p[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const d = fn(pts);
  ok(typeof d === 'string' && d.startsWith('M'), name + ' : path commence par M');
  // chaque segment C doit TERMINER exactement sur le point suivant
  let through = true;
  const segs = d.split('C').slice(1);
  segs.forEach((seg, idx) => {
    const tail = seg.trim().split(' ').pop().split(',');
    const ex = parseFloat(tail[0]), ey = parseFloat(tail[1]);
    if (Math.abs(ex - pts[idx + 1][0]) > 0.02 || Math.abs(ey - pts[idx + 1][1]) > 0.02) through = false;
  });
  ok(through, name + ' : passe EXACTEMENT par chaque point réel');
  // tous les nombres Y du path (contrôles inclus) restent dans [yMin, yMax]
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  let over = false;
  for (let i = 1; i < nums.length; i += 2) {
    const y = nums[i];
    if (y < yMin - 0.01 || y > yMax + 0.01) over = true;
  }
  ok(!over, name + ' : AUCUN dépassement du cadre (contrôles inclus)');
}
checkMonotone('monotoneStatPath (Résumé)', monotoneStatPath);
checkMonotone('monotonePath (Progression)', monotonePath);

console.log('\n── 2. FENÊTRE TEMPORELLE 14 JOURS CONSÉCUTIFS ──');
const w1 = lastNDays(14), w2 = pgLastNDays(14);
ok(w1.length === 14 && w2.length === 14, '2 fenêtres de 14 jours');
const today = new Date();
const todayKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
ok(w1[13] === todayKey && w2[13] === todayKey, 'dernier jour = AUJOURD’HUI (' + todayKey + ')');
let consec = true;
for (let i = 1; i < 14; i++) {
  const a = new Date(w1[i - 1] + 'T12:00:00'), b = new Date(w1[i] + 'T12:00:00');
  if (Math.round((b - a) / 86400000) !== 1) consec = false;
}
ok(consec, 'jours consécutifs (+1 jour exactement)');

console.log('\n── 3. PLAFOND Y ROND + FORMAT MINUTES ──');
ok(niceStatMax(80) === 100 && pgNiceMax(80) === 100, 'niceMax(80)=100');
ok(niceStatMax(3) === 5 && niceStatMax(50) === 50 && niceStatMax(120) === 200, 'niceMax : 3→5, 50→50, 120→200');
ok(fmtStatMin(78) === '1 h 18' && fmtStatMin(60) === '1 h' && fmtStatMin(45) === '45 min' && fmtStatMin(0) === '0 min', 'fmtStatMin : 78→1 h 18, 60→1 h, 45→45 min');

console.log('\n── 4. GABARIT SVG + PIPELINE RÉSUMÉ (temps d\'étude) ──');
const days = lastNDays(14);
const values = [0, 0, 0, 80, 0, 0, 0, 0, 30, 30, 0, 0, 12, 0];
const svgHtml = statTimeChart(values, days, { title: 'Temps d\'étude — 14 derniers jours (2 h 02)', aria: 'Courbe du temps d\'étude sur 14 jours', empty: '' });
ok(svgHtml.includes('stat-line') && svgHtml.includes('stat-area'), 'statTimeChart : ligne + aire présentes');
ok((svgHtml.match(/stroke-dasharray="3 5"/g) || []).length === 2, 'grille pointillée 2 lignes');
ok(svgHtml.includes('aria-label="Courbe du temps d\'étude sur 14 jours"'), 'aria correcte');
ok(svgHtml.includes(dayLabel(days[0])) && svgHtml.includes("Aujourd'hui"), 'jalons de dates réelles');
const dash = {
  summary: { totalSections: 5, totalChapters: 2 },
  studyTime: { formatted: { total: '2 h 02' } },
  activity: [ // trous volontaires : dates qui ne couvrent pas les 14 jours
    { date: days[3], sections: 2, minutes: 80 },
    { date: days[8], sections: 1, minutes: 30 },
    { date: '2020-01-01', sections: 1, minutes: 999 }, // hors fenêtre → ignoré
  ],
};
const card = renderStatsCard(dash);
ok(/Temps d..tude . 14 derniers jours \(1 h 50\)/.test(card), 'titre courbe TEMPS présent (80+30 min = 1 h 50)');
ok(card.includes('2 h 02'), 'total 14 j correct (2 h 02 = 80+30+12 min)');
const dAttr = card.match(/class="stat-line" d="([^"]+)"/);
ok(dAttr && dAttr[1].length > 40 && dAttr[1].startsWith('M'), 'path de la ligne généré (non vide)');
ok(!card.includes('999'), 'donnée hors fenêtre ignorée');

console.log('\n── 5. node --check des scripts inline des 2 pages ──');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arv852a-'));
let checked = 0, bad = 0;
for (const [label, src] of [['arv-progress.html', resumeSrc], ['progression.html', progSrc]]) {
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m, idx = 0;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1], body = m[2];
    if (!body.trim() || /src=/.test(attrs)) continue;
    if (/type\s*=\s*["'](importmap|application\/[a-z+]*json|speculationrules)["']/.test(attrs)) continue;
    idx++;
    const isMod = /type\s*=\s*["']module["']/.test(attrs);
    const f = path.join(tmp, label.replace('.html', '') + '_' + idx + (isMod ? '.mjs' : '.js'));
    fs.writeFileSync(f, body, 'utf8');
    checked++;
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { bad++; console.log('  FAIL — ' + label + ' script #' + idx + ' : ' + String(e.stderr || e.message).slice(0, 300)); }
  }
  ok(true, label + ' : ' + idx + ' scripts inline vérifiés');
}
ok(bad === 0, 'tous les scripts inline passent node --check (' + checked + ' vérifiés)');

console.log('\n════ RÉSULTAT : ' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
