// ================================================================
// API PROGRESS v8.10 — ARVEXA School
// Cahier intelligent + Fan-out IA + Tracking temps d'étude
// v8.10 « onglets Résumé · Questionnaires · Carte mentale » :
//   - generateSectionExtras : QCM COURT (6 questions à 3 choix, interactif)
//     + CARTE MENTALE en escalier (idée de base → étapes → subdivisions,
//     nombre dicté par le volume de la leçon), générés À LA DEMANDE au
//     premier ouvert de l'onglet puis cachés dans analysis.qcm / analysis.mindmap
//     — même chaîne robuste callProvider (Gemini → Mistral → OpenRouter → Groq),
//     réponse bornée/sanitizée avant écriture ; zéro quota (la section a déjà
//     payé 1 à sa création), rate limit 6/min ;
//   - v8.9 « chaîne IA robuste · matières dynamiques · PDF 7 Mo » :
//   - callProvider CASCADE : modèle principal → replis (Groq llama-3.1-8b,
//     OpenRouter gpt-oss/llama-3.3:free, Gemini flash-latest) + 1 retente
//     auto sur 429/5xx/réseau — « si l'un tombe en panne, un autre prend le
//     relais », l'élève doit voir 0 erreur ; Gemini reçoit sa clé en query
//     ET en header x-goog-api-key (couvre clés AIza… et AQ.…) ;
//   - classifyLesson détecte aussi isStudy (cours réel vs écritures sans
//     rapport avec l'étude) → erreurs NOT_COURSE / SUBJECT_UNKNOWN (422,
//     quota remboursé, message clair côté élève) ;
//   - l'accueil n'affiche plus 8 cartes fixes : cartes matières DYNAMIQUES
//     (seulement les matières avec sections) — côté page, pas ici ;
//   - PDF > 7 Mo refusé proprement côté page (message), OCR élargi 10 pages.
// v8.6 « édition complète » (base v8.5 inchangée structurellement) :
//   - explications « comme un prof » enrichies (analogies, étapes)
//   - banque de questions SPLIT en 2 demi-tâches (base + avancée, 5-13 chacune)
//     fusionnées + renumérotées → 10-26 questions, taille « QCM » fiable chez Mistral
//   - QCM 8-12 imposés, distracteurs plausibles, explication chaque item
//   - anglais ré-ajouté (prompts language déjà dans le code)
//   - FILES séquentielles par fournisseur (anti-collision de concurrence)
//   - GEMINI 4e fournisseur (JSON natif responseMimeType) : questions + qcm primaires
//   - affectation calibrée sur les taux de succès réels : Groq = explication,
//     Mistral = structure + qcm (jsonMode), OpenRouter = questions (repli Mistral)
//   - extraction supprimée (la page n'utilise pas analysis.extracted)
//   - budget IA 70 s (maxDuration 90) — repli sur fournisseur inactif
//   - v4.14 : tâche QCM retirée (affichage + génération) — explication + banque
//     de questions uniquement ; les anciennes sections gardent leur QCM en base
// NOTE : maxDuration est assigné en FIN de module (visible par Vercel AU BUILD).
// ================================================================

const WINDOW_MS = 60 * 1000;

// ✅ Rate limit adaptatif par action
const RATE_LIMITS = {
  getDashboard: 20,
  listChapters: 30,
  createChapter: 10,
  getChapter: 30,
  createSection: 5,       // IA lourd = 5/min max
  autoAddSection: 5,      // ✅ v8.38 — IA (classement + analyse) = même budget que createSection
  renameSection: 20,      // ✅ v8.38 — écriture légère
  renameChapter: 20,      // ✅ v8.38 — écriture légère
  getSection: 30,
  updateNotes: 30,
  deleteSection: 10,
  deleteChapter: 10,
  getFullLesson: 15,
  getMateContact: 20,      // ✅ v8.54a — numéro WhatsApp d'un camarade (À proximité)
  generateSectionExtras: 12, // ✅ v8.44a — IA à la demande (QCM court + carte mentale) — l'élève qui vérifie en basculant d'onglets ne doit pas se bloquer
  getSmartCard: 30,       // ✅ v8.43 — lecture légère (carte intelligente de l'accueil)
  trackStudyTime: 60      // léger, fréquent
};

const DEFAULT_RATE_LIMIT = 30;
const requestLog = new Map();

// ────────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────────
var ALLOWED_SUBJECTS = new Set([
  'mathematiques', 'physique', 'chimie', 'svt',
  'philosophie', 'histoire', 'geographie', 'anglais',
  // ✅ v8.47a — « tout type qu'on peut faire dans le monde » (demande du
  // propriétaire : adapter l'IA à TOUTES les filières — mathématiques,
  // sciences, filières technologiques, informatique… — en distinguant bien
  // chaque domaine pour qu'aucun contenu ne soit mélangé).
  'francais', 'informatique', 'technologie', 'economie',
  'espagnol', 'allemand', 'education_civique', 'arts'
]);

var ALLOWED_SUBJECTS_ARRAY = Array.from(ALLOWED_SUBJECTS);

var SUBJECT_INFO = {
  mathematiques: { label: 'Mathématiques',  profile: 'scientific' },
  physique:      { label: 'Physique',       profile: 'scientific' },
  chimie:        { label: 'Chimie',         profile: 'scientific' },
  svt:           { label: 'SVT',            profile: 'svt' },
  philosophie:   { label: 'Philosophie',    profile: 'philosophy' },
  histoire:      { label: 'Histoire',       profile: 'history' },
  geographie:    { label: 'Géographie',     profile: 'history' },
  anglais:       { label: 'Anglais',        profile: 'language' },
  // ✅ v8.47a — les 8 nouvelles matières du cahier
  francais:          { label: 'Français',           profile: 'french' },
  informatique:      { label: 'Informatique',       profile: 'info' },
  technologie:       { label: 'Technologie',        profile: 'techno' },
  economie:          { label: 'Économie & Gestion', profile: 'econ' },
  espagnol:          { label: 'Espagnol',           profile: 'language' },
  allemand:          { label: 'Allemand',           profile: 'language' },
  education_civique: { label: 'Éducation civique',  profile: 'general' },
  arts:              { label: 'Arts & Musique',     profile: 'general' }
};
const MIN_CONTENT_LENGTH = 40;
const MAX_CONTENT_LENGTH = 2500; // calibré IA : aligné sur le cahier (budget analyse)

const FREE_SECTION_LIMIT = 5;
// ✅ v8.48a — Vercel HOBBY = plafond RÉEL 60 s par exécution de fonction
// (constaté : plan hobby sur l'équipe gagneavecia-9207s-projects). L'ancien
// budget 78 s + maxDuration 90 dépassaient le plafond → la fonction était
// TUÉE à 60 s → le fetch du client mourait sans réponse → « la génération ne
// termine jamais ». Budget calé à 56 s (marge pour auth + Firestore) —
// le reste du travail de complétion est assuré par l'action completeSection
// (bouton « Terminer la section ») et la signature IA ci-dessous.
const GLOBAL_AI_TIME_BUDGET_MS = 56000;

// ✅ v8.48a — SIGNATURE DE COMPLÉTION (demande du propriétaire : « à la fin
// tu mets une signature qui prouve que l'IA a terminé la section complète »).
// Chaque réponse JSON DOIT se terminer par ce champ : si la sortie du modèle
// a été COUPÉE (max_tokens atteint), la signature manque → la réponse est
// REJETÉE et le relais passe au modèle suivant — jamais de contenu tronqué
// affiché comme complet.
const AI_SIGNATURE = 'ARVEXA-COMPLETE';
const SIGNATURE_RULE = `
SIGNATURE DE COMPLÉTION — OBLIGATOIRE :
- Le DERNIER champ de l'objet JSON doit être "signature": "ARVEXA-COMPLETE".
- C'est la preuve que tu as écrit le JSON ENTIÈREMENT jusqu'au bout.
- Si tu manques de place, écourte les phrases de chaque élément MAIS termine TOUJOURS par la signature — un objet sans signature est rejeté et tout ton travail est perdu.`.trim();

let adminServices = null;

// ════════════════════════════════════════════════════════════════
// NORMALISATION LATEX
// ════════════════════════════════════════════════════════════════
const UNICODE_MATH_MAP = {
  'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
  'ε': '\\epsilon ', 'ζ': '\\zeta ', 'η': '\\eta ', 'θ': '\\theta ',
  'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'μ': '\\mu ',
  'ν': '\\nu ', 'ξ': '\\xi ', 'π': '\\pi ', 'ρ': '\\rho ',
  'σ': '\\sigma ', 'ς': '\\varsigma ', 'τ': '\\tau ', 'υ': '\\upsilon ',
  'φ': '\\phi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
  'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ',
  'Λ': '\\Lambda ', 'Ξ': '\\Xi ', 'Π': '\\Pi ',
  'Σ': '\\Sigma ', 'Υ': '\\Upsilon ', 'Φ': '\\Phi ',
  'Ψ': '\\Psi ', 'Ω': '\\Omega ',
  '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ',
  '·': '\\cdot ', '⋅': '\\cdot ', '∘': '\\circ ', '∗': '\\ast ',
  '⋆': '\\star ', '∙': '\\bullet ', '⊕': '\\oplus ', '⊗': '\\otimes ',
  '⊙': '\\odot ',
  '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ', '≈': '\\approx ',
  '≡': '\\equiv ', '≅': '\\cong ', '∼': '\\sim ', '≃': '\\simeq ',
  '∝': '\\propto ', '≪': '\\ll ', '≫': '\\gg ',
  '∈': '\\in ', '∉': '\\notin ', '∋': '\\ni ', '⊂': '\\subset ',
  '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ',
  '⊄': '\\not\\subset ', '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ',
  '∀': '\\forall ', '∃': '\\exists ', '∄': '\\nexists ', '¬': '\\neg ',
  '∧': '\\wedge ', '∨': '\\vee ',
  '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ', '∮': '\\oint ',
  '∂': '\\partial ', '∇': '\\nabla ', '√': '\\sqrt ',
  '→': '\\to ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ',
  '↑': '\\uparrow ', '↓': '\\downarrow ', '↕': '\\updownarrow ',
  '⇒': '\\Rightarrow ', '⇐': '\\Leftarrow ', '⇔': '\\Leftrightarrow ',
  '⟹': '\\Longrightarrow ', '⟸': '\\Longleftarrow ', '⟺': '\\Longleftrightarrow ',
  '↦': '\\mapsto ', '↪': '\\hookrightarrow ', '↩': '\\hookleftarrow ',
  '↗': '\\nearrow ', '↘': '\\searrow ', '↙': '\\swarrow ', '↖': '\\nwarrow ',
  '⇌': '\\rightleftharpoons ', '⇋': '\\leftrightharpoons ',
  '⟶': '\\longrightarrow ', '⟵': '\\longleftarrow ',
  '∞': '\\infty ', 'ℵ': '\\aleph ', 'ℓ': '\\ell ', 'ℏ': '\\hbar ',
  'ℜ': '\\Re ', 'ℑ': '\\Im ', '°': '^{\\circ} ', '′': "'", '″': "''",
  '‰': '\\text{‰} ', '§': '\\text{§} ',
};

const SUPERSCRIPT_MAP = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁿ': 'n', 'ⁱ': 'i'
};

const SUBSCRIPT_MAP = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')'
};

const NO_ARG_LATEX_COMMANDS = [
  'rightleftharpoons', 'leftrightharpoons', 'longrightarrow', 'longleftarrow',
  'Longleftrightarrow', 'Longleftarrow', 'Longrightarrow',
  'Leftrightarrow', 'leftrightarrow', 'rightarrow', 'leftarrow',
  'updownarrow', 'hookrightarrow', 'hookleftarrow',
  'Rightarrow', 'Leftarrow', 'to', 'gets', 'implies', 'impliedby',
  'iff', 'mapsto', 'longmapsto', 'leadsto',
  'varepsilon', 'vartheta', 'varsigma', 'varrho', 'varphi', 'varpi',
  'cdotp', 'cdot', 'times', 'div', 'pm', 'mp', 'ast', 'star', 'bullet',
  'circ', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq', 'propto',
  'cong', 'll', 'gg', 'subset', 'supset', 'subseteq', 'supseteq',
  'cup', 'cap', 'emptyset', 'forall', 'exists', 'nexists', 'neg', 'wedge',
  'vee', 'oplus', 'otimes', 'odot', 'sum', 'prod', 'int', 'oint',
  'partial', 'nabla', 'infty', 'aleph', 'ell', 'hbar',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon',
  'Phi', 'Psi', 'Omega',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp',
  'lim', 'max', 'min', 'det', 'mod', 'gcd', 'lcm',
  'quad', 'qquad'
];

const CMD_SPACE_REGEX = new RegExp(
  `(\\\\(?:${NO_ARG_LATEX_COMMANDS.join('|')}))(?=[a-zA-Z0-9])`,
  'g'
);

const HAS_UNICODE_MATH_REGEX = /[α-ωΑ-Ω×÷±∓·⋅∘∗⋆∙⊕⊗⊙≤≥≠≈≡≅∼≃∝≪≫∈∉∋⊂⊃⊆⊇⊄∪∩∅∀∃∄¬∧∨∑∏∫∮∂∇√→←↔↑↓↕⇒⇐⇔⟹⟸⟺↦↪↩↗↘↙↖⇌⇋⟶⟵∞ℵℓℏℜℑ⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]/;

function hasUnicodeMath(text) {
  if (!text || typeof text !== 'string') return false;
  return HAS_UNICODE_MATH_REGEX.test(text);
}

function replaceUnicodeScripts(text) {
  if (!text || typeof text !== 'string') return text;
  let r = text;

  r = r.replace(/([a-zA-Z0-9}\)\]_])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+)/g, (m, base, sups) => {
    const conv = sups.split('').map((c) => SUPERSCRIPT_MAP[c] || c).join('');
    return `${base}^{${conv}}`;
  });

  r = r.replace(/([a-zA-Z0-9}\)\]])([₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]+)/g, (m, base, subs) => {
    const conv = subs.split('').map((c) => SUBSCRIPT_MAP[c] || c).join('');
    return `${base}_{${conv}}`;
  });

  return r;
}

function replaceUnicodeMath(text) {
  if (!text || typeof text !== 'string') return text;

  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

  return parts.map((part, i) => {
    if (i % 2 === 0) return part; // prose : la flèche Unicode reste Unicode (lisible)

    // DANS les maths : Unicode → LaTeX (KaTeX-friendly, fix $x → 3$)
    let r = part;
    for (const [uni, latex] of Object.entries(UNICODE_MATH_MAP)) {
      if (r.indexOf(uni) !== -1) {
        r = r.split(uni).join(latex);
      }
    }
    return r;
  }).join('');
}

function fixCommandSpacing(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(CMD_SPACE_REGEX, '$1 ');
}

function normalizeDelimiters(text) {
  if (!text || typeof text !== 'string') return text;
  let r = text;

  r = r.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => `$${inner.trim()}$`);
  r = r.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => `$$${inner.trim()}$$`);
  r = r.replace(/\\begin\{(?:equation|align|gather)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather)\*?\}/g,
                (m, inner) => `$$${inner.trim()}$$`);

  return r;
}

function cleanBrokenDelimiters(text) {
  if (!text || typeof text !== 'string') return text;
  let r = text;

  r = r.replace(/\${6,}/g, '$$$$');
  r = r.replace(/\${5}/g, '$$$$');
  r = r.replace(/\${3}/g, '$$');
  r = r.replace(/\$\s*\$/g, ' ');
  r = r.replace(/\$\$\s*\$\$/g, ' ');

  return r;
}

// ✅ FIX « ADN\to ARN » : flèches LaTeX/ASCII orphelines (HORS des $…$)
// → Unicode lisible dans la prose. Dans les maths délimitées, on ne touche rien.
const ARROW_LAT2UNI = {
  Longleftrightarrow:'\u27FA', Longrightarrow:'\u27F9', Longleftarrow:'\u27F8',
  Leftrightarrow:'\u21D4', rightleftharpoons:'\u21CC', leftrightharpoons:'\u21CB',
  longrightarrow:'\u27F6', longleftarrow:'\u27F5', longmapsto:'\u27FC',
  leftrightarrow:'\u2194', hookrightarrow:'\u21AA', hookleftarrow:'\u21A9',
  Rightarrow:'\u21D2', Leftarrow:'\u21D0', updownarrow:'\u2195', Uparrow:'\u21D1', Downarrow:'\u21D3',
  downarrow:'\u2193', uparrow:'\u2191', nearrow:'\u2197', searrow:'\u2198', swarrow:'\u2199', nwarrow:'\u2196',
  mapsto:'\u21A6', rightarrow:'\u2192', leftarrow:'\u2190', leadsto:'\u2933',
  implies:'\u21D2', impliedby:'\u21D0', iff:'\u21D4', to:'\u2192', gets:'\u2190'
};
const ARROW_LAT2UNI_RE = new RegExp(
  '\\\\(' + Object.keys(ARROW_LAT2UNI).sort((a, b) => b.length - a.length).join('|') + ')(?![a-zA-Z])', 'g'
);

function arrowsToUnicode(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // maths délimitées : intactes
    let r = part.replace(ARROW_LAT2UNI_RE, (m, c) => ARROW_LAT2UNI[c] || m);
    // Flèches ASCII usuelles écrites par les modèles (prose uniquement)
    r = r.replace(/<=>/g, '\u21D4').replace(/<->/g, '\u2194').replace(/-->/g, '\u27F6')
         .replace(/==>/g, '\u27F9').replace(/->/g, '\u2192').replace(/=>/g, '\u21D2');
    return r;
  }).join('');
}

function wrapOrphanLatex(text) {
  if (!text || typeof text !== 'string') return text;
  if (!/\\[a-zA-Z]/.test(text)) return text;

  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return wrapSegmentLatex(part);
  }).join('');
}

function wrapSegmentLatex(segment) {
  if (!segment) return segment;
  if (!/\\[a-zA-Z]/.test(segment)) return segment;

  let r = segment;

  r = r.replace(
    /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g,
    (match) => ` $$${match}$$ `
  );

  const KNOWN_CMDS = new Set([
    ...NO_ARG_LATEX_COMMANDS,
    'frac', 'sqrt', 'dfrac', 'tfrac', 'cfrac',
    'text', 'mathrm', 'mathbf', 'mathit', 'mathbb', 'mathcal', 'mathfrak',
    'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
    'overline', 'underline', 'vec', 'hat', 'bar', 'dot', 'ddot', 'tilde',
    'binom', 'choose', 'pmod', 'bmod', 'operatorname',
    'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
    'lg', 'log', 'ln', 'exp',
    'quad', 'qquad', 'hspace', 'vspace'
  ]);

  r = r.replace(
    /(\\[a-zA-Z]+)((?:\s*\{[^}]*\})*)((?:\s*[_^]\s*(?:\{[^}]*\}|[a-zA-Z0-9]))*)/g,
    (match, cmd, args, scripts) => {
      if (!KNOWN_CMDS.has(cmd.slice(1))) return match;
      return ` $${cmd}${args || ''}${scripts || ''}$ `;
    }
  );

  r = r.replace(
    /(?:^|\s)([a-zA-Z]\s*[_^]\s*(?:\{[^}]*\}|[a-zA-Z0-9]))(?=\s|$|[.,;:!?])/g,
    (match, expr) => match.replace(expr, `$${expr.trim()}$`)
  );

  for (let iteration = 0; iteration < 5; iteration++) {
    const before = r;
    r = r.replace(
      /\$\s*([^$]*?)\s*\$\s*([+\-*/=<>()\[\]{}.,\s]*?)\s*\$\s*([^$]*?)\s*\$/g,
      (m, a, ops, b) => ` $${a.trim()} ${ops.trim()} ${b.trim()}$ `
    );
    if (before === r) break;
  }

  r = r.replace(/\$\s*\$/g, ' ');
  r = r.replace(/\$\s+/g, '$');
  r = r.replace(/\s+\$/g, '$');

  r = r.replace(/\s+/g, ' ');
  r = r.replace(/\s+([.,;:!?])/g, '$1');

  return r;
}

function cleanFormulaContent(formula) {
  if (!formula || typeof formula !== 'string') return formula;

  let open, close, inner;
  if (formula.startsWith('$$') && formula.endsWith('$$')) {
    open = '$$'; close = '$$';
    inner = formula.slice(2, -2);
  } else if (formula.startsWith('$') && formula.endsWith('$')) {
    open = '$'; close = '$';
    inner = formula.slice(1, -1);
  } else {
    return formula;
  }

  inner = inner.replace(/\s+/g, ' ').trim();
  inner = fixCommandSpacing(inner);
  inner = inner.replace(/^\$+/, '').replace(/\$+$/, '');

  return open + inner + close;
}

function cleanLatexText(text) {
  if (!text || typeof text !== 'string') return text;
  if (!text.trim()) return text;

  // Espaces insécables émis par certains modèles (U+00A0 / U+202F) → espace
  // normal : sinon tout le texte devient une seule ligne insécable qui déborde
  // des cartes QCM sur mobile (« le test sort de sa zone »).
  text = text.replace(/[\u00a0\u202f]/g, ' ');

  const hasBackslash = text.indexOf('\\') !== -1;
  const hasDollar = text.indexOf('$') !== -1;
  const hasUnicode = hasUnicodeMath(text);

  if (!hasBackslash && !hasDollar && !hasUnicode) return text;

  let r = text;

  r = normalizeDelimiters(r);
  r = cleanBrokenDelimiters(r);
  r = replaceUnicodeScripts(r);
  r = replaceUnicodeMath(r);
  r = arrowsToUnicode(r);
  r = fixCommandSpacing(r);
  r = wrapOrphanLatex(r);

  const parts = r.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  r = parts.map((part, i) => {
    if (i % 2 === 1) return cleanFormulaContent(part);
    return part;
  }).join('');

  r = r.replace(/[ \t]+/g, ' ');
  r = r.replace(/\s+([.,;:!?])/g, '$1');

  return r;
}

function deepClean(obj, depth = 0) {
  if (depth > 20) return obj;

  if (typeof obj === 'string') {
    if (obj.length < 6 && !/[\\$]/.test(obj) && !hasUnicodeMath(obj)) return obj;
    return cleanLatexText(obj);
  }

  if (Array.isArray(obj)) return obj.map((item) => deepClean(item, depth + 1));

  if (obj && typeof obj === 'object') {
    const cleaned = {};
    for (const k in obj) {
      if (k === 'id' || k === 'type' || k === 'level' || k === 'importance' ||
          k === 'correct' || k === 'notionId' || k === 'number') {
        cleaned[k] = obj[k];
        continue;
      }
      cleaned[k] = deepClean(obj[k], depth + 1);
    }
    return cleaned;
  }

  return obj;
}

// ════════════════════════════════════════════════════════════════
// FIREBASE ADMIN
// ════════════════════════════════════════════════════════════════
function getAdminServices() {
  if (adminServices) return adminServices;

  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credentials || !credentials.trim()) throw new Error('firebase_admin_not_configured');

  let serviceAccount;
  try { serviceAccount = JSON.parse(credentials); }
  catch (e) { throw new Error('firebase_admin_invalid_json'); }

  if (!serviceAccount.project_id || !serviceAccount.private_key) {
    throw new Error('firebase_admin_invalid_credentials');
  }

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  adminServices = {
    auth: admin.auth(),
    db: admin.firestore(),
    FieldValue: admin.firestore.FieldValue,
    Timestamp: admin.firestore.Timestamp
  };
  return adminServices;
}

// ────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────
function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
}

// ✅ Rate limit adaptatif par action
// ⚠️ v4.13 — buckets ISOLÉS par (ip, action) : avant, TOUTES les actions
// partageaient un compteur unique, donc une navigation normale remplissait le
// bucket et la 1ʳᵉ suppression héritait d'un faux « trop de demandes ».
function rateLimited(ip, action) {
  const limit = RATE_LIMITS[action] || DEFAULT_RATE_LIMIT;
  const key = `${ip}|${action}`;
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5000) {
    for (const [k, v] of requestLog) {
      if (v.every((t) => now - t >= WINDOW_MS)) requestLog.delete(k);
    }
  }
  return recent.length > limit;
}

function jsonError(response, status, error, code) {
  return response.status(status).json({
    success: false,
    error,
    ...(code ? { code } : {})
  });
}

function applyCors(request, response) {
  const ALLOWED_ORIGINS = [
    'https://arvexaschool.vercel.app',
    'https://admin-89.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ];
  const origin = request.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Max-Age', '86400');
}

async function verifyFirebaseToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const { auth } = getAdminServices();
    return await auth.verifyIdToken(match[1]);
  } catch (error) {
    console.error('[PROGRESS AUTH] failed:', error.message);
    return null;
  }
}

function isPremiumUser(data) {
  if (!data) return false;
  const status = data.subscriptionStatus || 'none';
  if (status === 'pending') return false;

  const hasPremium = data.premium === true ||
                     data.isUnlocked === true ||
                     data.hasDeposited === true;

  const end = data.subscriptionEndDate?.toDate?.() ||
    (data.subscriptionEndDate?.seconds ? new Date(data.subscriptionEndDate.seconds * 1000) : null);

  if (hasPremium && end) return end.getTime() > Date.now();
  if (status === 'expired') return false;
  if (hasPremium && !end) return true;
  return false;
}

function toISO(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v._seconds !== undefined) return new Date(v._seconds * 1000).toISOString();
  if (v.seconds !== undefined) return new Date(v.seconds * 1000).toISOString();
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

function todayKey() { return new Date().toISOString().slice(0, 10); }
function monthKey()  { return new Date().toISOString().slice(0, 7); }

function formatRelativeDate(value) {
  const iso = toISO(value);
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `il y a ${day}j`;
  if (day < 30) return `il y a ${Math.floor(day / 7)} sem.`;
  return d.toLocaleDateString('fr-FR');
}

function isMeaningfulContent(text) {
  if (!text || typeof text !== 'string') return false;
  const words = text.match(/[a-zA-ZÀ-ÿ]{2,}/g) || [];
  return words.length >= 5;
}

function formatMinutes(totalMin) {
  if (!totalMin || totalMin < 1) return '0 min';
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

function normalizeMathInput(text) {
  if (!text || typeof text !== 'string') return '';
  let r = text;
  r = r.replace(/([a-zA-Z0-9\)])\s*²/g, '$1^2');
  r = r.replace(/([a-zA-Z0-9\)])\s*³/g, '$1^3');
  r = r.replace(/([a-zA-Z0-9\)])\s*⁴/g, '$1^4');
  r = r.replace(/([a-zA-Z0-9\)])\s*⁵/g, '$1^5');
  r = r.replace(/√\s*\(([^)]+)\)/g, 'racine($1)');
  r = r.replace(/√\s*([a-zA-Z0-9]+)/g, 'racine($1)');
  r = r.replace(/≤/g, ' <= ');
  r = r.replace(/≥/g, ' >= ');
  r = r.replace(/≠/g, ' != ');
  r = r.replace(/∞/g, ' infini ');
  r = r.replace(/π/g, ' pi ');
  r = r.replace(/θ/g, ' theta ');
  r = r.replace(/α/g, ' alpha ');
  r = r.replace(/β/g, ' beta ');
  r = r.replace(/Δ/g, ' Delta ');
  r = r.replace(/∑/g, ' somme ');
  r = r.replace(/∫/g, ' integrale ');
  r = r.replace(/→/g, ' tend vers ');
  r = r.replace(/×/g, ' fois ');
  r = r.replace(/÷/g, ' divise par ');
  r = r.replace(/±/g, ' plus ou moins ');
  return r;
}

// ────────────────────────────────────────────────────────────────
// IA — FOURNISSEURS
// ────────────────────────────────────────────────────────────────
function getProviders() {
  return [
    {
      name: 'Groq',
      key: process.env.GROQ_API_KEY,
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      // ✅ v8.47d — repli RÉEL si le modèle principal sature : l'ancien repli
      // `llama-3.1-8b-instant` a été RETIRÉ de Groq (« does not exist or you
      // do not have access » constaté par sonde E2E) → quand gpt-oss-120b
      // renvoyait 429 TPM, Groq n'offrait AUCUN second modèle et la tâche
      // tombait sur des relais morts (OpenRouter cap 50/jour, Gemini quota).
      // Nouvelle chaîne : llama-3.3-70b-versatile + openai/gpt-oss-20b — les
      // TPM Groq sont des SEAUX PAR MODÈLE, donc chaque repli a sa propre
      // fenêtre (la rotation passe au suivant si l'un est retiré).
      fallbackModels: ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b'],
      jsonMode: true
    },
    {
      name: 'OpenRouter',
      key: process.env.OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      // ✅ v8.46a — le compte OpenRouter est à 0 crédit : les modèles PAYANTS
      // (openai/gpt-oss-*, etc.) répondent HTTP 402 et la génération entière
      // échouait (cause réelle de « carte générée mais rien à l'écran » :
      // la chaîne Groq [clé morte] → Gemini → OpenRouter-payant était TOUTE
      // cassée). On repart sur la liste :free VÉRIFIÉE EN DIRECT le 24/11/2026
      // (sonde réelle : particle 9,4 s · nemotron 13,5 s · flint 28 s — JSON
      // carte valide 3/3). Modèles à raisonnement (reasoning_tokens) : le
      // raisonnement arrive dans un champ séparé, `content` reste du JSON pur.
      model: process.env.OPENROUTER_MODEL || 'particle-ai/particle-1:free',
      fallbackModels: [
        'nvidia/nemotron-3.5-super-vl:free',
        'recursive/flint-v1.0:free',
        'google/gemma-4-31b-it:free',
        'google/gemma-4-26b-a4b-it:free',
        'inclusionai/ling-3.2-flash:free',
        'baidu/ernie-5.5-flash-preview:free'
      ],
      jsonMode: true,
      headers: {
        'HTTP-Referer': process.env.APP_ORIGIN || '',
        'X-Title': 'ARVEXA Notebook'
      }
    },
    {
      name: 'Mistral',
      key: process.env.MISTRAL_API_KEY,
      endpoint: 'https://api.mistral.ai/v1/chat/completions',
      model: process.env.MISTRAL_MODEL || 'mistral-large-latest',
      fallbackModels: ['mistral-small-latest'],
      jsonMode: true
    },
    {
      name: 'Gemini',
      key: process.env.GEMINI_API_KEY,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.8-flash'}:generateContent`,
      // ✅ v8.9 — si le modèle de l'env n'existe pas → modèles stables connus
      fallbackModels: ['gemini-flash-latest', 'gemini-2.0-flash'],
      gemini: true
    }
  ].filter((p) => Boolean(p.key));
}

// Les modeles (surtout Mistral) inserent des retours a la ligne LITTERAUX
// dans les longues proses -> JSON invalide. On les echappe avant parsing.
function escapeControlCharsInJsonStrings(s) {
  if (!s || typeof s !== 'string') return s;
  let out = '';
  let inStr = false, esc = false;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (ch === '\\' && inStr) {
      // Backslash : valide seulement \" \\ / et \uXXXX.
      // b f n r t sont TRAITES COMME LATEX (\neq, \frac, \tan, \bar) car les
      // vraies nouvelles lignes sont interdites dans les valeurs (regle JSON).
      const next = i + 1 < n ? s[i + 1] : '';
      if (next === 'u' && /^[0-9a-fA-F]{4}/.test(s.slice(i + 2, i + 6))) { out += ch; esc = true; continue; }
      if ('"\\/'.includes(next)) { out += ch; esc = true; continue; }
      out += '\\\\';
      continue;
    }
    if (inStr) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }
    out += ch;
  }
  return out;
}

// Guillemets doubles NON echappes a l'interieur des chaines ("le nombre "a" tel que")
// -> heuristique : un " suivi d'un caractere non structurel est un guillemet interne.
function escapeInnerQuotes(s) {
  if (!s || typeof s !== 'string') return s;
  let out = '';
  let inStr = false, esc = false;
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; out += ch; continue; }
      let j = i + 1;
      while (j < n && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
      const next = j < n ? s[j] : '';
      if (next === '' || ':,}]'.includes(next)) { inStr = false; out += ch; }
      else { out += '\\"'; }
      continue;
    }
    out += ch;
  }
  return out;
}

function repairJson(str) {
  if (!str || typeof str !== 'string') return null;

  let s = String(str).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try { return JSON.parse(s); } catch (_) {}

  const firstBrace = s.indexOf('{');
  if (firstBrace === -1) return null;
  const lastBrace = s.lastIndexOf('}');
  // Reponse tronquee sans AUCUN '}' : reparer depuis la premiere accolade
  let candidate = (lastBrace > firstBrace) ? s.slice(firstBrace, lastBrace + 1) : s.slice(firstBrace);
  try { return JSON.parse(candidate); } catch (_) {}

  // Rejouer la PILE d'imbrication pour fermer dans le bon ordre
  const stack = [];
  let inString = false, escape = false;
  for (const ch of candidate) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
  }

  let suffix = '';
  if (escape) candidate = candidate.slice(0, -1);
  if (inString) suffix += '"';
  while (stack.length) suffix += stack.pop();
  candidate += suffix;

  try { return JSON.parse(candidate); } catch (_) {}
  return null;
}

// ✅ v8.9 — CASCADE PAR FOURNISSEUR : modèle principal → replis, avec 1
// retente automatique sur 429/5xx/réseau. Demande du propriétaire : « si l'un
// commence et tombe en panne, un autre prend le relais — 0 erreur vue ».
function sleepMs(ms) { return new Promise((r) => setTimeout(r, ms)); }

// UN appel (1 modèle, 1 délai) — ne jette jamais, renvoie {ok, ...}.
async function attemptProviderOnce(provider, model, timeoutMs, { systemPrompt, userPrompt, maxTokens }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let rawContent = null;

    if (provider.gemini) {
      // API generateContent : JSON natif via responseMimeType.
      // ✅ v8.9 — clé passée EN MÊME TEMPS en query (?key=) et en header
      // x-goog-api-key : couvre les anciennes clés AIza… ET les nouvelles AQ.…
      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }
        }
      };
      const result = await fetch(`${provider.endpoint.split(':generateContent')[0]}:generateContent?key=${encodeURIComponent(provider.key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const status = result.status;
      const data = await result.json().catch(() => null);
      if (!result.ok) {
        const msg = data?.error?.message || `HTTP ${result.status}`;
        const kind = (status === 401 || status === 403) ? 'auth'
          : (status === 429 || status >= 500) ? 'retryable' : 'other';
        return { ok: false, status, errMsg: msg, kind };
      }
      rawContent = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!rawContent) {
        const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'réponse vide';
        return { ok: false, status, errMsg: reason, kind: 'empty' };
      }
      // ✅ v8.48a — finishReason : MAX_TOKENS = sortie COUPÉE en plein JSON
      return { ok: true, rawContent, status, finishReason: data?.candidates?.[0]?.finishReason || null };
    }

    const body = {
      model,
      temperature: 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };

    if (provider.jsonMode) body.response_format = { type: 'json_object' };

    const result = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.key}`,
        ...(provider.headers || {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const status = result.status;
    const data = await result.json().catch(() => null);
    if (!result.ok) {
      const msg = data?.error?.message || `HTTP ${result.status}`;
      const kind = (status === 401 || status === 403) ? 'auth'
        : (status === 429 || status >= 500) ? 'retryable'
        : (/model/i.test(msg) ? 'modelbad' : 'other');
      return { ok: false, status, errMsg: msg, kind };
    }

    rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) return { ok: false, status, errMsg: 'réponse vide', kind: 'empty' };
    // ✅ v8.48a — finish_reason « length » = sortie COUPÉE (max_tokens atteint)
    return { ok: true, rawContent, status, finishReason: data?.choices?.[0]?.finish_reason || null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      errMsg: err?.name === 'AbortError' ? 'délai dépassé' : (err.message || 'réseau'),
      kind: 'retryable'
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Nettoyage + réparation JSON (chaîne existante, extraite telle quelle).
function parseProviderJson(provider, rawContent) {
  const cleaned = String(rawContent).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try { return JSON.parse(cleaned); }
  catch (_) {
    const repaired = repairJson(cleaned);
    if (repaired) {
      console.warn(`[AI] ${provider.name} — JSON réparé avec succès`);
      return repaired;
    }
    const sanitized = escapeControlCharsInJsonStrings(cleaned);
    try { return JSON.parse(sanitized); }
    catch (posErr) {
      const repaired2 = repairJson(sanitized);
      if (repaired2) {
        console.warn(`[AI] ${provider.name} — JSON réparé (contrôles + LaTeX)`);
        return repaired2;
      }
      // Diagnostic : message V8 (token fautif) + contexte si position disponible
      let ctx = ` [${String(posErr?.message || '').slice(0, 200)}]`;
      const pm = /position (\d+)/.exec(String(posErr?.message || ''));
      if (pm) {
        const p = parseInt(pm[1], 10);
        ctx += ` [vers ${sanitized.slice(Math.max(0, p - 120), p + 120).replace(/[\n\r\t]/g, '⏎')}]`;
      }
      console.warn(`[AI] ${provider.name} — JSON invalide non réparable. Début: ${cleaned.slice(0, 200)}`);
      throw new Error(`${provider.name}: JSON invalide${ctx}`);
    }
  }
}

async function callProvider(provider, { systemPrompt, userPrompt, maxTokens = 4000, deadline, validate, requireSignature }) {
  // ✅ v8.46b — POLYTAPE 2 PASSES SANS SOMMEIL : les modèles :free d'OpenRouter
  // sont PARTAGÉS entre tous les utilisateurs — la saturation (HTTP 429
  // « temporarily rate-limited upstream ») varie MINUTE PAR MINUTE et revient
  // INSTANTANÉMENT. L'ancien comportement (réessai du MÊME modèle après
  // 1,4 s + timeout 30 s par essai) brûlait tout le budget de 52 s sur 2-3
  // modèles saturés sans jamais atteindre les autres. Désormais :
  // - timeout 20 s max par essai (OpenRouter) — un accroc ne bouffe plus le tour ;
  // - PASSE 1 : chaque modèle UNE fois, 429 = rotation IMMÉDIATE vers le
  //   suivant (zéro sommeil — c'est la rotation qui est l'échappatoire) ;
  // - PASSE 2 : si au moins un 429 a été vu et qu'il reste ≥ 12 s — on
  //   REPASSE toute la liste (les fenêtres :free se libèrent en secondes) ;
  // - l'échec d'un modèle ne bloque plus jamais l'essai du suivant.
  // ✅ v8.48a — SIGNATURE DE COMPLÉTION + TRONCATURE :
  // - requireSignature : le JSON doit porter "signature":"ARVEXA-COMPLETE"
  //   en dernier champ — absent = sortie coupée → modèle suivant ;
  // - finish_reason « length » / « MAX_TOKENS » = troncature OFFICIELLE du
  //   fournisseur → modèle suivant ET maxTokens ×1,6 (plafonné 8000) pour la
  //   suite du tour : la sortie doit FINIR, jamais être coupée.
  const perTry = { 'Groq': 18000, 'OpenRouter': 20000, 'Mistral': 45000, 'Gemini': 38000 };
  const baseTimeout = perTry[provider.name] || 20000;
  const models = [provider.model]
    .concat(Array.isArray(provider.fallbackModels) ? provider.fallbackModels : [])
    .filter(Boolean);
  const absDeadline = deadline || (Date.now() + baseTimeout * (models.length + 1));
  let lastMsg = 'indisponible';
  let parseErr = null;   // le PREMIER JSON irréparable est gardé : si AUCUN
                         // modèle n'a produit de JSON lisible, c'est lui qu'on
                         // lèvera — mais la rotation continue d'abord.
  let sawRateLimit = false;
  let tokLimit = maxTokens; // grossit si une sortie a été coupée

  const tryOne = async (model) => {
    const remaining = absDeadline - Date.now();
    if (remaining < 4000) return 'exhausted';
    const res = await attemptProviderOnce(provider, model, Math.min(baseTimeout, remaining), { systemPrompt, userPrompt, maxTokens: tokLimit });
    if (res.ok) {
      // ✅ v8.48a — troncature officielle du fournisseur : la sortie a atteint
      // le plafond de tokens → JSON forcément incomplet → on AGRANDIT le
      // plafond pour les modèles suivants et on passe au suivant.
      if (/^(length|MAX_TOKENS)$/i.test(String(res.finishReason || ''))) {
        tokLimit = Math.min(8000, Math.round(tokLimit * 1.6));
        lastMsg = `${model} : sortie coupée (fin ${res.finishReason})`;
        return 'parse';
      }
      try {
        const parsed = parseProviderJson(provider, res.rawContent);
        // ✅ v8.48a — SIGNATURE DE COMPLÉTION : le champ final prouve que le
        // modèle a écrit son JSON JUSQU'AU BOUT. Un JSON « réparé » par
        // repairJson après une coupure n'a PAS la signature (elle est écrite
        // en dernier, donc coupée en premier) → rejeté → modèle suivant.
        if (requireSignature && parsed?.signature !== AI_SIGNATURE) {
          lastMsg = `${model} : JSON sans signature de complétion (sortie coupée ou incomplète)`;
          tokLimit = Math.min(8000, Math.round(tokLimit * 1.6));
          return 'parse';
        }
        // ✅ v8.46c — validation AU NIVEAU MODÈLE : un JSON lisible mais de
        // mauvaise FORME (carte sans étapes, QCM vide) fait tourner la roue
        // vers le modèle SUIVANT du même fournisseur (ex. gpt-oss-120b →
        // llama-3.1-8b-instant) au lieu de sauter tout le fournisseur — le
        // fallback de modèle redevient utile.
        if (typeof validate === 'function' && !validate(parsed)) {
          lastMsg = `${model} : format inutilisable`;
          return 'parse';
        }
        return { value: parsed, done: true };
      }
      catch (e) { if (!parseErr) parseErr = e; lastMsg = e.message || lastMsg; return 'parse'; } // JSON irréparable → modèle SUIVANT (la roue tourne)
    }
    lastMsg = res.errMsg || `HTTP ${res.status}`;
    if (res.kind === 'auth') {
      // clé invalide : inutile d'essayer les autres modèles du même fournisseur
      throw new Error(`${provider.name}: ${lastMsg}`);
    }
    if (res.status === 429 || /rate-limited|temporarily rate/i.test(String(lastMsg))) sawRateLimit = true;
    // ✅ v8.46c — CAP QUOTIDIEN du tier gratuit OpenRouter (50 requêtes/jour
    // sans crédits, niveau COMPTE, découvert par la sonde health.js ?providers=1 :
    // « Rate limit exceeded: free-models-per-day ») : quand il est atteint,
    // TOUS les modèles :free renvoient le même 429 instantané — tourner la
    // roue ne sert à rien et brûle le budget de 52 s. On lève immédiatement
    // (comme une erreur de clé) pour passer au fournisseur suivant.
    if (/free-models-per-day/i.test(String(lastMsg))) {
      throw new Error(`${provider.name}: quota quotidien gratuit épuisé — relais fournisseur suivant`);
    }
    return res.kind;
  };

  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && (!sawRateLimit || absDeadline - Date.now() < 12000)) break;
    for (const model of models) {
      const r = await tryOne(model);
      if (r === 'exhausted') break;
      if (r && r.done) return r.value;
    }
    if (Date.now() >= absDeadline) break;
  }

  if (parseErr) throw parseErr;
  throw new Error(`${provider.name}: ${lastMsg}`);
}

// v8.6 — FILES SÉQUENTIELLES PAR FOURNISSEUR (anti-collision) :
// le fan-out simultané faisait partir 2 tâches lourdes (explanation + qcm)
// chez le MÊME fournisseur gratuit → concurrence refusée → tâches perdues.
// Désormais chaque fournisseur exécute SES tâches en file (séquentiel),
// les files tournent en parallèle. Repli sur fournisseur INACTIF uniquement.
// + GESTION DES 429 : un fournisseur en rate-limit est écarté 25 s (retry-after si fourni).
// Affectation calibrée sur les limites réelles observées :
// - Groq (TPM 8000/min) : UNIQUEMENT l'explication (tâche la plus critique)
// - OpenRouter (lent mais sans TPM serré) : questions + qcm en file
// - Mistral : structure
const TASK_PROVIDER_PREF = {
  // ✅ v8.46c — Groq premier (vivante depuis Vercel, 522 ms prouvée par la
  // sonde health.js) ; OpenRouter en secours — son tier gratuit est plafonné
  // à 50 requêtes/JOUR (free-models-per-day, découvert par sonde) : il ne
  // doit absorber que le débordement TPM de Groq (8000 tokens/min) et pas
  // toute la charge. Gemini (clé non standard, FAILED_PRECONDITION) et
  // Mistral (non configuré) restent des relais finaux.
  explanation: ['Groq', 'OpenRouter', 'Gemini', 'Mistral'],
  structure:   ['Groq', 'OpenRouter', 'Mistral', 'Gemini'],
  questions_a: ['Groq', 'OpenRouter', 'Gemini', 'Mistral'],
  questions_b: ['Groq', 'OpenRouter', 'Gemini', 'Mistral'],
  qcm:         ['Groq', 'OpenRouter', 'Gemini', 'Mistral']
};

function distributeTasks(tasks, providers) {
  if (providers.length === 0) return [];
  const byName = new Map(providers.map((p) => [p.name, p]));
  const queues = new Map();
  tasks.forEach((task, i) => {
    const pref = TASK_PROVIDER_PREF[task.name] || providers.map((p) => p.name);
    let provider = null;
    for (const name of pref) {
      if (byName.has(name)) { provider = byName.get(name); break; }
    }
    if (!provider) provider = providers[i % providers.length];
    if (!queues.has(provider.name)) queues.set(provider.name, { provider, tasks: [] });
    queues.get(provider.name).tasks.push({ task, index: i });
  });
  return Array.from(queues.values());
}

async function runParallelTasks(tasks, providers, deadline) {
  const queues = distributeTasks(tasks, providers);
  const results = new Array(tasks.length).fill(null);
  // Concurrence max par fournisseur : Mistral (payant) accepte 2 requêtes
  // parallèles ; Groq est limité à 1 (TPM 8000/min) ; OpenRouter 2.
  const MAX_CONC = { 'Groq': 1, 'OpenRouter': 2, 'Mistral': 2, 'Gemini': 3 };
  const busy = new Map(providers.map((p) => [p.name, 0]));
  const blockedUntil = new Map(providers.map((p) => [p.name, 0]));

  function usable(p) {
    const cap = MAX_CONC[p.name] || 1;
    return (busy.get(p.name) || 0) < cap && (blockedUntil.get(p.name) || 0) <= Date.now();
  }
  function release(p) {
    busy.set(p.name, Math.max(0, (busy.get(p.name) || 1) - 1));
  }
  // Réserve atomiquement (test-and-set, sans await entre les deux) le premier
  // fournisseur UTILISABLE dans l'ordre de préférence donné (capacité libre +
  // non bloqué). Respecte l'ordre de TASK_PROVIDER_PREF pour les replis.
  async function reserveFromPref(prefNames, triedNames) {
    while (deadline && Date.now() < deadline - 8000) {
      for (const name of prefNames) {
        if (triedNames.includes(name)) continue;
        const p = providers.find((x) => x.name === name);
        if (p && usable(p)) { busy.set(p.name, (busy.get(p.name) || 0) + 1); return p; }
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    return null;
  }

  async function callMarked(provider, task) {
    try {
      const value = await callProvider(provider, {
        systemPrompt: task.systemPrompt,
        userPrompt: task.userPrompt,
        maxTokens: task.maxTokens,
        deadline,
        // ✅ v8.48a — TOUTE tâche principale exige la signature de complétion :
        // une sortie coupée (max_tokens, coupure réseau) est rejetée et le
        // relais passe au modèle suivant — jamais de résumé tronqué affiché.
        requireSignature: true
      });
      return value;
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('HTTP 429') || /rate limit/i.test(msg) || /quota/i.test(msg)) {
        // Quota JOURNALIER épuisé → inutile de retenter avant longtemps.
        // Quota à la minute → réessayer dans 25 s.
        const daily = /per day|TPD|daily/i.test(msg);
        const waitMs = daily ? 600000 : 25000;
        blockedUntil.set(provider.name, Date.now() + waitMs);
        console.warn(`[FAN-OUT] ${provider.name} en rate-limit (${daily ? 'QUOTIDIEN' : 'minute'}), écarté ${waitMs / 1000} s`);
      } else if (/abort/i.test(msg)) {
        // Fournisseur qui dépasse systématiquement son timeout → petit repos.
        blockedUntil.set(provider.name, Date.now() + 15000);
      }
      throw e;
    }
  }

  // Exécute une tâche : réserve le fournisseur préféré (dans l'ordre de
  // préférence, capacité respectée) puis jusqu'à 2 replis préférentiels.
  // Toutes les erreurs rencontrées sont accumulées pour le diagnostic meta.
  async function executeTask(task, preferred) {
    const tried = [];
    const errs = [];
    let value = null;
    const prefNames = TASK_PROVIDER_PREF[task.name] || providers.map((p) => p.name);
    const order = [preferred.name, ...prefNames.filter((n) => n !== preferred.name)];

    const first = await reserveFromPref(order, tried);
    if (!first) {
      return { value: null, providerName: preferred.name, err: new Error('aucun fournisseur disponible avant deadline') };
    }
    tried.push(first.name);

    try { value = await callMarked(first, task); }
    catch (e) { errs.push(`${first.name}: ${e?.message || e}`); }
    finally { release(first); }

    for (let attempt = 0; attempt < 2 && !value; attempt++) {
      if (deadline && Date.now() > deadline - 8000) {
        console.warn(`[FAN-OUT] Tâche "${task.name}" : deadline proche, plus de repli`);
        break;
      }
      const alt = await reserveFromPref(order, tried);
      if (!alt) { console.warn(`[FAN-OUT] Tâche "${task.name}" : aucun fournisseur utilisable avant deadline`); break; }
      tried.push(alt.name);
      try {
        value = await callMarked(alt, task);
        if (value) console.log(`[FAN-OUT] Repli OK : "${task.name}" via ${alt.name}`);
      } catch (e2) { errs.push(`${alt.name}: ${e2?.message || e2}`); }
      finally { release(alt); }
    }

    // 2e chance pour l'explication : le JSON des longues proses est non
    // déterministe — un même fournisseur peut réussir au 2e essai.
    // Jusqu'à 2 retentations (dernier fournisseur en échec JSON d'abord,
    // sinon Mistral), tant que le deadline le permet.
    if (!value && task.name === 'explanation') {
      for (let retry = 0; retry < 2 && !value; retry++) {
        if (deadline && Date.now() > deadline - 25000) break;
        // ✅ v8.47c — pause 5 s avant chaque relance : la plupart des échecs
        // sont des 429 TPM (8 000 tokens/min chez Groq) — relancer à l'instant
        // ré-atterrit dans la même fenêtre saturée ; 5 s laissent la fenêtre
        // glisser (l'explication est retriée tôt : elle est EN TÊTE de file).
        await new Promise((r) => setTimeout(r, 5000));
        let retryName = null;
        // D'abord le dernier fournisseur en échec transitoire (demande/abort)
        for (let i = errs.length - 1; i >= 0; i--) {
          if (/high demand|aborted|429/i.test(errs[i])) { retryName = errs[i].split(':')[0]; break; }
        }
        // Sinon le dernier en échec JSON (non déterministe)
        if (!retryName) {
          for (let i = errs.length - 1; i >= 0; i--) {
            if (errs[i].includes('JSON invalide')) { retryName = errs[i].split(':')[0]; break; }
          }
        }
        if (!retryName) retryName = 'Mistral';
        const rp = providers.find((p) => p.name === retryName);
        if (!rp) break;
        console.warn(`[FAN-OUT] 2e chance : "${task.name}" retenté sur ${rp.name}`);
        busy.set(rp.name, (busy.get(rp.name) || 0) + 1);
        try {
          value = await callMarked(rp, task);
          if (value) console.log(`[FAN-OUT] 2e chance réussie : "${task.name}" via ${rp.name}`);
          else errs.push(`${rp.name}: 2e essai vide`);
        } catch (e3) { errs.push(`${rp.name} (2e essai): ${e3?.message || e3}`); }
        finally { release(rp); }
      }
    }

    return { value, providerName: first.name, err: errs.length ? new Error(errs.join(' | ')) : null };
  }

  await Promise.all(queues.map((queue) => (async () => {
    for (const { task, index } of queue.tasks) {
      const { value, providerName, err } = await executeTask(task, queue.provider);
      if (!value) {
        console.warn(`[FAN-OUT] Tâche "${task.name}" échouée — raison: ${err?.message || 'unknown'}`);
      }
      results[index] = value
        ? { status: 'fulfilled', value, task, provider: providerName }
        : { status: 'rejected', error: err, task, provider: 'none' };
    }
  })()));

  results.forEach((r) => {
    if (!r) return;
    if (r.status === 'fulfilled') console.log(`[FAN-OUT] OK ${r.task.name} (via ${r.provider})`);
    else console.error(`[FAN-OUT] FAIL ${r.task.name} - raison: ${r.error?.message || 'unknown'}`);
  });

  return results;
}

function mergeAnalysis(results, profile) {
  const merged = {
    profile,
    sectionTitle: null,
    explanation: null,
    structure: null,
    questions: [],
    qcm: [],
    extracted: null
  };

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const data = r.value;
    const taskName = r.task.name;

    switch (taskName) {
      case 'extraction':
        merged.sectionTitle = data.sectionTitle || merged.sectionTitle;
        merged.extracted = data;
        break;
      case 'explanation':
        merged.explanation = data;
        merged.sectionTitle = data.sectionTitle || merged.sectionTitle;
        break;
      case 'structure':
        merged.structure = data;
        break;
      case 'questions_a':
      case 'questions_b':
        if (Array.isArray(data.questions)) merged.questions.push(...data.questions);
        else if (data.questions && typeof data.questions === 'object') merged.questions.push(data.questions);
        break;
      case 'qcm':
        if (Array.isArray(data.qcm)) merged.qcm.push(...data.qcm);
        else if (data.qcm && typeof data.qcm === 'object' && data.qcm.question) merged.qcm.push(data.qcm);
        break;
    }
  }

  return merged;
}

// ────────────────────────────────────────────────────────────────
// NORMALISATION POST-GÉNÉRATION (v8.6)
// Garantit que la page ne reçoit QUE des questions/QCM exploitables.
// ────────────────────────────────────────────────────────────────
function normalizeAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;

  // ✅ v8.48a — la signature de complétion a SERVI (preuve à la réception) :
  // elle est retirée des données stockées — le badge visible de complétion est
  // calculé par le client sur la présence réelle de toutes les parties.
  // Parcours RÉCURSIF : aucune branche stockée ne doit garder le champ interne
  // (top-level, explanation, structure, extracted, questions…).
  (function stripSig(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return;
    if (Array.isArray(obj)) { obj.forEach((v) => stripSig(v, depth + 1)); return; }
    delete obj.signature;
    Object.values(obj).forEach((v) => stripSig(v, depth + 1));
  })(analysis, 0);

  // Banque de questions : filtrer + renuméroter + borner
  if (Array.isArray(analysis.questions)) {
    analysis.questions = analysis.questions
      .filter((q) => q && typeof q.question === 'string' && q.question.trim().length > 0 &&
                     typeof q.answer === 'string' && q.answer.trim().length > 0)
      .map((q, i) => ({
        id: `q${i + 1}`,
        level: Math.min(3, Math.max(1, Number(q.level) || (i % 2 === 0 ? 1 : 2))),
        type: (typeof q.type === 'string' && q.type.trim()) ? q.type.trim() : (i % 2 === 0 ? 'definition' : 'application'),
        question: q.question.trim(),
        answer: q.answer.trim(),
        mustHave: Array.isArray(q.mustHave)
          ? q.mustHave.filter((m) => typeof m === 'string' && m.trim()).slice(0, 6)
          : [],
        importance: Math.min(3, Math.max(1, Number(q.importance) || 1))
      }));
  }

  // QCM : garder uniquement les entrées cohérentes, normaliser les lettres
  if (Array.isArray(analysis.qcm)) {
    analysis.qcm = analysis.qcm
      .map((q) => {
        if (!q || typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.options)) return null;
        const options = q.options
          .filter((o) => o && typeof o.text === 'string' && o.text.trim())
          .slice(0, 5)
          .map((o, i) => ({ id: String.fromCharCode(65 + i), text: String(o.text).trim() }));
        if (options.length < 2) return null;
        let correct = String(q.correct || 'A').trim().toUpperCase().slice(0, 1);
        if (!options.some((o) => o.id === correct)) correct = 'A';
        return {
          question: q.question.trim(),
          options,
          correct,
          explanation: (typeof q.explanation === 'string' && q.explanation.trim()) ? q.explanation.trim() : ''
        };
      })
      .filter(Boolean);
  }

  return analysis;
}

// ────────────────────────────────────────────────────────────────
// RÈGLES COMMUNES
// ────────────────────────────────────────────────────────────────
const LATEX_RULES = `
RÈGLE LATEX — OBLIGATOIRE :
- Toute formule mathématique DOIT être entre $...$ (inline) ou $$...$$ (display).
- INTERDIT : LaTeX brut sans $ (ex : "v = \\sqrt{x}" doit devenir "$v = \\sqrt{x}$").
- INTERDIT : symboles Unicode mathématiques bruts (π, √, ², ≤, ≥, ∞, →, ×, ·, ≠, ∈, ∑, ∫, Δ).
- Ajoute TOUJOURS un espace après une commande LaTeX sans argument (ex : "\\cdotp mol", pas "\\cdotpmol").
- Utilise \\cdot ou \\cdotp (avec espace) pour le point médian : "g \\cdot mol^{-1}".
`.trim();

const PERIMETER_RULES = `
RÈGLE DE PÉRIMÈTRE STRICT :
- Tu travailles UNIQUEMENT sur la section fournie par l'élève.
- INTERDICTION de mentionner ou d'utiliser une connaissance externe au texte fourni.
`.trim();

const JSON_STRICT_RULES = `
RÈGLE JSON STRICTE :
- Réponds UNIQUEMENT avec un objet JSON valide.
- Pas de texte avant ou après le JSON.
- Pas de markdown (\`\`\`).
- Échappe correctement les guillemets doubles dans les chaînes (\\").
- Utilise des apostrophes droites (') et non typographiques.
- INTERDIT les retours à la ligne à l'intérieur d'une valeur : écris chaque valeur sur UNE seule ligne, sépare les idées par des points.
- Respecte EXACTEMENT les quantités demandées dans la tâche (nombre de parties, de questions, de QCM).
- Si la réponse risque d'être longue, reste concis sur CHAQUE élément plutôt que de réduire le nombre d'éléments.
${SIGNATURE_RULE}
`.trim();

// ✅ v8.47a — QUALITÉ DU RÉSUMÉ (demande du propriétaire : « le résumé doit
// simplifier la lecture et la compréhension à l'élève… lui montrer les points
// clés… pour que la lecture et la compréhension soit propre et bien soigné,
// détaillé chaque élément, les points clés et autres »). Injecté dans la
// tâche « explanation » de TOUS les profils, quelle que soit la matière.
const COMPREHENSION_RULES = `
QUALITÉ DU RÉSUMÉ — OBLIGATOIRE (compréhension maximale) :
- Le résumé doit SIMPLIFIER la lecture et la compréhension : phrases complètes, propres et bien soignées ; chaque élément détaillé sans sauter de raisonnement.
- Explique chaque terme technique à sa première apparition — aucun jargon inexpliqué.
- Utilise une analogie ou un exemple concret dès que la discipline le permet.
- RESTE STRICTEMENT DANS LA DISCIPLINE du contenu : applique uniquement SES conventions, SON vocabulaire et SES méthodes. Ne mélange JAMAIS deux disciplines (aucune formule en histoire/littérature/philosophie, aucun récit narratif-littéraire dans un cours scientifique, aucun code en dehors de l'informatique…).
- Ajoute "keyFacts" : 4 à 8 points clés INDISPENSABLES à retenir, chacun une phrase complète courte — c'est la liste que l'élève relit juste avant l'examen.
`.trim();

// ✅ v8.48a — RIGUEUR PAR MATIÈRE (demande du propriétaire : « régler la
// rigueur au niveau des matières surtout maths physique-chimie SVT philosophie
// français anglais histoire-géo et d'autres matières »). Injecté dans la tâche
// « explanation » de chaque profil — chaque discipline garde SES conventions
// strictes, zéro mélange.
const RIGOR_BY_PROFILE = {
  scientific: `RIGUEUR MATHÉMATIQUES / PHYSIQUE-CHIMIE — OBLIGATOIRE :
- Définitions EXACTES du cours (aucune approximation de vocabulaire : « vitesse moyenne » ≠ « vitesse instantanée »).
- Toute grandeur porte son unité SI (m, s, m·s⁻¹ écrit en LaTeX $m \\cdot s^{-1}$ — le point médian est \\cdot suivi d'un espace) et le calcul montre LES ÉTAPES : formule littérale → substitution → résultat avec unité.
- Les formules sont en LaTeX entre $...$, les raisonnements numérotés, la cohérence des notations préservée du début à la fin.
- Aucun récit littéraire, aucune digression historique : uniquement du contenu scientifique de la section.`.trim(),
  svt: `RIGUEUR SVT — OBLIGATOIRE :
- Terminologie biologique et anatomique EXACTE (organes, molécules, états physiologiques) — jamais de mot vague à la place du terme du cours.
- Les mécanismes sont décrits DANS L'ORDRE biologique, étape par étape, avec cause → effet à chaque étape.
- Aucune formule mathématique hors propos, aucun raisonnement chimique si la leçon est biologique (et inversement).
- Les schémas décrits le sont en mots précis (structure, fonction, sens de circulation).`.trim(),
  philosophy: `RIGUEUR PHILOSOPHIE — OBLIGATOIRE :
- Chaque concept est DÉFINI avec précision avant d'être utilisé ; la distinction thèse / argument / exemple est toujours explicite.
- Aucune date historique, aucune formule scientifique, aucun code : uniquement les concepts, leurs distinctions et leurs objections.
- Le raisonnement suit la démarche philosophique : poser le problème → examiner la thèse → objections → dépassement.
- Citer les auteurs UNIQUEMENT s'ils apparaissent dans le texte de l'élève (périmètre strict).`.trim(),
  history: `RIGUEUR HISTOIRE-GÉOGRAPHIE — OBLIGATOIRE :
- Dates, acteurs, lieux et repères EXACTS (jamais approchés) ; causes et conséquences clairement SÉPARÉES et nommées comme telles.
- Vocabulaire d'historien / géographe (ex : « pays industrialisé », « conflit colonial ») utilisé correctement.
- AUCUNE formule mathématique, aucun code, aucune notion scientifique : uniquement faits, chronologie, acteurs, espaces.
- Récit factuel organisé : situation de départ → événements → résultats, sans digression littéraire.`.trim(),
  french: `RIGUEUR FRANÇAIS — OBLIGATOIRE :
- Règles de grammaire, d'orthographe et de conjugaison citées AVEC leur nom exact (accord, concordance des temps, valeur des temps).
- Terminologie littéraire précise : figures de style nommées (métaphore, hyperbole, anaphore…), registres, énonciation — chacune illustrée par un exemple COURT pris dans la leçon.
- Aucune formule mathématique, aucun code : uniquement langue, textes et notions littéraires.
- L'IA elle-même écrit un français impeccable (accords, ponctuation) — c'est un modèle de langue.`.trim(),
  language: `RIGUEUR LANGUE VIVANTE (anglais, espagnol, allemand…) — OBLIGATOIRE :
- Vocabulaire et règles UNIQUEMENT dans LA langue étudiée ; jamais une autre langue étrangère mélangée.
- Traductions exactes dans les DEUX sens ; chaque règle de grammaire est illustrée d'un exemple dans la langue + sa traduction française.
- Les erreurs typiques des francophones sont signalées avec ❌ l'erreur → ✅ la correction.
- Aucune formule mathématique, aucun fait d'histoire hors contexte culturel de la leçon.`.trim(),
  info: `RIGUEUR INFORMATIQUE — OBLIGATOIRE :
- Terminologie exacte (algorithme, variable, boucle, fonction, base de données…) et code CORRECT selon le langage de la leçon.
- Le code ou le pseudo-code est séparé du texte explicatif ; les comportements décrits sont PRÉCIS (ce que le programme affiche, dans quel ordre).
- Aucune formule mathématique hors algorithmie, aucun récit historique hors section.
- Complexité, structures et étapes d'exécution expliquées simplement mais rigoureusement.`.trim(),
  techno: `RIGUEUR FILIÈRES TECHNOLOGIQUES — OBLIGATOIRE :
- Composants, systèmes et processus nommés EXACTEMENT comme dans la leçon ; unités techniques correctes (V, A, W, tr/min…).
- Chaque processus est présenté DANS L'ORDRE de fonctionnement (entrée → traitement → sortie).
- Aucune digression littéraire : uniquement la logique technique de la section.`.trim(),
  econ: `RIGUEUR ÉCONOMIE-GESTION — OBLIGATOIRE :
- Définitions économiques et juridiques EXACTES (production, valeur ajoutée, contrat…) avec le vocabulaire du programme.
- Les mécanismes sont présentés cause → effet, et tout calcul commercial est POSE (formule → données → résultat, unités comprises : €, %).
- Aucun mélange avec la littérature ou les sciences physiques.`.trim(),
  general: `RIGUEUR DE LA DISCIPLINE — OBLIGATOIRE :
- Identifie la discipline réelle du contenu fourni et applique STRICTEMENT ses conventions, son vocabulaire et ses méthodes.
- N'importe JAMAIS une notion d'une autre discipline (pas de formule dans un texte littéraire, pas d'analyse littéraire dans un cours scientifique).
- Chaque terme technique est utilisé à bon escient et expliqué à sa première apparition.`.trim()
};

// ────────────────────────────────────────────────────────────────
// PROMPTS PAR PROFIL
// ────────────────────────────────────────────────────────────────
function buildScientificPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide, sans commentaire.',
      userPrompt: `Tu es professeur expert du BAC, pédagogue et passionné. Explique cette section comme à un élève qui découvre, devant ta classe.

${baseContext}

${PERIMETER_RULES}
${LATEX_RULES}
${COMPREHENSION_RULES}

RÈGLES PÉDAGOGIQUES — STYLE PROF :
- Commence par l'essentiel, puis détaille étape par étape, sans sauter de raisonnement.
- Utilise au moins une ANALOGIE concrète de la vie quotidienne quand c'est possible.
- Chaque idée doit être EXPLIQUÉE en français simple. Aucun jargon sans explication.
- Phrases complètes et rédigées, jamais de listes télégraphiques.
- Couvre TOUT le contenu de la section (2 à 5 parties selon sa richesse).
- Chaque partie : keyTerms avec 2 à 4 termes clés expliqués simplement.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Ce que tu dois comprendre en 2-3 phrases.",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "Partie 1",
      "mainIdea": "Idée principale",
      "simpleExplanation": "Explication en français simple (3-6 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "relations": ["relation 1"],
      "example": "Exemple chiffré si présent",
      "toRemember": "Ce qu'il faut retenir"
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 3500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Extrait la structure scientifique de cette section.

${baseContext}

${PERIMETER_RULES}
${LATEX_RULES}

Ne mets QUE ce qui est présent dans la section. Si pas de formule → tableau vide.

Format JSON :
{
  "formulas": [{"latex": "$z = a + bi$", "description": "...", "variables": [{"symbol": "a", "meaning": "..."}], "condition": "..."}],
  "method": {"title": "Méthode", "steps": ["Étape 1"]},
  "examples": [{"enonce": "...", "steps": ["..."], "result": "$...$"}],
  "traps": [{"trap": "...", "solution": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildSvtPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide, sans commentaire.',
      userPrompt: `Tu es professeur de SVT, pédagogue et passionné. Explique cette section comme à un élève qui découvre, devant ta classe.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES SVT :
- Explication EN FRANÇAIS simple, phrases complètes et rédigées.
- Décris chaque MÉCANISME étape par étape (aucune étape sous-entendue).
- Explique les RELATIONS (organe A → organe B) en disant POURQUOI.
- Utilise des termes biologiques précis MAIS explique-les.
- Utilise au moins une analogie concrète quand c'est possible.
- Couvre TOUT le contenu de la section (2 à 5 parties).

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "...",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "...",
      "mainIdea": "...",
      "simpleExplanation": "...",
      "terms": [{"term": "...", "meaning": "..."}],
      "mechanism": {"description": "...", "steps": ["Étape 1"]},
      "relations": ["relation 1"],
      "toRemember": "..."
    }
  ]
}

CONTRAINTES :
- Maximum 5 parties (parts).
- Chaque simpleExplanation : 3 à 6 phrases.

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 3000,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section de SVT.

${baseContext}

${PERIMETER_RULES}

PAS de formules.

Format JSON :
{
  "mechanisms": [{"name": "...", "steps": ["..."], "relations": ["..."], "consequences": ["..."]}],
  "definitions": [{"term": "...", "definition": "..."}],
  "classifications": [{"category": "...", "items": ["..."]}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildPhilosophyPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide, sans commentaire.',
      userPrompt: `Tu es professeur de philosophie. Explique cette section COMME SI L'ÉLÈVE N'Y CONNAISSAIT RIEN.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES PHILO :
- VULGARISE chaque concept philosophique.
- Décompose chaque argument.
- Donne des exemples du quotidien.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "...",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "...",
      "mainIdea": "...",
      "simpleExplanation": "Explication longue (5-10 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "arguments": ["Argument 1"],
      "everydayExamples": ["Exemple 1"],
      "toRemember": "..."
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 3000,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section de philosophie.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "theses": [{"thesis": "...", "arguments": ["..."]}],
  "vocabulary": [{"term": "...", "meaning": "..."}],
  "plans": [{"title": "Plan", "parties": ["I. ...", "II. ..."]}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildHistoryPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur d'histoire-géographie. Présente cette section CLAIREMENT, comme devant ta classe.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES :
- "understanding" : récit clair et structuré de 6 à 10 phrases (dates, acteurs, enjeux expliqués simplement).
- "context" : situation avant l'événement / le phénomène, en 2 à 4 phrases.
- "keyFacts" : 6 à 10 faits essentiels à retenir, chacun une phrase complète.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Résumé en 5-8 phrases.",
  "context": "...",
  "keyFacts": ["fait 1"]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section d'histoire-géo.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "timeline": [{"date": "...", "event": "..."}],
  "causesConsequences": [{"cause": "...", "consequence": "..."}],
  "keyFigures": [{"name": "...", "role": "..."}],
  "vocabulary": [{"term": "...", "meaning": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildFrenchPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur de français. Explique cette section clairement.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES FRANÇAIS :
- Règles de grammaire/orthographe expliquées avec exemples ; textes littéraires analysés selon les conventions de l'analyse littéraire (aucune formule mathématique, aucun contenu d'une autre discipline).
- Chaque règle illustrée par au moins un exemple et son contre-exemple si utile.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "...",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "...",
      "mainIdea": "...",
      "simpleExplanation": "...",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "toRemember": "..."
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section de français.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "literaryDevices": [{"name": "...", "definition": "...", "example": "..."}],
  "vocabulary": [{"term": "...", "meaning": "..."}],
  "texts": [{"title": "...", "author": "...", "analysis": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildLanguagePrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur de LANGUE VIVANTE (${subjectLabel}) pour des FRANCOPHONES DÉBUTANTS.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES LANGUE (${subjectLabel}) :
- EXPLICATIONS TOUJOURS EN FRANÇAIS.
- EXEMPLES EN ${subjectLabel} avec TRADUCTION SYSTÉMATIQUE.
- Dans les champs nommés "english", écris le mot ou la phrase dans LA LANGUE ÉTUDIÉE (${subjectLabel}) ; le champ "french" contient la traduction française. Ne mélange JAMAIS une autre langue étrangère dans cette leçon.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "...",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "...",
      "mainIdea": "...",
      "simpleExplanation": "Explication EN FRANÇAIS (5-10 phrases).",
      "keyTerms": [{"english": "word", "french": "traduction", "example": "example"}],
      "examples": [{"english": "English sentence.", "french": "Traduction."}],
      "commonMistakes": [{"mistake": "...", "correction": "..."}],
      "toRemember": "..."
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 3000,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section d'anglais.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "vocabulary": [{"english": "...", "french": "...", "phonetic": "..."}],
  "grammar": [{"rule": "...", "explanation_fr": "...", "examples": [{"english": "...", "french": "..."}]}],
  "phrases": [{"english": "...", "french": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, explication d'exemples).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : application, analyse, raisonnement, calcul si la matière s'y prête.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

// ✅ v8.47a — PROFILS NOUVELLES MATIÈRES : informatique, technologie,
// économie & gestion, et un profil UNIVERSEL adaptatif (éducation civique,
// arts… et toute discipline du monde non couverte explicitement).
function buildInformatiquePrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur d'informatique, pédagogue. Explique cette section comme à un élève qui découvre, devant ta classe.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES INFORMATIQUE :
- Concepts (variables, boucles, réseaux, algorithmes…) expliqués en français simple, avec une analogie concrète quand c'est possible.
- Le CODE (extraits de programme, pseudo-code, requêtes, formules de tableur) appartient UNIQUEMENT à cette discipline : mets-le dans les champs "example" ou "steps" en une seule ligne lisible.
- Explique ce que fait chaque extrait de code — jamais de code sans explication.
- AUCUNE formule LaTeX : les calculs d'algorithmie s'écrivent en texte (ex : "complexité en O(n)").

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Ce que tu dois comprendre en 2-3 phrases.",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "Partie 1",
      "mainIdea": "Idée principale",
      "simpleExplanation": "Explication en français simple (3-6 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "example": "Extrait de code ou d'algorithme avec son explication",
      "toRemember": "Ce qu'il faut retenir"
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Extrait la structure informatique de cette section.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "concepts": [{"name": "...", "explanation": "..."}],
  "method": {"title": "Méthode ou algorithme", "steps": ["Étape 1"]},
  "examples": [{"enonce": "Problème ou objectif", "steps": ["Instruction 1"], "result": "Résultat attendu ou sortie du programme"}],
  "traps": [{"trap": "Erreur classique de débutant", "solution": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, concepts, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement, comportement d'un programme ou d'un algorithme).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- Types variés : que fait ce code, trouve l'erreur, complète l'algorithme, compare deux solutions.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildTechnoPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur de filière technologique (${subjectLabel}) : mécanique, électronique, énergie, génie civil, procédés… Explique cette section comme à un élève qui découvre.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}
${LATEX_RULES}

RÈGLES TECHNOLOGIQUES :
- Décris les SYSTÈMES et COMPOSANTS par leur FONCTION (à quoi il sert, comment il agit).
- Explique chaque PROCESSUS étape par étape (aucune étape sous-entendue).
- Utilise les unités techniques correctes (V, A, W, N, Pa, tr/min…) et explique chaque grandeur.
- Une formule n'apparaît que si c'est un vrai calcul technique de la filière, en LaTeX entre $...$.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Ce que tu dois comprendre en 2-3 phrases.",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "Partie 1",
      "mainIdea": "Idée principale",
      "simpleExplanation": "Explication en français simple (3-6 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "relations": ["relation entre composants ou grandeurs"],
      "example": "Application concrète dans la filière",
      "toRemember": "Ce qu'il faut retenir"
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Extrait la structure technique de cette section de ${subjectLabel}.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "systems": [{"name": "Composant ou système", "function": "Sa fonction", "relations": ["Avec quoi il interagit"]}],
  "process": {"title": "Processus ou montage", "steps": ["Étape 1"]},
  "formulas": [{"latex": "$P = U \\cdot I$", "description": "...", "condition": "Quand l'utiliser"}],
  "traps": [{"trap": "Erreur classique", "solution": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (fonctions des composants, définitions techniques, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (analyse d'un système, calcul technique si la leçon s'y prête, diagnostic d'une panne, choix d'un composant).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildEconPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur d'économie et de gestion (${subjectLabel}) : économie, comptabilité, droit, commerce, marketing. Explique cette section comme à un élève qui découvre.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES ÉCONOMIE & GESTION :
- Chaque définition économique, juridique ou comptable est donnée AVEC un exemple concret (entreprise, marché, budget d'un foyer).
- Explique les MÉCANISMES en chaînes de cause à effet (ex : "si la demande augmente → le prix monte → …").
- Les calculs (marges, pourcentages, bilans) s'écrivent en texte simple avec le détail ("marge = prix de vente − coût d'achat").
- Pas de récits historiques ni de notions d'une autre discipline : STRICTEMENT économie/gestion/droit/commerce.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Ce que tu dois comprendre en 2-3 phrases.",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "Partie 1",
      "mainIdea": "Idée principale",
      "simpleExplanation": "Explication en français simple (3-6 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "example": "Exemple chiffré ou situation d'entreprise",
      "toRemember": "Ce qu'il faut retenir"
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Extrait la structure économique/gestion de cette section.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "definitions": [{"term": "Terme économique ou juridique", "definition": "...", "example": "..."}],
  "mechanisms": [{"name": "Mécanisme", "chain": ["Cause", "Effet", "Conséquence"]}],
  "calculations": [{"name": "Calcul utile", "formulaText": "marge = prix de vente − coût d'achat", "example": "..."}],
  "traps": [{"trap": "Confusion classique", "solution": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, acteurs, faits essentiels).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application à une situation d'entreprise, interprétation d'un mécanisme, calcul commercial, analyse de cas).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function buildGeneralPrompts({ subjectLabel, rawInput }) {
  const baseContext = `Matière : ${subjectLabel}
═══════════════════════════════════════════════════════════════
CONTENU DE LA SECTION FOURNIE PAR L'ÉLÈVE
═══════════════════════════════════════════════════════════════
${rawInput}
═══════════════════════════════════════════════════════════════`.trim();

  return [
    {
      name: 'explanation',
      maxTokens: 3800,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Tu es professeur universel et pédagogue. Cette section appartient à une discipline que tu dois d'abord IDENTIFIER précisément (éducation civique, arts, musique, ou toute autre matière du monde), puis expliquer selon les conventions de CETTE discipline et uniquement d'elle.

${baseContext}

${PERIMETER_RULES}
${COMPREHENSION_RULES}

RÈGLES UNIVERSELLES :
- 1re étape mentale : identifie la discipline exacte et sa branche (ex : éducation civique = droits et devoirs, institutions ; arts = techniques, œuvres, mouvements ; musique = théorie, instruments, époques).
- 2e étape : explique avec le vocabulaire et les méthodes de CETTE discipline (jamais de formules hors des sciences exactes, jamais de code hors informatique, jamais de récit historique hors histoire).
- Chaque notion est définie simplement, illustrée d'un exemple fidèle à la discipline.

Format JSON :
{
  "sectionTitle": "...",
  "understanding": "Ce que tu dois comprendre en 2-3 phrases.",
  "keyFacts": ["point clé indispensable 1"],
  "parts": [
    {
      "partTitle": "Partie 1",
      "mainIdea": "Idée principale",
      "simpleExplanation": "Explication en français simple (3-6 phrases).",
      "keyTerms": [{"term": "...", "meaning": "..."}],
      "example": "Exemple propre à la discipline",
      "toRemember": "Ce qu'il faut retenir"
    }
  ]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'structure',
      maxTokens: 2500,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Structure cette section de ${subjectLabel} selon les conventions de sa discipline.

${baseContext}

${PERIMETER_RULES}

Format JSON :
{
  "outline": [{"title": "Grand axe", "detail": "Ce qu'il couvre"}],
  "definitions": [{"term": "Terme clé de la discipline", "definition": "..."}],
  "examples": [{"enonce": "Cas ou exemple étudié", "steps": ["Pour l'aborder : 1"], "result": "Ce qu'il illustre"}],
  "traps": [{"trap": "Confusion ou erreur classique dans cette discipline", "solution": "..."}]
}

${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_a',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions de NOTIONS DE BASE sur cette section (définitions, notions, faits essentiels de sa discipline).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables pour une réponse complète.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    },
    {
      name: 'questions_b',
      maxTokens: 2400,
      systemPrompt: 'Tu produis EXCLUSIVEMENT du JSON valide.',
      userPrompt: `Génère 5 à 13 questions AVANCÉES sur cette section (application, analyse, raisonnement dans le respect de la discipline identifiée).

$${baseContext}

$${PERIMETER_RULES}

RÈGLES :
- Entre 5 et 13 questions, réponses rédigées (1 à 2 phrases), jamais un mot isolé.
- mustHave : 2 à 3 éléments indispensables.

Format JSON :
{
  "questions": [{"id": "q1", "question": "...", "answer": "...", "mustHave": ["..."]}]
}

$${JSON_STRICT_RULES}

Réponds UNIQUEMENT avec le JSON.`
    }
  ];
}

function getPromptsForProfile(profile, context) {
  let tasks;
  switch (profile) {
    case 'scientific': tasks = buildScientificPrompts(context); break;
    case 'svt':        tasks = buildSvtPrompts(context); break;
    case 'philosophy': tasks = buildPhilosophyPrompts(context); break;
    case 'history':    tasks = buildHistoryPrompts(context); break;
    case 'french':     tasks = buildFrenchPrompts(context); break;
    case 'language':   tasks = buildLanguagePrompts(context); break;
    // ✅ v8.47a — profils des nouvelles matières
    case 'info':       tasks = buildInformatiquePrompts(context); break;
    case 'techno':     tasks = buildTechnoPrompts(context); break;
    case 'econ':       tasks = buildEconPrompts(context); break;
    case 'general':    tasks = buildGeneralPrompts(context); break;
    default:           tasks = buildScientificPrompts(context);
  }
  // ✅ v8.47c — EXPLICATION EN PREMIER dans la file. L'ancien ordre (tâches
  // légères d'abord) faisait que l'explication — la tâche la PLUS LOURDE en
  // tokens — tournait toujours en DERNIER et héritait d'une fenêtre TPM Groq
  // (8 000 tokens/min) déjà consumée par les 3 autres tâches → 429 → relais
  // morts (OpenRouter cap 50/jour, Gemini instable, Mistral non configuré)
  // → « L'explication pédagogique n'a pas pu être générée » en fallback.
  // Le prof d'abord : il reçoit la fenêtre fraîche ; les questions suivent.
  // ✅ v8.48a — RIGUEUR PAR MATIÈRE : le bloc de rigueur de CE profil est
  // injecté dans la tâche « explanation » (maths/PC : unités + étapes de
  // calcul ; SVT : terminologie biologique exacte ; philosophie : concepts ;
  // français : règles nommées ; langues : traductions exactes ; histoire-géo :
  // dates/acteurs/causes…). Chaque matière garde SES conventions — zéro mélange.
  const rigor = RIGOR_BY_PROFILE[profile] || RIGOR_BY_PROFILE.general;
  for (const t of tasks) {
    if (t.name === 'explanation' && t.userPrompt) {
      t.userPrompt += `\n\n${rigor}`;
    }
  }
  const order = { explanation: 1, questions_a: 2, questions_b: 3, structure: 4 };
  return tasks.slice().sort((a, b) => (order[a.name] ?? 9) - (order[b.name] ?? 9));
}

function buildFallbackAnalysis({ rawInput, profile }) {
  return {
    profile,
    sectionTitle: 'Section',
    explanation: {
      sectionTitle: 'Section',
      understanding: 'Analyse automatique indisponible. Contenu brut disponible ci-dessous.',
      parts: [{
        partTitle: 'Contenu',
        mainIdea: 'Contenu fourni',
        simpleExplanation: rawInput.slice(0, 500),
        keyTerms: [],
        toRemember: 'Réessayer plus tard.'
      }]
    },
    structure: null,
    questions: [],
    qcm: [],
    fallback: true
  };
}

// ────────────────────────────────────────────────────────────────
// QUOTAS
// ────────────────────────────────────────────────────────────────
async function reserveSectionQuota(uid) {
  const { db, FieldValue } = getAdminServices();
  const userRef = db.collection('users').doc(uid);
  const period = monthKey();
  const quotaRef = userRef.collection('notebookQuota').doc(`sections-${period}`);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('profile_missing');
    if (isPremiumUser(userSnap.data())) {
      return { allowed: true, premium: true, used: 0, limit: Infinity, reserved: false };
    }

    const quotaSnap = await transaction.get(quotaRef);
    const used = Number(quotaSnap.data()?.count || 0);
    if (used >= FREE_SECTION_LIMIT) {
      return { allowed: false, used, limit: FREE_SECTION_LIMIT, premium: false, reserved: false };
    }

    transaction.set(quotaRef, {
      count: used + 1,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return { allowed: true, used: used + 1, limit: FREE_SECTION_LIMIT, premium: false, reserved: true };
  });
}

// ✅ CORRECTION : releaseSectionQuota protégé contre les erreurs Firebase Admin
async function releaseSectionQuota(uid) {
  try {
    const { db, FieldValue } = getAdminServices();
    const period = monthKey();
    const quotaRef = db.collection('users').doc(uid).collection('notebookQuota').doc(`sections-${period}`);

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(quotaRef);
      const used = Math.max(0, Number(snap.data()?.count || 0) - 1);
      transaction.set(quotaRef, {
        count: used,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    });
  } catch (err) {
    console.warn('[PROGRESS] releaseSectionQuota failed:', err.message);
  }
}

async function markDailyActivity(uid, inc = {}) {
  const { db, FieldValue } = getAdminServices();
  const dateKey = todayKey();
  const ref = db.collection('users').doc(uid).collection('dailyActivity').doc(dateKey);
  await ref.set({
    date: dateKey,
    sectionsCreated: FieldValue.increment(inc.sectionsCreated || 0),
    lastAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function trackStudyTime(uid, body) {
  const minutes = Math.min(120, Math.max(1, Math.round(Number(body.minutes) || 0)));
  if (minutes <= 0) return { success: true, skipped: true };

  const { db, FieldValue } = getAdminServices();
  const today = todayKey();
  const ref = db.collection('users').doc(uid).collection('dailyActivity').doc(today);

  // ✅ v8.43 — granularité MATIÈRE + CHAPITRE : la carte intelligente de
  // l'accueil compare le temps passé entre les chapitres/sections pour
  // détecter les lacunes (demande propriétaire). Agrégats :
  //  - dailyActivity/{date} : bySubject.{subject} + byChapter.{subject/chapitreId}
  //  - notebooks/{subject}/chapters/{chapterId}.studyMinutes (total vie du chapitre)
  const subject = typeof body.subject === 'string' && ALLOWED_SUBJECTS.has(body.subject) ? body.subject : null;
  const chapterId = typeof body.chapterId === 'string' && body.chapterId.length > 0 && body.chapterId.length < 128
    ? body.chapterId.replace(/[\n\r]/g, '') : null;

  const patch = {
    date: today,
    studyMinutes: FieldValue.increment(minutes),
    lastAt: FieldValue.serverTimestamp()
  };
  if (subject) patch[`bySubject.${subject}`] = FieldValue.increment(minutes);
  if (subject && chapterId) patch[`byChapter.${subject}/${chapterId}`] = FieldValue.increment(minutes);

  await ref.set(patch, { merge: true });

  // Agrégat par chapitre (temps total) — lisible sans balayer 365 jours.
  if (subject && chapterId) {
    try {
      const chapterRef = db.collection('users').doc(uid)
        .collection('notebooks').doc(subject)
        .collection('chapters').doc(chapterId);
      const b = db.batch();
      b.set(chapterRef, {
        studyMinutes: FieldValue.increment(minutes),
        lastStudiedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      b.set(db.collection('users').doc(uid).collection('notebooks').doc(subject), {
        studyMinutesTotal: FieldValue.increment(minutes)
      }, { merge: true });
      await b.commit();
    } catch (e) {
      console.warn('[STUDY] agrégat chapitre:', e.message);
    }
  }

  return { success: true, addedMinutes: minutes };
}

async function computeStudyTime(uid) {
  const { db } = getAdminServices();
  let snap;
  try {
    snap = await db.collection('users').doc(uid).collection('dailyActivity')
      .orderBy('date', 'desc').limit(365).get();
  } catch (e) {
    // ✅ CORRECTION : log visible au lieu de silencieux
    console.error('[PROGRESS] computeStudyTime failed:', e.message);
    return {
      totalMinutes: 0,
      totalHours: 0,
      todayMinutes: 0,
      weekMinutes: 0,
      formatted: { total: '0 min', week: '0 min', today: '0 min' }
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoKey = weekAgo.toISOString().slice(0, 10);

  let totalMinutes = 0;
  let todayMinutes = 0;
  let weekMinutes = 0;
  const bySubject = {}; // ✅ v8.43 — temps par matière (carte intelligente)

  snap.docs.forEach((d) => {
    const data = d.data();
    const minutes = Number(data.studyMinutes || 0);
    totalMinutes += minutes;
    if (data.date === today) todayMinutes += minutes;
    if (data.date >= weekAgoKey) weekMinutes += minutes;
    if (data.bySubject && typeof data.bySubject === 'object') {
      for (const k of Object.keys(data.bySubject)) {
        bySubject[k] = (bySubject[k] || 0) + Number(data.bySubject[k] || 0);
      }
    }
  });

  return {
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    todayMinutes,
    weekMinutes,
    bySubject,
    formatted: {
      total: formatMinutes(totalMinutes),
      week: formatMinutes(weekMinutes),
      today: formatMinutes(todayMinutes)
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════
// ✅ v8.38 — activité des N derniers jours (sections créées + minutes d'étude)
// pour la courbe de la carte statistiques de la page Résumé.
async function getDailyActivity(uid, days = 14) {
  const { db } = getAdminServices();
  let snap;
  try {
    snap = await db.collection('users').doc(uid).collection('dailyActivity')
      .orderBy('date', 'desc').limit(days).get();
  } catch (e) {
    console.error('[PROGRESS] getDailyActivity failed:', e.message);
    snap = { docs: [] };
  }

  const byDate = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!data?.date) return;
    byDate.set(data.date, {
      sections: Number(data.sectionsCreated || 0),
      minutes: Number(data.studyMinutes || 0)
    });
  });

  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDate.get(key) || { sections: 0, minutes: 0 };
    out.push({ date: key, sections: hit.sections, minutes: hit.minutes });
  }
  return out;
}

async function getDashboard(uid) {
  const { db } = getAdminServices();

  const chaptersPromises = ALLOWED_SUBJECTS_ARRAY.map((subjectKey) =>
    db
      .collection('users').doc(uid)
      .collection('notebooks').doc(subjectKey)
      .collection('chapters')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get()
      .catch(() => ({ docs: [] }))
  );

  const streakPromise = computeStreak(uid);
  const studyTimePromise = computeStudyTime(uid);
  const activityPromise = getDailyActivity(uid, 14);

  const [chaptersResults, streak, studyTime, activity] = await Promise.all([
    Promise.all(chaptersPromises),
    streakPromise,
    studyTimePromise,
    activityPromise
  ]);

  const subjects = [];
  let totalChapters = 0;
  let totalSections = 0;

  ALLOWED_SUBJECTS_ARRAY.forEach((subjectKey, index) => {
    const chaptersSnap = chaptersResults[index];
    const info = SUBJECT_INFO[subjectKey];

    if (!chaptersSnap.docs || chaptersSnap.docs.length === 0) return;

    const chapters = chaptersSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || 'Chapitre',
        sectionsCount: data.sectionsCount || 0,
        studyMinutes: Number(data.studyMinutes || 0), // ✅ v8.43 — lacunes
        last: formatRelativeDate(data.updatedAt || data.createdAt)
      };
    });

    const totalSubjectSections = chapters.reduce((s, c) => s + c.sectionsCount, 0);
    totalChapters += chapters.length;
    totalSections += totalSubjectSections;

    subjects.push({
      key: subjectKey,
      label: info.label,
      chaptersCount: chapters.length,
      sectionsCount: totalSubjectSections,
      last: chapters[0]?.last || ''
    });
  });

  subjects.sort((a, b) => b.sectionsCount - a.sectionsCount);

  // ✅ v8.43 — BLOC SMART intégré au dashboard : la carte intelligente de
  // l'accueil réutilise ce même payload (mis en cache par la page Résumé),
  // et l'action dédiée getSmartCard fournit la version allégée.
  const allChaptersSmart = [];
  subjects.forEach((s) => {
    const subjChapters = (chaptersResults[ALLOWED_SUBJECTS_ARRAY.indexOf(s.key)].docs || [])
      .map((d) => {
        const data = d.data();
        return {
          subject: s.key, subjectLabel: s.label, id: d.id,
          title: data.title || 'Chapitre',
          sectionsCount: Number(data.sectionsCount || 0),
          studyMinutes: Number(data.studyMinutes || 0)
        };
      });
    allChaptersSmart.push(...subjChapters);
    s.minutes = Number((studyTime.bySubject || {})[s.key] ||
      subjChapters.reduce((acc, c) => acc + c.studyMinutes, 0));
    s.minutesLabel = formatMinutes(s.minutes);
  });

  let lacune = null;
  if (allChaptersSmart.length > 0) {
    const scored = allChaptersSmart
      .map((c) => ({ ...c, score: (c.sectionsCount + 1) / (c.studyMinutes + 20) }))
      .sort((a, b) => b.score - a.score);
    lacune = scored[0];
    delete lacune.score;
  }

  let recentActivity = [];
  if (subjects.length > 0) {
    const topSubject = subjects[0];
    try {
      const lastChaptersSnap = await db
        .collection('users').doc(uid)
        .collection('notebooks').doc(topSubject.key)
        .collection('chapters')
        .orderBy('updatedAt', 'desc')
        .limit(3)
        .get();

      recentActivity = lastChaptersSnap.docs.map((d) => {
        const data = d.data();
        return {
          subject: topSubject.key,
          subjectLabel: topSubject.label,
          chapterId: d.id,
          chapterTitle: data.title || 'Chapitre',
          sectionsCount: data.sectionsCount || 0,
          time: formatRelativeDate(data.updatedAt || data.createdAt)
        };
      });
    } catch (e) {
      recentActivity = [];
    }
  }

  return {
    success: true,
    summary: { subjectsCount: subjects.length, totalChapters, totalSections },
    streak,
    studyTime,
    subjects,
    recentActivity,
    activity, // ✅ v8.38 — 14 derniers jours [{date, sections, minutes}] pour la courbe
    smart: { // ✅ v8.43 — carte intelligente de l'accueil (temps comparés + lacune)
      study: {
        totalMinutes: studyTime.totalMinutes,
        weekMinutes: studyTime.weekMinutes,
        todayMinutes: studyTime.todayMinutes,
        totalLabel: studyTime.formatted.total,
        weekLabel: studyTime.formatted.week
      },
      lacune
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// ✅ v8.43 — CARTE INTELLIGENTE DE L'ACCUEIL (demande propriétaire :
// « en disant par connecter il va comparer les temps entre les différentes
// chapitres et sections qu'on a passés — en fonction de ce temps il pourra
// déterminer là où l'utilisateur a des lacunes, et quand l'utilisateur
// touche la carte il mène directement à la section ou au chapitre concerné »).
// Détection DÉTERMINISTE (instantanée, 0 appel IA) :
//  score de lacune d'un chapitre = (sections + 1) / (studyMinutes + 20)
//  → favorise les chapitres volumineux jamais/pas assez travaillés.
async function getSmartCard(uid) {
  const { db } = getAdminServices();

  const chaptersPromises = ALLOWED_SUBJECTS_ARRAY.map((subjectKey) =>
    db
      .collection('users').doc(uid)
      .collection('notebooks').doc(subjectKey)
      .collection('chapters')
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get()
      .catch(() => ({ docs: [] }))
  );
  const studyTimePromise = computeStudyTime(uid);

  const [chaptersResults, studyTime] = await Promise.all([
    Promise.all(chaptersPromises),
    studyTimePromise
  ]);

  const subjects = [];
  const allChapters = [];
  let totalChapters = 0;
  let totalSections = 0;

  ALLOWED_SUBJECTS_ARRAY.forEach((subjectKey, index) => {
    const chaptersSnap = chaptersResults[index];
    const info = SUBJECT_INFO[subjectKey];
    if (!chaptersSnap.docs || chaptersSnap.docs.length === 0) return;

    const chapters = chaptersSnap.docs.map((d) => {
      const data = d.data();
      return {
        subject: subjectKey,
        subjectLabel: info.label,
        id: d.id,
        title: data.title || 'Chapitre',
        sectionsCount: Number(data.sectionsCount || 0),
        studyMinutes: Number(data.studyMinutes || 0)
      };
    });

    totalChapters += chapters.length;
    const subjSections = chapters.reduce((s, c) => s + c.sectionsCount, 0);
    totalSections += subjSections;
    const subjMinutes = Number((studyTime.bySubject || {})[subjectKey] ||
      chapters.reduce((s, c) => s + c.studyMinutes, 0));

    subjects.push({
      key: subjectKey,
      label: info.label,
      minutes: subjMinutes,
      minutesLabel: formatMinutes(subjMinutes),
      chaptersCount: chapters.length,
      sectionsCount: subjSections
    });
    allChapters.push(...chapters);
  });

  subjects.sort((a, b) => b.minutes - a.minutes);

  // Lacune : chapitre le moins travaillé relativement à son volume.
  let lacune = null;
  if (allChapters.length > 0) {
    const scored = allChapters
      .map((c) => ({ ...c, score: (c.sectionsCount + 1) / (c.studyMinutes + 20) }))
      .sort((a, b) => b.score - a.score);
    lacune = scored[0];
    delete lacune.score;
  }

  return {
    success: true,
    study: {
      totalMinutes: studyTime.totalMinutes,
      weekMinutes: studyTime.weekMinutes,
      todayMinutes: studyTime.todayMinutes,
      totalLabel: studyTime.formatted.total,
      weekLabel: studyTime.formatted.week
    },
    summary: { totalChapters, totalSections, subjectsCount: subjects.length },
    subjects,
    lacune
  };
}

async function computeStreak(uid) {
  const { db } = getAdminServices();
  let snap;
  try {
    snap = await db.collection('users').doc(uid).collection('dailyActivity')
      .orderBy('date', 'desc').limit(90).get();
  } catch (e) {
    // ✅ CORRECTION : log visible
    console.error('[PROGRESS] computeStreak failed:', e.message);
    return { current: 0, best: 0 };
  }

  if (snap.docs.length === 0) return { current: 0, best: 0 };

  const activeDates = new Set(snap.docs.map((d) => d.data().date).filter(Boolean));
  let current = 0;
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (activeDates.has(key)) current++;
    else break;
  }

  const sorted = Array.from(activeDates).sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach((dateStr) => {
    if (prev) {
      const diff = Math.round((new Date(dateStr) - new Date(prev)) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    best = Math.max(best, run);
    prev = dateStr;
  });

  return { current, best };
}

async function listChapters(uid, body) {
  const { subject } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };

  const { db } = getAdminServices();
  const snap = await db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters')
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  const chapters = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      title: data.title || 'Chapitre',
      sectionsCount: data.sectionsCount || 0,
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt),
      last: formatRelativeDate(data.updatedAt || data.createdAt)
    };
  });

  return { success: true, chapters };
}

async function createChapter(uid, body) {
  const { subject, title } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    throw { status: 400, message: 'Titre trop court.' };
  }

  const { db, FieldValue } = getAdminServices();
  const cleanTitle = title.trim().slice(0, 100);

  const ref = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc();

  await ref.set({
    title: cleanTitle,
    sectionsCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  return { success: true, chapter: { id: ref.id, title: cleanTitle, sectionsCount: 0, last: 'à l\'instant' } };
}

async function getChapter(uid, body) {
  const { subject, chapterId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId) throw { status: 400, message: 'chapterId requis.' };

  const { db } = getAdminServices();
  const chapterRef = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const chapterSnap = await chapterRef.get();
  if (!chapterSnap.exists) throw { status: 404, message: 'Chapitre introuvable.' };

  const data = chapterSnap.data();
  const sectionsSnap = await chapterRef.collection('sections').orderBy('createdAt', 'asc').get();

  const sections = sectionsSnap.docs.map((d) => {
    const s = d.data();
    const analysis = s.analysis || {};
    const questionsCount = Array.isArray(analysis.questions) ? analysis.questions.length : 0;
    const qcmCount = Array.isArray(analysis.qcm) ? analysis.qcm.length : 0;

    return {
      id: d.id,
      title: s.title || 'Section',
      questionsCount,
      qcmCount,
      time: formatRelativeDate(s.createdAt),
      status: 'done'
    };
  });

  return {
    success: true,
    chapter: {
      id: chapterId,
      title: data.title || 'Chapitre',
      subject,
      sectionsCount: sections.length,
      createdAt: toISO(data.createdAt),
      updatedAt: toISO(data.updatedAt)
    },
    sections
  };
}

async function createSection(uid, body) {
  const { subject, chapterId, rawInput } = body;

  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId) throw { status: 400, message: 'chapterId requis.' };
  if (!rawInput || typeof rawInput !== 'string') throw { status: 400, message: 'Contenu manquant.' };

  const trimmed = validateSectionContent(rawInput);

  const quota = await reserveSectionQuota(uid);
  if (!quota.allowed) {
    throw {
      status: 429,
      message: `Limite gratuite atteinte (${quota.limit} sections/mois). Passe à Premium.`,
      code: 'FREE_SECTION_LIMIT'
    };
  }

  const { db } = getAdminServices();

  const chapterRef = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const chapterSnap = await chapterRef.get();
  if (!chapterSnap.exists) {
    if (quota.reserved) await releaseSectionQuota(uid);
    throw { status: 404, message: 'Chapitre introuvable.' };
  }

  return finalizeSection(uid, { subject, chapterId, chapterRef, trimmed, quota });
}

// ✅ v8.38 — validations partagées par createSection ET autoAddSection
function validateSectionContent(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') throw { status: 400, message: 'Contenu manquant.' };
  const trimmed = rawInput.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    throw { status: 400, message: `Contenu trop court (min ${MIN_CONTENT_LENGTH} caractères).` };
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throw { status: 400, message: `Contenu trop long (max ${MAX_CONTENT_LENGTH}).` };
  }
  if (!isMeaningfulContent(trimmed)) {
    throw { status: 400, message: 'Contenu trop court ou sans texte exploitable.' };
  }
  return trimmed;
}

// ✅ v8.38 — noyau d'analyse extrait de createSection (comportement IDENTIQUE) :
// cache partagé → fan-out IA → fusion → écriture Firestore → compteurs.
// Utilisé par createSection (chapitre choisi) et autoAddSection (chapitre détecté).
async function finalizeSection(uid, { subject, chapterId, chapterRef, trimmed, quota }) {
  const { FieldValue } = getAdminServices();

  const info = SUBJECT_INFO[subject];
  const subjectLabel = info.label;
  const profile = info.profile;

  const normalizedInput = normalizeMathInput(trimmed);

  const context = { subjectLabel, rawInput: normalizedInput };
  const tasks = getPromptsForProfile(profile, context);
  const providers = getProviders();

  if (!providers.length) {
    if (quota.reserved) await releaseSectionQuota(uid);
    throw { status: 503, message: 'Aucun fournisseur IA disponible.' };
  }

  // ✅ v8.25 — CACHE IA PARTAGÉ : ce contenu a-t-il déjà été généré pour un
  // autre élève ? Si oui : 0 appel IA + quota mensuel remboursé.
  const cacheKey = aiCacheKey(profile, tasks.map((t) => t.userPrompt || ''));
  const cachedAnalysis = await readAiCache(cacheKey);
  // ✅ v8.47c — GARDE À LA LECTURE DU CACHE : une entrée mise en cache SANS
  // vraie explication (fenêtres TPM saturées du passé) est ignorée — on la
  // traite comme un cache-miss pour RÉGÉNÉRER, puis l'écriture réussie
  // écrase l'entrée empoisonnée sous la même clé. Sans cette garde, chaque
  // élève qui soumet le même cours recevait l'analyse amputée à jamais.
  // ✅ v8.47e — la garde exige aussi une STRUCTURE non vide : une entrée avec
  // une bonne explication mais SANS structure (tâche structure tombée au moment
  // de sa création) est régénérée au lieu d'être servie amputée pour toujours.
  const cachedExplOk = cachedAnalysis
    && cachedAnalysis.explanation
    && typeof cachedAnalysis.explanation.understanding === 'string'
    && cachedAnalysis.explanation.understanding.trim().length > 20
    && !cachedAnalysis.explanation.understanding.includes("n'a pas pu être générée")
    && cachedAnalysis.structure
    && typeof cachedAnalysis.structure === 'object'
    && Object.keys(cachedAnalysis.structure).length > 0;
  if (cachedAnalysis && !cachedExplOk) {
    console.log(`[FAN-OUT] CACHE HIT ${cacheKey.slice(0, 18)}… SANS explication → régénération (entrée empoisonnée purgée à la réussite)`);
  }
  const useCache = cachedAnalysis && cachedExplOk;
  if (useCache) {
    if (quota.reserved) await releaseSectionQuota(uid);
    console.log(`[FAN-OUT] CACHE HIT ${cacheKey.slice(0, 18)}… — 0 appel IA`);

    const cachedRef = chapterRef.collection('sections').doc();
    const cachedId = cachedRef.id;
    await cachedRef.set({
      title: cachedAnalysis.sectionTitle || cachedAnalysis.explanation?.sectionTitle || 'Section',
      rawInput: trimmed,
      profile,
      analysis: cachedAnalysis,
      userNotes: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    await chapterRef.set({
      sectionsCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await markDailyActivity(uid, { sectionsCreated: 1 });

    return {
      success: true,
      sectionId: cachedId,
      meta: { cache: true, elapsedMs: 0, counts: {
        parts: (Array.isArray(cachedAnalysis.explanation?.parts) ? cachedAnalysis.explanation.parts.length : 0),
        questions: (Array.isArray(cachedAnalysis.questions) ? cachedAnalysis.questions.length : 0)
      } },
      section: {
        id: cachedId,
        title: cachedAnalysis.sectionTitle || 'Section',
        rawInput: trimmed,
        profile,
        analysis: cachedAnalysis,
        userNotes: ''
      }
    };
  }

  console.log(`[FAN-OUT] ${tasks.length} tâches, ${providers.length} fournisseurs pour profil "${profile}"`);

  let analysis;
  const t0 = Date.now();
  const meta = { elapsedMs: 0, counts: {}, providers: {}, failures: {} };
  try {
    const deadline = Date.now() + GLOBAL_AI_TIME_BUDGET_MS;
    const results = await runParallelTasks(tasks, providers, deadline);

    // Diagnostic renvoyé au client (meta) : fournisseur par tâche + échecs
    results.forEach((r) => {
      if (!r) return;
      if (r.status === 'fulfilled') meta.providers[r.task.name] = r.provider;
      else meta.failures[r.task.name] = String(r.error?.message || 'échec').slice(0, 900);
    });

    analysis = mergeAnalysis(results, profile);

    analysis = deepClean(analysis);
    analysis = normalizeAnalysis(analysis);

    if (!analysis.explanation || typeof analysis.explanation !== 'object') {
      console.warn('[FAN-OUT] explanation manquant -> fallback minimal');
      analysis.explanation = {
        sectionTitle: analysis.sectionTitle || 'Section',
        understanding: 'L\'explication pédagogique n\'a pas pu être générée pour cette section. Les questions restent disponibles ci-dessous.',
        parts: []
      };
    }

    const hasContent = (Array.isArray(analysis.explanation.parts) && analysis.explanation.parts.length > 0) ||
                       (Array.isArray(analysis.questions) && analysis.questions.length > 0);
    if (!hasContent) {
      console.warn('[FAN-OUT] Tout a échoué -> fallback complet');
      analysis = buildFallbackAnalysis({ rawInput: normalizedInput, profile });
    }
  } catch (err) {
    if (quota.reserved) await releaseSectionQuota(uid);
    throw err;
  }

  // ✅ v8.25 — succès IA : publie le résultat dans le cache partagé (si le
  // contenu est exploitable) — les prochains élèves de cette section : 0 IA.
  // ✅ v8.47c — GARDE À L'ÉCRITURE : on ne cache QUE si l'explication est
  // RÉELLE (compréhension rédigée + parties OU points clés). L'ancienne garde
  // (parts > 0 || questions > 0) laissait entrer des analyses SANS explication
  // (fenêtre TPM saturée) → cache empoisonné servi à tous les élèves suivants.
  const explReal = analysis.explanation
    && typeof analysis.explanation.understanding === 'string'
    && analysis.explanation.understanding.trim().length > 20
    && !analysis.explanation.understanding.includes("n'a pas pu être générée");
  const explRich = (Array.isArray(analysis.explanation?.parts) && analysis.explanation.parts.length > 0) ||
                   (Array.isArray(analysis.explanation?.keyFacts) && analysis.explanation.keyFacts.length > 0);
  // ✅ v8.47e — on ne cache qu'une analyse COMPLÈTE (explication + structure)
  const structFull = analysis.structure && typeof analysis.structure === 'object' && Object.keys(analysis.structure).length > 0;
  if (explReal && explRich && structFull && !analysis.fallback) {
    await writeAiCache(cacheKey, profile, analysis);
  }

  const sectionRef = chapterRef.collection('sections').doc();
  const sectionId = sectionRef.id;

  await sectionRef.set({
    title: analysis.sectionTitle || analysis.explanation?.sectionTitle || 'Section',
    rawInput: trimmed,
    profile,
    analysis,
    userNotes: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await chapterRef.set({
    sectionsCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  await markDailyActivity(uid, { sectionsCreated: 1 });

  meta.elapsedMs = Date.now() - t0;
  meta.counts = {
    parts: (Array.isArray(analysis.explanation?.parts) ? analysis.explanation.parts.length : 0),
    questions: (Array.isArray(analysis.questions) ? analysis.questions.length : 0)
  };

  return {
    success: true,
    sectionId,
    meta,
    section: {
      id: sectionId,
      title: analysis.sectionTitle || 'Section',
      rawInput: trimmed,
      profile,
      analysis,
      userNotes: ''
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// ✅ v8.38 — AUTO-ADD : l'IA détecte la matière et classe la leçon
// ═══════════════════════════════════════════════════════════════

// Clé de comparaison : minuscules, sans accents, sans ponctuation.
function normalizeTitleKey(s) {
  let out = String(s || '').toLowerCase();
  try { out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
  return out.replace(/[^a-z0-9]+/g, '');
}

// Titres des chapitres existants, toutes matières (pour que l'IA réutilise
// le bon chapitre au lieu d'en créer un doublon).
async function getSubjectChapterTitles(uid) {
  const { db } = getAdminServices();
  const map = {};
  await Promise.all(ALLOWED_SUBJECTS_ARRAY.map(async (subjectKey) => {
    try {
      const snap = await db
        .collection('users').doc(uid)
        .collection('notebooks').doc(subjectKey)
        .collection('chapters')
        .orderBy('updatedAt', 'desc')
        .limit(100)
        .get();
      const titles = snap.docs.map((d) => String(d.data()?.title || '').trim()).filter((t) => t.length >= 2);
      if (titles.length > 0) map[subjectKey] = titles;
    } catch (e) { /* cahier absent : rien à proposer */ }
  }));
  return map;
}

// 1 appel IA léger (JSON) : {subject, chapter, section, isStudy}. Boucle sur
// les fournisseurs disponibles jusqu'à une réponse exploitable.
// ✅ v8.9 — l'IA dit AUSSI si le texte n'est PAS un contenu d'étude (« savoir
// si c'est un domaine ou juste des écritures qui n'ont rien d'étude »).
async function classifyLesson(rawInput, chapterMap, providers) {
  const SUBJ_LINE = ALLOWED_SUBJECTS_ARRAY.join(', ');
  const SUBJ_LABELS = ALLOWED_SUBJECTS_ARRAY
    .map((k) => `- ${k} = ${SUBJECT_INFO[k].label}`)
    .join('\n');

  let mapText = '(aucun chapitre existant)';
  const parts = ALLOWED_SUBJECTS_ARRAY
    .filter((k) => Array.isArray(chapterMap[k]) && chapterMap[k].length > 0)
    .map((k) => `${k} : ${chapterMap[k].slice(0, 25).join(' | ')}`);
  if (parts.length > 0) mapText = parts.join('\n');

  const systemPrompt =
    'Tu es un classifieur de leçons scolaires pour le cahier intelligent ARVEXA (élèves du collège à l\'université, programmes francophones). ' +
    'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises de code.';

  const userPrompt =
    'Voici le début d\'un contenu donné par un élève :\n' +
    '"""\n' + rawInput.slice(0, 1400) + (rawInput.length > 1400 ? '\n[…] (tronqué)' : '') + '\n"""\n\n' +
    'Les cahiers existants de cet élève (matière : chapitres déjà créés) :\n' + mapText + '\n\n' +
    'Matières disponibles :\n' + SUBJ_LABELS + '\n\n' +
    'Ta tâche :\n' +
    '1. "isStudy" : true si ce contenu est bien de l\'ÉTUDE scolaire (leçon, cours, définitions, formules, exercices, résumé de cours, leçon dictée…). ' +
    'false si ce n\'est PAS un contenu d\'étude (bavardage, message personnel, recette, chanson, publicité, sport, journal intime, écritures sans aucun rapport avec une matière scolaire).\n' +
    '2. "subject" : la matière de ce contenu — EXACTEMENT une de ces clés : ' + SUBJ_LINE + '. (Si "isStudy" est false, mets "".)\n' +
    '   ✅ v8.47a — SÉPARATION STRICTE DES DOMAINES : identifie la discipline EXACTE et ne la confonds JAMAIS avec une autre. Une leçon d\'histoire qui cite des chiffres reste histoire ; une leçon de mathématiques qui raconte un contexte reste mathématiques ; un cours d\'informatique n\'est jamais de la philosophie ; une leçon d\'économie n\'est jamais de l\'histoire. Chaque discipline garde SES conventions (formules réservées aux sciences exactes, code réservé à l\'informatique, dates et acteurs réservés à l\'histoire…).\n' +
    '3. "chapter" : le chapitre auquel cette leçon appartient. Si la leçon correspond à un chapitre EXISTANT du cahier (même thème, même sujet), reprends son titre EXACTEMENT comme il est écrit dans la liste. Sinon, propose un titre de chapitre court et standard (max 60 caractères, sans numéro de chapitre). (Si "isStudy" est false, mets "".)\n' +
    '4. "section" : un titre court et clair pour CETTE partie de leçon précise (max 80 caractères, sans numéro). (Si "isStudy" est false, mets "".)\n\n' +
    'Réponds exactement : {"subject":"...","chapter":"...","section":"...","isStudy":true}';

  let lastErr = null;
  let sawNotStudy = false;
  let unknownSubject = '';
  for (const provider of providers) {
    try {
      const parsed = await callProvider(provider, {
        systemPrompt,
        userPrompt,
        // ✅ v8.47b — 300 → 900 : les modèles à RAISONNEMENT (gpt-oss-120b en
        // tête de chaîne) brûlent des tokens AVANT le JSON — à 300 le JSON
        // de classification était tronqué → parse échoué → chaîne entière en
        // échec (« L'IA n'a pas pu identifier la matière » 502 intermittent,
        // observé sur histoire). 900 laisse la place au raisonnement + JSON.
        maxTokens: 900,
        deadline: Date.now() + 32000
      });
      const subject = String(parsed?.subject || '').trim().toLowerCase();
      const chapter = String(parsed?.chapter || '').trim().replace(/^chapitre\s*\d+\s*[:.\-–]?\s*/i, '').slice(0, 100);
      const section = String(parsed?.section || '').trim().slice(0, 100);
      const isStudy = parsed?.isStudy !== false;
      if (!isStudy) {
        sawNotStudy = true;
        throw new Error('contenu hors étude');
      }
      if (!ALLOWED_SUBJECTS.has(subject)) {
        if (!unknownSubject && subject) unknownSubject = subject;
        throw new Error(`matière hors liste : ${subject}`);
      }
      if (chapter.length < 2 || section.length < 2) throw new Error('titres trop courts');
      return { subject, chapter, section };
    } catch (e) {
      lastErr = e;
      console.warn(`[AUTO-ADD] classement échoué chez ${provider.name} : ${e.message}`);
    }
  }
  if (sawNotStudy) {
    throw {
      status: 422,
      code: 'NOT_COURSE',
      message: 'Ce texte ne ressemble pas à un cours — l\'IA n\'y a trouvé aucune matière d\'étude. Vérifie ta leçon et réessaie.'
    };
  }
  if (unknownSubject) {
    throw {
      status: 422,
      code: 'SUBJECT_UNKNOWN',
      message: `Matière hors cahier détectée (${unknownSubject}). Les matières du cahier : Mathématiques, Physique, Chimie, SVT, Philosophie, Histoire, Géographie, Anglais, Français, Informatique, Technologie, Économie & Gestion, Espagnol, Allemand, Éducation civique, Arts & Musique.`
    };
  }
  throw { status: 502, message: 'L\'IA n\'a pas pu identifier la matière de cette leçon. Réessaie dans un instant.', detail: String(lastErr?.message || '').slice(0, 200) };
}

async function autoAddSection(uid, body) {
  const { rawInput } = body;
  const trimmed = validateSectionContent(rawInput);

  const quota = await reserveSectionQuota(uid);
  if (!quota.allowed) {
    throw {
      status: 429,
      message: `Limite gratuite atteinte (${quota.limit} sections/mois). Passe à Premium.`,
      code: 'FREE_SECTION_LIMIT'
    };
  }

  const providers = getProviders();
  if (!providers.length) {
    if (quota.reserved) await releaseSectionQuota(uid);
    throw { status: 503, message: 'Aucun fournisseur IA disponible.' };
  }

  let chapterMapForMatch = {};
  let classification;
  try {
    const chapterMap = await getSubjectChapterTitles(uid);
    classification = await classifyLesson(trimmed, chapterMap, providers);
    chapterMapForMatch = chapterMap;
  } catch (err) {
    if (quota.reserved) await releaseSectionQuota(uid);
    throw err;
  }

  const { subject, chapter: proposedChapter, section: proposedSection } = classification;

  // Réutilise un chapitre existant si le titre proposé correspond (comparaison
  // normalisée, containment dans les deux sens pour absorber les variantes) ;
  // sinon crée le chapitre.
  const existingTitles = chapterMapForMatch[subject] || [];
  const proposedKey = normalizeTitleKey(proposedChapter);
  let matchedChapterTitle = null;
  if (proposedKey.length >= 4) {
    for (const t of existingTitles) {
      const tk = normalizeTitleKey(t);
      if (!tk) continue;
      if (tk === proposedKey || (tk.length >= 6 && proposedKey.length >= 6 && (tk.includes(proposedKey) || proposedKey.includes(tk)))) {
        matchedChapterTitle = t;
        break;
      }
    }
  }

  const { db, FieldValue } = getAdminServices();
  const chaptersCol = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters');

  let chapterId = null;
  let chapterTitle = proposedChapter;
  let chapterRef = null;
  let createdChapter = false;

  if (matchedChapterTitle) {
    const snap = await chaptersCol.where('title', '==', matchedChapterTitle).limit(1).get().catch(() => null);
    if (snap && !snap.empty) {
      chapterId = snap.docs[0].id;
      chapterRef = snap.docs[0].ref;
      chapterTitle = matchedChapterTitle;
    }
  }
  if (!chapterRef) {
    const ref = chaptersCol.doc();
    await ref.set({
      title: proposedChapter.slice(0, 100),
      sectionsCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    chapterId = ref.id;
    chapterRef = ref;
    chapterTitle = proposedChapter.slice(0, 100);
    createdChapter = true;
  }

  const result = await finalizeSection(uid, {
    subject, chapterId, chapterRef, trimmed, quota
  });

  // La section peut porter un meilleur titre que la proposition (l'analyse IA
  // choisit le sien) — on renvoie tout pour que l'élève garde ses repères.
  const sectionTitle = result?.section?.title || proposedSection;

  return {
    success: true,
    sectionId: result.sectionId,
    meta: result.meta,
    subject,
    subjectLabel: SUBJECT_INFO[subject].label,
    chapterId,
    chapterTitle,
    sectionTitle,
    createdChapter,
    section: result.section
  };
}

// ✅ v8.38 — renommage (l'élève ajuste les noms proposés par l'IA)
function cleanRenameTitle(title) {
  if (!title || typeof title !== 'string') throw { status: 400, message: 'Titre manquant.' };
  const clean = title.trim().replace(/\s+/g, ' ').slice(0, 100);
  if (clean.length < 2) throw { status: 400, message: 'Titre trop court (2 caractères minimum).' };
  return clean;
}

async function renameSection(uid, body) {
  const { subject, chapterId, sectionId, title } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId || !sectionId) throw { status: 400, message: 'IDs manquants.' };
  const clean = cleanRenameTitle(title);

  const { db, FieldValue } = getAdminServices();
  const ref = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId)
    .collection('sections').doc(sectionId);

  const snap = await ref.get();
  if (!snap.exists) throw { status: 404, message: 'Section introuvable.' };

  await ref.set({ title: clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true, title: clean };
}

async function renameChapter(uid, body) {
  const { subject, chapterId, title } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId) throw { status: 400, message: 'chapterId requis.' };
  const clean = cleanRenameTitle(title);

  const { db, FieldValue } = getAdminServices();
  const ref = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const snap = await ref.get();
  if (!snap.exists) throw { status: 404, message: 'Chapitre introuvable.' };

  await ref.set({ title: clean, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true, title: clean };
}

async function getSection(uid, body) {
  const { subject, chapterId, sectionId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId || !sectionId) throw { status: 400, message: 'IDs manquants.' };

  const { db } = getAdminServices();
  const ref = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId)
    .collection('sections').doc(sectionId);

  const snap = await ref.get();
  if (!snap.exists) throw { status: 404, message: 'Section introuvable.' };

  const s = snap.data();
  return {
    success: true,
    section: {
      id: sectionId,
      title: s.title || 'Section',
      subject,
      chapterId,
      rawInput: s.rawInput || '',
      profile: s.profile || 'scientific',
      analysis: s.analysis || {},
      userNotes: s.userNotes || '',
      createdAt: toISO(s.createdAt),
      time: formatRelativeDate(s.createdAt)
    }
  };
}

async function updateNotes(uid, body) {
  const { subject, chapterId, sectionId, userNotes } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId || !sectionId) throw { status: 400, message: 'IDs manquants.' };
  if (typeof userNotes !== 'string') throw { status: 400, message: 'userNotes invalide.' };

  const { db, FieldValue } = getAdminServices();
  const ref = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId)
    .collection('sections').doc(sectionId);

  await ref.set({
    userNotes: userNotes.slice(0, 8000),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
}

async function deleteSection(uid, body) {
  const { subject, chapterId, sectionId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId || !sectionId) throw { status: 400, message: 'IDs manquants.' };

  const { db, FieldValue } = getAdminServices();
  const chapterRef = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const sectionRef = chapterRef.collection('sections').doc(sectionId);
  const snap = await sectionRef.get();
  if (!snap.exists) throw { status: 404, message: 'Section introuvable.' };

  await sectionRef.delete();
  await chapterRef.set({
    sectionsCount: FieldValue.increment(-1),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true };
}

async function deleteChapter(uid, body) {
  const { subject, chapterId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId) throw { status: 400, message: 'chapterId requis.' };

  const { db } = getAdminServices();
  const chapterRef = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const snap = await chapterRef.get();
  if (!snap.exists) throw { status: 404, message: 'Chapitre introuvable.' };

  const sectionsSnap = await chapterRef.collection('sections').get();
  const batch = db.batch();
  sectionsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(chapterRef);
  await batch.commit();

  return { success: true };
}

async function getFullLesson(uid, body) {
  const { subject, chapterId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId) throw { status: 400, message: 'chapterId requis.' };

  const { db } = getAdminServices();
  const chapterRef = db
    .collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId);

  const chapterSnap = await chapterRef.get();
  if (!chapterSnap.exists) throw { status: 404, message: 'Chapitre introuvable.' };

  const sectionsSnap = await chapterRef.collection('sections').orderBy('createdAt', 'asc').get();

  const sections = sectionsSnap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id,
      title: s.title || 'Section',
      profile: s.profile || 'scientific',
      analysis: s.analysis || {},
      userNotes: s.userNotes || ''
    };
  });

  return {
    success: true,
    chapter: { id: chapterId, title: chapterSnap.data().title || 'Chapitre', subject },
    sections
  };
}

// ═══════════════════════════════════════════════════════════════
// HANDLER
// ═══════════════════════════════════════════════════════════════
// ✅ v8.25 — CACHE IA PARTAGÉ : une même section (même contenu + même profil)
// n'est générée qu'UNE SEULE FOIS pour TOUS les élèves — l'élève suivant qui
// crée la même section reçoit le résultat en cache (0 appel IA, quota mensuel
// NON consommé). C'est le levier n°1 d'économie du quota IA gratuit.
const AI_CACHE_COLLECTION = 'ai_cache';
const AI_CACHE_VERSION = 'v1';

function aiCacheKey(profile, userPrompts) {
  const crypto = require('crypto');
  return AI_CACHE_VERSION + '-' + crypto.createHash('sha1')
    .update(String(profile) + '::' + userPrompts.join('\u0000')).digest('hex');
}

async function readAiCache(key) {
  try {
    const { db } = getAdminServices();
    const snap = await db.collection(AI_CACHE_COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return (data.analysis && typeof data.analysis === 'object' && !data.analysis.fallback) ? data.analysis : null;
  } catch (_) { return null; }
}

async function writeAiCache(key, profile, analysis) {
  try {
    if (!analysis || analysis.fallback) return;
    const hasContent = (Array.isArray(analysis.explanation?.parts) && analysis.explanation.parts.length > 0) ||
                       (Array.isArray(analysis.questions) && analysis.questions.length > 0);
    if (!hasContent) return;
    const { db, FieldValue } = getAdminServices();
    await db.collection(AI_CACHE_COLLECTION).doc(key).set({
      analysis, profile, version: AI_CACHE_VERSION, createdAt: FieldValue.serverTimestamp()
    });
  } catch (_) { /* le cache est un bonus, jamais bloquant */ }
}

// ────────────────────────────────────────────────────────────────
// ✅ v8.40 — EXTRAS DE SECTION À LA DEMANDE (QCM court + carte mentale)
// Générés au PREMIER ouvert des onglets « Questionnaires » / « Carte
// mentale », puis cachés dans analysis.qcm / analysis.mindmap — les
// ouvertures suivantes sont instantanées. Chaîne robuste : chaque tâche
// essaie les fournisseurs dans son ordre de préférence (callProvider gère
// déjà les replis de modèles + retentes) — si l'un tombe, le suivant prend
// le relais. Réponse bornée avant écriture : l'élève ne voit QUE des
// données exploitables.
// ────────────────────────────────────────────────────────────────
function extrasSectionRef(uid, body) {
  const { subject, chapterId, sectionId } = body;
  if (!ALLOWED_SUBJECTS.has(subject)) throw { status: 400, message: 'Matière invalide.' };
  if (!chapterId || !sectionId) throw { status: 400, message: 'IDs manquants.' };
  const { db } = getAdminServices();
  return db.collection('users').doc(uid)
    .collection('notebooks').doc(subject)
    .collection('chapters').doc(chapterId)
    .collection('sections').doc(sectionId);
}

function clampStr(v, max) {
  const s = String(v || '').trim();
  return s.slice(0, max);
}

// QCM COURT : 4 à 6 questions, 3 choix (A/B/C), 1 réponse exacte,
// 1 ligne d'explication — « quelque chose de court » (demande propriétaire).
function sanitizeQcm(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const it of raw.slice(0, 6)) {
    const q = clampStr(it?.q || it?.question || '', 220);
    const choices = Array.isArray(it?.choices) ? it.choices.map((c) => clampStr(c, 120)).filter(Boolean).slice(0, 3) : [];
    let answer = Number(it?.answer);
    if (!q || choices.length !== 3 || !Number.isInteger(answer) || answer < 0 || answer > 2) continue;
    const why = clampStr(it?.why || it?.explanation || '', 260);
    out.push({ q, choices, answer, why });
  }
  return out.length >= 3 ? out : null;
}

// CARTE MENTALE EN CHAÎNE LINÉAIRE (v8.42) : 1 idée de base → 3-6 étapes qui
// SE SUIVENT dans l'ordre de la leçon → chaque étape 1-3 sous-points qui
// CONTINUENT la chaîne. Chaque carte porte son EXPLICATION (detail) et sa
// SIGNIFICATION (signif) — affichés en modale quand l'élève touche la carte
// (demande propriétaire : « chaque carte aura son explication, sa
// signification pour faciliter la révision »).
function sanitizeMindmap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const idea = clampStr(raw.idea || raw.title || '', 180);
  if (!idea) return null;
  const out = { idea, detail: clampStr(raw.detail || raw.description || '', 320), signif: clampStr(raw.signif || raw.signification || '', 280), steps: [] };
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : (Array.isArray(raw.branches) ? raw.branches : []);
  const steps = [];
  for (const st of rawSteps.slice(0, 6)) {
    const title = clampStr(st?.title || '', 120);
    if (!title) continue;
    const detail = clampStr(st?.detail || st?.description || '', 260);
    const signif = clampStr(st?.signif || st?.signification || '', 240);
    const children = [];
    const rawKids = Array.isArray(st?.children) ? st.children : (Array.isArray(st?.sub) ? st.sub : []);
    for (const c of rawKids.slice(0, 3)) {
      const ct = clampStr(c?.title || c?.q || '', 110);
      if (!ct) continue;
      children.push({
        title: ct,
        detail: clampStr(c?.detail || '', 200),
        signif: clampStr(c?.signif || c?.signification || '', 200)
      });
    }
    steps.push({ title, detail, signif, children });
  }
  // ✅ v8.46d — FIX FATAL : le tableau `steps` REMPLI n'était JAMAIS assigné à
  // `out` — toute carte VALIDE était renvoyée avec steps: [] (vide) puis
  // persistée vide en Firestore. Le client pré-cache rejetait ces cartes sans
  // étapes (steps.length > 0 requis) → « carte générée mais je ne vois pas la
  // map » ET le bouton « Générer la carte mentale » réapparaissait à chaque
  // retour. La racine la plus profonde du problème était ICI, depuis l'écriture
  // de cette fonction : la génération IA réussissait (Groq/OpenRouter), le
  // serveur répondait 200 avec une carte... vidée par le sanitize.
  out.steps = steps;
  return steps.length >= 2 ? out : null;
}

// ✅ v8.44a — validate : le JSON peut être PARSED mais inutilisable (mauvaise
// forme, étapes vides, troncature) — dans ce cas on RELAISSE AU FOURNISSEUR
// SUIVANT au lieu d'un « illisible » définitif (cause réelle du bouton
// « Générer la carte mentale » qui échouait toujours sur certaines leçons :
// le 1er fournisseur répondait un JSON de mauvaise forme, sanitize renvoyait
// null, et AUCUN relais n'avait lieu — échec déterministe à chaque clic).
async function callExtrasTask(taskName, providers, { systemPrompt, userPrompt, maxTokens, deadline, validate }) {
  // ✅ v8.46c — Groq EN PREMIER : la sonde health.js ?providers=1 DANS le
  // runtime Vercel a prouvé que la clé Groq y est VIVANTE et RAPIDE
  // (openai/gpt-oss-120b → 200 OK en 522 ms) — le « Forbidden » observé hors
  // Vercel était une restriction de RÉGION du poste de diagnostic. OpenRouter
  // devient SECOURS (son tier gratuit est plafonné à 50 requêtes/JOUR — sonde
  // : « free-models-per-day ») : Groq d'abord préserve le quota du jour.
  const pref = { qcm: ['Groq', 'OpenRouter', 'Gemini', 'Mistral'], mindmap: ['Groq', 'OpenRouter', 'Gemini', 'Mistral'] }[taskName]
    || ['Groq', 'OpenRouter', 'Gemini', 'Mistral'];
  const byName = new Map(providers.map((p) => [p.name, p]));
  let lastErr = null;
  for (const name of pref) {
    const provider = byName.get(name);
    if (!provider) continue;
    try {
      // ✅ v8.48a — signature de complétion exigée : un QCM ou une carte
      // coupée par max_tokens est rejetée → relais modèle/fournisseur suivant.
      const data = await callProvider(provider, { systemPrompt, userPrompt, maxTokens, deadline, validate, requireSignature: true });
      if (typeof validate === 'function') {
        const ok = validate(data);
        if (!ok) { lastErr = new Error(`${provider.name}: format inutilisable`); console.warn(`[EXTRAS v8.44a] ${taskName} → ${name} JSON de mauvaise forme — relais suivant`); continue; }
      }
      return data;
    } catch (e) {
      lastErr = e;
      console.warn(`[EXTRAS v8.40] ${taskName} → ${name} a échoué (${e.message.slice(0, 90)}) — relais suivant`);
    }
  }
  throw lastErr || new Error('Aucun fournisseur IA disponible.');
}

const EXTRAS_SYSTEM = 'Tu es un pédagogue expert. Tu réponds UNIQUEMENT en JSON valide, sans texte autour, sans balises de code. JSON en français, correct, exploitable directement.';

async function generateSectionExtras(uid, body) {
  const parts = Array.isArray(body.parts) ? body.parts.filter((p) => p === 'qcm' || p === 'mindmap') : ['qcm', 'mindmap'];
  if (parts.length === 0) throw { status: 400, message: 'Aucune partie demandée.' };

  const ref = extrasSectionRef(uid, body);
  const snap = await ref.get();
  if (!snap.exists) throw { status: 404, message: 'Section introuvable.' };
  const s = snap.data();
  const analysis = s.analysis || {};
  const title = clampStr(s.title || 'Leçon', 150);
  const raw = clampStr(s.rawInput || '', 4200);
  if (!raw || raw.length < 40) throw { status: 400, message: 'Le contenu de la section est trop court pour générer des extras.' };

  const need = [];
  const hasQcm = Array.isArray(analysis.qcm) && analysis.qcm.length >= 3;
  const hasMindmap = Boolean(analysis.mindmap && analysis.mindmap.idea && Array.isArray(analysis.mindmap.steps) && analysis.mindmap.steps.length >= 2);
  if (parts.includes('qcm') && !hasQcm) need.push('qcm');
  if (parts.includes('mindmap') && !hasMindmap) need.push('mindmap');

  const result = { success: true };
  if (hasQcm) result.qcm = analysis.qcm;
  if (hasMindmap) result.mindmap = analysis.mindmap;
  if (need.length === 0) return result; // tout est déjà en base — instantané

  const providers = getProviders();
  if (providers.length === 0) throw { status: 503, message: 'Aucun fournisseur IA configuré.' };
  const deadline = Date.now() + 52000;

  // ✅ v8.47a — ADAPTATION À LA DISCIPLINE (demande du propriétaire : les
  // questionnaires et la carte mentale obéissent aux mêmes règles que le
  // résumé — chaque domaine est traité selon SES conventions, jamais mélangé).
  const subjInfo = SUBJECT_INFO[body.subject] || null;
  const subjLabel = subjInfo ? subjInfo.label : (s.subjectLabel || '');
  const profKey = subjInfo ? subjInfo.profile : (s.profile || '');
  const QCM_HINTS = {
    scientific: "Questions centrées sur les POINTS CLÉS de la leçon : définitions, formules à connaître, calculs courts quand la leçon s'y prête.",
    svt: "Questions centrées sur les POINTS CLÉS : étapes des mécanismes, organes et leurs fonctions, relations biologiques.",
    philosophy: "Questions centrées sur les POINTS CLÉS : définitions des concepts, thèses et arguments — aucune date ni formule.",
    history: "Questions centrées sur les POINTS CLÉS : dates, acteurs, causes et conséquences — aucune formule ni code.",
    french: "Questions centrées sur les POINTS CLÉS : règles de grammaire/orthographe, notions littéraires, exemples corrects ou fautifs.",
    language: "Questions centrées sur les POINTS CLÉS : traductions, règles de grammaire de la langue étudiée, mots ou expressions — jamais d'une autre langue.",
    info: "Questions centrées sur les POINTS CLÉS : concepts, comportement d'un programme ou d'un algorithme, erreurs classiques — aucune formule mathématique hors algorithmie.",
    techno: "Questions centrées sur les POINTS CLÉS : fonction des composants et systèmes, processus, unités techniques.",
    econ: "Questions centrées sur les POINTS CLÉS : définitions économiques/juridiques, mécanismes cause à effet, calculs commerciaux courts.",
    general: "Questions centrées sur les POINTS CLÉS de la discipline identifiée dans la leçon — respecte STRICTEMENT ses conventions."
  };
  const MM_HINTS = {
    scientific: "Choisis les branches selon la structure naturelle des matières scientifiques : notions principales / propriétés ou formules / méthodes de résolution / exemples types.",
    svt: "Choisis les branches selon la structure naturelle de la SVT : mécanismes / organes et structures / relations / conséquences.",
    philosophy: "Choisis les branches selon la structure naturelle de la philosophie : concepts / thèses / arguments / exemples du quotidien.",
    history: "Choisis les branches selon la structure naturelle de l'histoire-géo : causes / faits et dates / acteurs / conséquences.",
    french: "Choisis les branches selon la structure naturelle du français : règles / notions de grammaire ou de littérature / exemples.",
    language: "Choisis les branches selon la structure naturelle d'une langue vivante : vocabulaire / règles de grammaire / expressions / erreurs fréquentes.",
    info: "Choisis les branches selon la structure naturelle de l'informatique : concepts / données et structures / méthodes et algorithmes / exemples de code ou pseudo-code.",
    techno: "Choisis les branches selon la structure naturelle des filières technologiques : systèmes et composants / fonctions / processus / unités et mesures.",
    econ: "Choisis les branches selon la structure naturelle de l'économie-gestion : définitions / mécanismes économiques / acteurs / exemples chiffrés.",
    general: "Choisis les branches selon la structure naturelle de la discipline identifiée dans la leçon : grands axes / notions clés / exemples représentatifs."
  };
  const discipline = subjLabel ? `Discipline : ${subjLabel}.` : '';
  const qcmHint = `Adapte les questions, les choix et les explications aux conventions de CETTE discipline — ne mélange JAMAIS deux disciplines. ${(QCM_HINTS[profKey] || QCM_HINTS.general)}`;
  const mmHint = `Le contenu appartient à UNE discipline unique — ne mélange JAMAIS deux disciplines. ${(MM_HINTS[profKey] || MM_HINTS.general)}`;

  const update = {};

  if (need.includes('qcm')) {
    const qcmData = await callExtrasTask('qcm', providers, {
      systemPrompt: EXTRAS_SYSTEM,
      userPrompt: `Section de cours intitulée « ${title} ».

CONTENU DE LA LEÇON :
"""
${raw}
"""

Génère un QCM COURT d'auto-évaluation : 4 à 6 questions MAXIMUM, chacune avec exactement 3 choix (A/B/C), UNE seule bonne réponse et une explication d'UNE ligne. Questions courtes et directes (définitions, applications immédiates, pièges classiques). Choix plausibles, jamais absurdes.

${discipline}
${qcmHint}

Réponds EXACTEMENT dans ce format (la signature en DERNIER champ est OBLIGATOIRE — preuve que le JSON est complet) :
{"qcm":[{"q":"…","choices":["…","…","…"],"answer":0,"why":"…"}],"signature":"${AI_SIGNATURE}"}`,
      // ✅ v8.46a — 2200 : les modèles :free à RAISONNEMENT consomment 1 300-
      // 2 500 tokens de raisonnement AVANT le JSON — 1600 tronquait la réponse.
      // ✅ v8.48a — 2600 : la signature + le QCM complet doivent tenir ; si le
      // plafond est atteint, callProvider AGRANDIT automatiquement (×1,6).
      maxTokens: 2600,
      deadline,
      validate: (d) => Boolean(d && Array.isArray(d.qcm) && d.qcm.length >= 2)
    });
    const qcm = sanitizeQcm(qcmData?.qcm);
    if (!qcm) throw new Error('QCM illisible — réessaie.');
    update['analysis.qcm'] = qcm;
    result.qcm = qcm;
  }

  if (need.includes('mindmap')) {
    const mmData = await callExtrasTask('mindmap', providers, {
      systemPrompt: EXTRAS_SYSTEM,
      userPrompt: `Section de cours intitulée « ${title} ».

CONTENU DE LA LEÇON :
"""
${raw}
"""

Construis une CARTE MENTALE HIÉRARCHIQUE (v8.43 — demande propriétaire : « c'est une liaison hiérarchique : regarde comment les cartes partent de la carte mère — la carte au centre et ses branches autour d'elle, reproduction conforme à une carte mentale classique »).

${discipline}
${mmHint}

Structure attendue :
- "idea" = la CARTE MÈRE : l'essentiel de la leçon en UNE phrase (elle ira AU CENTRE de la carte).
- "steps" = 3 à 6 BRANCHES qui rayonnent autour de la carte mère — chaque branche est un GRAND AXE du cours (pas une étape chronologique : les parties thématiques que l'on voit sur une vraie carte mentale).
- "children" = 1 à 3 cartes qui dépendent d'une branche (détails, exemples, notions précises de CET axe).

Chaque carte porte un titre ULTRA COURT (2 à 5 mots, étiquette lisible) et deux textes courts : "detail" = l'explication d'une phrase (ce que ce point veut dire), "signif" = sa signification pour la révision (une phrase : pourquoi ce point compte, ce qu'il faut retenir). La carte mère porte aussi son "detail" et sa "signif". L'ensemble doit couvrir toute la leçon.

Réponds EXACTEMENT dans ce format (la signature en DERNIER champ est OBLIGATOIRE — preuve que la carte est complète jusqu'à la dernière branche) :
{"idea":"…","detail":"…","signif":"…","steps":[{"title":"…","detail":"…","signif":"…","children":[{"title":"…","detail":"…","signif":"…"}]}],"signature":"${AI_SIGNATURE}"}`,
      // ✅ v8.46a — 3800 : raisonnement des modèles :free (jusqu'à 2 500 tokens)
      // + carte complète — 3200 tronquait parfois les dernières branches.
      maxTokens: 3800,
      deadline,
      // ✅ v8.44a — si le JSON est de mauvaise forme → FOURNISSEUR SUIVANT
      // (fini le « Carte mentale illisible » définitif du bouton)
      validate: (d) => {
        if (!d || typeof d !== 'object') return false;
        const ideaOk = Boolean(String(d.idea || d.title || '').trim());
        const rawSteps = Array.isArray(d.steps) ? d.steps : (Array.isArray(d.branches) ? d.branches : null);
        if (!ideaOk || !rawSteps) return false;
        const titled = rawSteps.filter((st) => st && String(st.title || '').trim()).length;
        return titled >= 2;
      }
    });
    const mindmap = sanitizeMindmap(mmData);
    if (!mindmap) throw new Error('Carte mentale illisible — réessaie.');
    update['analysis.mindmap'] = mindmap;
    result.mindmap = mindmap;
  }

  try { await ref.update(update); } catch (e) { /* écriture best-effort : l'élève a déjà son contenu */ }
  return result;
}

// ════════════════════════════════════════════════════════════════
// ✅ v8.48a — TERMINER LA SECTION : complétion des parties manquantes.
// Demande du propriétaire : « la génération ne termine jamais, il y a des
// coupures — fais en sorte que les IA finissent le résumé, les questionnaires
// et la carte mentale ». Le budget 56 s peut laisser une tâche sur le carreau
// (fenêtre TPM saturée) : au lieu de sauvegarder en silence une section
// amputée, le client affiche « Terminer la section » → CETTE action relance
// UNIQUEMENT les tâches manquantes (explication / structure / questions),
// fusionne avec ce qui existe déjà et renvoie la section complète.
// ════════════════════════════════════════════════════════════════
function explanationIsReal(expl) {
  return Boolean(expl
    && typeof expl.understanding === 'string'
    && expl.understanding.trim().length > 20
    && !expl.understanding.includes("n'a pas pu être générée")
    && !expl.understanding.includes('Analyse automatique indisponible'));
}

// ✅ v8.48a — complétion SENSIBLE AU PROFIL : l'histoire-géo (profil « history »)
// est NARRATIVE par conception (understanding + context + keyFacts, SANS
// « parts » — format v8.47a) : exiger parts > 0 la déclarait à jamais
// incomplète et le bouton « Terminer la section » tournait en rond. Pour
// history : explication réelle + 3+ points clés ; pour les autres profils :
// explication réelle + parties.
function sectionCompleteness(analysis, profile) {
  const a = analysis || {};
  const expl = a.explanation || {};
  const historyStyle = profile === 'history';
  const factsOk = Array.isArray(expl.keyFacts) && expl.keyFacts.length >= 3;
  const partsOk = Array.isArray(expl.parts) && expl.parts.length > 0;
  return {
    explanation: explanationIsReal(expl) && (historyStyle ? factsOk : partsOk),
    structure: Boolean(a.structure && typeof a.structure === 'object' && Object.keys(a.structure).length > 0),
    questions: Array.isArray(a.questions) && a.questions.length >= 4
  };
}

async function completeSection(uid, body) {
  const ref = extrasSectionRef(uid, body); // mêmes validations subject/chapterId/sectionId
  const snap = await ref.get();
  if (!snap.exists) throw { status: 404, message: 'Section introuvable.' };
  const s = snap.data();
  const analysis = s.analysis || {};
  const profile = s.profile || 'scientific';
  const complete = sectionCompleteness(analysis, profile);

  const missing = [];
  if (!complete.explanation) missing.push('explanation');
  if (!complete.structure) missing.push('structure');
  if (!complete.questions) missing.push('questions_a', 'questions_b');
  if (missing.length === 0) {
    return {
      success: true,
      alreadyComplete: true,
      section: {
        id: snap.id,
        title: s.title || 'Section',
        subject: body.subject,
        chapterId: body.chapterId,
        rawInput: s.rawInput || '',
        profile,
        analysis,
        userNotes: s.userNotes || '',
        createdAt: toISO(s.createdAt),
        time: formatRelativeDate(s.createdAt)
      }
    };
  }

  const info = SUBJECT_INFO[body.subject];
  if (!info || info.profile !== profile) {
    // profil inconnu → on re-dérive depuis le sujet (anciennes sections)
    if (!info) throw { status: 400, message: 'Matière invalide.' };
  }
  const subjectLabel = info ? info.label : 'Cours';
  const rawInput = normalizeMathInput(String(s.rawInput || ''));
  if (rawInput.length < MIN_CONTENT_LENGTH) throw { status: 400, message: 'Contenu de la section trop court pour la complétion.' };

  const context = { subjectLabel, rawInput };
  const allTasks = getPromptsForProfile(profile, context);
  const tasks = allTasks.filter((t) => missing.includes(t.name));
  const providers = getProviders();
  if (!providers.length) throw { status: 503, message: 'Aucun fournisseur IA disponible.' };

  console.log(`[COMPLETE v8.48a] section ${snap.id} — parties manquantes : ${missing.join(', ')}`);
  const deadline = Date.now() + GLOBAL_AI_TIME_BUDGET_MS;
  const results = await runParallelTasks(tasks, providers, deadline);
  const fresh = mergeAnalysis(results, profile);

  // Fusion : on ne remplace une partie existante que si la nouvelle est RÉELLE.
  const freshExplOk = explanationIsReal(fresh.explanation) &&
    (profile === 'history'
      ? (Array.isArray(fresh.explanation?.keyFacts) && fresh.explanation.keyFacts.length >= 3)
      : (Array.isArray(fresh.explanation?.parts) && fresh.explanation.parts.length > 0));
  if (freshExplOk) {
    analysis.explanation = fresh.explanation;
    if (fresh.sectionTitle && !analysis.sectionTitle) analysis.sectionTitle = fresh.sectionTitle;
  }
  if (fresh.structure && typeof fresh.structure === 'object' && Object.keys(fresh.structure).length > 0 && !complete.structure) {
    analysis.structure = fresh.structure;
  }
  if (Array.isArray(fresh.questions) && fresh.questions.length > 0 && !complete.questions) {
    analysis.questions = (Array.isArray(analysis.questions) ? analysis.questions : []).concat(fresh.questions);
  }

  let cleaned = deepClean(analysis);
  cleaned = normalizeAnalysis(cleaned);

  const { FieldValue } = getAdminServices();
  const nowComplete = sectionCompleteness(cleaned, profile);
  const update = { analysis: cleaned, updatedAt: FieldValue.serverTimestamp() };
  try { await ref.update(update); } catch (e) { /* best-effort */ }

  return {
    success: true,
    alreadyComplete: false,
    complete: nowComplete,
    missing: Object.entries(nowComplete).filter(([, ok]) => !ok).map(([k]) => k),
    section: {
      id: snap.id,
      title: cleaned.sectionTitle || s.title || 'Section',
      subject: body.subject,
      chapterId: body.chapterId,
      rawInput: s.rawInput || '',
      profile,
      analysis: cleaned,
      userNotes: s.userNotes || '',
      createdAt: toISO(s.createdAt),
      time: formatRelativeDate(s.createdAt)
    }
  };
}


// ✅ v8.54a — FICHE CAMARADE (page « À proximité ») : numéro WhatsApp.
// Demande du propriétaire : appui sur la carte d'un camarade → voir son
// numéro → l'appeler ou lui écrire pour des exos / révisions.
// SÉCURITÉ : RÉCIPROCITÉ stricte — le demandeur partage LUI-MÊME une
// position fraîche (< 24 h) et le camarade aussi ; champs minimaux
// (nom + whatsapp E.164), JAMAIS d'email, jamais d'adresse.
// (Le endpoint dédié api/contact.js a été retiré : plan Hobby = 12
// fonctions max — l'action vit dans ce routeur unique.)
async function getMateContact(uid, body) {
  const targetUid = String(body.uid || '').trim();
  if (!targetUid || targetUid.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(targetUid)) {
    throw { status: 400, message: 'Identifiant de camarade invalide.' };
  }
  if (targetUid === uid) throw { status: 400, message: 'C\'est toi :).' };

  const { db } = getAdminServices();
  const STALE_MS = 24 * 60 * 60 * 1000;
  const fresh = (ts) => ts && typeof ts.toMillis === 'function' && (Date.now() - ts.toMillis()) < STALE_MS;

  const myPosSnap = await db.collection('positions').doc(uid).get();
  if (!myPosSnap.exists || !fresh(myPosSnap.data().updatedAt)) {
    throw { status: 403, message: 'Active ton partage de localisation pour voir le contact d\'un camarade.', code: 'RECIPROCITY_REQUIRED' };
  }
  const posSnap = await db.collection('positions').doc(targetUid).get();
  if (!posSnap.exists || !fresh(posSnap.data().updatedAt)) {
    throw { status: 404, message: 'Ce camarade ne partage plus sa position.', code: 'NOT_SHARING' };
  }
  const userSnap = await db.collection('users').doc(targetUid).get();
  if (!userSnap.exists) throw { status: 404, message: 'Camarade introuvable.' };
  const u = userSnap.data() || {};
  const name = String(u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || posSnap.data().name || 'Camarade').slice(0, 60);
  const whatsapp = String(u.whatsapp || '').trim();
  return { success: true, hasNumber: Boolean(whatsapp), name, whatsapp };
}

module.exports = async function handler(request, response) {
  applyCors(request, response);

  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return jsonError(response, 405, 'Méthode non autorisée.');
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const action = body.action || '';

  // ✅ Rate limit adaptatif selon l'action (bucket isolé par action — v4.13)
  if (rateLimited(clientIp(request), action)) {
    return jsonError(response, 429, 'Service momentanément saturé. Réessaie dans quelques secondes.');
  }

  let user;
  try { user = await verifyFirebaseToken(request); }
  catch (e) {
    console.error('Auth error:', e.message);
    return jsonError(response, 503, 'Service temporairement indisponible.');
  }

  if (!user) return jsonError(response, 401, 'Connexion requise.', 'AUTH_REQUIRED');

  const uid = user.uid;

  console.log(`[PROGRESS v8.10] ${action} | uid=${uid.slice(0, 8)}`);

  try {
    switch (action) {
      case 'getDashboard':     return response.status(200).json(await getDashboard(uid));
      case 'getSmartCard':     return response.status(200).json(await getSmartCard(uid));
      case 'listChapters':     return response.status(200).json(await listChapters(uid, body));
      case 'createChapter':    return response.status(200).json(await createChapter(uid, body));
      case 'getChapter':       return response.status(200).json(await getChapter(uid, body));
      case 'createSection':    return response.status(200).json(await createSection(uid, body));
      case 'autoAddSection':   return response.status(200).json(await autoAddSection(uid, body));
      case 'renameSection':    return response.status(200).json(await renameSection(uid, body));
      case 'renameChapter':    return response.status(200).json(await renameChapter(uid, body));
      case 'getSection':       return response.status(200).json(await getSection(uid, body));
      case 'completeSection':  return response.status(200).json(await completeSection(uid, body));
      case 'generateSectionExtras': return response.status(200).json(await generateSectionExtras(uid, body));
      case 'updateNotes':      return response.status(200).json(await updateNotes(uid, body));
      case 'deleteSection':    return response.status(200).json(await deleteSection(uid, body));
      case 'deleteChapter':    return response.status(200).json(await deleteChapter(uid, body));
      case 'getFullLesson':    return response.status(200).json(await getFullLesson(uid, body));
      case 'trackStudyTime':   return response.status(200).json(await trackStudyTime(uid, body));
      case 'getMateContact':   return response.status(200).json(await getMateContact(uid, body));
      default:
        return jsonError(response, 400, `Action inconnue : "${action}"`);
    }
  } catch (error) {
    console.error(`[PROGRESS v8.10] "${action}" failed:`, error.message);
    if (error.status) return jsonError(response, error.status, error.message, error.code);
    return jsonError(response, 500, error.message || 'Erreur serveur.');
  }
};

// CONFIG VERCEL - assignee APRES module.exports (sinon ecrasee par
// l'assignation ci-dessus, jamais lue au build -> le budget IA 48 s
// serait tue par le timeout par defaut des functions Vercel)
module.exports.config = { maxDuration: 60 }; // ✅ v8.48a — plafond RÉEL du plan Vercel HOBBY (60 s) : l'ancien 90 était tronqué à 60 par la plateforme, la fonction mourait en plein IA (fetch client sans réponse → « génération qui ne termine jamais »)
