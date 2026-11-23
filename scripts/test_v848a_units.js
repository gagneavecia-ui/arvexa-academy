#!/usr/bin/env node
// ✅ v8.48a — TESTS UNITAIRES LOCAUX (extraction des fonctions pures de
// api/progress.js) : signature de complétion dans TOUS les profils, rigueur
// par matière injectée, complétion, normalisation (stripping signature).
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'progress.js'), 'utf8');
const out = (n, ok, d) => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);
let fails = 0;
const check = (n, ok, d) => { out(n, ok, d); if (!ok) fails++; };

function slice(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a + 1);
  if (a === -1 || b === -1) throw new Error(`slice introuvable: ${startMarker.slice(0, 40)}`);
  return src.slice(a, b);
}

// chunk S : constante de signature (AI_SIGNATURE + SIGNATURE_RULE)
const chunkSig = slice('const AI_SIGNATURE =', 'let adminServices = null;');
// chunk A : règles communes + RIGOR_BY_PROFILE (LATEX_RULES → PROMPTS PAR PROFIL)
const chunkRules = slice('const LATEX_RULES =', '// PROMPTS PAR PROFIL');
// chunk B : mergeAnalysis + normalizeAnalysis (de mergeAnalysis jusqu'à LATEX_RULES)
const chunkMerge = slice('function mergeAnalysis', 'const LATEX_RULES =');
// chunk C : builders + getPromptsForProfile (buildScientificPrompts → buildFallbackAnalysis)
const chunkBuilders = slice('function buildScientificPrompts', 'function buildFallbackAnalysis');
// chunk D : complétion (explanationIsReal → completeSection)
const chunkComplete = slice('function explanationIsReal', 'async function completeSection');

const ctx = { console };
const vm = require('vm');
vm.createContext(ctx);
vm.runInContext(chunkSig + '\n' + chunkRules + '\n' + chunkMerge + '\n' + chunkBuilders + '\n' + chunkComplete, ctx);

const PROFILES = ['scientific', 'svt', 'philosophy', 'history', 'french', 'language', 'info', 'techno', 'econ', 'general'];
const RIGOR_MARK = {
  scientific: 'RIGUEUR MATHÉMATIQUES / PHYSIQUE-CHIMIE',
  svt: 'RIGUEUR SVT',
  philosophy: 'RIGUEUR PHILOSOPHIE',
  history: 'RIGUEUR HISTOIRE-GÉOGRAPHIE',
  french: 'RIGUEUR FRANÇAIS',
  language: 'RIGUEUR LANGUE VIVANTE',
  info: 'RIGUEUR INFORMATIQUE',
  techno: 'RIGUEUR FILIÈRES TECHNOLOGIQUES',
  econ: 'RIGUEUR ÉCONOMIE-GESTION',
  general: 'RIGUEUR DE LA DISCIPLINE'
};

// ── 1. Signature + rigueur dans l'explication de TOUS les profils ──
for (const p of PROFILES) {
  const tasks = ctx.getPromptsForProfile(p, { subjectLabel: 'Test', rawInput: 'Contenu de test suffisant pour la vérification.'.repeat(3) });
  const expl = tasks.find((t) => t.name === 'explanation');
  check(`1.${PROFILES.indexOf(p) + 1} [${p}] explication porte la signature`, Boolean(expl && expl.userPrompt.includes('ARVEXA-COMPLETE')));
  check(`1.${PROFILES.indexOf(p) + 1}b [${p}] rigueur ${p} injectée`, Boolean(expl && expl.userPrompt.includes(RIGOR_MARK[p])));
  const others = tasks.filter((t) => t.name !== 'explanation');
  check(`1.${PROFILES.indexOf(p) + 1}c [${p}] questions/structure ont la règle JSON+signature`, others.every((t) => t.userPrompt.includes('ARVEXA-COMPLETE')));
}

// ── 2. L'ordre des tâches : explication en tête ──
const ord = ctx.getPromptsForProfile('scientific', { subjectLabel: 'Test', rawInput: 'X'.repeat(120) });
check('2.1 explication en tête de file', ord[0].name === 'explanation', ord.map((t) => t.name).join(','));

// ── 3. sectionCompleteness / explanationIsReal ──
const goodAnalysis = {
  explanation: { understanding: 'Voici ce que tu dois comprendre sur la cinématique du point matériel, en détail.', parts: [{ partTitle: 'P1' }] },
  structure: { formulas: [] },
  questions: [{ question: 'a', answer: 'b' }, { question: 'c', answer: 'd' }, { question: 'e', answer: 'f' }, { question: 'g', answer: 'h' }]
};
const comp = ctx.sectionCompleteness(goodAnalysis, 'scientific');
check('3.1 analyse complète → tout vrai', comp.explanation && comp.structure && comp.questions);
const badAnalysis = { explanation: { understanding: "L'explication pédagogique n'a pas pu être générée." }, structure: null, questions: [] };
const compBad = ctx.sectionCompleteness(badAnalysis, 'scientific');
check('3.2 analyse amputée → tout faux', !compBad.explanation && !compBad.structure && !compBad.questions);
const histAnalysis = { explanation: { understanding: 'Le traité de Versailles est signé le 28 juin 1919, voici ce qu il faut comprendre en détail.', keyFacts: ['f1', 'f2', 'f3', 'f4'] }, structure: { formulas: [] }, questions: [{}, {}, {}, {}] };
const compHist = ctx.sectionCompleteness(histAnalysis, 'history');
check('3.3 histoire narrative (sans parts) → complète', compHist.explanation === true);
const compHistSci = ctx.sectionCompleteness(histAnalysis, 'scientific');
check('3.4 même analyse en profil scientific → explanation fausse (parts requis)', compHistSci.explanation === false);

// ── 4. normalizeAnalysis : signature retirée, questions renumérotées ──
const toNorm = JSON.parse(JSON.stringify(goodAnalysis));
toNorm.signature = 'ARVEXA-COMPLETE';
toNorm.explanation.signature = 'ARVEXA-COMPLETE';
toNorm.structure.signature = 'ARVEXA-COMPLETE';
toNorm.questions.forEach((q, i) => { q.id = `raw${i}`; });
const normed = ctx.normalizeAnalysis(toNorm);
check('4.1 signature racine retirée', normed.signature === undefined);
check('4.2 signature explication retirée', normed.explanation.signature === undefined);
check('4.3 signature structure retirée', normed.structure.signature === undefined);
check('4.4 questions renumérotées q1..q4', normed.questions.map((q) => q.id).join(',') === 'q1,q2,q3,q4');

// ── 5. mergeAnalysis : fusion des résultats fan-out ──
const merged = ctx.mergeAnalysis([
  { status: 'fulfilled', value: { sectionTitle: 'Cinématique', understanding: 'comprendre', parts: [{ partTitle: 'P1' }], keyFacts: ['k1'] }, task: { name: 'explanation' }, provider: 'Groq' },
  { status: 'fulfilled', value: { formulas: [], method: { steps: ['s1'] } }, task: { name: 'structure' }, provider: 'Groq' },
  { status: 'fulfilled', value: { questions: [{ question: 'q1', answer: 'a1' }] }, task: { name: 'questions_a' }, provider: 'OpenRouter' },
  { status: 'rejected', error: new Error('Groq: 429'), task: { name: 'questions_b' }, provider: 'none' }
], 'scientific');
check('5.1 explication fusionnée', merged.explanation && merged.explanation.understanding === 'comprendre');
check('5.2 structure fusionnée', Boolean(merged.structure));
check('5.3 questions_a fusionnées', merged.questions.length === 1);
check('5.4 sectionTitle conservé', merged.sectionTitle === 'Cinématique');

// ── 6. Prompts extras (source) : signature dans QCM + carte ──
const sigCount = (src.match(/"signature":"\$\{AI_SIGNATURE\}"/g) || []).length;
check('6.1 formats QCM + carte finissent par la signature (×2)', sigCount === 2, `occurrences=${sigCount}`);
const reqSig = (src.match(/requireSignature: true/g) || []).length;
check('6.2 requireSignature exigé (callMarked + callExtrasTask = 2)', reqSig === 2, `occurrences=${reqSig}`);
check('6.3 budget 56 s', src.includes('GLOBAL_AI_TIME_BUDGET_MS = 56000'));
check('6.4 maxDuration 60 (plafond Hobby)', src.includes('maxDuration: 60'));
check('6.5 action completeSection enregistrée', src.includes("case 'completeSection'"));

// ── 7. Client arv-progress.html : badges + tap + z-index ──
const html = fs.readFileSync(path.join(__dirname, '..', 'arv-progress.html'), 'utf8');
check('7.1 badge signature doré présent', html.includes('Résumé complet') && html.includes('signé ARVEXA IA'));
check('7.2 bouton « Terminer » branché sur completeSection', html.includes("callApi('completeSection'"));
check('7.3 mini-signature QCM + carte', (html.match(/mini-signature/g) || []).length >= 2);
check('7.4 z-index modale 11000 > plein écran 10000', /modal-backdrop \{[^}]*z-index: 11000/.test(html));
check('7.5 toasts 12000', html.includes('z-index: 12000'));
check('7.6 swallow du click fantôme (appui simple)', html.includes('openModal.__swallow'));
check('7.7 SW v8.48a', fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8').includes("SW_VERSION = 'arvexa-offline-v8.48b'"));

console.log(fails === 0 ? '\nTOUS LES TESTS UNITAIRES PASSANT ✅' : `\n${fails} ÉCHEC(S) ❌`);
process.exit(fails === 0 ? 0 : 1);
