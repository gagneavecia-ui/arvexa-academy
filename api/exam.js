// ================================================================
// API EXAM v5.0 — ARVEXA School
// ✅ v5.0 : TRIPARTITION STRICTE DES MATIÈRES — le souci majeur corrigé :
//   • calcul      (mathematiques, physique, chimie) : exercices de CALCUL ; en
//                   maths VALEURS EXACTES obligatoires (zéro virgule, surtout
//                   en Nombres complexes — les décimales y rendaient le calcul
//                   impossible).
//   • svt         : QUESTIONNAIRE + ANALYSE BAC SVT (restitution, exploitation
//                   de documents, QCM, vrai/faux justifiés, conclusions) —
//                   calculs UNIQUEMENT en génétique/données chiffrées.
//   • litteraire  (histoire, geographie, philosophie) : QUESTIONNAIRE —
//                   STRICTEMENT ZÉRO calcul, zéro LaTeX mathématique.
// ✅ v5.0 : PROTOCOLE DE RÉSOLUTION PRÉALABLE — l'IA TRAITE chaque exercice
//   AVANT de le livrer : (1) prompt « traite d'abord » + (2) PASSE DE
//   VÉRIFICATION par un 2e appel IA qui résout chaque question, remplace les
//   questions défectueuses et attache les réponses vérifiées (utilisées par la
//   correction) + (3) VALIDEURS DÉTERMINISTES qui rejettent tout examen hors
//   régime (décimales en complexes, calculs en littéraire...), pool compris.
// Historique : v4.15 heavy 3→5/min, 429+retryAfter, contrat de complétion
//   (30/30 questions), gradation Sujet 1→2 ; v4.16 variation totale (temp 1.0,
//   anti-récyclage avoidStatements) ; v4.17 calculs purs type Pascal Lainé ;
//   v4.19 pool restreint au régime calcul.
// ================================================================


const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW_LIGHT = 60;
// ✅ v4.15 — heavy 3→5/min : une classe entière derrière une IP partagée (CGNAT)
// essuyait des 429 dès les 3e génération ; 5/min reste prudent pour le quota Groq.
const MAX_REQUESTS_PER_WINDOW_HEAVY = 5;
const requestLog = new Map();

// ✅ v8.65a — ALLOWED_SUBJECTS est déclaré APRÈS SUBJECT_LABELS (16 matières
// du cahier, page Résumé). ALLOWED_DURATIONS : puces 1 h → 4 h (image du
// propriétaire). La difficulté n'est PLUS choisie : c'est l'IA qui propose.
const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'bac']);
const ALLOWED_DURATIONS = new Set([30, 60, 90, 120, 180, 240]);
const ALLOWED_ACTIONS = new Set(['generate', 'correct', 'listExams', 'loadExam', 'deleteExam']);
const LIGHT_ACTIONS = new Set(['listExams', 'loadExam', 'deleteExam']);
const PREMIUM_ACTIONS = new Set(['listExams', 'loadExam']);
const REQUIRED_EXERCISES = 3;
const QUESTIONS_PER_EXERCISE = 5;
const TOTAL_POINTS = 20;
const FREE_EXAM_LIMIT = 2;
const POOL_COLLECTION = 'examPool';

// ⚡ v1.1 — CRÉDITS IA (packs Marketplace) : au-delà des 2 épreuves gratuites du
// jour, chaque épreuve complète (génération + correction incluse) coûte 1
// requête (v8.73a), débitée en transaction serveur.
const { COSTS, consumeCredits } = require('./_credits');

// ✅ v8.65a — TESTÉ EN DIRECT le 26/11/2026 : les relais :free d'OpenRouter
// renvoient un CONTENT VIDE dès que max_tokens dépasse ~4000 (cap upstream
// silencieux). À 3800 : particle 4,3 s · ernie 4,8 s · JSON parsable 3/3.
// 3800 tokens ≈ 12-15k caractères — largement suffisant pour un sujet complet.
const MAX_TOKENS = {
  GENERATE: 3800,
  CORRECT: 3800,
  PROVIDER_DEFAULT: 3800
};

const SUBJECT_LABELS = {
  mathematiques: 'Mathématiques',
  physique: 'Physique',
  chimie: 'Chimie',
  svt: 'SVT',
  philosophie: 'Philosophie',
  histoire: 'Histoire',
  geographie: 'Géographie',
  // ✅ v8.65a — TOUTES les matières du cahier (page Résumé) : l'élève peut
  // fabriquer une épreuve sur ce qu'il a réellement résumé, aucune matière
  // bloquée côté serveur.
  anglais: 'Anglais',
  francais: 'Français',
  informatique: 'Informatique',
  technologie: 'Technologie',
  economie: 'Économie & Gestion',
  espagnol: 'Espagnol',
  allemand: 'Allemand',
  education_civique: 'Éducation civique',
  arts: 'Arts & Musique'
};

// ✅ v8.65a — ALLOWED_SUBJECTS aligné sur la page Résumé (16 matières).
const ALLOWED_SUBJECTS = new Set(Object.keys(SUBJECT_LABELS));

// ✅ v5.0 — QCM autorisés aussi en SVT (questionnaires BAC SVT : QCM, vrai/faux).
const CHOICE_SUBJECTS = new Set(['mathematiques', 'physique', 'chimie', 'svt']);

// ═════════════════════════════════════════════════════════════
// ✅ v5.0 — TRIPARTITION STRICTE DES MATIÈRES
// Le v4.x appliquait « 100% CALCULS » à toutes les matières (SVT inclus) et
// n'imposait AUCUN questionnaire aux littéraires — d'où : des décimales
// impossibles en Nombres complexes, des calculs en Histoire, des exercices de
// maths purs en SVT. Désormais 3 régimes ÉTANCHES :
//   • calcul      (mathematiques, physique, chimie, informatique, technologie) :
//                   exercices de CALCUL, mais avec VALEURS EXACTES en maths
//                   (zéro virgule, surtout en complexes) ; décimales réalistes
//                   réservées à physique/chimie.
//   • svt         : QUESTIONNAIRE + ANALYSE BAC SVT (restitution, exploitation de
//                   documents, QCM, vrai/faux justifiés, conclusions) ; calculs
//                   UNIQUEMENT en génétique/données chiffrées du chapitre.
//   • litteraire  (histoire, geographie, philosophie, langues, français, éco,
//                   éducation civique, arts) : QUESTIONS uniquement —
//                   STRICTEMENT ZÉRO calcul, zéro LaTeX mathématique.
// ═════════════════════════════════════════════════════════════
const SUBJECT_CATEGORY = {
  mathematiques: 'calcul',
  physique: 'calcul',
  chimie: 'calcul',
  svt: 'svt',
  histoire: 'litteraire',
  geographie: 'litteraire',
  philosophie: 'litteraire',
  // ✅ v8.65a — nouvelles matières du cahier
  anglais: 'litteraire',
  francais: 'litteraire',
  espagnol: 'litteraire',
  allemand: 'litteraire',
  economie: 'litteraire',
  education_civique: 'litteraire',
  arts: 'litteraire',
  informatique: 'calcul',
  technologie: 'calcul'
};
const CATEGORY_LABELS = {
  calcul: 'scientifique à CALCULS (exercices de calcul pur)',
  svt: 'SVT — QUESTIONNAIRE + ANALYSE (PAS un exercice de maths)',
  litteraire: 'LITTÉRAIRE — QUESTIONNAIRE SANS AUCUN CALCUL'
};
function subjectCategory(subjectName) {
  return SUBJECT_CATEGORY[subjectName] || 'litteraire';
}
// Sciences à calculs purs (pool « calc ») — SVT n'en fait PLUS partie.
const CALC_SUBJECTS = new Set(['mathematiques', 'physique', 'chimie']);
const LITTERAIRE_SUBJECTS = new Set(['histoire', 'geographie', 'philosophie']);

let adminServices = null;

function getAdminServices() {
  if (adminServices) return adminServices;
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credentials) throw new Error('firebase_admin_not_configured');
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(credentials);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  adminServices = {
    auth: admin.auth(),
    db: admin.firestore(),
    FieldValue: admin.firestore.FieldValue
  };
  return adminServices;
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

// ✅ v4.13 — buckets ISOLÉS light/heavy : avant, un seul compteur par IP était
// partagé — 3 lectures légères épuisaient le quota lourd (3/min) et
// bloquaient une génération au premier essai.
function rateLimited(ip, maxRequests, group) {
  const limit = typeof maxRequests === 'number' ? maxRequests : MAX_REQUESTS_PER_WINDOW_HEAVY;
  const key = `${ip}|${group || 'heavy'}`;
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
  const payload = { success: false, error };
  if (code) payload.code = code;
  return response.status(status).json(payload);
}

function applyCors(request, response) {
  const ALLOWED_ORIGINS = new Set([
    'https://arvexa-academy.vercel.app',
    'https://admin-89.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ]);
  // ✅ FIX (2026-10-26) — autoriser l'origine du déploiement courant (déduite
  // des en-têtes Vercel) et APP_ORIGIN, pour que le changement de domaine
  // Vercel ne casse plus les appels cross-origin.
  const envOrigin = (process.env.APP_ORIGIN || '').trim().replace(/\/+$/, '');
  if (envOrigin) ALLOWED_ORIGINS.add(envOrigin.startsWith('http') ? envOrigin : `https://${envOrigin}`);
  const selfProto = String(request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const selfHost = String(request.headers['x-forwarded-host'] || request.headers.host || '').split(',')[0].trim();
  if (selfHost) ALLOWED_ORIGINS.add(`${selfProto}://${selfHost}`);
  const origin = request.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
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
  try { return await getAdminServices().auth.verifyIdToken(match[1]); }
  catch (_) { return null; }
}

function isPremiumUser(data) {
  if (!data) return false;
  const status = data.subscriptionStatus || 'none';
  if (status === 'pending') return false;
  const hasPremium = data.premium === true || data.isUnlocked === true || data.hasDeposited === true;
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

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const UNICODE_TO_LATEX = {
  'π': '\\pi ', '√': '\\sqrt{}', '×': '\\times ', '÷': '\\div ',
  '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ', '∞': '\\infty ',
  '→': '\\to ', '∈': '\\in ', '∑': '\\sum ', '∫': '\\int ',
  'Δ': '\\Delta ', 'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ',
  'θ': '\\theta ', 'λ': '\\lambda ', 'μ': '\\mu ', 'σ': '\\sigma ',
  '²': '^{2}', '³': '^{3}', '¹': '^{1}', '⁴': '^{4}', 'ⁿ': '^{n}',
  '·': '\\cdot ', '±': '\\pm ', '⁰': '^{0}'
};

function replaceUnicodeMath(text) {
  if (!text || typeof text !== 'string') return text;
  let r = text;
  for (const [u, l] of Object.entries(UNICODE_TO_LATEX)) r = r.split(u).join(l);
  return r;
}

// ✅ Délimiteurs LaTeX alternatifs → $ / $$ (KaTeX-friendly)
function normalizeLatexDelimiters(text) {
  if (!text || typeof text !== 'string') return text;
  let r = text;
  r = r.replace(/\\\(([\s\S]*?)\\\)/g, (m, inner) => `$${inner.trim()}$`);
  r = r.replace(/\\\[([\s\S]*?)\\\]/g, (m, inner) => `$$${inner.trim()}$$`);
  r = r.replace(/\\begin\{(?:equation|align|gather)\*?\}([\s\S]*?)\\end\{(?:equation|align|gather)\*?\}/g,
    (m, inner) => `$$${inner.trim()}$$`);
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
  if (text.includes('$')) {
    // Segment-aware : ne wrapper QUE ce qui est hors des maths déjà délimitées
    const segs = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
    return segs.map((s, i) => (i % 2 === 1 ? s : wrapOrphanLatex(s))).join('');
  }
  // Préserver les espaces de bord : le trim final ne doit pas coller le texte aux maths voisines
  const leadWs = (text.match(/^\s+/) || [''])[0];
  const trailWs = (text.match(/\s+$/) || [''])[0];
  let r = text;
  // 1. Environnements complets (\begin{…}…\end{…}) → display, masqués pendant les passes suivantes
  const stash = [];
  r = r.replace(/(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})/g, (m) => {
    stash.push(m);
    return '\u0000' + (stash.length - 1) + '\u0000';
  });
  // 2. Commandes avec arguments → INLINE (une formule dans une phrase ne doit pas casser la ligne)
  r = r.replace(/(\\[a-zA-Z]+(?:\{[^}]*\}){1,3})/g, ' $$$1$ ');
  // 3. Commandes sans argument (pas suivies de {, (, [ ou lettre) → INLINE
  r = r.replace(/(\\[a-zA-Z]+)(?![a-zA-Z{(\[])/g, ' $$$1$ ');
  // 4. Scripts orphelins (^{2}, _{n}) → INLINE
  r = r.replace(/([_^]\{[^}]*\})/g, ' $$$1$ ');
  // 5. Restauration des environnements
  r = r.replace(/\u0000(\d+)\u0000/g, (m, idx) => ' $$' + stash[+idx] + '$$ ');
  r = r.replace(/\${3,}/g, '$$').replace(/\$\s*\$/g, '').replace(/\s+/g, ' ').trim();
  return leadWs + r + trailWs;
}

function escapeHtmlOutsideLatex(text) {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }).join('');
}

function cleanText(text) {
  if (!text || typeof text !== 'string') return text;
  // ✅ v5.1 — purger les caractères de contrôle résiduels (\frac mal échappé
  // déjà corrompu en form-feed par un parse antérieur, etc.).
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  let r = normalizeLatexDelimiters(text);
  // Pipeline segment-aware : les maths $…$ / $$…$$ restent INTACTES,
  // la prose ne reçoit jamais de \commande LaTeX brute.
  const parts = r.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return replaceUnicodeMath(part); // maths : Unicode → LaTeX (KaTeX ok)
    return escapeHtmlOutsideLatex(wrapOrphanLatex(arrowsToUnicode(replaceUnicodeMath(part))));
  }).join('');
}

function deepClean(obj) {
  if (typeof obj === 'string') return cleanText(obj);
  if (Array.isArray(obj)) return obj.map(deepClean);
  if (obj && typeof obj === 'object') {
    const c = {};
    for (const k in obj) c[k] = deepClean(obj[k]);
    return c;
  }
  return obj;
}

function getUsageDate() { return new Date().toISOString().slice(0, 10); }

async function reserveFreeGeneration(uid) {
  const { db, FieldValue } = getAdminServices();
  const userRef = db.collection('users').doc(uid);
  const usageDate = getUsageDate();
  const usageRef = userRef.collection('examUsage').doc(usageDate);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const usageSnapshot = await transaction.get(usageRef);
    if (!userSnapshot.exists) throw new Error('profile_missing');
    if (isPremiumUser(userSnapshot.data())) return { premium: true, reserved: false };
    const used = Number(usageSnapshot.data()?.count || 0);
    if (used >= FREE_EXAM_LIMIT) return { premium: false, reserved: false, limitReached: true, used };
    transaction.set(usageRef, { count: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { premium: false, reserved: true, usageDate, used: used + 1 };
  });
}

async function releaseFreeGeneration(uid, usageDate) {
  if (!usageDate) return;
  try {
    const { db, FieldValue } = getAdminServices();
    const usageRef = db.collection('users').doc(uid).collection('examUsage').doc(usageDate);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(usageRef);
      const used = Math.max(0, Number(snap.data()?.count || 0) - 1);
      transaction.set(usageRef, { count: used, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
  } catch (_) {}
}

function getProviders() {
  const providers = [];
  if (process.env.GEMINI_API_KEY) {
    // ✅ v8.73a — GEMINI EN TÊTE DE CHAÎNE : les relais OpenRouter :free sont
    // INTERMITTENTS (vagues de « réponse vide » + finish=length constatées le
    // 27/11 — le raisonnement interne brûle tout le budget de tokens). Gemini
    // est natif JSON (responseMimeType) avec thinkingBudget 0 (zéro gaspillage)
    // et deux modèles stables enfile l'un derrière l'autre — la génération et
    // la correction reprennent un service régulier.
    providers.push(
      // ✅ v8.73a-fix2 — ORDRE PAR VITESSE : flash-lite (le plus rapide) →
      // flash → 3.8-flash (le plus lent, > 60 s constaté sur un examen complet).
      { name: 'Gemini/flash-lite-latest', key: process.env.GEMINI_API_KEY, gemini: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent', model: 'gemini-flash-lite-latest' },
      { name: 'Gemini/flash-latest', key: process.env.GEMINI_API_KEY, gemini: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', model: 'gemini-flash-latest' },
      { name: 'Gemini/gemini-3.8-flash', key: process.env.GEMINI_API_KEY, gemini: true, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', model: 'gemini-3.8-flash' }
    );
  }
  if (process.env.OPENROUTER_API_KEY) {
    // ✅ v8.65a — CHAÎNE VÉRIFIÉE EN DIRECT le 26/11/2026 (test réel depuis
    // le sandbox) : nemotron-3-ultra (550B) + ernie-5.5 répondent avec un JSON
    // impeccable ; gemma/ling/particle ont un cap partagé variable (429 →
    // relais suivant). Les slugs morts (inkling/dots3, retirés d'OpenRouter)
    // sont supprimés. Groq passe APRÈS : la clé actuelle renvoie 403 Forbidden
    // (test live) — si le propriétaire la remplace, elle reprend du service.
    const orHeaders = {
      'HTTP-Referer': process.env.APP_ORIGIN || '',
      'X-Title': 'ARVEXA Exam'
    };
    const orModel = (name, model) => ({
      name: 'OpenRouter/' + name, key: process.env.OPENROUTER_API_KEY,
      endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: model,
      jsonMode: true, headers: orHeaders
    });
    providers.push(
      // ✅ v8.73a — ORDRE CORRIGÉ (demande du propriétaire : « la génération
      // n'aboutit jamais ») : les DEUX modèles vérifiés fiables (ernie-5.5
      // rapide + nemotron-3-ultra le plus robuste) passent EN PREMIER — les
      // relais à cap variable (particle/gemma/ling) sont relégués après.
      // Ancien ordre : les 5 premiers essais échouaient (« réponse vide »)
      // et le budget 60 s s'épuisait AVANT d'atteindre nemotron-3-ultra.
      orModel('ernie-5.5-flash:free', 'baidu/ernie-5.5-flash-preview:free'),
      orModel('nemotron-3-ultra:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'),
      orModel('nemotron-3.5-super:free', 'nvidia/nemotron-3.5-super-vl:free'),
      orModel('particle-1:free', 'particle-ai/particle-1:free'),
      orModel('gemma-4-31b:free', 'google/gemma-4-31b-it:free'),
      orModel('ling-3.2-flash:free', 'inclusionai/ling-3.2-flash:free'),
      orModel('flint-v1:free', 'recursive/flint-v1.0:free')
    );
  }
  if (process.env.GROQ_API_KEY) {
    providers.push(
      { name: 'Groq/gpt-oss-120b', key: process.env.GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', jsonMode: true, headers: {} },
      { name: 'Groq/llama-3.3-70b', key: process.env.GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', jsonMode: true, headers: {} }
    );
  }
  if (process.env.MISTRAL_API_KEY) {
    providers.push(
      { name: 'Mistral/' + (process.env.MISTRAL_MODEL || 'open-mistral-nemo'), key: process.env.MISTRAL_API_KEY, endpoint: 'https://api.mistral.ai/v1/chat/completions', model: process.env.MISTRAL_MODEL || 'open-mistral-nemo', jsonMode: false, headers: {} }
    );
  }
  return providers;
}

// ✅ v5.1 — double les backslashes LaTeX simples DANS les $...$ : $\Delta$ →
// $\\Delta$, $\\frac{a}{b}$ → $\\\\frac{a}{b}$ (les séquences déjà doublées sont
// intactes grâce au lookbehind). Hors maths, rien n'est touché (les \n de mise
// en forme restent des retours à la ligne).
function repairMathEscapes(raw) {
  return String(raw).replace(/\$\$[^$]{0,2000}\$\$|\$[^$\n]{0,500}\$/g, (span) =>
    span.replace(/(?<!\\)\\(?=[A-Za-z])/g, '\\\\'));
}

// ✅ v5.1 — dernier recours : échappe tout backslash non suivi d'un caractère
// d'échappement JSON valide (corrige \Delta, \pi, \sqrt... hors $...$).
function repairAllEscapes(raw) {
  return String(raw).replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');
}

async function callProvider(provider, prompt, maxTokens, temperature, timeoutMs) {
  if (!maxTokens) maxTokens = MAX_TOKENS.PROVIDER_DEFAULT;
  const controller = new AbortController();
  // ✅ v8.73a — timeout par appel borné (45 s par défaut) ; generateWithFallback
  // passe le temps RESTANT du budget global pour que la fonction rentre
  // TOUJOURS avant le plateau Vercel (fini l'écran de chargement sans fin).
  // ✅ v8.73a — cap 75 s : le PREMIER fournisseur (Gemini ~40-50 s pour un
  // examen JSON complet de ~3800 tokens) doit pouvoir TERMINER dans le budget
  // 60 s de génération / 70 s de correction — les enveloppes (timeoutMs =
  // temps restant) restent les vraies bornes, jamais le cap.
  const timeout = setTimeout(() => controller.abort(), Math.max(5000, Math.min(75000, Number(timeoutMs) || 45000)));
  try {
    console.log(`[AI] ${provider.name} | prompt: ${prompt.length} car | max_tokens: ${maxTokens}`);

    const body = {
      model: provider.model,
      // ✅ v4.16 — 1.0 pour la GÉNÉRATION (créativité maximale : finis les exercices
      // clonés d'une relance à l'autre), 0.3 conservé pour la CORRECTION (notation stable).
      temperature: typeof temperature === 'number' ? temperature : 0.3,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: 'Tu produis exclusivement du JSON valide. Tu respectes scrupuleusement le schéma demandé.' },
        { role: 'user', content: prompt }
      ]
    };
    if (provider.jsonMode) body.response_format = { type: 'json_object' };
    // gpt-oss = modèle de raisonnement : effort bas → tokens réservés au contenu
    if (/gpt-oss/.test(provider.model || '')) body.reasoning_effort = 'low';
    // ✅ v8.65a — modèles à RAISONNEMENT (nemotron/particle/ernie...) : sans
    // cette ligne, le raisonnement brûle TOUT le budget sur les gros prompts
    // → content vide + finish=length (constaté en test live). Verified :
    // exclude=true → contenu pur, finish=stop.
    if (/openrouter\.ai/.test(provider.endpoint || '')) {
      body.reasoning = { exclude: true, max_tokens: 2000 };
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + provider.key
    };
    if (provider.headers) Object.assign(headers, provider.headers);

    // ✅ v8.73a — API GEMINI (generateContent) : JSON natif via responseMimeType
    // + thinkingBudget 0 (zéro tokens brûlés en raisonnement — la cause des
    // « réponse vide » des relais :free). Clé en query ET en header : couvre
    // les clés AIza… et AQ.… (même convention que api/progress.js).
    if (provider.gemini) {
      const gBody = {
        system_instruction: { parts: [{ text: 'Tu produis exclusivement du JSON valide. Tu respectes scrupuleusement le schéma demandé.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: typeof temperature === 'number' ? temperature : 0.3,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 }
        }
      };
      const gRes = await fetch(`${provider.endpoint}?key=${encodeURIComponent(provider.key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key },
        body: JSON.stringify(gBody),
        signal: controller.signal
      });
      const gData = await gRes.json().catch(() => null);
      if (!gRes.ok) {
        const msg = gData?.error?.message || ('HTTP ' + gRes.status);
        throw new Error(provider.name + ': ' + msg);
      }
      const parts = gData?.candidates?.[0]?.content?.parts || [];
      const gContent = parts.map((p) => (p && typeof p.text === 'string') ? p.text : '').join('');
      if (!gContent || !gContent.trim()) throw new Error(provider.name + ': réponse vide');
      console.log(`[AI] ${provider.name} — réponse: ${gContent.length} car`);
      const gClean = String(gContent).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const gCandidates = [repairMathEscapes(gClean), gClean, repairAllEscapes(gClean)];
      for (let gi = 0; gi < gCandidates.length; gi++) {
        try { return JSON.parse(gCandidates[gi]); }
        catch (e) {
          if (gi === gCandidates.length - 1) {
            console.warn(`[AI] ${provider.name} — JSON invalide même réparé. Début: ${gClean.slice(0, 200)}`);
            const gErr = new Error(provider.name + ': JSON invalide');
            gErr.raw = gClean;
            throw gErr;
          }
        }
      }
    }

    // ✅ v8.73a — RETRY INTERNE sur « réponse vide » : les relais :free sont
    // INTERMITTENTS (le même appel renvoie vide puis OK 10 s plus tard —
    // constaté en diagnostic direct). Un seul essai par relais gaspillait la
    // chaîne : on retente UNE fois le même relais (1,2 s de pause) dans la
    // même enveloppe de temps (AbortController commun).
    let data = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await fetch(provider.endpoint, {
        method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
      });
      data = await result.json().catch(() => null);
      if (!result.ok) {
        const msg = data?.error?.message || data?.message || ('HTTP ' + result.status);
        // 429/5xx du relais : re-tenter une fois peut suffire (cap transitoire)
        if (attempt === 1 && (result.status === 429 || result.status >= 500)) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw new Error(provider.name + ': ' + msg);
      }
      let content = data?.choices?.[0]?.message?.content;
      if (!content) {
        // ✅ v8.65a — filet : sur certains relais le JSON aboutit dans le champ
        // « reasoning » (exclusion non appliquée en amont). On le récupère.
        const rsn = data?.choices?.[0]?.message?.reasoning;
        if (rsn && String(rsn).trim().length > 40) content = String(rsn);
      }
      if (content) break;
      if (attempt === 1) {
        console.warn(`[AI] ${provider.name} — réponse vide (essai 1/2), re-tentative…`);
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    let content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const rsn = data?.choices?.[0]?.message?.reasoning;
      if (rsn && String(rsn).trim().length > 40) content = String(rsn);
    }
    if (!content) throw new Error(provider.name + ': réponse vide');

    console.log(`[AI] ${provider.name} — réponse: ${content.length} car`);

    const cleaned = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // ✅ v5.1 — RÉPARATION DES ÉCHAPPEMENTS LaTeX : un LLM qui écrit $\Delta$
    // (backslash simple) dans du JSON produit soit un JSON invalide (crash
    // « Bad escaped character »), soit des caractères de contrôle silencieux
    // (\frac → form-feed, \tan → tabulation). On double les backslashes LaTeX
    // à l'intérieur des $...$ AVANT le parse, puis on retente globalement.
    const candidates = [repairMathEscapes(cleaned), cleaned, repairAllEscapes(cleaned)];
    for (let ci = 0; ci < candidates.length; ci++) {
      try { return JSON.parse(candidates[ci]); }
      catch (e) {
        if (ci === candidates.length - 1) {
          console.warn(`[AI] ${provider.name} — JSON invalide même réparé. Début: ${cleaned.slice(0, 200)}`);
          const err = new Error(provider.name + ': JSON invalide');
          // ✅ v5.2 — le texte brut accompagne l'erreur : la passe de vérification
          // peut ainsi RÉCUPÉRER les solutions complètes d'une réponse tronquée.
          err.raw = cleaned;
          throw err;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ✅ v5.0 — genStyle PAR CATÉGORIE : calcul (maths/PC/chimie), svt, recit
// (littéraires). Le pool conserve le régime de l'exercice archivé.
function poolGenStyle(subject) {
  const category = subjectCategory(subject);
  if (category === 'calcul') return 'calc';
  if (category === 'svt') return 'svt';
  return 'recit';
}

async function saveExercisesToPool(exam, subject, difficulty, uid) {
  try {
    const { db, FieldValue } = getAdminServices();
    const batch = db.batch();
    let savedCount = 0;

    exam.subjects.forEach((subjectData) => {
      subjectData.exercises.forEach((exercise) => {
        if (!exercise.questions || exercise.questions.length === 0) return;
        const ref = db.collection(POOL_COLLECTION).doc();
        batch.set(ref, {
          subject,
          level: subjectData.level,
          difficulty,
          chapter: exam.chapter || 'all',
          title: exercise.title || 'Exercice',
          points: exercise.points || 6.67,
          statement: exercise.statement || '',
          questions: exercise.questions || [],
          source: 'ai',
          genStyle: poolGenStyle(subject),
          generatedBy: uid,
          createdAt: FieldValue.serverTimestamp(),
          usedCount: 0
        });
        savedCount++;
      });
    });

    if (savedCount > 0) {
      await batch.commit();
      console.log(`[POOL] ${savedCount} exercices sauvegardés pour ${subject}`);
    }
  } catch (e) {
    console.warn('[POOL] Erreur sauvegarde:', e.message);
  }
}

async function buildExamFromPool(config, avoidList) {
  try {
    const { db, FieldValue } = getAdminServices();
    const snap = await db.collection(POOL_COLLECTION)
      .where('subject', '==', config.subject)
      .limit(200)
      .get();

    if (snap.empty) return null;

    const allEx = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // ✅ v5.0 — la reconstruction ne puise que dans le RÉGIME de la matière
    // (calcul pur pour maths/PC/chimie ; questionnaire SVT pour svt) et dans
    // les exercices CONFORMES (valideurs v5.0 : zéro décimale en complexes,
    // zéro calcul en littéraire...).
    const category = subjectCategory(config.subject);
    const wantedStyles = category === 'calcul' ? ['calc']
      : category === 'svt' ? ['svt', 'calc']
      : ['recit'];
    const eligible = allEx.filter((e) =>
      wantedStyles.indexOf(e.genStyle || 'recit') !== -1 &&
      exerciseCompliant(e, config.subject, config.chapter));
    if (!eligible.length) return null;

    // ✅ v8.25 — anti-répétition en mode POOL-FIRST : évite (dans la mesure
    // du possible) les énoncés déjà servis à CET élève sur cet appareil.
    let base = eligible;
    if (Array.isArray(avoidList) && avoidList.length) {
      const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
      const avoidSet = new Set(avoidList.map(norm));
      const fresh = eligible.filter((e) => !avoidSet.has(norm(e.statement)));
      if (fresh.length >= 6) base = fresh;
    }

    let poolEx = base;
    if (config.chapter && config.chapter !== 'all') {
      const byChapter = eligible.filter((e) => e.chapter === config.chapter);
      if (byChapter.length >= 6) {
        poolEx = byChapter;
      }
    }

    let filtered = poolEx.filter((e) => e.difficulty === config.difficulty);
    if (filtered.length < 6) filtered = poolEx;

    const consolidation = filtered.filter((e) => e.level === 'consolidation');
    const approfondissement = filtered.filter((e) => e.level === 'approfondissement');

    if (consolidation.length < 3) {
      consolidation.push(...filtered.filter((e) => !consolidation.includes(e)));
    }
    if (approfondissement.length < 3) {
      approfondissement.push(...filtered.filter((e) => !approfondissement.includes(e)));
    }

    if (consolidation.length < 3 || approfondissement.length < 3) return null;

    consolidation.sort((a, b) => (a.usedCount || 0) - (b.usedCount || 0));
    approfondissement.sort((a, b) => (a.usedCount || 0) - (b.usedCount || 0));

    const pickedCons = shuffle(consolidation.slice(0, Math.min(8, consolidation.length))).slice(0, 3);
    const pickedApp = shuffle(approfondissement.slice(0, Math.min(8, approfondissement.length))).slice(0, 3);

    const batch = db.batch();
    [...pickedCons, ...pickedApp].forEach((ex) => {
      batch.update(db.collection(POOL_COLLECTION).doc(ex.id), {
        usedCount: FieldValue.increment(1),
        lastUsedAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit().catch(() => {});

    console.log('[POOL] Examen reconstruit depuis le pool');

    return repairExamStructure({
      subject: config.subject,
      level: config.level,
      duration: config.duration,
      totalPoints: TOTAL_POINTS,
      chapter: config.chapter,
      fromNotebook: false,
      subjects: [
        {
          id: 'subject_1',
          title: 'Sujet 1 — Consolidation',
          level: 'consolidation',
          instructions: 'Traitez les exercices dans le temps imparti.',
          exercises: pickedCons
        },
        {
          id: 'subject_2',
          title: 'Sujet 2 — Approfondissement',
          level: 'approfondissement',
          instructions: 'Traitez les exercices dans le temps imparti.',
          exercises: pickedApp
        }
      ],
      _fromPool: true
    }, config.subject);
  } catch (e) {
    console.warn('[POOL] Erreur reconstruction:', e.message);
    return null;
  }
}

async function buildUnavailableExam(config) {
  return {
    subject: config.subject,
    level: config.level,
    duration: config.duration,
    totalPoints: TOTAL_POINTS,
    chapter: config.chapter,
    fromNotebook: false,
    unavailable: true,
    message: 'Le service est temporairement indisponible. Merci de réessayer dans quelques minutes.',
    subjects: [
      { id: 'subject_1', title: 'Indisponible', level: 'consolidation', instructions: '', exercises: [] },
      { id: 'subject_2', title: 'Indisponible', level: 'approfondissement', instructions: '', exercises: [] }
    ]
  };
}

// ================================================================
// RÈGLES PÉDAGOGIQUES ET DE DIFFICULTÉ
// ================================================================

const LATEX_RULES = `
═══════════════════════════════════════════════════════════════
RÈGLES LATEX — OBLIGATOIRES
═══════════════════════════════════════════════════════════════
1. Formule mathématique TOUJOURS entre $...$ ou $$...$$.
2. INTERDIT de mettre du LaTeX brut sans $.
3. INTERDIT d'utiliser des symboles Unicode : π → $\\pi$, √ → $\\sqrt{}$, × → $\\times$, ≤ → $\\leq$, ≥ → $\\geq$, ∞ → $\\infty$, Δ → $\\Delta$, ² → $^2$, etc.
4. Fractions : $\\frac{...}{...}$. Vecteurs : $\\vec{u}$. Ensembles : $\\mathbb{R}$.
5. Unités avec petit espace : $9{,}81\\,\\text{m/s}^2$.
`;

// ✅ v5.0 — une pédagogie PAR CATÉGORIE : la règle « 100% calculs » ne s'applique
// PLUS aux littéraires ni à la SVT (elle provoquait des calculs en Histoire et
// des maths purs en SVT).
const PEDAGOGY_RULES_CALC = `
═══════════════════════════════════════════════════════════════
MISSION PÉDAGOGIQUE — MATIÈRE SCIENTIFIQUE À CALCULS (NIVEAU BAC AFRIQUE FRANCOPHONE)
═══════════════════════════════════════════════════════════════
Tu prépares un élève de Terminale D en Afrique francophone pour le BAC.
Les exercices doivent être :
- Fidèles au programme officiel (niveau BAC)
- Progressifs (facile → difficile au sein du même exercice)
- Chaque question teste UNE notion précise, mais peut nécessiter plusieurs étapes.
- BARÈME (composition sur 20) : QCM/Questions de connaissance = 5 pts ; exercices classiques = 7 pts au total ; dissertation finale = 8 pts.
- STYLE DE RÉFÉRENCE OBLIGATOIRE — 100% CALCULS type "Pascal Lainé" : chaque énoncé DONNE une expression, une équation, une fonction ou un bloc "Données :", et l'élève calcule, transforme, résout. AUCUN récit, AUCUNE histoire, AUCUNE situation vécue. La difficulté vient UNIQUEMENT des calculs.
- INTERDIT de générer une question sans travail réel (simple recopie du cours) comme de noyer un calcul dans un long récit. L'élève doit réfléchir sur des CALCULS.
`;

const PEDAGOGY_RULES_SVT = `
═══════════════════════════════════════════════════════════════
MISSION PÉDAGOGIQUE — SVT (NIVEAU BAC AFRIQUE FRANCOPHONE) — RÉGIME SPÉCIFIQUE
═══════════════════════════════════════════════════════════════
⚠️ LA SVT N'EST NI LES MATHS NI LA PHYSIQUE : c'est une matière à QUESTIONNAIRE + ANALYSE.
Tu prépares un élève de Terminale D en Afrique francophone pour le BAC.
Les exercices doivent être :
- Fidèles au programme officiel (niveau BAC) et au format des sujets BAC SVT.
- Progressifs (restitution → analyse → synthèse au sein du même exercice).
- BARÈME (composition sur 20) : QCM/Questions de connaissance = 5 pts ; exercices classiques = 7 pts au total ; dissertation finale = 8 pts.
COMPOSITION OBLIGATOIRE D'UN EXERCICE SVT (mélanger ces familles de questions) :
1. Restitution des connaissances : définir, citer, compléter, nommer, décrire (type "text", réponses courtes).
2. ANALYSE de documents/données : graphique, tableau, expérience, résultat d'observation → exploiter, interpréter, expliquer, comparer (type "text"). Les données (courbes, valeurs) sont données DANS l'énoncé et servent à RAISONNER, pas à calculer.
3. QCM (type "choice", 4 options, une seule juste) : 1 à 2 par exercice maximum.
4. VRAI/FAUX avec JUSTIFICATION OBLIGATOIRE : en type "text" (« Réponds par VRAI ou FAUX et justifie »).
5. CONCLUSION / synthèse rédigée (type "text") : mobiliser les réponses précédentes.
CALCULS EN SVT — UNIQUEMENT si le chapitre s'y prête (génétique : croisements, échiquiers, proportions ; ou une donnée chiffrée du chapitre) — jamais de calcul pur type maths.
⚠️ DOCUMENTS : si une question renvoie à un document, tableau, graphique ou résultats d'expérience, son contenu DOIT être intégralement recopié DANS le statement de l'exercice (l'élève ne voit QUE le texte de l'énoncé — jamais de « document ci-dessous » absent).
- INTERDIT : transformer un chapitre SVT non chiffré en exercices de calcul ; interdit les récits de marché ; interdit les questions sans travail réel.
`;

const PEDAGOGY_RULES_LITTERAIRE = `
═══════════════════════════════════════════════════════════════
MISSION PÉDAGOGIQUE — MATIÈRE LITTÉRAIRE (NIVEAU BAC AFRIQUE FRANCOPHONE)
═══════════════════════════════════════════════════════════════
⚠️ MATIÈRE LITTÉRAIRE : QUESTIONNAIRE UNIQUEMENT — STRICTEMENT ZÉRO CALCUL.
Tu prépares un élève de Terminale D en Afrique francophone pour le BAC.
Les questions doivent être :
- Fidèles au programme officiel (niveau BAC) et aux attentes réelles de l'épreuve.
- Progressives : connaissance → analyse → mise en relation → jugement argumenté.
- BARÈME (composition sur 20) : QCM/Questions de connaissance = 5 pts ; exercices classiques = 7 pts au total ; dissertation finale = 8 pts.
COMPOSITION OBLIGATOIRE (mélanger ces familles de questions) :
1. Questions de connaissances : citer, définir, situer, nommer, caractériser (type "text").
2. Analyse : expliquer un fait, un document, une notion, un extrait (type "text").
3. Mise en relation : comparer deux faits/notions/périodes (type "text").
4. Jugement argumenté ou question de réflexion (type "text").
5. Un QCM éventuel (type "choice", 4 options) OU un VRAI/FAUX justifié en type "text".
⚠️ COHÉRENCE TYPE : si tu écris « Parmi les propositions/affirmations suivantes », la question DOIT être de type "choice" avec 4 options et un correctAnswer — sinon reformule en question ouverte (type "text").
STRICTEMENT INTERDIT :
- Tout exercice de calcul, toute donnée numérique à calculer, tout pourcentage à calculer, toute opération arithmétique.
- Tout LaTeX mathématique ($...$), toute équation, toute expression mathématique.
- Les chiffres peuvent FIGURER comme données à COMMENTER (ex. un taux, une date), mais la réponse attendue est TOUJOURS rédigée, JAMAIS calculée. Une question dont la réponse exige une opération arithmétique = ÉCHEC de ta mission.
`;

const PEDAGOGY_RULES_BY_CATEGORY = {
  calcul: PEDAGOGY_RULES_CALC,
  svt: PEDAGOGY_RULES_SVT,
  litteraire: PEDAGOGY_RULES_LITTERAIRE
};

// ✅ v5.0 — PROTOCOLE DE RÉSOLUTION PRÉALABLE (exigence produit) : l'IA doit
// TRAITER chaque exercice AVANT de le livrer, et ne livrer que des questions
// qu'elle a résolues elle-même, sans erreur.
const SOLVE_FIRST_PROTOCOL = `
═══════════════════════════════════════════════════════════════
PROTOCOLE DE RÉSOLUTION PRÉALABLE — OBLIGATOIRE, AVANT D'ÉCRIRE LE JSON
═══════════════════════════════════════════════════════════════
ÉTAPE 1 — TRAITE D'ABORD : pour CHAQUE exercice, résous INTÉGRALEMENT chaque question sur ton brouillon interne (tous les calculs étape par étape, toutes les réponses rédigées).
ÉTAPE 2 — VÉRIFIE chaque résultat : la réponse EXISTE, est JUSTE, est PROPRE (valeur exacte ou arrondi convenu, jamais un résultat absurde) et les données de l'énoncé SUFFISENT pour y répondre.
ÉTAPE 3 — CORRIGE ou REMPLACE toute question que tu n'arrives pas à résoudre proprement AVANT de livrer l'examen.
RÈGLE ABSOLUE : tu ne livres QUE des exercices que tu as toi-même résolus en entier, SANS ERREUR. Un exercice impossible, mal calibré ou dont les données ne suffisent pas = ÉCHEC de ta mission.
Pour les questions "choice" : la bonne réponse (correctAnswer) est celle que TU as calculée/vérifiée ; les 3 autres propositions sont plausibles mais FAUSSES.
`;

// ✅ v5.0 — pédagogie de CORRECTION (neutre, toutes matières) : la correction
// s'appuie sur les réponses vérifiées par la passe de résolution (solution).
const CORRECTION_PEDAGOGY = `
═══════════════════════════════════════════════════════════════
PÉDAGOGIE DE CORRECTION (NIVEAU BAC AFRIQUE FRANCOPHONE)
═══════════════════════════════════════════════════════════════
Tu corriges un élève de Terminale D en Afrique francophone (épreuve de BAC).
- Note avec une BONTÉ EXIGEANTE : valorise toute démarche juste, sanctionne nettement les erreurs de fond.
- Explications conformes au régime de la matière : calcul étape par étape en maths/physique/chimie ; raisonnement biologique argumenté en SVT ; argumentation rédigée en histoire/géographie/philosophie.
- Si une réponse "correctAnswer" ou "solution" est fournie dans les données, c'est LA référence VALIDÉE par un professeur vérificateur : corrige par rapport à elle sans la remettre en cause.
`;

// ✅ v5.0 — règles de difficulté PAR CATÉGORIE : avant, les exemples « Ex. Maths »
// s'affichaient pour Histoire/Philo/SVT et poussaient l'IA vers des calculs.
const DIFFICULTY_RULES_BY_CATEGORY = {
  calcul: {
    easy: `Niveau FACILE : Calculs directs en 1 ou 2 étapes. Application immédiate du cours. Pas de mélange de notions. (Ex. Maths : mettre sous la forme algébrique z = (3+6i)/(-3-4i) ; calculer (3+2i)(1-3i).)`,
    medium: `Niveau MOYEN : Calculs en 3 ou 4 étapes. Application du cours avec une petite réflexion. (Ex. Maths : écrire sous forme algébrique 2e^{2iπ/3} et ((1+i)/(2-i))² ; module et argument de (1+i)^9/(1-i)^7.)`,
    hard: `Niveau DIFFICILE : Calculs longs à plusieurs étapes. L'élève doit mobiliser plusieurs notions du chapitre. (Ex. Maths : module et argument de a = 3i(2+i)(4+2i)(1+i) ; calcul de ((1+i√3)/2)^{2010}.)`,
    bac: `Niveau BAC (TRÈS DIFFICILE) : Exercices de synthèse type "Pascal Lainé" ou "Salissou Nazifi".
  - Les calculs doivent être longs (équations du 3ème/4ème degré, changements de variable, trigonométrie inverse).
  - Enchaîner plusieurs phases de calcul (mouvements composés, réactions successives).
  - L'élève doit utiliser un cahier de brouillon pour réussir.
  - Exemple Maths : "Résoudre z^4 + (3-6i)z^2 - 8 - 6i = 0".
  - Exemple Physique : "Un mobile M a pour équation horaire x_M(t) = -30t + 0,3t² et un mobile C : x_C(t) = 20t + 40 ; calculer l'instant et la position de rencontre, puis les vitesses à cet instant."`
  },
  svt: {
    easy: `Niveau FACILE (SVT) : restitution et lecture directes — définir, citer, compléter un texte, QCM évidents, VRAI/FAUX simples avec justification brève. Aucun calcul.`,
    medium: `Niveau MOYEN (SVT) : exploitation d'un document simple (graphique, tableau, expérience) — décrire, interpréter, expliquer un mécanisme ; QCM ; VRAI/FAUX justifié ; conclusion brève. Calculs seulement si le chapitre est génétique (proportions simples).`,
    hard: `Niveau DIFFICILE (SVT) : exploitation croisée de deux documents/données — mettre en relation des résultats d'expériences, expliquer un mécanisme complet, construire une argumentation biologique aboutissant à une conclusion. Génétique : échiquiers complets, proportions phénotypiques.`,
    bac: `Niveau BAC (TRÈS DIFFICILE — SVT) : problème scientifique complet type BAC — restitution ciblée + exploitation rigoureuse de documents + déduction en chaîne + synthèse/conclusion rédigée. Génétique : croisements complexes (di/trihybridisme, linkage) avec échiquiers et proportions exactes.`
  },
  litteraire: {
    easy: `Niveau FACILE (matière littéraire) : questions de connaissance directes — citer, définir, situer dans le temps/l'espace, compléter. Réponses courtes attendues. AUCUN calcul.`,
    medium: `Niveau MOYEN (matière littéraire) : analyse — expliquer un fait/notion/document, dégager des causes ou des conséquences, caractériser. AUCUN calcul.`,
    hard: `Niveau DIFFICILE (matière littéraire) : mise en relation — comparer deux situations/notions/périodes, croiser des documents, construire une démonstration organisée. AUCUN calcul.`,
    bac: `Niveau BAC (TRÈS DIFFICILE — matière littéraire) : dissertation/problème complet — analyse du sujet, mobilisation précise de connaissances, argumentation organisée, jugement critique personnelle. Philosophie : problématiser (thèse/antithèse/synthèse). AUCUN calcul.`
  }
};

const PHYSICS_RULES = `
═══════════════════════════════════════════════════════════════
RÈGLES SPÉCIFIQUES PHYSIQUE
═══════════════════════════════════════════════════════════════
1. L'énoncé DONNE directement les données techniques (équation(s) horaire(s), valeurs de v0, a, U, R, m...), avec au maximum UNE phrase de cadrage neutre ("Un mobile M et un camion C se déplacent sur une route rectiligne."), puis on passe immédiatement au CALCUL. STRICTEMENT INTERDIT de raconter une histoire.
2. LA PREMIÈRE QUESTION DU PREMIER EXERCICE CLASSIQUE (partie Q1.a — PAS le QCM) EST OBLIGATOIREMENT DE TYPE "drawing" :
   - Demander de faire le schéma, de placer le repère, ou de tracer les vecteurs.
3. Les questions suivantes du même exercice (1.b à 1.d) demandent des équations horaires, des calculs de distance/temps, ou des analyses graphiques.
`;

const CHEMISTRY_RULES = `
═══════════════════════════════════════════════════════════════
RÈGLES SPÉCIFIQUES CHIMIE
═══════════════════════════════════════════════════════════════
1. PAS de question de dessin. Toutes les questions sont de type "text" ou "choice".
2. L'énoncé ("statement") DOIT inclure un bloc "Données :" (masses molaires, volumes, concentrations).
3. Les questions doivent être progressives : 
   - Q1 : Équation de dissolution ou masse molaire.
   - Q2 : Calcul de concentration.
   - Q3 : Calcul de pH ou inventaire des espèces.
   - Q4 : Dilution ou électroneutralité.
`;

const STRUCTURE_CONTROL = `
═══════════════════════════════════════════════════════════════
CONTRÔLE STRUCTUREL OBLIGATOIRE (composition v8.65a — sur 20)
═══════════════════════════════════════════════════════════════
CONCISION OBLIGATOIRE : énoncés et données TENUS (statement ≤ 30 mots),
options courtes (≤ 12 mots), instructions brèves — la sortie ENTIÈRE doit
tenir dans un budget serré. Pas de bavardage, pas de répétition.
Ton JSON contient EXACTEMENT :
- "subjects" : tableau de __NB_SUJETS__
- Chaque subject a : "id" ("subject_1" / "subject_2"), "title", "level", "instructions", "exercises"
- "exercises" OBEIT STRICTEMENT à cette composition (dans cet ordre) :
  1) EXERCICE 0 — PARTIE QCM : "title": "QCM", "points": 5, EXACTEMENT 5 questions de type "choice", 1 point chacune, chacune avec "options" (4 objets {id:A/B/C/D, text}) et "correctAnswer" (A/B/C/D).
     (Si la matière N'ADMET PAS de QCM — matières littéraires hors SVT — ces 5 questions deviennent des questions de CONNAISSANCE à réponse courte type "text", toujours 1 point chacune.)
  2) EXERCICES 1..k — EXERCICES CLASSIQUES : k est TON CHOIX de professeur (2 OU 3 exercices). Chacun a "number", "title", "statement", "points", et 2 à 4 questions (type "text" ou "drawing"). La SOMME des "points" de ces exercices = EXACTEMENT 7.
  3) DERNIER EXERCICE — DISSERTATION / PROBLÈME DE SYNTHÈSE : "title": "Dissertation", "points": 8, "dissertation": true, "propositions": tableau de EXACTEMENT 2 objets {"id": "A" ou "B", "title": "...", "text": "énoncé complet du sujet"} — l'élève en traite UNE au choix — et EXACTEMENT 1 question de type "text" (points 8) dont le "text" demande de traiter l'une des deux propositions.
- La somme des points d'un sujet = EXACTEMENT 20 (5 + 7 + 8).
- C'est TOI qui décides du nombre d'exercices classiques (2 ou 3) et du nombre de questions par exercice (2 à 4) comme un vrai professeur : l'élève traite TOUT ce que tu livres.

CONTRAT DE COMPLÉTION — ABSOLUMENT OBLIGATOIRE :
- Tu livres l'INTÉGRALITÉ des questions (2 sujets complets), JAMAIS une réponse partielle.
- CHAQUE question a un énoncé ("text") COMPLET et NON VIDE : la question posée, les données numériques et l'unité attendue.
- CHAQUE exercice a un "statement" non vide qui pose les données de ses questions (expression à transformer, équation, données techniques ou courte situation).
- Si tu manques de place, raccourcis les formulations mais ne supprime JAMAIS une question et ne mets jamais "..." ou "".
- VÉRIFICATION FINALE AVANT DE RÉPONDRE : compte tes points par sujet (QCM 5 + exercices 7 + dissertation 8 = 20). S'il en manque, complète AVANT d'émettre ta réponse.
- INTERDIT de renvoyer un commentaire, une excuse ou du texte hors JSON.
`;

// ═════════════════════════════════════════════════════════════
// ✅ v4.16 — VARIATION TOTALE À CHAQUE RELANCE
// Avant : temperature 0.3 + prompt strictement identique ⇒ l'IA resservait
// presque les mêmes exercices à chaque génération. Désormais : température
// créative (1.0) + tirage aléatoire d'un contexte africain, d'une approche
// pédagogique et d'une contrainte numérique à CHAQUE appel + liste des
// énoncés déjà servis à cet élève (interdits de recyclage).
// ═════════════════════════════════════════════════════════════
const GEN_TEMPERATURE = 1.0;

function sanitizeAvoidList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((s) => typeof s === 'string')
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 140))
    .filter((s) => s.length >= 12)
    .slice(0, 18);
}

const VARIATION_CONTEXTS = {
  commun: [
    'le grand marché de la capitale un jour de forte affluence',
    'une coopérative maraîchère le long du fleuve',
    'un chantier de construction dans un nouveau quartier',
    'un trajet en car entre deux grandes villes du pays',
    'un centre de santé intégré en zone rurale',
    'un forage et le ravitaillement en eau d\'un village',
    'une boutique multi services de quartier',
    'un champ de mil pendant l\'hivernage',
    'un club de jeunes et un tournoi de football inter-quartiers',
    'une station de recharge de téléphones à énergie solaire',
    'une tontine entre commerçantes',
    'un élevage de volailles familial',
    'un quai de chargement de marchandises au bord du fleuve',
    'une salle de classe lors de la rentrée scolaire',
    'un petit atelier de couture qui reçoit des commandes'
  ],
  mathematiques: [
    'un partage d\'héritage de bétail entre héritiers',
    'un prêt à intérêt simple chez un boutiquier',
    'le tracé d\'une parcelle rectangulaire à clôturer',
    'la progression des ventes d\'un étal de tissus',
    'un réservoir qui se remplit et se vide en même temps',
    'un crédit épargne au sein d\'une association de femmes'
  ],
  physique: [
    'un motard qui rattrape un camion sur la route de Filingué',
    'un ballon lancé depuis la terrasse d\'une maison',
    'un circuit d\'éclairage alimenté par un panneau solaire',
    'un chariot qui descend une rampe de chargement',
    'un seau d\'eau remonté au-dessus d\'un puits',
    'un chauffeur qui freine pour éviter un troupeau'
  ],
  chimie: [
    'une solution de soude préparée au laboratoire du lycée',
    'un engrais dilué avant épandage dans un champ',
    'le dosage d\'un vinaigre artisanal',
    'une dissolution de sel dans l\'eau du fleuve',
    'une pile artisanale à deux électrodes',
    'une analyse d\'eau de forage'
  ],
  svt: [
    'une enquête sur la transmission d\'un caractère dans une famille d\'Afrique francophone',
    'une mare temporaire et sa vie pendant la saison des pluies',
    'la fermentation d\'un lait local',
    'une fleur disséquée en travaux pratiques',
    'le cycle de l\'eau observé pendant l\'hivernage',
    'un foyer qui s\'éclaire au biogaz'
  ],
  // ✅ v5.1 — contextes STRICTEMENT littéraires (histoire/géo/philo) : les
  // contextes scientifiques de « commun » (centre de santé, forage, champ...)
  // faisaient DÉRIVER un sujet d'histoire vers la santé.
  commun_lit: [
    'le grand marché de la capitale un jour de forte affluence',
    'un trajet en car entre deux grandes villes du pays',
    'une salle de classe lors de la rentrée scolaire',
    'un club de jeunes et un tournoi de football inter-quartiers',
    'une tontine entre commerçantes',
    'un petit atelier de couture qui reçoit des commandes',
    'une cérémonie traditionnelle au village',
    'un groupe de discussion sur les réseaux sociaux',
    'un débat radiophonique en langue locale',
    'une exposition culturelle sur l\'histoire du continent'
  ],
  philosophie: [
    'un débat de jeunes sur le travail et la réussite',
    'un dialogue sur la liberté et la tradition',
    'un jugement rendu au village et la question de la justice',
    'une discussion sur la science et la croyance',
    'une réflexion sur l\'argent et le bonheur'
  ],
  histoire: [
    'les résistances à la pénétration coloniale au Sahel',
    'les grands empires et royaumes du Sahel et de l\'Afrique de l\'Ouest',
    'la marche des pays d\'Afrique francophone vers l\'indépendance',
    'les institutions de la République après l\'indépendance',
    'les routes caravanières transsahariennes et le commerce ancien'
  ],
  geographie: [
    'l\'exode rural et la croissance des villes d\'Afrique de l\'Ouest',
    'une région du Sahel face à la sécheresse',
    'l\'exploitation des ressources minières et leurs enjeux',
    'les échanges commerciaux transfrontaliers',
    'la mobilité des pasteurs et le peuplement'
  ]
};

const VARIATION_ANGLES = [
  'partir d\'une histoire vécue avant d\'introduire la notion',
  'faire construire ou estimer une grandeur avant de la calculer',
  'demander une comparaison entre deux situations distinctes',
  'faire interpréter le résultat obtenu en fin de question',
  'glisser une donnée superflue que l\'élève doit savoir écarter',
  'emboîter deux notions du programme dans le même exercice',
  'faire une question en deux sous-étapes (a puis b) qui se répondent',
  'terminer l\'exercice par une question de synthèse ouverte'
];

// ✅ v5.0 — VARIATION_NUMERIC réservée à PHYSIQUE/CHIMIE (valeurs réalistes).
// C'était LA cause des nombres à virgule en Nombres complexes : cette liste
// était tirée pour TOUTES les matières scientifiques, maths incluses.
const VARIATION_NUMERIC = [
  'impose-toi des valeurs NON RONDES et inédites (ex. 7,5 ; 12,3 ; 17,25 ; 3/8 ; 2,4×10^3)',
  'impose-toi au moins deux valeurs décimales et une fraction dans chaque exercice',
  'impose-toi au moins une valeur en notation scientifique et une valeur impaire',
  'impose-toi des grandeurs réalistes (masses, distances, durées crédibles) différentes des valeurs habituelles'
];

// ✅ v5.0 — MATHS : VALEURS EXACTES OBLIGATOIRES. En mathématiques (surtout en
// Nombres complexes) les données et résultats doivent rester EXACTS : entiers,
// fractions simples, racines exactes — JAMAIS de nombres à virgule.
const MATH_EXACT_VALUES = 'Contrainte numérique MATHÉMATIQUES — VALEURS EXACTES OBLIGATOIRES : toutes les données sont des ENTIERS, des FRACTIONS SIMPLES ou des RACINES EXACTES ; AUCUN nombre à virgule dans les énoncés, les données, les réponses attendues ; pour les NOMBRES COMPLEXES : parties réelles et imaginaires ENTIÈRES ou fractions simples (ex. z = (3+6i)/(-3-4i) ; z = 2e^{iπ/3}) — JAMAIS 3,5i ni 2,75+1,5i ; les résultats sont EXACTS et PROPRES (entiers, fractions simples, valeurs remarquables de cos/sin, angles en radians simples).';

const VARIATION_TEXT = [
  'appuie chaque argument sur un exemple précis, daté ou localisé',
  'impose-toi un vocabulaire technique du programme',
  'fais référence à une situation africaine concrète dans au moins une question',
  'varie les types de questions : une analyse, une mise en relation, un jugement argumenté'
];

// ✅ v4.17 — TECHNIQUES de calcul tirées au hasard à CHAQUE appel (matières
// scientifiques) : la variété vient du TYPE DE CALCUL demandé (style fiches
// Pascal Lainé : formes à transformer, équations à résoudre, modules/arguments,
// puissances élevées...) et non plus d'un contexte narratif imposé.
const VARIATION_CALC_DRILLS = {
  mathematiques: [
    'calculs de transformation directe : mettre sous forme algébrique a+ib des quotients, produits ou carrés (ex. z = (3+6i)/(-3-4i) ; ((1+i)/(2-i))²)',
    'calculs de module, argument, formes trigonométrique et exponentielle (ex. écrire 2e^{2iπ/3} sous forme algébrique ; module et argument d un produit comme 3i(2+i)(4+2i)(1+i))',
    'puissances élevées obtenues par la forme trigonométrique (ex. ((1+i√3)/2)^{2010} ; (1+i)^9/(1-i)^7)',
    'résolution d équations (degré 2, équation en z², changement de variable, discriminant)',
    'calculs d images, de limites, de dérivées, de tangentes, de variations',
    'suites : calculs de termes, de raison, de sommes, de seuil',
    'probabilités et dénombrement : calculs directs, arbres pondérés, espérance',
    'calcul vectoriel, coordonnées, distances, milieux, colinéarité'
  ],
  physique: [
    'équations horaires et mouvements : calculs de position, vitesse, instant de rencontre, distance',
    'applications en chaîne des théorèmes du cours : chaque grandeur calculée alimente la question suivante',
    'calculs électriques : loi d Ohm, puissance, énergie, associations de résistors',
    'conversions, notation scientifique et applications numériques rigoureuses avec unités'
  ],
  chimie: [
    'chaînes de calculs quantité de matière / masse molaire / concentration',
    'avancement, tableau d avancement, réactif limitant, rendement',
    'pH, Ka, dosage, dilution : calculs successifs à partir du bloc Données',
    'écriture et équilibrage d équations suivis d applications numériques'
  ],
  svt: [
    'génétique : croisements, échiquiers, proportions phénotypiques calculées',
    'calculs de pourcentages, proportions et taux à partir de données brutes',
    'lecture chiffrée de documents : courbes, tableaux, calculs de variation',
    'restitution structurée appuyée sur des données précises du chapitre'
  ]
};

// ✅ v5.0 — angles de variation SVT : questionnaires, analyses, conclusions —
// PAS des calculs type maths.
const VARIATION_SVT_ANGLES = [
  'construire la chaîne complète document → exploitation → déduction → conclusion rédigée',
  'glisser deux QCM et un VRAI/FAUX justifié au milieu des questions d\'analyse',
  'faire décrire puis interpréter un graphique ou un tableau de résultats fourni dans l\'énoncé',
  'demander la mise en relation de deux documents ou de deux résultats expérimentaux',
  'terminer par une synthèse/conclusion qui mobilise les réponses précédentes',
  'demander de schématiser ou légender une structure (réponse décrite en texte)',
  'faire formuler une hypothèse puis la valider à partir des données fournies'
];

// ✅ v4.17 — angles de variante 100% CALCUL (remplacent les angles narratifs
// pour les matières scientifiques ; les littéraires gardent VARIATION_ANGLES).
const VARIATION_CALC_ANGLES = [
  'emboîter deux notions du programme dans le même exercice de calcul',
  'faire une question en deux sous-étapes (a puis b) où le résultat de a sert au calcul de b',
  'demander la même grandeur par deux méthodes différentes (vérification croisée)',
  'glisser une expression astucieuse dont une transformation intermédiaire simplifie tout',
  'faire intervenir une valeur exacte puis sa valeur approchée demandée séparément',
  'insérer un "montrer que..." qui guide l élève vers la question suivante',
  'terminer l exercice par une question de synthèse qui combine les résultats précédents'
];

function buildVariationBlock(subject, avoidStatements) {
  const category = subjectCategory(subject);
  const isCalc = category === 'calcul';
  const isSvt = category === 'svt';
  const isScience = isCalc; // compat pool/rattrapage : seules maths/PC/chimie sont « calc »
  // ✅ v5.1 — les littéraires ne tirent que des contextes STRICTEMENT
  // littéraires (commun_lit) — aucune contamination par un contexte scientifique.
  const pool = (VARIATION_CONTEXTS[subject] || [])
    .concat(category === 'litteraire' ? VARIATION_CONTEXTS.commun_lit : VARIATION_CONTEXTS.commun);
  const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');
  let c1 = pick(pool);
  let c2 = pick(pool);
  for (let guard = 0; c2 === c1 && guard < 8; guard += 1) c2 = pick(pool);
  const d1 = pick(VARIATION_CALC_DRILLS[subject]);
  let d2 = pick(VARIATION_CALC_DRILLS[subject]);
  for (let guard = 0; d2 === d1 && guard < 8; guard += 1) d2 = pick(VARIATION_CALC_DRILLS[subject]);
  const angle = isCalc ? pick(VARIATION_CALC_ANGLES)
    : isSvt ? pick(VARIATION_SVT_ANGLES)
    : pick(VARIATION_ANGLES);
  // ✅ v5.0 — contrainte numérique PAR CATÉGORIE :
  //   maths  → valeurs EXACTES (MATH_EXACT_VALUES) — zéro virgule ;
  //   PC     → décimales réalistes (VARIATION_NUMERIC) ;
  //   svt/lit → contrainte rédactionnelle.
  const constraint = subject === 'mathematiques' ? MATH_EXACT_VALUES
    : isCalc ? 'Contrainte numérique : ' + pick(VARIATION_NUMERIC)
    : 'Contrainte rédactionnelle : ' + pick(VARIATION_TEXT);
  const avoid = sanitizeAvoidList(avoidStatements);
  const avoidBlock = avoid.length
    ? '- ÉNONCÉS DÉJÀ SERVUS à cet élève lors de ses générations précédentes — INTERDIT de les reprendre tels quels, de changer seulement les noms ou les nombres, ou d\'en livrer une variante proche :\n' +
      avoid.map((s) => '  • ' + s).join('\n')
    : '';

  // ✅ v5.0 — styleBlock : 100% CALCULS PURS UNIQUEMENT pour maths/physique/chimie.
  // SVT reçoit son propre bloc QUESTIONNAIRE + ANALYSE ; littéraires : contexte imposé.
  const styleBlock = isCalc
    ? '- STYLE OBLIGATOIRE — 100% DES CALCULS, ZÉRO HISTOIRE (fiches d\'entraînement type "Pascal Lainé") :\n' +
      '  • TOUS les exercices (3 sur 3 PAR SUJET) sont des CALCULS PURS : l\'énoncé DONNE une expression, une équation, une fonction ou un bloc « Données : », et l\'élève calcule, transforme, résout.\n' +
      '  • STRICTEMENT INTERDIT : récit, histoire, situation vécue, personnages, achat au marché, trajet, forage, tontine — AUCUNE mise en scène, même en 1 phrase.\n' +
      '  • La difficulté vient UNIQUEMENT des calculs (nombre d\'étapes, techniques combinées, expression astucieuse).\n' +
      '  • Valeurs CALCULABLES (résultats exacts ou arrondis propres ; moduli, angles et solutions simples quand le chapitre s\'y prête).\n' +
      '  • Tirage technique imposé Sujet 1 : ' + d1 + '\n' +
      '  • Tirage technique imposé Sujet 2 : ' + d2 + '\n' +
      '  • (Ces techniques imposent le STYLE de l\'exercice ; applique-les au chapitre exigé ci-dessus.)\n' +
      '  • EXEMPLE DE STYLE ATTENDU — respecte EXACTEMENT cette forme, adaptée au chapitre exigé :\n' +
      '    Maths : Énoncé « On considère z = (3+6i)/(-3-4i). 1.a) Mettre z sous forme algébrique. b) En déduire le module et un argument. » — ET PAS « Aïcha achète au marché... »\n' +
      '    Physique : Énoncé « Un mobile M a pour équation horaire x_M(t) = 40 - 4t et un mobile C : x_C(t) = 10 + t² (t en s, x en m). 1.a) Placer le repère et tracer les vecteurs vitesse. b) Calculer l\'instant de rencontre. »\n'
    : isSvt
    ? '- STYLE OBLIGATOIRE — QUESTIONNAIRE + ANALYSE BAC SVT (PAS un exercice de maths) :\n' +
      '  • Chaque exercice mélange : restitution de connaissances, exploitation d\'un document/donnée fourni dans l\'énoncé, QCM (max 2), VRAI/FAUX justifié, conclusion rédigée.\n' +
      '  • INTERDIT : exercice de calcul pur, données à calculer, format type maths (« mettre sous forme », « résoudre l\'équation »...).\n' +
      '  • Calculs UNIQUEMENT si le chapitre est génétique/données chiffrées du chapitre — sinon ZÉRO calcul.\n' +
      '  • Angle imposé Sujet 1 : ' + angle + '\n' +
      '  • Angle imposé Sujet 2 : ' + pick(VARIATION_SVT_ANGLES) + '\n'
    : '';
  // ✅ v5.0 — sciences à calculs : AUCUNE situation réelle proposée ; SVT et
  // littéraires : contexte imposé conservé.
  const contextLines = isCalc
    ? ''
    : '- Contexte imposé Sujet 1 (si compatible avec le contenu exigé) : ' + c1 + '\n' +
      '- Contexte imposé Sujet 2 (si compatible avec le contenu exigé) : ' + c2;

  return `══════════════════════════════════════════════════════════════
VARIATION OBLIGATOIRE — TIRAGE N° ${Math.floor(Math.random() * 900000000) + 100000000}
══════════════════════════════════════════════════════════════
Chaque appel doit produire un examen 100% INÉDIT : énoncés, valeurs, techniques et questions changent TOTALEMENT d'une génération à l'autre.
${styleBlock}${contextLines}
- Approche imposée : ${angle}
- ${constraint}
- INTERDIT de recycler les exercices classiques ou une génération précédente : même trame ou mêmes données = échec.
${avoidBlock}`;
}

function generationPrompt(config, avoidStatements, single) {
  const subjectLabel = SUBJECT_LABELS[config.subject] || config.subject;
  const category = subjectCategory(config.subject);

  let specificRules = '';
  if (config.subject === 'physique') specificRules = PHYSICS_RULES;
  else if (config.subject === 'chimie') specificRules = CHEMISTRY_RULES;

  const diffRulesByCat = DIFFICULTY_RULES_BY_CATEGORY[category] || DIFFICULTY_RULES_BY_CATEGORY.calcul;
  const diffRules = diffRulesByCat[config.difficulty] || diffRulesByCat.medium;
  const variationBlock = buildVariationBlock(config.subject, avoidStatements);

  return `Tu es un professeur expert du BAC en Afrique francophone.

${PEDAGOGY_RULES_BY_CATEGORY[category] || PEDAGOGY_RULES_CALC}
${specificRules}

NATURE DE CETTE MATIÈRE : ${CATEGORY_LABELS[category] || ''}. Respecte STRICTEMENT ce régime.
ADHÉRENCE MATIÈRE ABSOLUE : tous les exercices portent UNIQUEMENT sur ${subjectLabel} et le chapitre exigé — tout contenu appartenant à une autre matière ou à un autre domaine = échec.

MISSION : Génère DEUX sujets d'examen complets.

Matière : ${subjectLabel}
Niveau : ${config.level}
Chapitre : ${config.chapter === 'all' ? 'tous les chapitres' : config.chapter}
DIFFICULTÉ : c'est TOI, professeur, qui juges le niveau juste — de la maîtrise du cours jusqu'au niveau BAC. GRADATION OBLIGATOIRE : le Sujet 2 doit être VISIBLEMENT plus difficile que le Sujet 1 (énoncés plus riches, plus d'étapes de calcul, notions combinées).

SUJET 1 — "Consolidation" : tester les bases du chapitre.
SUJET 2 — "Approfondissement" : aller plus loin vers le BAC.

${variationBlock}

${LATEX_RULES}

${SOLVE_FIRST_PROTOCOL}

FORMAT JSON :
{
  "subject": "${config.subject}",
  "level": "${config.level}",
  "duration": ${config.duration},
  "totalPoints": 20,
  "chapter": "${config.chapter}",
  "subjects": [
    { "id": "subject_1", "title": "Sujet 1 — Consolidation", "level": "consolidation", "instructions": "...", "exercises": [] },
    { "id": "subject_2", "title": "Sujet 2 — Approfondissement", "level": "approfondissement", "instructions": "...", "exercises": [] }
  ]
}

${STRUCTURE_CONTROL.replace('__NB_SUJETS__', single ? '1 objet' : '2 objets')}

${single ? 'UN SEUL sujet est attendu dans "subjects" (entraînement sur le cours : l\'élève traite ce sujet unique).' : ''}
Réponds UNIQUEMENT avec le JSON complet et valide.`;
}

function generationPromptFromNotebook(config, notebookContext, avoidStatements, single) {
  const subjectLabel = SUBJECT_LABELS[config.subject] || config.subject;
  const category = subjectCategory(config.subject);

  let specificRules = '';
  if (config.subject === 'physique') specificRules = PHYSICS_RULES;
  else if (config.subject === 'chimie') specificRules = CHEMISTRY_RULES;

  const diffRulesByCat = DIFFICULTY_RULES_BY_CATEGORY[category] || DIFFICULTY_RULES_BY_CATEGORY.calcul;
  const diffRules = diffRulesByCat[config.difficulty] || diffRulesByCat.medium;
  const variationBlock = buildVariationBlock(config.subject, avoidStatements);

  const hasAnySubjectCount = single ? 'UN SEUL' : 'DEUX';
  const gradation = single
    ? ''
    : 'GRADATION OBLIGATOIRE : le Sujet 2 doit être VISIBLEMENT plus difficile que le Sujet 1.';

  return `Tu es un professeur expert du BAC en Afrique francophone.

${PEDAGOGY_RULES_BY_CATEGORY[category] || PEDAGOGY_RULES_CALC}
${specificRules}

NATURE DE CETTE MATIÈRE : ${CATEGORY_LABELS[category] || ''}. Respecte STRICTEMENT ce régime.
ADHÉRENCE MATIÈRE ABSOLUE : tous les exercices portent UNIQUEMENT sur ${subjectLabel} et le contenu du cahier exigé — tout contenu appartenant à une autre matière ou à un autre domaine = échec.

L'élève a étudié un chapitre dans son cahier. Génère ${hasAnySubjectCount} sujet(s) basé(s) STRICTEMENT sur ce contenu.

Chapitre : ${notebookContext.chapterTitle}
Matière : ${subjectLabel}
DIFFICULTÉ : c'est TOI, professeur, qui juges le niveau juste — de la maîtrise du cours lu ci-dessous jusqu'au niveau BAC. ${gradation}

═══════════════════════════════════════════════════════════════
CONTENU DU CHAPITRE ÉTUDIÉ
═══════════════════════════════════════════════════════════════
${notebookContext.contentText}

RÈGLE ABSOLUE : génère UNIQUEMENT à partir du contenu ci-dessus.

${variationBlock}

${LATEX_RULES}

${SOLVE_FIRST_PROTOCOL}

FORMAT JSON :
${single
    ? `{
  "subject": "${config.subject}",
  "level": "${config.level}",
  "duration": ${config.duration},
  "totalPoints": 20,
  "chapter": "${config.chapter}",
  "fromNotebook": true,
  "subjects": [
    { "id": "subject_1", "title": "Entraînement — ${notebookContext.chapterTitle}", "level": "consolidation", "instructions": "...", "exercises": [] }
  ]
}`
    : `{
  "subject": "${config.subject}",
  "level": "${config.level}",
  "duration": ${config.duration},
  "totalPoints": 20,
  "chapter": "${config.chapter}",
  "fromNotebook": true,
  "subjects": [
    { "id": "subject_1", "title": "Sujet 1 — Consolidation", "level": "consolidation", "instructions": "...", "exercises": [] },
    { "id": "subject_2", "title": "Sujet 2 — Approfondissement", "level": "approfondissement", "instructions": "...", "exercises": [] }
  ]
}`}

${STRUCTURE_CONTROL.replace('__NB_SUJETS__', single ? 'UN objet EXACTEMENT' : '2 objets EXACTEMENT')}

${single
    ? '⚠️ UN SEUL sujet est attendu dans "subjects" — le tableau "subjects" doit contenir EXACTEMENT 1 objet, jamais 2 (entraînement sur le cours : l\'élève traite ce sujet unique).'
    : '⚠️ EXACTEMENT 2 sujets sont attendus dans "subjects" — jamais 1, jamais 3.'}
Réponds UNIQUEMENT avec le JSON.`;
}

function correctionPrompt(body, notebookContext) {
  const subject = body.exam.subjects.find((s) => s.id === body.subjectId) || body.exam.subjects[0];
  if (!subject) throw new Error('subject_not_found');

  const questionsDetail = [];
  subject.exercises.forEach((exercise, exIdx) => {
    exercise.questions.forEach((question, qIdx) => {
      const key = body.subjectId + ':' + exIdx + ':' + qIdx;
      questionsDetail.push({
        exerciseNumber: exercise.number || (exIdx + 1),
        exerciseTitle: exercise.title || '',
        exerciseStatement: exercise.statement || '',
        // ✅ v8.65a — la dissertation (2 propositions au choix) est identifiée :
        // le correcteur sait quel sujet l'élève a choisi et corrige dessus.
        isDissertation: exercise.dissertation === true,
        propositions: Array.isArray(exercise.propositions) ? exercise.propositions : null,
        chosenProposition: exercise.dissertation === true ? (body.answers['dissertProp:' + exIdx] || null) : null,
        questionNumber: question.number || ((exIdx + 1) + '.' + (qIdx + 1)),
        questionText: question.text,
        type: question.type || 'text',
        options: question.options || null,
        points: Number(question.points) || 1,
        // ✅ v5.0 — la réponse vérifiée par la passe de résolution (q.solution)
        // renforce la correction : le correcteur part d'une réponse déjà validée.
        correctAnswer: question.correctAnswer || question.solution || null,
        studentAnswer: body.answers[key] || null,
        answered: body.answers[key] !== null && body.answers[key] !== ''
      });
    });
  });

  // ⚡ v8.64a — LE COURS DE L'ÉLÈVE : en mode Entraînement, la correction
  // emploie les MOTS EXACTS et les TECHNIQUES de la leçon résumée (page
  // Résumé) — l'élève reconnaît son cours dans chaque explication.
  const courseBlock = (notebookContext && notebookContext.contentText)
    ? `

═══════════════════════════════════════════════
LE COURS DE CET ÉLÈVE (source pédagogique de vérité — chapitre : ${notebookContext.chapterTitle || ''})
═══════════════════════════════════════════════
${notebookContext.contentText}

RÈGLES DE CORRECTION AVEC LE COURS (obligatoires) :
- Utilise les MOTS EXACTS et les TECHNIQUES du cours ci-dessus dans "explanation", "concept", "betterMethod" et "toReview".
- Quand une question se rapporte à une notion du cours, cite la formulation du cours (« comme dans ton cours : … »).
- Montre à l'élève COMMENT son cours répond à la question (définitions, formules, étapes telles qu'écrites dans sa leçon).
- Ne contredis JAMAIS le cours de l'élève : s'il est approximatif, corrige en t'appuyant d'abord sur sa formulation.
`
    : '';
  return `Tu es un professeur correcteur expert du BAC en Afrique francophone. Ton rôle : corriger CHAQUE question avec une PÉDAGOGIE MAXIMALE, en attribuant une NOTE et une EXPLICATION à chaque question, sans exception.

${CORRECTION_PEDAGOGY}${courseBlock}

MISSION DE CORRECTION :
Pour CHAQUE question, tu dois produire une analyse pédagogique complète ET une note.

DONNÉES (les numéros "number" ci-dessous sont LA SEULE référence valide) :
${JSON.stringify(questionsDetail, null, 2)}

CE QUE TU DOIS GÉNÉRER POUR CHAQUE QUESTION (obligatoire, sans exception) :
1. "number" : REPRODUIS EXACTEMENT le numéro de la question dans les données (ex: "1.a", "2.c"). INTERDIT de renuméroter, de simplifier ou d'inventer un autre format.
2. "points" : la note décimale attribuée, entre 0 et maxPoints de la question.
3. "status" : "correct" (note max ou presque), "partial" (note intermédiaire), "wrong" (0 mais réponse fournie), "unanswered" (pas de réponse).
4. "explanation" : Explication complète (3-6 phrases), comme un prof qui explique la réponse attendue.
5. "steps" : Tableau des ÉTAPES DE CORRECTION (2 à 7) — OBLIGATOIRE pour TOUTE question de calcul (chaque étape du raisonnement chiffré) ET pour la dissertation (plan détaillé : introduction/problématique, thèses, arguments, exemples du cours, conclusion). Pour une question de restitution, "steps" liste les points clés attendus (1 à 3).
6. "concept" : La notion/théorème testée (une phrase).
7. "whyWrong" : Si l'élève a raté, explication de SON erreur précise.
8. "commonMistake" : L'erreur classique.
9. "toReview" : Ce qu'il faut revoir.
10. "betterMethod" : Une astuce (si pertinent).
11. "feedback" : Message encourageant adapté à SA réponse.

BARÈME STRICT — RÈGLES DE NOTATION (à appliquer rigoureusement) :
- Réponse complète et juste → points = maxPoints (status "correct").
- Réponse contenant une partie correcte (bonne méthode, résultat partiel, idée juste mal formulée) → points PARTIELS entre 0.25×maxPoints et 0.75×maxPoints (status "partial").
- Réponse fournie mais entièrement fausse → 0 (status "wrong").
- Aucune réponse (null, vide) → 0 et status "unanswered".
- ⚠️ INTERDIT FORMEL de donner 0 à une réponse non vide si elle contient des éléments justes. Si l'élève a la bonne démarche ou le bon résultat, il gagne des points.
- ⚠️ Chaque question DOIT avoir "points" ET "status" ET "explanation" — une correction sans note ou sans explication est invalide.

CALCUL DES POINTS — CAS PARTICULIERS
- QCM : compare la réponse de l'élève à correctAnswer. Correcte = points maximaux. Fausse ou absente = 0.
- Texte libre : évalue le FOND (idées justes, démarche, résultat), pas la forme.
- DISSERTATION (isDissertation=true) : l'élève devait traiter UNE des deux propositions. Identifie la proposition traitée ("chosenProposition", sinon déduis-la de sa copie). Évalue : le plan (introduction avec problématique, développement argumenté, conclusion), le respect du sujet choisi, la précision des connaissances et l'usage des mots du cours. Une copie partielle mais sérieuse gagne des points PARTIELS — jamais 0 si des idées justes figurent dessus. Dans "steps", rends le PLAN DE CORRECTION attendu.
- SCHÉMA (drawing) : évalue la présence des éléments exigés (repère, vecteurs, labels), pas la beauté du dessin.

${LATEX_RULES}

FORMAT JSON :
{
  "score": 15.5,
  "totalScore": 20,
  "percentage": 77,
  "grade": "Bien",
  "exercises": [
    {
      "number": 1,
      "explanation": "Bilan de l'exercice (2-3 phrases)",
      "advice": "Conseil pour progresser",
      "questions": [
        { "number": "1.a", "points": 1.33, "status": "correct", "explanation": "...", "steps": ["..."], "concept": "...", "whyWrong": null, "commonMistake": "...", "toReview": "...", "betterMethod": "...", "feedback": "..." },
        { "number": "1.b", "points": 0.5, "status": "partial", "explanation": "...", "steps": [], "concept": "...", "whyWrong": "...", "commonMistake": "...", "toReview": "...", "betterMethod": null, "feedback": "..." }
      ]
    }
  ],
  "revisionTopics": ["Notion 1", "Notion 2"],
  "globalFeedback": {
    "strengths": ["Point fort 1"],
    "weaknesses": ["Faiblesse 1"],
    "encouragement": "Message personnalisé"
  }
}

⚠️ Le tableau "exercises" doit contenir les exercices dans le MÊME ORDRE que les données, chaque exercice avec TOUTES ses questions, numéros EXACTS identiques aux données.

CONTRAT DE COMPLÉTION — ABSOLUMENT OBLIGATOIRE :
- Tu rends un verdict (points + status + explanation) pour CHAQUE question des données, SANS EXCEPTION, dans le même ordre.
- Si une réponse d'élève est ambiguë ou mal formulée, tranche avec ton meilleur jugement professionnel — ne saute JAMAIS une question et ne renvoie jamais un objet partiel.
- INTERDIT de renvoyer du texte hors JSON.

Réponds UNIQUEMENT avec l'objet JSON.`;
}

// ✅ v8.65a — composition d'un sujet : QCM 5 pts + exercices classiques 7 pts
// (NOMBRE DÉCIDÉ PAR L'IA, 2 à 3) + dissertation 8 pts (2 propositions).
// repairExamStructure répare tout écart et RENORMALISE les points à 20.
function round2(v) { return Math.round(Number(v) * 100) / 100; }

function repairQuestion(question, subjectName, eIdx, qIdx, forceChoice) {
  if (!question || typeof question !== 'object') question = {};
  if (!question.number) question.number = (eIdx + 1) + '.' + String.fromCharCode(97 + qIdx);
  if (!question.text) question.text = question.question || '';
  if (!Array.isArray(question.options) && Array.isArray(question.choices)) question.options = question.choices;
  if (forceChoice) {
    // QCM : 4 options A-D obligatoires, sinon la question devient "text"
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      question.type = 'text';
      delete question.options;
      delete question.correctAnswer;
    } else {
      question.type = 'choice';
      const letters = ['A', 'B', 'C', 'D'];
      question.options = question.options.map((opt, oi) => {
        const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || String(opt || ''));
        return { id: letters[oi], text: String(text || '').trim() || ('Option ' + letters[oi]) };
      });
      let correct = question.correctAnswer;
      if (correct === null || correct === undefined) correct = 'A';
      else if (typeof correct === 'number') correct = letters[correct] || 'A';
      else {
        correct = String(correct).toUpperCase().trim();
        if (['A', 'B', 'C', 'D'].indexOf(correct) === -1) correct = 'A';
      }
      question.correctAnswer = correct;
    }
  } else {
    if (!question.type) {
      question.type = (Array.isArray(question.options) && question.options.length === 4) ? 'choice' : 'text';
    }
    if (question.type === 'choice') {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        question.type = 'text';
        delete question.options;
        delete question.correctAnswer;
      } else {
        const letters = ['A', 'B', 'C', 'D'];
        question.options = question.options.map((opt, oi) => {
          const text = typeof opt === 'string' ? opt : (opt?.text || opt?.label || String(opt || ''));
          return { id: letters[oi], text: String(text || '').trim() || ('Option ' + letters[oi]) };
        });
        let correct = question.correctAnswer;
        if (correct === null || correct === undefined) correct = 'A';
        else if (typeof correct === 'number') correct = letters[correct] || 'A';
        else {
          correct = String(correct).toUpperCase().trim();
          if (['A', 'B', 'C', 'D'].indexOf(correct) === -1) correct = 'A';
        }
        question.correctAnswer = correct;
      }
    } else {
      delete question.options;
      delete question.correctAnswer;
    }
    if (!CHOICE_SUBJECTS.has(subjectName) && question.type === 'choice') {
      question.type = 'text';
      delete question.options;
      delete question.correctAnswer;
    }
    // ✅ RÈGLE SPÉCIALE PHYSIQUE : la première question du PREMIER exercice
    // classique reste un schéma (le QCM n'est pas concerné).
    if (subjectName === 'physique' && eIdx === 1 && qIdx === 0) {
      question.type = 'drawing';
      delete question.options;
      delete question.correctAnswer;
      if (!String(question.text).toLowerCase().includes('schéma') && !String(question.text).toLowerCase().includes('dessin')) {
        question.text = "Faire le schéma du dispositif en précisant le repère et les vecteurs. " + question.text;
      }
    }
  }
  return question;
}

function repairExamStructure(exam, subjectName, expectedSubjects) {
  if (!exam || typeof exam !== 'object') return null;
  const supportsChoices = CHOICE_SUBJECTS.has(subjectName);
  // ✅ v8.73a — Entraînement (1 sujet attendu) : on ne clone JAMAIS un sujet
  // unique en « Sujet 2 » — l'élève doit voir SON sujet unique, pas deux copies.
  const wantSubjects = Number(expectedSubjects) === 1 ? 1 : 2;

  if (!Array.isArray(exam.subjects)) {
    if (Array.isArray(exam.exams)) exam.subjects = exam.exams;
    else if (Array.isArray(exam.sujets)) exam.subjects = exam.sujets;
    else return null;
  }
  if (exam.subjects.length === 0) return null;
  if (exam.subjects.length === 1 && wantSubjects === 2) {
    const copy = JSON.parse(JSON.stringify(exam.subjects[0]));
    copy.id = 'subject_2';
    copy.title = 'Sujet 2 — Approfondissement';
    copy.level = 'approfondissement';
    copy.instructions = 'Approfondit votre maîtrise.';
    exam.subjects.push(copy);
  }
  exam.subjects = exam.subjects.slice(0, wantSubjects);

  exam.subjects.forEach((subject, sIdx) => {
    if (!subject.id) subject.id = 'subject_' + (sIdx + 1);
    if (!subject.title) subject.title = 'Sujet ' + (sIdx + 1);
    if (!subject.level) subject.level = sIdx === 0 ? 'consolidation' : 'approfondissement';
    subject.instructions = sIdx === 0
      ? 'Consolidez vos bases avec des exercices progressifs pour maîtriser l\'essentiel du chapitre.'
      : 'Allez plus loin avec des exercices exigeants pour viser le niveau BAC.';

    if (!Array.isArray(subject.exercises)) subject.exercises = [];
    subject.exercises = subject.exercises.filter((ex) => ex && typeof ex === 'object');

    // ── Sépare la dissertation (dernier bloc) si l'IA l'a mise ailleurs ──
    let dissertation = null;
    subject.exercises = subject.exercises.filter((ex) => {
      if (ex.dissertation === true) { dissertation = dissertation || ex; return false; }
      return true;
    });
    if (!dissertation && subject.exercises.length >= 2) {
      const last = subject.exercises[subject.exercises.length - 1];
      // L'IA a parfois appelé la dissertation « Exercice 3 » : si le DERNIER
      // exercice est déjà long/textuel (aucune question choice), on l'adopte.
      const allText = Array.isArray(last.questions) && last.questions.length <= 2 &&
        last.questions.every((q) => q && q.type !== 'choice');
      if (allText && String(last.title || '').toLowerCase().match(/dissert|composition|probl[eè]me|synth|essai/)) {
        dissertation = last;
        subject.exercises.pop();
      }
    }

    // ── 1. PARTIE QCM / QUESTIONS DE CONNAISSANCE (5 pts) ──
    const qcm = subject.exercises[0] || {};
    const qcmSource = Array.isArray(qcm.questions) ? qcm.questions.filter((q) => q && String(q.text || '').trim()) : [];
    const qcmQuestions = [];
    for (let i = 0; i < 5; i++) {
      const src = qcmSource[i];
      const q = repairQuestion(src ? JSON.parse(JSON.stringify(src)) : null, subjectName, 0, i, supportsChoices);
      q.points = 1;
      qcmQuestions.push(q);
    }
    // Les questions en trop du bloc QCM : on les garde comme exercice classique si l'IA en a livré plus de 5
    const extraQcm = qcmSource.slice(5).map((q, i) => repairQuestion(JSON.parse(JSON.stringify(q)), subjectName, 1, i, false));

    const qcmBlock = {
      number: 1,
      // ✅ le libellé suit le CONTENU réel (l'IA, le pool ou la matière peuvent
      // livrer des questions de connaissance plutôt qu'un vrai QCM)
      title: (supportsChoices && qcmQuestions.filter((q) => q.type === 'choice').length >= 3)
        ? 'QCM — Questions à choix multiples'
        : 'Questions de connaissance',
      points: 5,
      statement: qcm.statement || (supportsChoices ? 'Pour chaque question, entoure la bonne réponse. Une seule réponse est acceptée.' : 'Réponds brièvement et précisément à chaque question.'),
      questions: qcmQuestions
    };

    // ── 2. EXERCICES CLASSIQUES (7 pts au total, nombre = IA) ──
    const middles = subject.exercises.slice(1).filter((ex) => Array.isArray(ex.questions) && ex.questions.length > 0);
    if (extraQcm.length && middles.length) {
      middles[0].questions = (middles[0].questions || []).concat(extraQcm);
    } else if (extraQcm.length) {
      middles.push({ number: 1, title: 'Exercice 1', points: 0, statement: '', questions: extraQcm });
    }
    const repairedMiddles = middles.map((ex, i) => {
      const qs = (ex.questions || []).filter((q) => q && String(q.text || '').trim()).slice(0, 5);
      return {
        number: i + 2,
        title: ex.title || ('Exercice ' + (i + 2)),
        points: Number(ex.points) || 0,
        statement: String(ex.statement || ''),
        questions: qs.map((q, qi) => repairQuestion(q, subjectName, i + 1, qi, false))
      };
    }).filter((ex) => ex.questions.length > 0);

    // Garde-fou : au moins UN exercice classique ; sinon on déplace 2 questions
    // de connaissance en exercice (l'épreuve reste complète).
    if (!repairedMiddles.length) {
      const moved = qcmQuestions.splice(3, 2).map((q, i) => ({ ...q, type: 'text', points: 3.5 / 2 }));
      qcmQuestions.push({
        number: '1.e', text: 'Reproduis et complète ton schéma/réponse du chapitre étudié (question de synthèse).', points: 1, type: 'text'
      });
      repairedMiddles.push({ number: 2, title: 'Exercice 2', points: 7, statement: '', questions: moved });
    }

    // ── 3. DISSERTATION (8 pts, 2 propositions) ──
    let dissertBlock = null;
    if (dissertation) {
      const qs = (Array.isArray(dissertation.questions) ? dissertation.questions : []).filter((q) => q && String(q.text || '').trim());
      const props = (Array.isArray(dissertation.propositions) ? dissertation.propositions : [])
        .filter((p) => p && (String(p.text || p.title || '').trim()))
        .slice(0, 2)
        .map((p, i) => ({
          id: String(p.id || String.fromCharCode(65 + i)).toUpperCase().slice(0, 1),
          title: String(p.title || ''),
          text: String(p.text || p.title || '')
        }));
      dissertBlock = {
        number: repairedMiddles.length + 2,
        title: 'Dissertation / Problème de synthèse',
        points: 8,
        dissertation: true,
        statement: String(dissertation.statement || ''),
        propositions: props.length === 2 ? props : null,
        questions: qs.slice(0, 1).map((q, qi) => repairQuestion(q, subjectName, repairedMiddles.length + 1, qi, false))
      };
      if (!dissertBlock.questions.length) {
        dissertBlock.questions = [{
          number: (repairedMiddles.length + 2) + '.a',
          text: 'Traite l\'une des deux propositions ci-dessus (introduction, développement argumenté, conclusion).',
          points: 8, type: 'text'
        }];
      }
      // Une seule proposition valide → pas de choix A/B possible : on retire
      // les propositions (la question unique reste posée normalement).
      if (dissertBlock.propositions && dissertBlock.propositions.length < 2) dissertBlock.propositions = null;
    }

    // ── ASSEMBLAGE + RENORMALISATION DES POINTS (total = 20) ──
    const finalExercises = [qcmBlock, ...repairedMiddles];
    if (dissertBlock) finalExercises.push(dissertBlock);

    // Cible : QCM 5 fixe ; dissertation 8 si présente ; le reste aux exercices classiques
    const hasDissert = Boolean(dissertBlock);
    const middleTarget = hasDissert ? 7 : 15;
    const middleSum = repairedMiddles.reduce((s, ex) => s + (Number(ex.points) || 0), 0) || 1;
    repairedMiddles.forEach((ex) => {
      ex.points = round2(((Number(ex.points) || 0) / middleSum) * middleTarget);
    });
    // Ajuste l'arrondi sur le dernier exercice classique
    const middleTotal = repairedMiddles.reduce((s, ex) => s + ex.points, 0);
    if (repairedMiddles.length) {
      const drift = round2(middleTarget - middleTotal);
      repairedMiddles[repairedMiddles.length - 1].points = round2(repairedMiddles[repairedMiddles.length - 1].points + drift);
    }

    subject.exercises = finalExercises;
    subject.totalPoints = 20;
  });

  return exam;
}

function validateGeneratedExam(exam, subjectName, expectedSubjects) {
  // ✅ v8.73a — le nombre de sujets attendu dépend du MODE : 2 en Examen blanc,
  // EXACTEMENT 1 en Entraînement (le prompt ne demande qu'un seul sujet).
  // Avant : la validation exigeait TOUJOURS 2 sujets → chaque épreuve
  // Entraînement conforme à 1 sujet était rejetée → « n'aboutit jamais ».
  const wantSubjects = Number(expectedSubjects) === 1 ? 1 : 2;
  const supportsChoices = CHOICE_SUBJECTS.has(subjectName);
  const validQuestion = (q) => {
    // ✅ v4.15 — une question SANS énoncé est inacceptable pour l'élève : invalide.
    if (!q || typeof q.text !== 'string' || !q.text.trim()) return false;
    if (!supportsChoices || q.type !== 'choice') return ['text', 'number', 'formula', 'choice', 'drawing'].indexOf(q.type) !== -1;
    return Array.isArray(q.options) && q.options.length === 4 && ['A', 'B', 'C', 'D'].indexOf(q.correctAnswer) !== -1;
  };
  return exam && Array.isArray(exam.subjects) && exam.subjects.length === wantSubjects &&
    exam.subjects.every((s) => {
      const exs = s.exercises;
      if (!Array.isArray(exs) || exs.length < 2 || exs.length > 6) return false;
      // Chaque exercice : au moins 1 question valide
      return exs.every((ex) => Array.isArray(ex.questions) && ex.questions.length >= 1 && ex.questions.every(validQuestion));
    });
}

// ✅ v4.15 — RATTRAPAGE "PRESQUE COMPLET" : une IA qui livre presque tout ne
// doit pas jeter tout le sujet (ni pire, montrer des questions vides). On
// remplace les questions fautives du QCM par des questions du pool puis on
// revalide STRICTEMENT. Si le pool ne suffit pas, le fournisseur suivant
// prend le relais.
const NEAR_MISS_MAX_EMPTY = 3;

function countEmptyQuestions(exam) {
  let n = 0;
  (exam && Array.isArray(exam.subjects) ? exam.subjects : []).forEach((s) =>
    ((s && s.exercises) || []).forEach((ex) =>
      ((ex && ex.questions) || []).forEach((q) => {
        if (!q || !String(q.text || '').trim()) n += 1;
      })
    )
  );
  return n;
}

function isNearMiss(exam, subjectName, expectedSubjects) {
  const empty = countEmptyQuestions(exam);
  if (empty === 0 || empty > NEAR_MISS_MAX_EMPTY) return false;
  const lenient = JSON.parse(JSON.stringify(exam));
  lenient.subjects.forEach((s) => (s.exercises || []).forEach((ex) =>
    (ex.questions || []).forEach((q) => {
      if (!String(q.text || '').trim()) q.text = 'placeholder';
    })
  ));
  return validateGeneratedExam(lenient, subjectName, expectedSubjects);
}

function patchExamFromPoolQuestions(exam, subjectName, poolExercises, chapter, expectedSubjects) {
  if (!exam || !Array.isArray(poolExercises) || !poolExercises.length) return null;
  const seen = new Set();
  exam.subjects.forEach((s) => (s.exercises || []).forEach((ex) => {
    seen.add(String(ex.title || '') + '|' + String(ex.statement || '').slice(0, 40));
  }));

  // ✅ v5.0 — rattrapage : seuls les exercices du régime de la matière ET
  // conformes (valideurs v5.0) servent au remplacement.
  const category = subjectCategory(subjectName);
  const wantedStyles = category === 'calcul' ? ['calc']
    : category === 'svt' ? ['svt', 'calc']
    : ['recit'];
  const pool = poolExercises.filter((p) =>
    p && wantedStyles.indexOf(p.genStyle || 'recit') !== -1 &&
    exerciseCompliant(p, subjectName, chapter) &&
    Array.isArray(p.questions) && p.questions.length >= 2 &&
    p.questions.every((q) => String(q.text || '').trim())
  );
  if (!pool.length) return null;

  let patched = false;
  exam.subjects.forEach((subject) => {
    (subject.exercises || []).forEach((ex, eIdx) => {
      if (ex.dissertation === true) return; // la dissertation n'est pas remplacée par un exercice de pool
      const hasEmpty = (ex.questions || []).some((q) => !String(q.text || '').trim());
      if (!hasEmpty) return;
      const sameLevel = pool.filter((p) => p.level === subject.level);
      const candidates = (sameLevel.length ? sameLevel : pool)
        .filter((p) => !seen.has(String(p.title || '') + '|' + String(p.statement || '').slice(0, 40)));
      // ✅ v4.16 — tirage ALÉATOIRE parmi les candidats : deux rattrapages ne
      // resservent pas mécaniquement le même exercice de secours.
      const pick = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
      if (!pick) return;
      seen.add(String(pick.title || '') + '|' + String(pick.statement || '').slice(0, 40));
      const keepPoints = ex.points;
      subject.exercises[eIdx] = {
        number: ex.number || (eIdx + 1),
        title: ex.dissertation ? ex.title : (pick.title || ('Exercice ' + (eIdx + 1))),
        points: keepPoints || pick.points || 6.67,
        statement: pick.statement || '',
        questions: pick.questions.slice(0, 5),
        ...(ex.dissertation ? { dissertation: true, propositions: ex.propositions } : {})
      };
      patched = true;
    });
  });

  if (!patched) return null;
  return repairExamStructure(exam, subjectName, expectedSubjects);
}

// ═════════════════════════════════════════════════════════════
// ✅ v5.0 — CONFORMITÉ DE CONTENU PAR CATÉGORIE (valideurs déterministes)
// Filet de sécurité CODE en plus du prompt : un examen qui viole son régime
// (décimales en Nombres complexes, calcul en Histoire...) est REJETÉ.
// ═════════════════════════════════════════════════════════════

// Détecte un nombre décimal (3,5 / 3.5 / 0{,}25...) dans un texte.
const DECIMAL_RE = /(?:^|[^\w\d.])\d{1,6}[.,]\d+/;

function hasDecimalNumber(text) {
  return DECIMAL_RE.test(String(text || '').replace(/\{,\}/g, ','));
}

// Exercice lié aux nombres complexes (utile en tirage « tous les chapitres »).
const COMPLEX_RE = /complex|module|argument|affixe|forme\s+(alg[eé]brique|trigonom[eé]trique|exponentielle)|z\s*=|z[_{^]|\bRe\b|\bIm\b|partie\s+(r[eé]elle|imaginaire)/i;

function exerciseIsComplexRelated(exercise) {
  const texts = [exercise.statement].concat((exercise.questions || []).map((q) => q && q.text));
  return texts.some((t) => COMPLEX_RE.test(String(t || '')));
}

// Tâche de calcul dans une matière littéraire (interdite).
function isCalculationTask(text) {
  const t = String(text || '');
  if (/\$[^$]+\$/.test(t)) return true; // LaTeX mathématique interdit en littéraire
  return /\bcalcul/i.test(t); // « Calculer », « Calcule », « calcul de la valeur »…
}

function collectExerciseTexts(exercise) {
  const texts = [String(exercise.statement || '')];
  (exercise.questions || []).forEach((q) => {
    if (!q) return;
    texts.push(String(q.text || ''));
    (Array.isArray(q.options) ? q.options : []).forEach((o) =>
      texts.push(String((o && o.text) || o || '')));
  });
  return texts;
}

function exerciseCompliant(exercise, subjectName, chapter) {
  if (!exercise) return false;
  const category = subjectCategory(subjectName);
  const texts = collectExerciseTexts(exercise);

  // 1) Littéraires : ZÉRO calcul, ZÉRO LaTeX mathématique.
  if (category === 'litteraire' && texts.some(isCalculationTask)) return false;

  // 2) Maths : zéro décimale dès que l'exercice touche aux nombres complexes
  //    (chapitre « Nombres complexes », ou exercice identifié complexe en
  //    tirage « tous les chapitres »).
  if (subjectName === 'mathematiques') {
    const complexChapter = /complex/i.test(String(chapter || ''));
    if (complexChapter || exerciseIsComplexRelated(exercise)) {
      if (texts.some(hasDecimalNumber)) return false;
    }
  }
  return true;
}

function validateContentCompliance(exam, subjectName, chapter) {
  if (!exam || !Array.isArray(exam.subjects)) return false;
  return exam.subjects.every((s) =>
    (s.exercises || []).every((ex) => exerciseCompliant(ex, subjectName, chapter)));
}

// ═════════════════════════════════════════════════════════════
// ✅ v5.0 — PASSE DE RÉSOLUTION PRÉALABLE (exigence : « il traite d'abord, il
// fournit ensuite »). Après la génération, un 2e appel IA RÉSOUT chaque
// question. Les réponses vérifiées sont attachées à l'examen (et réutilisées
// par la correction) ; les questions défectueuses sont REMPLACÉES.
// ═════════════════════════════════════════════════════════════

// ✅ v5.0b — normalisation pour le contrôle d'alignement des solutions.
function normPrefix(text, n) {
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, n);
}

// ✅ v5.1 — les questions d'un même format commencent toutes pareil (« Réponds
// par VRAI ou FAUX et justifie », « QCM », « Sélectionnez la bonne réponse »...) :
// ce préfixe GÉNÉRIQUE est retiré avant comparaison, sinon toutes les questions
// VF se ressemblent et de mauvaises solutions passent l'alignement.
function stripGenericPrefix(s) {
  return String(s || '')
    .replace(/^(reponds? par|repondre par)?\s*(vrai ou faux|qcm|selectionnez la bonne reponse|choisissez la bonne reponse|choisis la bonne reponse|jugez|justifie[z]?|citez|definissez|expliquez|analyserez?|analysez)/, '')
    .replace(/^\s*(le|la|les|l|de la|du|des|d)\s+/, '')
    .trim();
}

// L'écho du vérificateur correspond-t-il à la vraie question ? Comparaison de
// JACCARD (≥ 0,5) sur les 8 premiers mots normalisés OU préfixe commun ≥ 14 car.
function echoFits(echo, actual) {
  if (!echo || !actual) return true;
  const e = stripGenericPrefix(echo);
  const a = stripGenericPrefix(actual);
  if (!e || !a) return true;
  if (e === a) return true;
  const we = e.split(' ').filter(Boolean).slice(0, 8);
  const wa = a.split(' ').filter(Boolean).slice(0, 8);
  const setA = new Set(wa);
  let inter = 0;
  we.forEach((w) => { if (setA.has(w)) inter += 1; });
  const union = new Set(we.concat(wa)).size;
  if (union && inter / union >= 0.5) return true;
  const short = Math.min(e.length, a.length);
  if (short >= 14 && e.slice(0, 14) === a.slice(0, 14)) return true;
  return false;
}

// ✅ v5.1 — CLÉS UNIQUES : les deux sujets utilisent tous les deux « 1.a »…
// « 3.e » ; s'en remettre au numéro seul écrasait les solutions du Sujet 1 par
// celles du Sujet 2 (30 % de réponses fausses lors des tests live). Chaque
// question reçoit une clé « s1.2.c » / « s2.3.e » utilisée partout.
function questionKey(subjectIdx, qNumber) {
  return 's' + (subjectIdx + 1) + '.' + String(qNumber || '');
}

function compactExamForVerification(exam) {
  return (exam.subjects || []).map((s, sIdx) => ({
    level: s.level,
    exercises: (s.exercises || []).map((ex) => ({
      number: ex.number,
      statement: ex.statement,
      questions: (ex.questions || []).map((q) => ({
        key: questionKey(sIdx, q.number),
        number: q.number,
        text: q.text,
        type: q.type,
        options: Array.isArray(q.options) ? q.options.map((o) => (o && o.text) || '') : undefined,
        correctAnswer: q.correctAnswer || undefined
      }))
    }))
  }));
}

function verificationPrompt(exam, subjectName, chapter) {
  const subjectLabel = SUBJECT_LABELS[subjectName] || subjectName;
  const category = subjectCategory(subjectName);
  const chapterLabel = chapter === 'all' ? 'tous les chapitres' : chapter;
  return `Tu es un professeur VÉRIFICATEUR du BAC en Afrique francophone. On te donne un examen de ${subjectLabel} (chapitre : ${chapterLabel}) DÉJÀ rédigé par un autre professeur. Ton rôle : TRAITER toi-même CHAQUE question (tous les calculs, toutes les réponses rédigées), PUIS déclarer si la question est fiable.

⚠️ ALIGNEMENT STRICT : chaque réponse doit répondre à LA question dont tu recopies le début ET dont tu reprends la "key" — jamais à une autre question de l'examen. Traite les questions DANS L'ORDRE, une par une (les clés s1.* = Sujet 1, s2.* = Sujet 2 : NE LES CONFONDS PAS).

⚠️ AUTO-CONTRÔLE PAR SUBSTITUTION (obligatoire pour tout calcul) : après avoir calculé un résultat, REMPLACE-le dans l'expression de départ et vérifie que l'égalité est vraie (ex. une racine d'équation doit ANNULER l'équation ; une forme algébrique doit redonner l'original quand on redivise). Si la substitution échoue, RECOMMENCE le calcul avant de livrer la réponse.

⚠️ CONTRÔLE FACTUEL (histoire, géographie, philosophie, SVT) : vérifie chaque DATE, ACTEUR, LIEU, ÉVÉNEMENT, mécanisme biologique cité dans tes réponses. Un fait faux ou une question dont l'énoncé suppose un fait CONTREFAITUAL = verdict "defaut" avec fix.

NATURE DE LA MATIÈRE : ${CATEGORY_LABELS[category] || ''}.
DÉFAUTS À SIGNALER (verdict "defaut" + fix obligatoire) :
- question IMPOSSIBLE, ambiguë, ou dont les données de l'énoncé ne suffisent pas ;
- INCOHÉRENCE INTERNE dans l'énoncé (données contradictoires entre elles, tableau qui contredit le texte) ;
- résultat INEXISTANT, absurde, ou mal calibré pour le niveau BAC ;
- en Mathématiques : valeur décimale non exacte là où des valeurs EXACTES sont attendues (surtout Nombres complexes : jamais 3,5i, jamais 2,75+1,5i) ;
- matière littéraire : question qui exige un CALCUL ou une opération arithmétique ;
- SVT : question de calcul pur dans un chapitre non chiffré ;
- question "choice" dont la bonne réponse (correctAnswer) est FAUSSE ou douteuse ;
- tout fait historique/géographique/biologique FAUX dans l'énoncé ou dans la réponse attendue.

EXAMEN À VÉRIFIER (JSON) :
${JSON.stringify({ subjects: compactExamForVerification(exam) })}

FORMAT DE TA RÉPONSE — UNIQUEMENT ce JSON :
{
  "solutions": [ { "key": "s1.1.a", "question": "REPRODUIS les 6 premiers mots de la question à laquelle TU réponds", "answer": "réponse finale concise (1-2 phrases) qui répond EXACTEMENT à CETTE question", "verdict": "ok" ou "defaut" } ],
  "fixes": [ { "key": "s2.2.c", "problem": "le défaut constaté", "newQuestion": { "key": "s2.2.c", "text": "question CORRIGÉE, même clé, même type, cohérente avec l'énoncé de l'exercice", "options": [ {"id": "A", "text": "..."}, {"id": "B", "text": "..."}, {"id": "C", "text": "..."}, {"id": "D", "text": "..."} ], "correctAnswer": "B" }, "newAnswer": "réponse corrigée que TU as vérifiée" } ]
}
CONTRAT :
- "solutions" : UNE entrée par question (même "key" que dans l'examen : "s1.1.a", "s1.1.b"... puis "s2.1.a"...), AUCUNE exception, DANS L'ORDRE de l'examen.
- Pour une question « Vrai ou Faux », la réponse COMMENCE par « Vrai » ou « Faux » puis justifie.
- Pour une question à options, la réponse commence par la LETTRE de la bonne option (ex. « B. ... »).
- verdict "defaut" → tu DOIS fournir le fix correspondant (même "key") avec la question corrigée que TU as résolue.
- Si tout est fiable : "fixes" = [].
- Réponds UNIQUEMENT avec le JSON valide.`;
}

// ✅ v5.2 — RÉCUPÉRATION D'UNE RÉPONSE TRONQUÉE : la passe de vérification
// produit 30 solutions longues ; si la sortie est coupée en plein milieu, on
// extrait quand même les entrées complètes du tableau "solutions" (mieux vaut
// 27/30 solutions vérifiées que 0).
// Parse une entrée extraite d'un JSON tronqué : tente brut, puis échappements
// globaux, puis doublement de tout backslash lettre. Si le parse brut réussit
// MAIS contient des caractères de contrôle (\f, \t, \b — signature d'un \frac
// mal échappé), on retente les candidats réparés.
// Signature d'une corruption de type backslash-frac / backslash-tan mal échappé :
// caractères de contrôle form-feed/tab/backspace DANS LES VALEURS parsées
// (JSON.stringify les ré-échapperait, il faut donc tester les valeurs brutes).
function hasControlChars(o) {
  if (typeof o === 'string') return /[\u0008\u000C\u0009]/.test(o);
  if (Array.isArray(o)) return o.some(hasControlChars);
  if (o && typeof o === 'object') return Object.values(o).some(hasControlChars);
  return false;
}

function salvageEntryParse(str) {
  const candidates = [str,
    repairAllEscapes(str),
    String(str).replace(/(?<!\\)\\(?=[A-Za-z])/g, '\\\\')];
  let firstOk = null;
  for (let k = 0; k < candidates.length; k++) {
    try {
      const o = JSON.parse(candidates[k]);
      if (hasControlChars(o)) {
        if (!firstOk) firstOk = o; // corruption probable → on tente mieux
        continue;
      }
      return o;
    } catch (_) {}
  }
  return firstOk;
}

function salvageSolutions(raw) {
  const s = String(raw || '');
  const idx = s.indexOf('"solutions"');
  if (idx === -1) return [];
  let i = s.indexOf('[', idx);
  if (i === -1) return [];
  i += 1;
  const out = [];
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (s[i] !== '{') break;
    let depth = 0, inStr = false, esc = false, j = i;
    for (; j < s.length; j += 1) {
      const c = s[j];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) break; // objet incomplet (tronqué) → on s'arrête
    const entry = salvageEntryParse(s.slice(i, j + 1));
    if (entry && (entry.key || entry.number)) out.push(entry);
    i = j + 1;
    while (i < s.length && s[i] !== ',' && s[i] !== ']') i += 1;
    if (s[i] === ']') break;
    i += 1;
  }
  return out;
}

async function verifyWithFallback(exam, subjectName, chapter) {
  const providers = getProviders();
  for (const provider of providers) {
    try {
      console.log('[VERIFY] Tentative ' + provider.name + '...');
      const result = await callProvider(provider, verificationPrompt(exam, subjectName, chapter), MAX_TOKENS.CORRECT, 0.2);
      if (result && Array.isArray(result.solutions) && result.solutions.length) return result;
      console.warn('[VERIFY] ' + provider.name + ': format invalide');
    } catch (e) {
      // ✅ v5.2 — récupération des solutions complètes d'une sortie tronquée
      if (e && e.raw) {
        const salvaged = salvageSolutions(e.raw);
        if (salvaged.length) {
          console.warn('[VERIFY] ' + provider.name + ' tronqué — ' + salvaged.length + ' solutions complètes récupérées');
          return { solutions: salvaged, fixes: [], _salvaged: true };
        }
      }
      console.warn('[VERIFY] ' + provider.name + ' échec: ' + e.message);
    }
  }
  return null;
}

function applyVerification(exam, verification) {
  if (!verification || !Array.isArray(verification.solutions)) return exam;

  // ✅ v5.1 — indexation par position réelle : la clé sX. est recalculée depuis
  // la POSITION de la question (sujet/exercice/numéro) et croisée avec la clé
  // annoncée par le vérificateur. Fini l'écrasement Sujet 2 → Sujet 1.
  const questionByKey = new Map();
  (exam.subjects || []).forEach((s, sIdx) => (s.exercises || []).forEach((ex) =>
    (ex.questions || []).forEach((q) => {
      questionByKey.set(questionKey(sIdx, q.number), q);
    })));

  const solList = verification.solutions.filter((s) => s && (s.key || s.number) !== undefined);
  solList.forEach((s) => {
    const key = String(s.key !== undefined ? s.key : s.number);
    const q = questionByKey.get(key);
    if (!q) {
      console.warn('[VERIFY] Clé de solution inconnue ignorée : ' + key);
      return;
    }
    if (typeof s.answer !== 'string' || !s.answer.trim()) return;
    const answer = s.answer.trim();
    const echo = normPrefix(s.question || '', 30);
    const actual = normPrefix(q.text || '', 30);
    if (echo && actual && !echoFits(echo, actual)) {
      console.warn('[VERIFY] Solution ' + key + ' écartée : désalignement (« ' + echo.slice(0, 24) + '… » ≠ « ' + actual.slice(0, 24) + '… »)');
      return;
    }
    // Garde VRAI/FAUX : une question VF exige une réponse qui tranche d'abord.
    if (/vrai\s*(ou|\/)\s*faux/i.test(String(q.text || '')) &&
        !/^(vrai|faux|c'est\s+(vrai|faux))/i.test(answer)) {
      console.warn('[VERIFY] Solution ' + key + ' écartée : VRAI/FAUX non tranché.');
      return;
    }
    q.solution = answer.slice(0, 600);
  });

  // 2) Questions défectueuses → remplacées par la version corrigée (déjà résolue).
  const fixes = Array.isArray(verification.fixes) ? verification.fixes : [];
  fixes.forEach((f) => {
    if (!f) return;
    const key = String(f.key !== undefined ? f.key : (f.number !== undefined ? f.number : ''));
    const q = questionByKey.get(key);
    if (!q) {
      console.warn('[VERIFY] Clé de fix inconnue ignorée : ' + key);
      return;
    }
    const nq = f.newQuestion;
    if (nq && typeof nq.text === 'string' && nq.text.trim()) q.text = nq.text.trim();
    if (nq && Array.isArray(nq.options) && nq.options.length === 4 &&
        /^[A-D]$/.test(String(nq.correctAnswer || ''))) {
      const letters = ['A', 'B', 'C', 'D'];
      q.type = 'choice';
      q.options = nq.options.map((opt, oi) => {
        const text = typeof opt === 'string' ? opt : (opt && opt.text) || '';
        return { id: letters[oi], text: String(text || '').trim() || ('Option ' + letters[oi]) };
      });
      q.correctAnswer = String(nq.correctAnswer).toUpperCase();
    }
    if (typeof f.newAnswer === 'string' && f.newAnswer.trim()) {
      q.solution = f.newAnswer.trim().slice(0, 600);
    }
  });

  return exam;
}

async function generateWithFallback(prompt, subjectName, poolLoader, chapter, expectedSubjects) {
  const providers = getProviders();
  if (!providers.length) throw new Error('provider_missing');

  const startTime = Date.now();
  // ✅ v8.73a — budget 70 s (< maxDuration 90) : même sur les fournisseurs
  // lents (Gemini ~40-60 s pour un examen JSON complet), le handler RENTRE
  // TOUJOURS par lui-même (épreuve ou repli propre) — fini les réponses
  // coupées par le plateau qui laissaient l'élève sur un écran sans fin.
  const TIME_BUDGET_MS = 70000;
  const errors = [];

  for (let i = 0; i < providers.length; i++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIME_BUDGET_MS) {
      errors.push('time_budget_exceeded');
      break;
    }

    const provider = providers[i];
    try {
      console.log('[AI] Tentative ' + provider.name + '...');
      const remainingMs = Math.max(6000, TIME_BUDGET_MS - (Date.now() - startTime));
      let rawExam = await callProvider(provider, prompt, MAX_TOKENS.GENERATE, GEN_TEMPERATURE, remainingMs);
      rawExam = repairExamStructure(rawExam, subjectName, expectedSubjects);

      // ✅ v5.0 — validité structurelle + CONFORMITÉ DE RÉGIME (valideurs v5.0)
      if (validateGeneratedExam(rawExam, subjectName, expectedSubjects) &&
          validateContentCompliance(rawExam, subjectName, chapter)) {

        // ✅ v5.0 — PASSE DE RÉSOLUTION : l'IA traite l'examen AVANT livraison.
        // ✅ v8.73a — on ne lance la vérification que si la génération a été
        // RAPIDE (marge ≥ 25 s devant le budget 60 s) : une génération lente
        // livre SANS la passe plutôt que de dépasser le délai côté élève.
        if (Date.now() - startTime < TIME_BUDGET_MS - 25000) {
          const verification = await verifyWithFallback(rawExam, subjectName, chapter);
          if (verification) {
            rawExam = applyVerification(rawExam, verification);
            rawExam = repairExamStructure(rawExam, subjectName, expectedSubjects);
          }
        }

        // Re-validation après vérification ; si la passe a dégradé l'examen,
        // le fournisseur suivant reprend la main.
        if (validateGeneratedExam(rawExam, subjectName, expectedSubjects) &&
            validateContentCompliance(rawExam, subjectName, chapter)) {
          console.log('[AI] OK ' + provider.name + ' (vérifié)');
          return { exam: rawExam, provider: provider.name };
        }
        errors.push(provider.name + ': vérification dégradée');
      }

      // ✅ v4.15 — rattrapage "presque complet" via le pool avant de rejeter
      if (isNearMiss(rawExam, subjectName, expectedSubjects) && typeof poolLoader === 'function') {
        const pool = await poolLoader().catch(() => null);
        if (pool && pool.length) {
          const patched = patchExamFromPoolQuestions(rawExam, subjectName, pool, chapter, expectedSubjects);
          if (patched && validateGeneratedExam(patched, subjectName, expectedSubjects) &&
              validateContentCompliance(patched, subjectName, chapter)) {
            console.log('[AI] OK ' + provider.name + ' (+rattrapage pool)');
            return { exam: patched, provider: provider.name + '+pool' };
          }
        }
      }

      errors.push(provider.name + ': structure/conformité invalide');
    } catch (error) {
      errors.push(provider.name + ': ' + error.message);
      console.warn('[AI] FAIL ' + provider.name + ': ' + error.message);
    }
  }
  throw new Error('all_providers_failed: ' + errors.join(' | '));
}

// ═══════════════════════════════════════════════════════════════
// CORRECTION ROBUSTE — matching, cohérence, explications garanties
// ═══════════════════════════════════════════════════════════════

function normQNumber(n) {
  // "1.a" / "1-A" / "1a" / "1 )" → "1a" — comparaison tolérante des numéros
  return String(n === null || n === undefined ? '' : n).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickAiNumber(aiQ) {
  return aiQ.number ?? aiQ.num ?? aiQ.questionNumber ?? aiQ.qNumber ?? aiQ.id ?? '';
}

function pickAiPoints(aiQ, maxQ) {
  const raw = aiQ.points ?? aiQ.note ?? aiQ.pts ?? (aiQ.score !== undefined && aiQ.score !== null && Number(aiQ.score) <= maxQ * 1.02 ? aiQ.score : undefined);
  let p = Number(raw);
  if (!isFinite(p) || raw === null || raw === undefined) return null;
  if (p > maxQ * 1.02) {
    // L'IA a parfois noté sur 20 alors que la question vaut maxQ : ramener à l'échelle
    if (p <= 20 && maxQ > 0) p = (p / 20) * maxQ;
    else p = maxQ;
  }
  return Math.max(0, Math.min(maxQ, p));
}

function pickAiStatus(aiQ) {
  const s = String(aiQ.status ?? aiQ.verdict ?? aiQ.result ?? '').toLowerCase();
  if (s.includes('part') || s.includes('moyen')) return 'partial';
  if (s.includes('correct') || s.includes('juste') || s.includes('bonne')) return 'correct';
  if (s.includes('wrong') || s.includes('faux') || s.includes('incorrect') || s.includes('false')) return 'wrong';
  if (s.includes('unanswered') || s.includes('empty') || s.includes('sans réponse') || s.includes('vide')) return 'unanswered';
  return '';
}

const STOPWORDS = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'au', 'aux', 'en', 'dans', 'pour', 'par', 'sur', 'que', 'qui', 'quoi', 'est', 'sont', 'ce', 'cet', 'cette', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs', 'il', 'elle', 'ils', 'elles', 'on', 'nous', 'vous', 'je', 'tu', 'se', 'plus', 'moins', 'comme', 'donc', 'alors', 'avec', 'sans', 'tout', 'toute', 'tous', 'toutes', 'etre', 'avoir', 'the', 'and', 'for', 'with', 'this', 'that']);

function tokenizeForSim(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{3,}/g)
    ?.filter((w) => !STOPWORDS.has(w)) || [];
}

function similarityScore(studentText, expectedText) {
  const st = tokenizeForSim(studentText);
  const ex = tokenizeForSim(expectedText);
  if (st.length === 0 || ex.length === 0) return 0;
  const exSet = new Set(ex);
  let hit = 0;
  st.forEach((w) => { if (exSet.has(w)) hit++; });
  return hit / ex.length; // couverture des éléments attendus
}

function letterFromAiCorrectAnswer(aiAnswer, options) {
  const raw = String(aiAnswer || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  let m = upper.match(/^([ABCD])(?![A-Z])/) || upper.match(/^\(?([ABCD])\)?[).\:\s]/);
  if (m) return m[1];
  if (Array.isArray(options)) {
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const target = norm(raw);
    const found = options.find((o) => norm(o && o.text) === target || norm(o && o.id) === target);
    if (found && found.id) return String(found.id).toUpperCase();
  }
  return null;
}

function isAnswered(a) {
  return a !== null && a !== undefined && String(a).trim() !== '';
}

function mergeAiCorrection(deterministicResults, aiResult) {
  if (!aiResult || !Array.isArray(aiResult.exercises)) return;

  aiResult.exercises.forEach((aiEx, exIdx) => {
    let target = deterministicResults[exIdx];
    if (!target && aiEx && aiEx.number !== undefined) {
      target = deterministicResults.find((r) => String(r.exerciseResult.number) === String(aiEx.number));
    }
    if (!target) return;

    const aiQuestions = Array.isArray(aiEx.questions) ? aiEx.questions
      : Array.isArray(aiEx.results) ? aiEx.results
      : Array.isArray(aiEx.answers) ? aiEx.answers
      : [];
    const matched = new Set();

    aiQuestions.forEach((aiQ) => {
      if (!aiQ || typeof aiQ !== 'object') return;
      const numKey = normQNumber(pickAiNumber(aiQ));
      let match = null;
      if (numKey) {
        match = target.exerciseResult.questions.find((q) => !matched.has(q) && normQNumber(q.number) === numKey);
      }
      if (!match) {
        match = target.exerciseResult.questions.find((q) => !matched.has(q) && q.status === 'pending');
      }
      if (!match) return;
      matched.add(match);

      // 1) Champs pédagogiques (toujours, même pour les QCM déjà notés)
      if (aiQ.explanation) match.explanation = String(aiQ.explanation);
      if (Array.isArray(aiQ.steps) && aiQ.steps.length > 0) match.steps = aiQ.steps.map((s) => String(s));
      else if (typeof aiQ.steps === 'string' && aiQ.steps.trim()) match.steps = [aiQ.steps.trim()];
      if (aiQ.concept) match.concept = String(aiQ.concept);
      if (aiQ.whyWrong) match.whyWrong = String(aiQ.whyWrong);
      if (aiQ.commonMistake) match.commonMistake = String(aiQ.commonMistake);
      if (aiQ.toReview) match.toReview = String(aiQ.toReview);
      if (aiQ.betterMethod) match.betterMethod = String(aiQ.betterMethod);
      if (aiQ.feedback) match.feedback = String(aiQ.feedback);
      if (aiQ.correctAnswer && !match.correctAnswer) match.correctAnswer = String(aiQ.correctAnswer);

      // 2) QCM resté en attente faute de correctAnswer : re-note dès que l'IA le fournit
      if (String(match.type).toLowerCase() === 'choice' && match.status === 'pending') {
        const letter = letterFromAiCorrectAnswer(
          aiQ.correctAnswer || match.correctAnswer,
          target.exerciseResult._options ? target.exerciseResult._options[match.number] : null
        );
        if (letter) {
          match.correctAnswer = letter;
          const sa = String(match.studentAnswer || '').trim().toUpperCase();
          if (!isAnswered(match.studentAnswer)) {
            match.points = 0;
            match.status = 'unanswered';
          } else if (sa === letter) {
            match.points = Number(match.maxPoints) || 1.33;
            match.status = 'correct';
          } else {
            match.points = 0;
            match.status = 'wrong';
          }
        }
        return;
      }

      // 3) Note des questions texte en attente — JAMAIS de 0 silencieux
      if (match.status === 'pending') {
        if (!isAnswered(match.studentAnswer)) {
          match.points = 0;
          match.status = 'unanswered';
          return;
        }
        const maxQ = Number(match.maxPoints) || 1.33;
        let p = pickAiPoints(aiQ, maxQ);
        const st = pickAiStatus(aiQ);
        if (p === null && st === 'correct') p = maxQ;
        if (p === null && st === 'partial') p = round2(maxQ * 0.5);
        if (p === null && (st === 'wrong' || st === 'unanswered')) p = 0;
        if (p === null) {
          // L'IA n'a pas donné de note → note partielle prudente (jamais 0 par défaut)
          p = round2(maxQ * 0.5);
        }
        match.points = p;
        match.status = st || (p >= maxQ * 0.9 ? 'correct' : p > 0 ? 'partial' : 'wrong');
      }
    });

    if (aiEx.explanation) target.exerciseResult.explanation = String(aiEx.explanation);
    if (aiEx.advice) target.exerciseResult.advice = String(aiEx.advice);
  });
}

function enforceGradingCoherence(deterministicResults, aiGlobalScore) {
  let raw = 0;
  let maxAll = 0;
  let answeredTextCount = 0;
  let answeredTextMax = 0;

  deterministicResults.forEach((r) => {
    r.exerciseResult.questions.forEach((q) => {
      const maxQ = Number(q.maxPoints) || 1.33;
      maxAll += maxQ;
      const answered = isAnswered(q.studentAnswer);

      if (String(q.type).toLowerCase() === 'choice') {
        // QCM : note TOUJOURS déterministe
        if (!answered) {
          q.points = 0;
          q.status = 'unanswered';
        } else if (q.status === 'correct') {
          q.points = maxQ;
        } else {
          q.points = 0;
          if (q.status !== 'wrong' && q.status !== 'unanswered') q.status = 'wrong';
        }
      } else if (!answered) {
        q.points = 0;
        q.status = 'unanswered';
      } else {
        answeredTextCount++;
        answeredTextMax += maxQ;
        let p = Math.max(0, Math.min(maxQ, Number(q.points) || 0));
        if (q.status === 'correct' && p < maxQ * 0.8) p = maxQ; // le prof a validé → max
        if (p >= maxQ * 0.95) { p = maxQ; q.status = 'correct'; }
        else if (p > 0) { q.status = (q.status === 'correct') ? 'correct' : 'partial'; }
        else { q.status = 'wrong'; }
        q.points = round2(p);
      }
      raw += Number(q.points) || 0;
    });
  });

  // Filet de sécurité : l'IA donne un score global crédible mais la note calculée est nulle
  // alors que des réponses texte existent → redistribuer le score de l'IA (jamais 0 injuste).
  const s = Number(aiGlobalScore);
  if (isFinite(s) && s > 0.5 && raw < 0.5 && answeredTextCount > 0 && answeredTextMax > 0) {
    const targetSum = Math.min(answeredTextMax, (Math.min(20, s) / 20) * answeredTextMax);
    const per = targetSum / answeredTextCount;
    deterministicResults.forEach((r) => {
      r.exerciseResult.questions.forEach((q) => {
        const maxQ = Number(q.maxPoints) || 1.33;
        if (String(q.type).toLowerCase() !== 'choice' && isAnswered(q.studentAnswer)) {
          const p = Math.min(maxQ, per);
          q.points = round2(p);
          q.status = p >= maxQ * 0.95 ? 'correct' : p > 0 ? 'partial' : 'wrong';
        }
      });
    });
  }
}

function ensureEveryQuestionExplained(deterministicResults) {
  deterministicResults.forEach((r) => {
    r.exerciseResult.questions.forEach((q) => {
      const answered = isAnswered(q.studentAnswer);
      if (!q.explanation || !String(q.explanation).trim()) {
        if (String(q.type).toLowerCase() === 'choice') {
          if (q.status === 'correct') {
            q.explanation = `Bonne réponse : ${q.correctAnswer || '—'}. Tu as bien identifié la réponse attendue.`;
          } else if (q.status === 'unanswered') {
            q.explanation = q.correctAnswer
              ? `La bonne réponse était : ${q.correctAnswer}. Relis la question et retrouve cette information dans ton cours.`
              : 'Aucune réponse fournie pour cette question.';
          } else {
            q.explanation = q.correctAnswer
              ? `Ta réponse (${q.studentAnswer}) n'était pas la bonne. La bonne réponse était : ${q.correctAnswer}. Compare les deux options pour comprendre la nuance.`
              : 'Réponse incorrecte. Relis la question et ton cours sur ce point précis.';
          }
        } else if (!answered) {
          q.explanation = 'Aucune réponse fournie. Pour progresser : reprends la question au calme et mobilise le cours correspondant, même une réponse partielle rapporte des points.';
        } else {
          const base = q.correctAnswer ? `Réponse attendue : ${q.correctAnswer}. ` : '';
          q.explanation = base +
            (q.concept ? `Notion testée : ${q.concept}. ` : '') +
            "Le correcteur n'a pas pu produire d'analyse détaillée pour cette question cette fois-ci. Compare ta réponse aux éléments attendus et complète avec ton cours.";
        }
      }
      if (!q.feedback || !String(q.feedback).trim()) {
        q.feedback = q.status === 'correct' ? 'Très bien, continue comme ça !'
          : q.status === 'partial' ? 'Bonne base — il reste à préciser ta réponse.'
          : q.status === 'unanswered' ? "N'hésite pas à tenter une réponse la prochaine fois : même partielle, elle rapporte des points."
          : 'Reprends cette notion tranquillement : tu vas y arriver.';
      }
    });
    if (!r.exerciseResult.explanation || !String(r.exerciseResult.explanation).trim()) {
      const good = Number(r.exerciseResult.score) >= Number(r.exerciseResult.maxScore) * 0.5;
      r.exerciseResult.explanation = good
        ? 'Bilan : de solides bases sur cet exercice. Poursuis tes efforts pour viser le sans-faute.'
        : 'Bilan : cet exercice doit être revu. Reprends le cours correspondant, puis refais les questions manquées.';
    }
    if (!r.exerciseResult.advice || !String(r.exerciseResult.advice).trim()) {
      const good = Number(r.exerciseResult.score) >= Number(r.exerciseResult.maxScore) * 0.5;
      r.exerciseResult.advice = good
        ? "Continue à t'entraîner sur des exercices plus difficiles."
        : 'Revois les notions manquées avant de passer au prochain examen.';
    }
  });
}

function localFallbackCorrection(deterministicResults) {
  // L'IA est momentanément indisponible : on corrige localement pour TOUJOURS
  // donner une note et une explication (QCM déterministes + heuristique texte).
  deterministicResults.forEach((r) => {
    r.exerciseResult.questions.forEach((q) => {
      if (q.status !== 'pending') return;
      if (!isAnswered(q.studentAnswer)) {
        q.points = 0;
        q.status = 'unanswered';
        return;
      }
      const maxQ = Number(q.maxPoints) || 1.33;
      if (String(q.type).toLowerCase() === 'choice' && q.correctAnswer) {
        const sa = String(q.studentAnswer).trim().toUpperCase();
        const ca = String(q.correctAnswer).trim().toUpperCase();
        if (sa === ca) { q.points = maxQ; q.status = 'correct'; }
        else { q.points = 0; q.status = 'wrong'; }
        return;
      }
      if (q.correctAnswer) {
        const sim = similarityScore(q.studentAnswer, q.correctAnswer);
        if (sim >= 0.5) { q.points = maxQ; q.status = 'correct'; }
        else if (sim >= 0.25) { q.points = round2(maxQ * 0.5); q.status = 'partial'; }
        else { q.points = 0; q.status = 'wrong'; }
        return;
      }
      const t = String(q.studentAnswer).trim();
      const substantive = t.length >= 25 && t.split(/\s+/).length >= 5;
      q.points = round2(maxQ * (substantive ? 0.5 : 0.25));
      q.status = 'partial';
    });
  });
}

// ✅ v8.65a — PROMPT DE CORRECTION PAR LOTS (5 questions) : sortie compacte
// qui tient DANS le plafond des relais :free (3800 tokens) — fini les JSON
// tronqués. Le QCM est déjà noté côté serveur : l'IA ne voit que les
// questions rédigées / schémas / dissertation. Elle explique avec les MOTS
// DU COURS de l'élève (entraînement) et rend des ÉTAPES de correction.
function correctionChunkPrompt(items, notebookContext, includeSummary) {
  const courseBlock = (notebookContext && notebookContext.contentText)
    ? `

═══════════════════════════════════════════════
LE COURS DE CET ÉLÈVE (source pédagogique de vérité — chapitre : ${notebookContext.chapterTitle || ''})
═══════════════════════════════════════════════
${notebookContext.contentText}

RÈGLES DE CORRECTION AVEC LE COURS (obligatoires) :
- Utilise les MOTS EXACTS et les TECHNIQUES du cours ci-dessus dans "explanation", "concept", "betterMethod" et "toReview".
- Montre à l'élève COMMENT son cours répond à la question (définitions, formules, étapes telles qu'écrites dans sa leçon).
- Ne contredits JAMAIS le cours de l'élève : s'il est approximatif, corrige en t'appuyant d'abord sur sa formulation.
`
    : '';

  return `Tu es un professeur correcteur expert du BAC en Afrique francophone. Corrige avec une PÉDAGOGIE MAXIMALE les questions ci-dessous, chacune avec une NOTE précise et des ÉTAPES DE CORRECTION.${courseBlock}

QUESTIONS À CORRIGER (le QCM est déjà noté : ne corrige QUE ces questions) :
${JSON.stringify(items, null, 1)}

RÈGLES DE NOTATION (strictes) :
- Réponse complète et juste → points = max (status "correct").
- Partiellement juste → points PARTIELS entre 0.25 et 0.75 × max (status "partial").
- Réponse fournie mais fausse → 0 (status "wrong"). Aucune réponse → 0 (status "unanswered").
- INTERDIT de donner 0 à une réponse contenant des éléments justes.
- SCHÉMA (drawing) : évalue la présence des éléments exigés (repère, vecteurs, labels), pas la beauté.
- DISSERTATION (isDissertation=true) : l'élève devait traiter UNE des deux propositions. Évalue plan (intro/problématique, arguments, conclusion), respect du sujet choisi, usage des mots du cours. Copie partielle sérieuse = points PARTIELS, jamais 0.
- CHAQUE question : "steps" = tableau des ÉTAPES (calcul : chaque étape chiffrée ; dissertation : plan de correction ; restitution : points clés attendus, 1-3 items).

FORMAT JSON (UNIQUEMENT cet objet, sans texte autour) :
{
  "corrections": [
    { "number": "2.a", "points": 1.5, "status": "partial", "explanation": "2-4 phrases claires", "steps": ["étape 1", "étape 2"], "concept": "notion testée", "whyWrong": "son erreur précise ou null", "commonMistake": "...", "toReview": "...", "betterMethod": "astuce", "feedback": "message encourageant" }
  ]${includeSummary ? `,
  "revisionTopics": ["Notion à revoir 1", "Notion 2"],
  "globalFeedback": { "strengths": ["..."], "weaknesses": ["..."], "encouragement": "message personnalisé" }` : ''}
}

CONTRAT :
- "number" : EXACTEMENT le numéro de la question dans les données (jamais renuméroter).
- UNE entrée "corrections" par question des données, même ordre, AUCUNE exception.
- Réponds UNIQUEMENT avec l'objet JSON.`;
}

// ✅ v8.65a — même chaîne de secours que correctWithFallback, mais pour les
// lots : valide un tableau "corrections" (JSON plat) au lieu de "exercises".
async function correctChunkWithFallback(prompt, deadlineMs) {
  const providers = getProviders();
  if (!providers.length) throw new Error('provider_missing');
  const errors = [];
  for (const provider of providers) {
    try {
      // ✅ v8.73a — chaque appel reçoit le temps RESTANT du budget correction
      // (la fonction doit renvoyer avant le plateau Vercel, sinon 504).
      const remaining = deadlineMs ? Math.max(6000, deadlineMs - Date.now()) : undefined;
      const result = await callProvider(provider, prompt, MAX_TOKENS.CORRECT, undefined, remaining);
      if (!result || typeof result !== 'object') { errors.push(provider.name + ': résultat non-objet'); continue; }
      if (!Array.isArray(result.corrections) || result.corrections.length === 0) {
        errors.push(provider.name + ': corrections vide ou invalide');
        continue;
      }
      const okShape = result.corrections.every((c) => c && typeof c === 'object' && (c.number !== undefined));
      if (!okShape) { errors.push(provider.name + ': corrections mal formées'); continue; }
      return result;
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error('all_providers_failed: ' + errors.join(' | '));
}

// ✅ v8.65a — fusion des corrections par NUMÉRO DE QUESTION (indépendant du
// découpage en exercices) : remplit les champs pédagogiques + la note de
// TOUTE question encore en attente (pending) après la passe déterministe.
function mergeAiCorrectionsFlat(deterministicResults, corrections) {
  if (!Array.isArray(corrections)) return;
  const all = [];
  deterministicResults.forEach((r) => {
    (r.exerciseResult.questions || []).forEach((q) => all.push(q));
  });
  const matched = new Set();
  corrections.forEach((aiQ) => {
    if (!aiQ || typeof aiQ !== 'object') return;
    const numKey = normQNumber(pickAiNumber(aiQ));
    let match = null;
    if (numKey) match = all.find((q) => !matched.has(q) && normQNumber(q.number) === numKey);
    if (!match) match = all.find((q) => !matched.has(q) && q.status === 'pending' && String(q.type).toLowerCase() !== 'choice');
    if (!match) return;
    matched.add(match);

    // 1) Champs pédagogiques
    if (aiQ.explanation) match.explanation = String(aiQ.explanation);
    if (Array.isArray(aiQ.steps) && aiQ.steps.length > 0) match.steps = aiQ.steps.map((s) => String(s));
    else if (typeof aiQ.steps === 'string' && aiQ.steps.trim()) match.steps = [aiQ.steps.trim()];
    if (aiQ.concept) match.concept = String(aiQ.concept);
    if (aiQ.whyWrong) match.whyWrong = String(aiQ.whyWrong);
    if (aiQ.commonMistake) match.commonMistake = String(aiQ.commonMistake);
    if (aiQ.toReview) match.toReview = String(aiQ.toReview);
    if (aiQ.betterMethod) match.betterMethod = String(aiQ.betterMethod);
    if (aiQ.feedback) match.feedback = String(aiQ.feedback);
    if (aiQ.correctAnswer && !match.correctAnswer) match.correctAnswer = String(aiQ.correctAnswer);

    // 2) Note IA pour les questions rédigées encore en attente
    const maxPts = Number(match.maxPoints) || 1;
    if (match.status === 'pending' && String(match.type).toLowerCase() !== 'choice') {
      if (match.status === 'pending' && !isAnswered(match.studentAnswer)) {
        match.points = 0;
        match.status = 'unanswered';
      } else {
        const given = Number(aiQ.points);
        if (Number.isFinite(given)) {
          match.points = Math.max(0, Math.min(maxPts, given));
          if (match.points >= maxPts * 0.95) match.status = 'correct';
          else if (match.points > 0) match.status = 'partial';
          else match.status = 'wrong';
        }
      }
    }
  });
}

async function correctWithFallback(prompt) {
  const providers = getProviders();
  if (!providers.length) throw new Error('provider_missing');
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await callProvider(provider, prompt, MAX_TOKENS.CORRECT);

      if (!result || typeof result !== 'object') {
        errors.push(provider.name + ': résultat non-objet');
        continue;
      }
      if (!Array.isArray(result.exercises) || result.exercises.length === 0) {
        errors.push(provider.name + ': exercises vide ou invalide');
        continue;
      }
      const hasValidExercises = result.exercises.every((ex) =>
        ex && Array.isArray(ex.questions) && ex.questions.length > 0
      );
      if (!hasValidExercises) {
        errors.push(provider.name + ': questions manquantes dans un exercice');
        continue;
      }
      if (typeof result.score !== 'number' || isNaN(result.score)) {
        errors.push(provider.name + ': score invalide');
        continue;
      }

      return { result, provider: provider.name };
    } catch (error) {
      errors.push(provider.name + ': ' + error.message);
    }
  }
  throw new Error('all_providers_failed: ' + errors.join(' | '));
}

function correctQCMDeterministic(subject, subjectId, answers) {
  const exercises = [];
  subject.exercises.forEach((exercise, exIdx) => {
    const exRes = {
      number: exercise.number || (exIdx + 1),
      title: exercise.title || ('Exercice ' + (exIdx + 1)),
      score: 0,
      maxScore: 0,
      correctAnswers: 0,
      totalQuestions: exercise.questions.length,
      questions: [],
      wrongAnswers: [],
      explanation: '',
      advice: ''
    };
    const textQuestions = [];

    exercise.questions.forEach((question, qIdx) => {
      const key = subjectId + ':' + exIdx + ':' + qIdx;
      const studentAnswer = answers[key];
      const points = Number(question.points) || 1.33;
      exRes.maxScore += points;

      const qRes = {
        number: question.number || ((exIdx + 1) + '.' + (qIdx + 1)),
        questionText: question.text || '',
        type: question.type || 'text',
        studentAnswer: studentAnswer || null,
        correctAnswer: question.correctAnswer || null,
        points: 0,
        maxPoints: points,
        status: 'pending',
        feedback: '',
        explanation: '',
        steps: [],
        concept: '',
        whyWrong: null,
        commonMistake: null,
        toReview: null,
        betterMethod: null
      };

      if (question.type === 'choice' && Array.isArray(question.options)) {
        exRes._options = exRes._options || {};
        exRes._options[qRes.number] = question.options;
      }

      if (question.type === 'choice' && question.correctAnswer) {
        if (studentAnswer === question.correctAnswer) {
          qRes.status = 'correct';
          qRes.points = points;
          exRes.score += points;
          exRes.correctAnswers++;
        } else if (!studentAnswer) {
          qRes.status = 'unanswered';
        } else {
          qRes.status = 'wrong';
          exRes.wrongAnswers.push({
            number: qRes.number,
            studentAnswer,
            correctAnswer: question.correctAnswer,
            question: question.text
          });
        }
      } else {
        textQuestions.push({ exerciseIndex: exIdx, questionIndex: qIdx, questionResult: qRes });
      }
      exRes.questions.push(qRes);
    });
    exercises.push({ exerciseResult: exRes, textQuestions });
  });
  return exercises;
}

async function correctExamHybrid(exam, subjectId, answers, uid, notebookContext) {
  const subject = exam.subjects.find((s) => s.id === subjectId) || exam.subjects[0];
  if (!subject) throw new Error('subject_not_found');

  const hasAnyAnswer = Object.values(answers || {}).some(
    (a) => a !== null && a !== undefined && String(a).trim() !== ''
  );

  if (!hasAnyAnswer) {
    console.log('[EXAM] Aucune réponse fournie → note forcée à 0/20');

    const emptyExercises = subject.exercises.map((ex, exIdx) => ({
      number: ex.number || (exIdx + 1),
      title: ex.title || `Exercice ${exIdx + 1}`,
      score: 0,
      maxScore: Number(ex.points) || 6.67,
      correctAnswers: 0,
      totalQuestions: ex.questions.length,
      questions: ex.questions.map((q, qIdx) => ({
        number: q.number || `${exIdx + 1}.${qIdx + 1}`,
        questionText: q.text || '',
        type: q.type || 'text',
        studentAnswer: null,
        correctAnswer: q.correctAnswer || null,
        points: 0,
        maxPoints: Number(q.points) || 1.33,
        status: 'unanswered',
        feedback: 'Pas de réponse.',
        explanation: q.correctAnswer ? `La bonne réponse était : ${q.correctAnswer}` : 'Aucune réponse fournie.',
        steps: [],
        concept: '',
        whyWrong: null,
        commonMistake: null,
        toReview: null,
        betterMethod: null
      })),
      explanation: 'Aucune réponse fournie.',
      advice: 'Réponds aux questions la prochaine fois !'
    }));

    return {
      score: 0,
      totalScore: TOTAL_POINTS,
      percentage: 0,
      grade: 'Insuffisant',
      exercises: emptyExercises,
      revisionTopics: ['Revoir tout le chapitre'],
      globalFeedback: {
        strengths: [],
        weaknesses: ['Aucune réponse fournie'],
        encouragement: 'Il faut répondre aux questions pour être évalué !'
      }
    };
  }

  const deterministicResults = correctQCMDeterministic(subject, subjectId, answers);
  const hasTextQuestions = deterministicResults.some((r) => r.textQuestions.length > 0);

  let correctionMode = 'deterministic';
  let aiGlobalScore = null;

  if (hasTextQuestions) {
    try {
      // ✅ v8.65a — CORRECTION PAR LOTS : les relais IA :free plafonnent la
      // taille de sortie (~3800 tokens) ; un prompt unique de 15+ questions
      // tronquait le JSON. On corrige par paquets de 5 questions (QCM déjà
      // noté côté serveur), puis on fusionne par numéro de question.
      const pendingItems = [];
      deterministicResults.forEach((r) => {
        (r.exerciseResult.questions || []).forEach((q) => {
          if (String(q.type).toLowerCase() === 'choice') return; // QCM : déjà noté
          pendingItems.push({
            exerciseNumber: r.exerciseResult.number,
            exerciseTitle: r.exerciseResult.title || '',
            exerciseStatement: r.exerciseResult.statement || '',
            isDissertation: r.exerciseResult.dissertation === true,
            propositions: Array.isArray(r.exerciseResult.propositions) ? r.exerciseResult.propositions : null,
            chosenProposition: r.exerciseResult.dissertation === true
              ? (answers['dissertProp:' + (Number(r.exerciseResult.number) - 1)] || null) : null,
            number: q.number,
            questionText: q.questionText || q.text || '',
            type: q.type || 'text',
            points: Number(q.maxPoints) || 1,
            correctAnswer: q.correctAnswer || null,
            studentAnswer: q.studentAnswer || null,
            answered: isAnswered(q.studentAnswer)
          });
        });
      });

      const CHUNK_SIZE = 5;
      const chunks = [];
      for (let i = 0; i < pendingItems.length; i += CHUNK_SIZE) {
        chunks.push(pendingItems.slice(i, i + CHUNK_SIZE));
      }

      let aiMerged = 0;
      const collectedTopics = [];
      let collectedFeedback = null;
      // ✅ v8.73a — BUDGET CORRECTION 70 s (< maxDuration 90) : les lots après
      // le délai sont corrigés localement — l'élève reçoit TOUJOURS sa copie
      // corrigée (fini « jamais les épreuves jusqu'à la correction »).
      const CORR_DEADLINE = Date.now() + 70000;
      for (let ci = 0; ci < chunks.length; ci++) {
        const isLast = ci === chunks.length - 1;
        if (Date.now() > CORR_DEADLINE - 8000) {
          console.warn('[CORRECT] budget dépassé avant le lot ' + (ci + 1) + '/' + chunks.length + ' → correction locale du reste');
          // ✅ les questions restées « pending » reçoivent la correction locale
          // (ne touche QUE les pending : les lots déjà corrigés par l'IA sont préservés)
          localFallbackCorrection(deterministicResults);
          break;
        }
        const prompt = correctionChunkPrompt(chunks[ci], notebookContext, isLast);
        const aiResponse = await correctChunkWithFallback(prompt, CORR_DEADLINE);
        const corrections = (aiResponse && Array.isArray(aiResponse.corrections)) ? aiResponse.corrections : [];
        mergeAiCorrectionsFlat(deterministicResults, corrections);
        aiMerged += corrections.length;
        if (isLast) {
          if (Array.isArray(aiResponse.revisionTopics)) collectedTopics.push(...aiResponse.revisionTopics);
          if (aiResponse.globalFeedback) collectedFeedback = aiResponse.globalFeedback;
        }
      }

      if (aiMerged > 0) {
        if (collectedTopics.length) deterministicResults.revisionTopics = collectedTopics;
        if (collectedFeedback) deterministicResults.globalFeedback = collectedFeedback;
        correctionMode = 'ai';
        aiGlobalScore = null;
      } else {
        throw new Error('aucune correction IA exploitable');
      }
    } catch (error) {
      console.warn('AI correction failed → correction locale (note + explications garanties):', error.message);
      // ✅ L'IA est indisponible : on corrige QUAND MÊME localement. L'élève reçoit
      // toujours une note et une explication — jamais de correction refusée.
      localFallbackCorrection(deterministicResults);
      correctionMode = 'local';
      deterministicResults.globalFeedback = deterministicResults.globalFeedback || {};
      if (!Array.isArray(deterministicResults.globalFeedback.weaknesses) || deterministicResults.globalFeedback.weaknesses.length === 0) {
        deterministicResults.globalFeedback.weaknesses = ['Analyse détaillée momentanément indisponible : notes provisoires attribuées automatiquement.'];
      }
    }
  }

  enforceGradingCoherence(deterministicResults, correctionMode === 'ai' ? aiGlobalScore : null);
  ensureEveryQuestionExplained(deterministicResults);

  const finalExercises = deterministicResults.map((r) => r.exerciseResult);
  finalExercises.forEach((ex) => { delete ex._options; });

  let rawScore = 0;
  let maxPossibleScore = 0;
  finalExercises.forEach((ex) => {
    ex.questions.forEach((q) => {
      const qMax = Number(q.maxPoints) || 1.33;
      const qPts = Math.max(0, Math.min(qMax, Number(q.points) || 0));
      q.points = round2(qPts);
      q.maxPoints = round2(qMax);
      rawScore += qPts;
      maxPossibleScore += qMax;
      if (q.status === 'correct') ex.correctAnswers = (ex.correctAnswers || 0) + 1;
    });
  });

  let finalScore = maxPossibleScore > 0 ? (rawScore / maxPossibleScore) * TOTAL_POINTS : 0;
  finalScore = round2(Math.max(0, Math.min(TOTAL_POINTS, finalScore)));

  let sumExScore = 0;
  let sumExMax = 0;
  finalExercises.forEach((ex, idx) => {
    const isLast = idx === finalExercises.length - 1;
    const exMax = isLast
      ? round2(TOTAL_POINTS - sumExMax)
      : round2((ex.questions.reduce((s, q) => s + (Number(q.maxPoints) || 0), 0) / (maxPossibleScore || 1)) * TOTAL_POINTS);
    const exRaw = ex.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
    const exRawMax = ex.questions.reduce((s, q) => s + (Number(q.maxPoints) || 0), 0);
    const exScore = exRawMax > 0 ? round2((exRaw / exRawMax) * exMax) : 0;
    ex.maxScore = exMax;
    ex.score = Math.min(exScore, exMax);
    sumExMax += exMax;
    sumExScore += ex.score;
  });

  if (finalExercises.length > 0) {
    const last = finalExercises[finalExercises.length - 1];
    const drift = round2(finalScore - sumExScore);
    if (drift !== 0) {
      last.score = round2(Math.max(0, Math.min(last.maxScore, last.score + drift)));
    }
  }

  const percentage = Math.round((finalScore / TOTAL_POINTS) * 100);
  let grade = 'Insuffisant';
  if (percentage >= 90) grade = 'Excellent';
  else if (percentage >= 80) grade = 'Très bien';
  else if (percentage >= 70) grade = 'Bien';
  else if (percentage >= 60) grade = 'Assez bien';
  else if (percentage >= 50) grade = 'Passable';

  const revisionTopics = deterministicResults.revisionTopics || [];
  if (!revisionTopics.length) {
    finalExercises.forEach((ex) => {
      if (ex.score < ex.maxScore * 0.5) revisionTopics.push('Revoir ' + (ex.title || ('Exercice ' + ex.number)));
    });
  }

  const globalFeedback = deterministicResults.globalFeedback || {
    strengths: [],
    weaknesses: [],
    encouragement: percentage >= 70 ? 'Bon travail global !' : 'Continue tes efforts.'
  };

  return {
    score: finalScore,
    totalScore: TOTAL_POINTS,
    percentage,
    grade,
    exercises: finalExercises,
    revisionTopics,
    globalFeedback,
    correctionMode
  };
}

async function saveExamResult(uid, body, result) {
  const { db, FieldValue } = getAdminServices();
  const selected = body.exam.subjects.find((s) => s.id === body.subjectId) || body.exam.subjects[0];
  const difficulties = Array.isArray(result?.exercises) ? result.exercises.map((ex) => ({
    number: ex.number,
    score: Number(ex.score || 0),
    maxScore: Number(ex.maxScore || 6.67),
    advice: String(ex.advice || '').slice(0, 500)
  })) : [];

  await db.collection('users').doc(uid).collection('examResults').add({
    subject: SUBJECT_LABELS[body.exam.subject] || body.exam.subject,
    subjectKey: body.exam.subject,
    chapter: body.exam.chapter || 'all',
    chapterTitle: selected?.title || 'Examen',
    score: Number(result?.score || 0),
    totalScore: TOTAL_POINTS,
    percentage: Number(result?.percentage || 0),
    grade: result?.grade || null,
    result: { ...result, exercises: result?.exercises || [] },
    difficulties,
    answerCount: Object.values(body.answers || {}).filter(Boolean).length,
    examTitle: selected?.title || 'Examen',
    fromNotebook: Boolean(body.notebookContext),
    createdAt: FieldValue.serverTimestamp(),
    date: FieldValue.serverTimestamp()
  });
}

function validateConfig(body) {
  const config = {
    subject: String(body.subject || ''),
    level: String(body.level || ''),
    chapter: String(body.chapter || 'all'),
    difficulty: String(body.difficulty || ''),
    duration: Number(body.duration)
  };
  if (!ALLOWED_SUBJECTS.has(config.subject)) return 'Matière invalide.';
  // ✅ v8.65a — niveaux étendus (Bac D/C/A/B, 1ère …) : le type d'examen vient
  // du profil de l'élève. La difficulté N'EST PLUS choisie (l'IA propose) et
  // le nombre d'exercices est DÉCIDÉ PAR L'IA.
  if (!config.level || config.level.length > 40) return 'Niveau invalide.';
  if (config.difficulty && !ALLOWED_DIFFICULTIES.has(config.difficulty)) return 'Difficulté invalide.';
  if (!ALLOWED_DURATIONS.has(config.duration)) return 'Durée invalide.';
  if (config.chapter.length > 100) return 'Chapitre invalide.';
  return null;
}

function validateCorrection(body) {
  if (!body.exam || !Array.isArray(body.exam.subjects) || !body.subjectId || !body.answers) {
    return 'Données invalides.';
  }
  const size = JSON.stringify(body).length;
  if (size > 500000) return 'Examen trop volumineux.';
  return null;
}

async function loadNotebookContext(uid, subject, chapterId, chapterTitle) {
  const { db } = getAdminServices();
  const notebookKey = subject;
  if (!notebookKey) return null;

  function normalizeText(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }

  let chapterData = null;
  let actualChapterId = chapterId;

  const chapterRef = chapterId
    ? db.collection('users').doc(uid).collection('notebooks').doc(notebookKey)
        .collection('chapters').doc(chapterId).get()
    : null;

  const chaptersListPromise = !chapterId && chapterTitle
    ? db.collection('users').doc(uid).collection('notebooks').doc(notebookKey)
        .collection('chapters').get().catch(() => ({ docs: [] }))
    : null;

  const [chapterSnap, chaptersSnap] = await Promise.all([
    chapterRef || Promise.resolve(null),
    chaptersListPromise || Promise.resolve(null)
  ]);

  if (chapterSnap && chapterSnap.exists) {
    chapterData = { id: chapterId, ...chapterSnap.data() };
  } else if (chaptersSnap && chaptersSnap.docs) {
    const target = normalizeText(chapterTitle);
    const found = chaptersSnap.docs.find((d) => {
      const t = normalizeText(d.data().title);
      return t === target || t.includes(target) || target.includes(t);
    });
    if (found) {
      chapterData = { id: found.id, ...found.data() };
      actualChapterId = found.id;
    }
  }

  if (!chapterData) return null;

  const sectionsSnap = await db.collection('users').doc(uid)
    .collection('notebooks').doc(notebookKey)
    .collection('chapters').doc(actualChapterId)
    .collection('sections').orderBy('createdAt', 'asc').get();

  if (sectionsSnap.empty) return null;

  const sections = sectionsSnap.docs.slice(0, 8).map((d) => {
    const s = d.data();
    return { id: d.id, title: s.title || 'Section', rawInput: s.rawInput || '', analysis: s.analysis || {} };
  });

  const contentText = sections.map((s, i) => {
    let text = `━━━ SECTION ${i + 1} : ${s.title} ━━━\n`;
    text += 'Contenu : ' + s.rawInput.slice(0, 1200) + '\n';
    const a = s.analysis || {};
    if (a.explanation?.understanding) text += 'À comprendre : ' + String(a.explanation.understanding).slice(0, 300) + '\n';
    return text;
  }).join('\n\n');

  return {
    notebookKey, chapterId: actualChapterId,
    chapterTitle: chapterData.title || chapterTitle || 'Chapitre',
    sectionsCount: sections.length,
    contentText
  };
}

module.exports = async function handler(request, response) {
  applyCors(request, response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return jsonError(response, 405, 'Méthode non autorisée.');
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const action = body.action || 'generate';
  const isLight = LIGHT_ACTIONS.has(action);
  const rateLimit = isLight ? MAX_REQUESTS_PER_WINDOW_LIGHT : MAX_REQUESTS_PER_WINDOW_HEAVY;

  if (rateLimited(clientIp(request), rateLimit, isLight ? 'light' : 'heavy')) {
    // ✅ v4.15 — retryAfter : le client affiche un compte à rebours et RETENTE
    // TOUT SEUL au lieu d'afficher une erreur (technique du cahier v4.13).
    return response.status(429).json({
      success: false,
      error: isLight
        ? 'Service momentanément saturé. Réessaie dans quelques secondes.'
        : 'Beaucoup d\'élèves en ce moment. Réessaie dans une minute.',
      retryAfter: isLight ? 6 : 45
    });
  }

  const verifiedUser = await verifyFirebaseToken(request).catch(() => null);
  if (!verifiedUser) return jsonError(response, 401, 'Connexion requise.', 'AUTH_REQUIRED');

  if (!ALLOWED_ACTIONS.has(action)) return jsonError(response, 400, 'Action invalide.');

  if (PREMIUM_ACTIONS.has(action)) {
    try {
      const { db } = getAdminServices();
      const userSnap = await db.collection('users').doc(verifiedUser.uid).get();
      if (!userSnap.exists) {
        return jsonError(response, 404, 'Profil utilisateur introuvable.');
      }
      if (!isPremiumUser(userSnap.data())) {
        return jsonError(
          response,
          403,
          'L\'historique des examens est réservé aux comptes Premium.',
          'PREMIUM_REQUIRED'
        );
      }
    } catch (e) {
      console.error('[HISTORIQUE] Premium check failed:', e.message);
      return jsonError(response, 503, 'Service temporairement indisponible.');
    }
  }

  if (action === 'listExams') {
    try {
      const { db } = getAdminServices();
      const limit = Math.min(100, Number(body.limit) || 50);
      const snap = await db.collection('users').doc(verifiedUser.uid)
        .collection('examResults')
        .orderBy('createdAt', 'desc').limit(limit).get();

      const exams = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          subject: data.subject || 'Examen',
          subjectKey: data.subjectKey || '',
          chapterTitle: data.chapterTitle || '',
          examTitle: data.examTitle || 'Examen',
          score: Number(data.score || 0),
          totalScore: Number(data.totalScore || 20),
          percentage: Number(data.percentage || 0),
          grade: data.grade || null,
          createdAt: toISO(data.createdAt)
        };
      });

      return response.status(200).json({ success: true, exams });
    } catch (e) {
      console.error('[HISTORIQUE EXAMS] error:', e.message);
      return jsonError(response, 500, 'Impossible de charger l\'historique.');
    }
  }

  if (action === 'loadExam') {
    if (!body.examId) return jsonError(response, 400, 'examId requis.');
    try {
      const { db } = getAdminServices();
      const ref = db.collection('users').doc(verifiedUser.uid).collection('examResults').doc(body.examId);
      const snap = await ref.get();
      if (!snap.exists) return jsonError(response, 404, 'Examen introuvable.');
      const data = snap.data();
      return response.status(200).json({
        success: true,
        exam: {
          id: snap.id,
          subject: data.subject,
          subjectKey: data.subjectKey || '',
          chapterTitle: data.chapterTitle || '',
          examTitle: data.examTitle || 'Examen',
          score: Number(data.score || 0),
          totalScore: Number(data.totalScore || 20),
          percentage: Number(data.percentage || 0),
          grade: data.grade || null,
          result: data.result || null,
          createdAt: toISO(data.createdAt)
        }
      });
    } catch (e) {
      return jsonError(response, 500, 'Erreur chargement.');
    }
  }

  if (action === 'deleteExam') {
    if (!body.examId) return jsonError(response, 400, 'examId requis.');
    try {
      const { db } = getAdminServices();
      await db.collection('users').doc(verifiedUser.uid).collection('examResults').doc(body.examId).delete();
      return response.status(200).json({ success: true });
    } catch (e) {
      return jsonError(response, 500, 'Erreur suppression.');
    }
  }

  if (action === 'generate') {
    const validationError = validateConfig(body);
    if (validationError) return jsonError(response, 400, validationError);

    // ✅ v8.25 — POOL-FIRST (économie de quota IA) : si le pool contient assez
    // d'exercices conformes pour cette matière, l'examen est servi SANS aucun
    // appel IA et SANS consommer le quota gratuit (2/jour) — le quota IA
    // gratuit est la ressource la plus rare de la plateforme. Le mode
    // « cahier » (notebookContext, personnalisé) garde la génération IA.
    if (!body.notebookContext) {
      try {
        const pooledEarly = await buildExamFromPool(body, sanitizeAvoidList(body.avoidStatements));
        if (pooledEarly) {
          return response.status(200).json({
            success: true, exam: pooledEarly, meta: { provider: 'pool' }, source: 'pool'
          });
        }
      } catch (_) { /* pool indisponible → cheminement IA normal */ }
    }

    const reservation = await reserveFreeGeneration(verifiedUser.uid).catch(() => null);
    if (!reservation) return jsonError(response, 503, 'Vérification du quota indisponible.');

    if (reservation.limitReached) {
      // ⚡ v1.1 — QUOTA DU JOUR ÉPUISÉ (2/jour) → tentative de 5 crédits Marketplace
      // ⚡ v8.64a — CRÉDITS PAR PAGE : les épreuves consomment la réserve « exam »
      // (aiCreditsExam) d'abord, puis l'ancienne réserve globale héritée.
      let creditUsed = false;
      let creditRemaining = 0;
      if (!reservation.premium) {
        try {
          const creditResult = await consumeCredits(getAdminServices().db, verifiedUser.uid, COSTS.exam, 'exam');
          if (creditResult.allowed) {
            creditUsed = true;
            creditRemaining = creditResult.remaining;
          }
        } catch (creditError) {
          console.error('[EXAM] credits error:', creditError.message);
          return jsonError(response, 503, 'Vérification des crédits temporairement indisponible.');
        }
      }
      if (!creditUsed) {
        return response.status(429).json({
          success: false,
          // ✅ v8.73a — 1 requête = 1 épreuve complète (génération + correction) ;
          // les packs se rechargent dans la Marketplace (plus dans l'Abonnement).
          error: 'Limite du jour atteinte (2 épreuves gratuites). Recharge ta réserve d\'épreuves ⚡ dans la Marketplace (1 requête = 1 épreuve + correction complète) ou passe Premium.',
          code: 'FREE_EXAM_LIMIT', used: reservation.used, limit: FREE_EXAM_LIMIT,
          creditsRemaining: creditRemaining
        });
      }
      reservation.creditMode = true;
      reservation.creditRemaining = creditRemaining;
    }

    try {
      const providers = getProviders();
      if (!providers.length) throw new Error('provider_missing');

      // ✅ v8.65a — la difficulté n'est plus choisie par l'élève : valeur
      // neutre par défaut (le pool et les statistiques restent cohérents).
      body.difficulty = ALLOWED_DIFFICULTIES.has(String(body.difficulty || '')) ? String(body.difficulty) : 'medium';

      let notebookContext = null;
      if (body.notebookContext && (body.notebookContext.chapterId || body.notebookContext.chapterTitle)) {
        try {
          notebookContext = await loadNotebookContext(
            verifiedUser.uid, body.subject,
            body.notebookContext.chapterId, body.notebookContext.chapterTitle
          );
        } catch (e) { console.warn('[EXAM] Contexte cahier échoué:', e.message); }
      }

      // ✅ v4.16 — anti-répétition : la liste des énoncés déjà servis vient du
      // client (localStorage de l'appareil), assainie puis injectée dans le prompt.
      const avoidStatements = sanitizeAvoidList(body.avoidStatements);
      // ✅ v8.65a — ENTRAÎNEMENT : UN seul sujet (sortie 2× plus courte →
      // tient dans le plafond des relais :free + moitié moins de quota).
      const prompt = notebookContext
        ? generationPromptFromNotebook(body, notebookContext, avoidStatements, true)
        : generationPrompt(body, avoidStatements, false);

      // ✅ v4.15 — accès paresseux au pool pour le rattrapage des sujets presque complets
      const poolLoader = async () => {
        const { db } = getAdminServices();
        const snap = await db.collection(POOL_COLLECTION)
          .where('subject', '==', body.subject).limit(80).get();
        return snap.docs.map((d) => d.data() || {});
      };
      const genResult = await generateWithFallback(prompt, body.subject, poolLoader, body.chapter, notebookContext ? 1 : 2);
      let exam = genResult.exam;

      exam = deepClean(exam);

      await saveExercisesToPool(exam, body.subject, body.difficulty, verifiedUser.uid);

      exam.chapter = body.chapter;
      exam.fromNotebook = Boolean(notebookContext);
      exam.notebookSectionsCount = notebookContext?.sectionsCount || 0;

      return response.status(200).json({
        success: true,
        exam,
        meta: { provider: genResult.provider, fromNotebook: Boolean(notebookContext) },
        // ⚡ v1.1 — info crédits (le quota gratuit n'a PAS été consommé en mode crédits)
        creditMode: Boolean(reservation.creditMode),
        creditsRemaining: reservation.creditMode ? reservation.creditRemaining : undefined
      });
    } catch (error) {
      console.error('Exam generation failed:', error.message);
      if (reservation?.reserved) {
        try { await releaseFreeGeneration(verifiedUser.uid, reservation.usageDate); } catch (_) {}
      }

      // ✅ v8.73a — MODE ENTRAÎNEMENT : le pool ne contient PAS le chapitre du
      // cahier de l'élève → un examen pool serait HORS SUJET tout en étant
      // présenté comme « ton entraînement ». On refuse ce mensonge : message
      // clair de re-tentative (le retry interne des relais rend ce cas rare).
      if (body.notebookContext) {
        return response.status(502).json({
          success: false,
          error: 'La fabrication de ton entraînement a échoué cette fois (relais IA momentanément saturés). Réessaie dans quelques secondes : ton cours est bien lu.',
          code: 'TRAINING_GENERATION_FAILED',
          // ✅ v8.73a-diag — chaîne des échecs par relais (diagnostic propriétaire)
          detail: String(error.message || '').slice(0, 900)
        });
      }

      const pooled = await buildExamFromPool(body);
      if (pooled) {
        return response.status(200).json({ success: true, exam: pooled, fallback: true, source: 'pool' });
      }

      return response.status(200).json({
        success: true,
        exam: await buildUnavailableExam(body),
        unavailable: true
      });
    }
  }

  if (action === 'correct') {
    const validationError = validateCorrection(body);
    if (validationError) return jsonError(response, 400, validationError);

    // ⚡ v8.64a — COURS DE L'ÉLÈVE : si le correct a été lancé en mode
    // Entraînement (notebookContext présent), le serveur RELIT les sections
    // du cahier et les donne au correcteur (mots/techniques de la leçon).
    let correctionNotebook = null;
    if (body.notebookContext && (body.notebookContext.chapterId || body.notebookContext.chapterTitle)) {
      try {
        correctionNotebook = await loadNotebookContext(
          verifiedUser.uid, body.exam.subject,
          body.notebookContext.chapterId, body.notebookContext.chapterTitle
        );
      } catch (e) { console.warn('[EXAM] Contexte cahier correction échoué:', e.message); }
    }

    try {
      const result = await correctExamHybrid(body.exam, body.subjectId, body.answers, verifiedUser.uid, correctionNotebook);
      try { await saveExamResult(verifiedUser.uid, body, result); }
      catch (e) { console.error('Save exam result failed:', e.message); }

      return response.status(200).json({ success: true, result });
    } catch (error) {
      const msg = (error && error.message) ? error.message : String(error);
      console.error('Exam correction failed:', msg);

      // ✅ CAS B : correction réellement indisponible
      if (msg === 'CORRECTION_UNAVAILABLE') {
        return jsonError(
          response,
          503,
          'La correction est temporairement indisponible. Tes réponses sont conservées : réessaie dans quelques minutes.',
          'CORRECTION_UNAVAILABLE'
        );
      }

      console.error('Unexpected correction error:', (error && error.stack) || msg);
      return jsonError(response, 500, 'Une erreur inattendue est survenue pendant la correction.');
    }
  }

  return jsonError(response, 400, 'Action inconnue.');
};


// ✅ Config assignée APRÈS module.exports — visible par Vercel AU BUILD (pas seulement au runtime).
module.exports.config = { maxDuration: 90 };

// ✅ v5.0 — exports internes (tests automatisés uniquement ; inutilisés par Vercel).
module.exports._internal = {
  subjectCategory,
  CATEGORY_LABELS,
  buildVariationBlock,
  generationPrompt,
  generationPromptFromNotebook,
  verificationPrompt,
  repairExamStructure,
  validateGeneratedExam,
  validateContentCompliance,
  exerciseCompliant,
  hasDecimalNumber,
  isCalculationTask,
  exerciseIsComplexRelated,
  applyVerification,
  questionKey,
  normPrefix,
  echoFits,
  stripGenericPrefix,
  repairMathEscapes,
  repairAllEscapes,
  salvageSolutions,
  poolGenStyle
};
