#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   check_v853a.js — Tests v8.53a (node scripts/check_v853a.js)
   (1) goalTarget adaptatif ; (2) signatures dashSig/pgSig ; (3) QDJ IA
   extractJson/normalizeIa ; (4) gardes d'unicité dans les 2 pages ;
   (5) dé-BAC-ification ; (6) SW v8.53a ; (7) syntaxe des scripts.
   ═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let pass = 0, fail = 0;
function T(name, cond) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }

/* ── 1. goalTarget (miroir arvexa-classes.js) ── */
console.log('\n[1] ARVEXA_CLASSES.goalTarget — adaptatif tous niveaux');
const classesSrc = read('arvexa-classes.js');
global.window = {};
eval(classesSrc);
const CL = global.window.ARVEXA_CLASSES;
T('terminale → le BAC', CL.goalTarget('terminale') === 'le BAC');
T('terminale_d (legacy) → le BAC', CL.goalTarget('terminale_d') === 'le BAC');
T('troisieme → le BEPC', CL.goalTarget('troisieme') === 'le BEPC');
T('quatrieme (BEPC en vue) → le BEPC', CL.goalTarget('quatrieme') === 'le BEPC');
T('seconde (BAC en vue) → le BAC', CL.goalTarget('seconde') === 'le BAC');
T('premiere → le BAC', CL.goalTarget('premiere') === 'le BAC');
T('licence2 → ta licence', CL.goalTarget('licence2') === 'ta licence');
T('sixieme → ton objectif', CL.goalTarget('sixieme') === 'ton objectif');
T('custom → ton objectif', CL.goalTarget('custom') === 'ton objectif');
T('goal() inchangé : terminale + année → BAC 2027', CL.goal('terminale', 2027) === 'BAC 2027');

/* ── 2. Signatures d'unicité (miroirs dashSig / pgSig) ── */
console.log('\n[2] Signature — une seule actualisation');
function dashSig(data) {
  try {
    const safe = (x) => (Array.isArray(x) ? x : []);
    const act = safe(data && data.activity)
      .map((a) => (a.date || '') + ':' + (a.minutes || 0) + ':' + (a.sections || 0)).join(',');
    const sub = safe(data && data.subjects)
      .map((s) => (s.key || '') + ':' + (s.sectionsCount || 0) + ':' + (s.minutes || 0) + ':' + (s.last || '')).join(',');
    const rec = safe(data && data.recentActivity)
      .map((a) => (a.chapterId || '') + ':' + (a.time || '')).join(',');
    const sm = (data && data.summary) ? (data.summary.totalSections || 0) + '/' + (data.summary.totalChapters || 0) : '';
    const stt = (data && data.studyTime) ? (data.studyTime.totalMinutes || 0) : '';
    return sm + '|' + stt + '|' + act + '|' + sub + '|' + rec;
  } catch (e) { return 'x' + Date.now(); }
}
const D1 = { summary: { totalSections: 12, totalChapters: 3 }, studyTime: { totalMinutes: 340 }, activity: [{ date: '2026-11-24', minutes: 45, sections: 2 }], subjects: [{ key: 'mathematiques', sectionsCount: 8, minutes: 210, last: 'hier' }], recentActivity: [{ chapterId: 'ch1', time: '10:00' }] };
const D2 = JSON.parse(JSON.stringify(D1));
const D3 = JSON.parse(JSON.stringify(D1)); D3.activity[0].minutes = 90;
T('cache === frais → même signature (no-op garanti)', dashSig(D1) === dashSig(D2));
T('données réellement changées → signature différente', dashSig(D1) !== dashSig(D3));
T('conteneurs vides → signature stable', dashSig({}) === dashSig({}));
T('null → pas de crash', typeof dashSig(null) === 'string');

/* ── 3. QDJ IA — extractJson + normalizeIa (miroirs quotidien.html) ── */
console.log('\n[3] Question du jour — parsing IA robuste');
function extractJson(txt) {
  let t = String(txt || '').trim().replace(/```(?:json)?/gi, '');
  const s = t.indexOf('['), e = t.lastIndexOf(']');
  if (s === -1 || e === -1 || e <= s) throw new Error('pas de JSON');
  t = t.slice(s, e + 1);
  /* ✅ v8.53a — survit aux échappements invalides du modèle (\', \d, …) :
     toute barre inverse NON suivie d'un caractère d'échappement JSON valide
     est doublée (\' → \\' — l'apostrophe redevient littérale). */
  /* ✅ v8.53a — passe atomique : paires valides gardées, \X invalide doublé */
  t = t.replace(/\\(["\\\/bfnrtu])|\\([\s\S])/g, function (m, valid, other) {
    return valid ? '\\' + valid : '\\\\' + other;
  });
  return JSON.parse(t);
}
function normalizeIa(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 4).map((it, i) => {
    const o = (Array.isArray(it && it.options) ? it.options : (Array.isArray(it && it.o) ? it.o : []))
      .map((x) => String(x).trim()).filter((x) => x.length > 0 && x.length < 200).slice(0, 4);
    const label = String((it && (it.matiere || it.matiereLabel || it.subject)) || '').trim() || 'Culture générale';
    let a = Number(it && (it.bonne != null ? it.bonne : it.a));
    if (!Number.isInteger(a) || a < 0 || a >= o.length) a = 0;
    return {
      label,
      c: String((it && (it.chapitre || it.c)) || '').trim().slice(0, 80),
      q: String((it && (it.question || it.q)) || '').trim().slice(0, 400),
      o, a,
      e: String((it && (it.explication || it.e)) || '').trim().slice(0, 300)
    };
  }).filter((it) => it.q && it.o.length >= 2);
}
const clean = '[{"matiere":"Mathématiques","chapitre":"Théorème de Thalès","question":"2x = 6, x = ?","options":["3","2","6","12"],"bonne":0,"explication":"x = 6/2."},{"matiere":"Philosophie","question":"Qui a écrit Le Contrat social ?","options":["Rousseau","Voltaire","Descartes","Kant"],"bonne":0,"explication":"Rousseau, 1762."}]';
T('JSON propre → 2 questions', normalizeIa(extractJson(clean)).length === 2);
T('clôtures markdown ``` tolérées', normalizeIa(extractJson('```json\n' + clean + '\n```')).length === 2);
T('texte autour du JSON toléré', normalizeIa(extractJson('Voici les questions :\n' + clean + '\nBonne chance !')).length === 2);
const dirty = [{ matiere: 'Histoire', question: 'Cap ?', options: ['Oui', '', 'Non', ' '], bonne: 9, explication: '' }];
const nd = normalizeIa(extractJson(JSON.stringify(dirty)));
T('bonne hors bornes → 0 (garde)', nd[0].a === 0);
T('options vides filtrées → 2 restantes', nd[0].o.length === 2);
T('matière inconnue → « Culture générale »', normalizeIa(extractJson('[{"question":"Q ?","options":["a","b"],"bonne":1}]'))[0].label === 'Culture générale');
T('items sans question filtrés', normalizeIa(extractJson('[{"options":["a","b"],"bonne":0},{"question":"ok","options":["a","b"],"bonne":0}]')).length === 1);
T('rien de valide → 0 question (→ repli banque)', normalizeIa(extractJson('[]')).length === 0);
let threw = false; try { extractJson('aucun tableau ici'); } catch (e) { threw = true; }
T('sans JSON → exception (→ repli banque)', threw);
/* ✅ v8.53a — échappements invalides du modèle (sonde E2E réelle : \') */
const apostrophe = "[{\"matiere\":\"Mathématiques\",\"question\":\"Qu\\'est-ce que x ?\",\"options\":[\"l\\'inconnue\",\"le prix\",\"la somme\",\"la limite\"],\"bonne\":0,\"explication\":\"C\\'est l\\'inconnue.\"}]";
T("apostrophe mal échappée (\') → parsée quand même", normalizeIa(extractJson(apostrophe)).length === 1);
T('échappement JSON valide préservé (\\n)', normalizeIa(extractJson('[{"question":"A\\nB","options":["a","b"],"bonne":0}]')).length === 1);

/* ── 4. Gardes d'unicité présentes dans les 2 pages ── */
console.log('\n[4] Gardes « une seule actualisation » dans le code');
const ap = read('arv-progress.html');
const pg = read('progression.html');
T('arv-progress : dashSig défini', /function dashSig\(data\)/.test(ap));
T('arv-progress : no-op si signature identique', ap.includes("if (!__first && el.dataset.sig === __sig) return;"));
T('arv-progress : animation = première peinture seulement', ap.includes('if (__first) { try { animateStatCharts(el); }'));
T('progression : pgSig défini', /function pgSig\(dash\)/.test(pg));
T('progression : no-op si signature identique', pg.includes('if (painted && __sig === __pgSig) return;'));
T('progression : drawSpline reçoit animate (2 courbes)', (pg.match(/\{ animate: __animate \}/g) || []).length === 2);
T('progression : drawSpline animate=false par défaut câblé', pg.includes('const animate = !(opts && opts.animate === false);'));

/* ── 5. Dé-BAC-ification + carte parcours + QDJ ── */
console.log('\n[5] Dé-BAC-ification + carte + QDJ');
const idx = read('index.html');
const qdj = read('quotidien.html');
T('index : titre parcours adaptatif (#parcoursTitle)', idx.includes('id="parcoursTitle"'));
T('index : plus de « Ton parcours vers le BAC » en dur', !idx.includes('🧭 Ton parcours vers le BAC'));
T('index : stats en dur (temps · série · sections)', idx.includes('id="psStatTime"') && idx.includes('id="psStatStreak"') && idx.includes('id="psStatSections"'));
T('index : chip lacune en dur', idx.includes('id="psLacune"') && idx.includes('id="psLacuneTxt"'));
T('index : liseré premium (::before)', idx.includes('.parcours-card::before'));
const pj = read('parcours.js');
T('parcours.js : titre adaptatif câblé', pj.includes("'🧭 Ton parcours vers ' + target"));
T('parcours.js : puce sans faux compte à rebours (hasExam)', pj.includes('hasExam'));
T('parcours.js : lacune remplie depuis getSmartCard', pj.includes('Lacune : '));
const ex = read('exam.html');
T('exam.html : « conditions de ton examen »', ex.includes('Prépare ton test dans les conditions de ton examen.'));
T('exam.html : « Niveau Examen »', ex.includes('Niveau Examen</div>'));
const ac = read('auth-choice.html');
T('auth-choice.html : titre multi-niveaux', ac.includes('Prépare tes examens, construis ton avenir'));
const ot = read('outils.html');
T('outils.html : QDJ décrite comme IA + cours du Résumé', ot.includes('TES cours du') && !ot.includes('rituel des BAC +'));
T('outils.html : Exam Blanc universel', ot.includes('conditions réelles de ton examen'));
const ab = read('abonnement.html');
T('abonnement.html : examens au pluriel', ab.includes('préparer tes examens en toute confiance'));
const rg2 = read('register.html');
T('register.html : 6ᵉ → licence', rg2.includes("de la 6ᵉ jusqu'à la licence"));
const ob = read('onboarding.html');
T('onboarding.html : réussite (sans BAC)', ob.includes('ton parcours vers la réussite.'));
const av = read('arv.html');
T('arv.html : programme/niveau/examens', av.includes('ton programme, ton niveau ou tes examens'));
T('quotidien : appel IA /api/arv', qdj.includes("fetch('/api/arv'"));
T('quotidien : leçons RÉELLES dans le prompt (getDashboard + getFullLesson + source exclusive)', qdj.includes("action: 'getDashboard'") && qdj.includes("action: 'getFullLesson'") && qdj.includes('SEULE source autorisée')); // ✅ v8.54a — extraits réels du cours fourni
T('quotidien : banque statique SUPPRIMÉE + écran sans leçon (v8.54a)', !qdj.includes('chargerBanque') && qdj.includes('noCourseView'));
T('quotidien : cache 1×/jour (KEY_IA + dayKey)', qdj.includes('arvexa-quotidien-ia-v1') && qdj.includes("v.date === dayKey()"));
T('quotidien : partage adaptatif (goalTarget)', qdj.includes('goalTarget') && qdj.includes('arvexa-academy.vercel.app'));
T('quotidien : plus de partage « je prépare le BAC » figé', !qdj.includes('je prépare le BAC, rejoins-moi'));
T('quotidien : niveau depuis le profil (CL.full)', qdj.includes('CL.full('));
T('quotidien : importmap Firebase présent', qdj.includes('firebasejs/12.12.1/firebase-app.js'));

/* ── 6. SW ── */
console.log('\n[6] Service worker');
const sw = read('service-worker.js');
T('SW_VERSION = arvexa-online-v8.61a (let, ré-épinglé)', /let SW_VERSION = 'arvexa-online-v8\.6\da';/.test(sw));
T('SW 100 % en ligne : aucun précache', !sw.includes('PRECACHE') && !/\.addAll\(/.test(sw));
T('SW 100 % en ligne : aucun respondWith', !/respondWith/.test(sw));
T('SW 100 % en ligne : activate purge tous les caches', /caches\.keys\(\)/.test(sw) && /caches\.delete\(n\)/.test(sw));

/* ── 7. Syntaxe ── */
console.log('\n[7] node --check');
['service-worker.js', 'arvexa-classes.js', 'parcours.js', 'arvexa-streak.js', 'theme.js'].forEach((f) => {
  try { execSync('node --check ' + path.join(__dirname, '..', f), { stdio: 'pipe' }); T(f + ' : syntaxe OK', true); }
  catch (e) { T(f + ' : ERREUR ' + e.message.slice(0, 80), false); }
});
/* script module de quotidien.html extrait puis vérifié */
const m = qdj.match(/<script type="module">([\s\S]*?)<\/script>/);
T('quotidien : script module trouvé', !!m);
if (m) {
  fs.writeFileSync(path.join(__dirname, 'tmp_qdj_module.mjs'), m[1]);
  try { execSync('node --check ' + path.join(__dirname, 'tmp_qdj_module.mjs'), { stdio: 'pipe' }); T('quotidien : module JS syntaxe OK', true); }
  catch (e) { T('quotidien : module ERREUR ' + e.message.slice(0, 200), false); }
  finally { try { fs.unlinkSync(path.join(__dirname, 'tmp_qdj_module.mjs')); } catch (e) {} }
}

/* équilibre HTML des 6 pages touchées */
console.log('\n[8] Équilibre HTML');
['index.html', 'quotidien.html', 'arv-progress.html', 'progression.html', 'exam.html', 'outils.html'].forEach((f) => {
  const s = read(f);
  T(f + ' : <script> équilibrés', (s.match(/<script\b/g) || []).length === (s.match(/<\/script>/g) || []).length);
});

console.log('\n════════════════════════════════');
console.log('RÉSULTAT : ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
