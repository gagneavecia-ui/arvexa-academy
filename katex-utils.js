// ================================================================
// KATEX UTILS v6.0 — ARVEXA School
// Rendu mathématique robuste, global, auto-injecté
// ✅ OPTIMISÉ : cache regex + une seule passe Unicode
// ✅ v6.0 (v8.54a) — « renforce le KaTeX au maximum » : macros pour toutes
//    les commandes manquantes (\sgn \sech \Var \pgcd…), sanitisation
//    profonde par formule (entités HTML, %/# nus, \rm \bf hérités,
//    accolades/\left\right équilibrés, environnements fermés), RÉPARATION
//    POST-RENDU (.katex-error re-rendu puis aplati en Unicode lisible —
//    plus AUCUNE source rouge brute à l'écran).
// ================================================================

(function () {
  'use strict';

  if (window.__arvexaKatexInit) return;
  window.__arvexaKatexInit = true;

  // ═══════════════════════════════════════════════════════════════
  // 1. MACROS UNIVERSEL
  // ═══════════════════════════════════════════════════════════════
  const MACROS = {
    "\\R": "\\mathbb{R}",
    "\\N": "\\mathbb{N}",
    "\\Z": "\\mathbb{Z}",
    "\\Q": "\\mathbb{Q}",
    "\\C": "\\mathbb{C}",
    "\\K": "\\mathbb{K}",
    "\\P": "\\mathbb{P}",
    "\\Re": "\\operatorname{Re}",
    "\\Im": "\\operatorname{Im}",
    "\\arg": "\\operatorname{arg}",
    "\\card": "\\operatorname{card}",
    "\\Card": "\\operatorname{Card}",
    "\\Ker": "\\operatorname{Ker}",
    "\\Vect": "\\operatorname{Vect}",
    "\\rg": "\\operatorname{rg}",
    "\\tr": "\\operatorname{tr}",
    "\\grad": "\\operatorname{grad}",
    "\\divergence": "\\operatorname{div}",
    "\\rot": "\\operatorname{rot}",
    "\\norm": "\\left\\|#1\\right\\|",
    "\\norme": "\\left\\|#1\\right\\|",
    "\\abs": "\\left|#1\\right|",
    "\\valabs": "\\left|#1\\right|",
    "\\deriv": "\\frac{d#1}{d#2}",
    "\\derivn": "\\frac{d^{#1}#2}{d#3^{#1}}",
    "\\derivp": "\\frac{\\partial #1}{\\partial #2}",
    "\\integral": "\\int_{#1}^{#2}",
    "\\limite": "\\lim_{#1 \\to #2}",
    "\\paren": "\\left(#1\\right)",
    "\\bracket": "\\left[#1\\right]",
    "\\brace": "\\left\\{#1\\right\\}",
    "\\set": "\\left\\{#1\\right\\}",
    "\\interval": "\\left[#1, #2\\right]",
    "\\intervalo": "\\left]#1, #2\\right[",
    "\\ii": "\\mathrm{i}",
    "\\jj": "\\mathrm{j}",
    "\\kk": "\\mathrm{k}",
    "\\unite": "\\,\\text{#1}",
    "\\unites": "\\,\\text{#1}",
    "\\mol": "\\text{mol}",
    "\\pH": "\\text{pH}",
    "\\e": "\\mathrm{e}",
    "\\eps": "\\varepsilon",
    "\\phi": "\\varphi",
    "\\dt": "\\Delta t",
    "\\dx": "\\Delta x",
    "\\dv": "\\Delta v",
    /* ✅ v6.0 — commandes demandées par les IA mais absentes de KaTeX :
       chaque entrée ci-dessous supprime une classe entière de
       « Undefined control sequence » (formules mal rendues). */
    "\\sgn": "\\operatorname{sgn}",
    "\\sech": "\\operatorname{sech}",
    "\\csch": "\\operatorname{csch}",
    "\\Arg": "\\operatorname{Arg}",
    "\\Var": "\\operatorname{Var}",
    "\\Cov": "\\operatorname{Cov}",
    "\\Corr": "\\operatorname{Corr}",
    "\\erf": "\\operatorname{erf}",
    "\\erfc": "\\operatorname{erfc}",
    "\\Arcsin": "\\operatorname{Arcsin}",
    "\\Arccos": "\\operatorname{Arccos}",
    "\\Arctan": "\\operatorname{Arctan}",
    "\\Proj": "\\operatorname{Proj}",
    "\\Id": "\\mathbb{I}",
    "\\lcm": "\\operatorname{lcm}",
    "\\pgcd": "\\operatorname{pgcd}",
    "\\ppcm": "\\operatorname{ppcm}",
    "\\ds": "\\displaystyle",
    "\\dsum": "\\displaystyle\\sum",
    "\\dint": "\\displaystyle\\int",
    "\\E": "\\mathbb{E}",
    "\\degree": "^{\\circ}",
    "\\degc": "^{\\circ}\\text{C}"
  };

  // ═══════════════════════════════════════════════════════════════
  // 2. COMMANDES LATEX CONNUES
  // ═══════════════════════════════════════════════════════════════
  const KNOWN_LATEX_COMMANDS = new Set([
    'alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta','vartheta',
    'iota','kappa','lambda','mu','nu','xi','pi','varpi','rho','varrho','sigma','varsigma',
    'tau','upsilon','phi','varphi','chi','psi','omega',
    'Gamma','Delta','Theta','Lambda','Xi','Pi','Sigma','Upsilon','Phi','Psi','Omega',
    'times','div','pm','mp','cdot','cdotp','ast','star','bullet','circ','oplus','otimes',
    'odot','ominus','oslash','bigcirc',
    'leq','geq','neq','ne','approx','equiv','cong','sim','simeq','propto','ll','gg',
    'leqslant','geqslant','lesssim','gtrsim','prec','succ','preceq','succeq',
    'in','notin','ni','owns','subset','supset','subseteq','supseteq','subsetneq',
    'supsetneq','cup','cap','emptyset','varnothing','setminus','sqcup','sqcap',
    'forall','exists','nexists','neg','lnot','wedge','land','vee','lor','top','bot',
    'vdash','dashv','models','vDash','nvdash',
    'sum','prod','coprod','int','iint','iiint','oint','partial','nabla','infty',
    'aleph','beth','gimel','daleth','ell','hbar','imath','jmath','wp',
    'sin','cos','tan','cot','sec','csc','arcsin','arccos','arctan',
    'sinh','cosh','tanh','coth','log','ln','lg','exp','lim','limsup','liminf',
    'max','min','sup','inf','det','dim','ker','deg','gcd','hom','arg','mod','bmod','pmod',
    'frac','dfrac','tfrac','cfrac','sqrt','binom','dbinom','tbinom','choose','genfrac',
    'operatorname','overset','underset','stackrel',
    'left','right','big','Big','bigg','Bigg','bigl','bigr','Bigl','Bigr','biggl','biggr',
    'Biggl','Biggr','middle','langle','rangle','lceil','rceil','lfloor','rfloor',
    'lbrace','rbrace','lbrack','rbrack','vert','Vert','parallel','nparallel',
    'perp','backslash',
    'overline','underline','underbrace','overbrace','vec','hat','bar','dot','ddot',
    'dddot','ddddot','tilde','widetilde','widehat','overrightarrow','overleftarrow',
    'overleftrightarrow','underrightarrow','underleftarrow','boxed','fbox','cancel',
    'bcancel','xcancel','sout','not',
    'begin','end',
    'quad','qquad','enspace','hspace','vspace','thinspace','medspace','thickspace',
    'negthinspace','negmedspace','negthickspace',
    'text','textrm','textsf','texttt','textnormal','textup','textsl','textsc',
    'mathrm','mathbf','mathit','mathsf','mathtt','mathbb','mathcal','mathscr',
    'mathfrak','boldsymbol','bm','pmb','displaystyle','textstyle','scriptstyle',
    'scriptscriptstyle','limits','nolimits',
    'ldots','cdots','vdots','ddots','idotsint','prime','backprime','degree','celsius',
    'micro','perthousand','copyright','pounds','yen','euro',
    'to','gets','leftarrow','rightarrow','leftrightarrow','Leftarrow','Rightarrow',
    'Leftrightarrow','uparrow','downarrow','updownarrow','Uparrow','Downarrow',
    'Updownarrow','mapsto','longmapsto','longleftarrow','longrightarrow',
    'longleftrightarrow','Longleftarrow','Longrightarrow','Longleftrightarrow',
    'hookrightarrow','hookleftarrow','twoheadrightarrow','twoheadleftarrow',
    'rightharpoonup','rightharpoondown','leftharpoonup','leftharpoondown',
    'rightleftharpoons','leftrightharpoons','nearrow','searrow','swarrow','nwarrow',
    'implies','impliedby','iff','leadsto',
    'dagger','ddagger','checkmark','maltese','flat','natural','sharp',
    'clubsuit','diamondsuit','heartsuit','spadesuit',
    'triangle','triangledown','triangleleft','triangleright','square','blacksquare',
    'lozenge','blacklozenge','bigstar','circledast','circledcirc','circleddash',
    'angstrom'
  ]);

  function containsKnownLatex(text) {
    if (!text) return false;
    const re = /\\([a-zA-Z]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (KNOWN_LATEX_COMMANDS.has(m[1])) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. DÉLIMITEURS ÉTENDUS
  // ═══════════════════════════════════════════════════════════════
  const DELIMITERS = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\begin{equation}', right: '\\end{equation}', display: true },
    { left: '\\begin{equation*}', right: '\\end{equation*}', display: true },
    { left: '\\begin{align}', right: '\\end{align}', display: true },
    { left: '\\begin{align*}', right: '\\end{align*}', display: true },
    { left: '\\begin{aligned}', right: '\\end{aligned}', display: true },
    { left: '\\begin{cases}', right: '\\end{cases}', display: true },
    { left: '\\begin{matrix}', right: '\\end{matrix}', display: true },
    { left: '\\begin{pmatrix}', right: '\\end{pmatrix}', display: true },
    { left: '\\begin{bmatrix}', right: '\\end{bmatrix}', display: true },
    { left: '\\begin{vmatrix}', right: '\\end{vmatrix}', display: true },
    { left: '\\begin{Vmatrix}', right: '\\end{Vmatrix}', display: true },
    { left: '\\begin{array}', right: '\\end{array}', display: true },
    { left: '\\begin{gather}', right: '\\end{gather}', display: true },
    { left: '\\begin{gather*}', right: '\\end{gather*}', display: true },
    { left: '\\begin{smallmatrix}', right: '\\end{smallmatrix}', display: true },
    { left: '\\begin{multline}', right: '\\end{multline}', display: true },
    { left: '\\begin{split}', right: '\\end{split}', display: true }
  ];

  // ═══════════════════════════════════════════════════════════════
  // 4. TABLE UNICODE → LATEX
  // ═══════════════════════════════════════════════════════════════
  const UNICODE_MAP = {
    'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
    'ε': '\\epsilon ', 'ϵ': '\\epsilon ', 'ζ': '\\zeta ', 'η': '\\eta ',
    'θ': '\\theta ', 'ϑ': '\\vartheta ', 'ι': '\\iota ', 'κ': '\\kappa ',
    'λ': '\\lambda ', 'μ': '\\mu ', 'ν': '\\nu ', 'ξ': '\\xi ',
    'π': '\\pi ', 'ϖ': '\\varpi ', 'ρ': '\\rho ', 'ϱ': '\\varrho ',
    'σ': '\\sigma ', 'ς': '\\varsigma ', 'τ': '\\tau ', 'υ': '\\upsilon ',
    'φ': '\\phi ', 'ϕ': '\\varphi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ',
    'Γ': '\\Gamma ', 'Δ': '\\Delta ', 'Θ': '\\Theta ', 'Λ': '\\Lambda ',
    'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ', 'Υ': '\\Upsilon ',
    'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega ',
    '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ',
    '·': '\\cdot ', '⋅': '\\cdot ', '∘': '\\circ ', '∗': '\\ast ',
    '⋆': '\\star ', '∙': '\\bullet ', '⊕': '\\oplus ', '⊖': '\\ominus ',
    '⊗': '\\otimes ', '⊘': '\\oslash ', '⊙': '\\odot ', '⊚': '\\circledcirc ',
    '†': '\\dagger ', '‡': '\\ddagger ',
    '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ', '≈': '\\approx ',
    '≡': '\\equiv ', '≅': '\\cong ', '∼': '\\sim ', '≃': '\\simeq ',
    '∝': '\\propto ', '≪': '\\ll ', '≫': '\\gg ', '≦': '\\leq ',
    '≧': '\\geq ', '≲': '\\lesssim ', '≳': '\\gtrsim ',
    '≺': '\\prec ', '≻': '\\succ ', '⪯': '\\preceq ', '⪰': '\\succeq ',
    '∈': '\\in ', '∉': '\\notin ', '∋': '\\ni ', '∌': '\\not\\ni ',
    '⊂': '\\subset ', '⊃': '\\supset ', '⊆': '\\subseteq ', '⊇': '\\supseteq ',
    '⊄': '\\not\\subset ', '⊅': '\\not\\supset ',
    '⊈': '\\nsubseteq ', '⊉': '\\nsupseteq ',
    '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ', '∖': '\\setminus ',
    '⊔': '\\sqcup ', '⊓': '\\sqcap ',
    '∀': '\\forall ', '∃': '\\exists ', '∄': '\\nexists ',
    '¬': '\\neg ', '∧': '\\wedge ', '∨': '\\vee ',
    '⊢': '\\vdash ', '⊣': '\\dashv ', '⊨': '\\models ',
    '⊤': '\\top ', '⊥': '\\bot ',
    '∑': '\\sum ', '∏': '\\prod ', '∐': '\\coprod ', '∫': '\\int ',
    '∬': '\\iint ', '∭': '\\iiint ', '∮': '\\oint ',
    '∂': '\\partial ', '∇': '\\nabla ', '√': '\\sqrt ',
    '∞': '\\infty ', 'ℵ': '\\aleph ', 'ℶ': '\\beth ', 'ℷ': '\\gimel ',
    'ℓ': '\\ell ', 'ℏ': '\\hbar ', 'ℜ': '\\Re ', 'ℑ': '\\Im ',
    '℘': '\\wp ', 'ı': '\\imath ', 'ȷ': '\\jmath ',
    '°': '^{\\circ} ', '′': "'", '″': "''", '‴': "'''",
    '‰': '\\text{‰} ', '§': '\\text{§} ', '¶': '\\text{¶} ',
    '€': '\\text{€} ', '£': '\\text{£} ', '¥': '\\text{¥} ',
    '©': '\\text{©} ', '®': '\\text{®} ', '™': '\\text{™} ',
    '◆': '\\blacklozenge ', '◇': '\\lozenge ', '■': '\\blacksquare ',
    '□': '\\square ', '▲': '\\blacktriangle ', '△': '\\triangle ',
    '▼': '\\blacktriangledown ', '▽': '\\triangledown ',
    '◀': '\\blacktriangleleft ', '▶': '\\blacktriangleright ',
    '★': '\\bigstar ', '☆': '\\star ', '✓': '\\checkmark ',
    '♣': '\\clubsuit ', '♦': '\\diamondsuit ',
    '♡': '\\heartsuit ', '♠': '\\spadesuit ',
    '⇌': '\\rightleftharpoons ', '⇋': '\\leftrightharpoons ',
    '⟶': '\\longrightarrow ', '⟵': '\\longleftarrow ',
    'Å': '\\text{Å} ', '℃': '\\text{°C} ',
    '→': '\\to ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ',
    '↑': '\\uparrow ', '↓': '\\downarrow ', '↕': '\\updownarrow ',
    '⇑': '\\Uparrow ', '⇓': '\\Downarrow ', '⇕': '\\Updownarrow ',
    '⇒': '\\Rightarrow ', '⇐': '\\Leftarrow ', '⇔': '\\Leftrightarrow ',
    '⟹': '\\Longrightarrow ', '⟸': '\\Longleftarrow ', '⟺': '\\Longleftrightarrow ',
    '↦': '\\mapsto ', '⟼': '\\longmapsto ',
    '↪': '\\hookrightarrow ', '↩': '\\hookleftarrow ',
    '↠': '\\twoheadrightarrow ', '↞': '\\twoheadleftarrow ',
    '⇀': '\\rightharpoonup ', '⇁': '\\rightharpoondown ',
    '↼': '\\leftharpoonup ', '↽': '\\leftharpoondown ',
    '↗': '\\nearrow ', '↘': '\\searrow ', '↙': '\\swarrow ', '↖': '\\nwarrow ',
    '⤳': '\\leadsto ', '⟾': '\\implies ',
    '¯': '\\bar{}', 'ˉ': '\\bar{}',
    '♭': '\\flat ', '♮': '\\natural ', '♯': '\\sharp '
  };

  // ═══════════════════════════════════════════════════════════════
  // 5. EXPOSANTS ET INDICES UNICODE
  // ═══════════════════════════════════════════════════════════════
  const SUPERSCRIPT_MAP = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
    'ⁿ': 'n', 'ⁱ': 'i'
  };

  const SUBSCRIPT_MAP = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
    'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h',
    'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p',
    'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j'
  };

  // ═══════════════════════════════════════════════════════════════
  // 6. DÉTECTION UNICODE MATHÉMATIQUE
  // ═══════════════════════════════════════════════════════════════
  const HAS_UNICODE_MATH_REGEX = /[α-ωΑ-Ω×÷±∓·⋅∘∗⋆∙⊕⊗⊖⊘⊙≤≥≠≈≡≅∼≃∝≪≫∈∉∋⊂⊃⊆⊇⊄⊅⊈⊉∪∩∅∖⊔⊓∀∃∄¬∧∨⊢⊣⊨⊤⊥∑∏∐∫∬∭∮∂∇√∞ℵℶℷℓℏℜℑ℘°′″‴‰§¶€£¥©®™◆◇■□▲△▼▽◀▶★☆✓♣♦♡♠⇌⇋⟶⟵Å℃→←↔↑↓↕⇑⇓⇕⇒⇐⇔⟹⟸⟺↦⟼↪↩↠↞⇀⇁↼↽↗↘↙↖⤳⟾⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎]/;

  function hasUnicodeMath(text) {
    if (!text || typeof text !== 'string') return false;
    return HAS_UNICODE_MATH_REGEX.test(text);
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. ✅ OPTIMISATION : REGEX PRÉ-COMPILÉES (construites UNE FOIS)
  // ═══════════════════════════════════════════════════════════════

  // ✅ Regex pour fixCommandSpacing (construite une seule fois)
  let __fixCommandSpacingRegex = null;
  (function buildFixCommandSpacingRegex() {
    const cmdList = Array.from(KNOWN_LATEX_COMMANDS)
      .filter(c => /^[a-zA-Z]+$/.test(c))
      .sort((a, b) => b.length - a.length);
    if (cmdList.length > 0) {
      __fixCommandSpacingRegex = new RegExp(
        `(\\\\${cmdList.join('|\\\\')})(?=[a-zA-Z0-9])`,
        'g'
      );
    }
  })();

  // ✅ Regex pour replaceUnicodeMath (une seule passe au lieu de 200 itérations)
  const __UNICODE_MAP_ENTRIES = Object.entries(UNICODE_MAP);
  const __UNICODE_REGEX = new RegExp(
    __UNICODE_MAP_ENTRIES
      .map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'g'
  );

  // ═══════════════════════════════════════════════════════════════
  // 8. RÉPARATION DES COMMANDES AMPUTÉES PAR JSON.parse
  // ═══════════════════════════════════════════════════════════════
  function repairBrokenLatexCommands(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    // ═══ COMMANDES AVEC ACCOLADE ═══
    r = r.replace(/(?<![\\a-zA-Z])ext\{/g, '\\text{');
    r = r.replace(/(?<![\\a-zA-Z])rac\{/g, '\\frac{');
    r = r.replace(/(?<![\\a-zA-Z])qrt\{/g, '\\sqrt{');
    r = r.replace(/(?<![\\a-zA-Z])imes(?=\s)/g, '\\times ');
    r = r.replace(/(?<![\\a-zA-Z])imes(?=[\d{])/g, '\\times ');
    r = r.replace(/(?<![\\a-zA-Z])heta\{/g, '\\theta{');
    r = r.replace(/(?<![\\a-zA-Z])heta(?=\s)/g, '\\theta ');
    r = r.replace(/(?<![\\a-zA-Z])heta(?=[\^_])/g, '\\theta');
    r = r.replace(/(?<![\\a-zA-Z])au\{/g, '\\tau{');
    r = r.replace(/(?<![\\a-zA-Z])au(?=\s)/g, '\\tau ');
    r = r.replace(/(?<![\\a-zA-Z])au(?=[\^_])/g, '\\tau');
    r = r.replace(/(?<![\\a-zA-Z])eta\{/g, '\\beta{');
    r = r.replace(/(?<![\\a-zA-Z])eta(?=\s)/g, '\\beta ');
    r = r.replace(/(?<![\\a-zA-Z])eta(?=[\^_])/g, '\\beta');
    r = r.replace(/(?<![\\a-zA-Z])ho\{/g, '\\rho{');
    r = r.replace(/(?<![\\a-zA-Z])ho(?=\s)/g, '\\rho ');
    r = r.replace(/(?<![\\a-zA-Z])ho(?=[\^_])/g, '\\rho');
    r = r.replace(/(?<![\\a-zA-Z])abla\{/g, '\\nabla{');
    r = r.replace(/(?<![\\a-zA-Z])abla(?=\s)/g, '\\nabla ');
    r = r.replace(/(?<![\\a-zA-Z])abla(?=[\^_])/g, '\\nabla');
    r = r.replace(/(?<![\\a-zA-Z])abla(?=[\d\s])/g, '\\nabla ');
    r = r.replace(/(?<![\\a-zA-Z])eq\{/g, '\\neq{');
    r = r.replace(/(?<![\\a-zA-Z])eq(?=\s)/g, '\\neq ');
    r = r.replace(/(?<![\\a-zA-Z])eq(?=[\d])/g, '\\neq ');

    // ═══ CONTEXTE MATHÉMATIQUE ═══
    r = r.replace(/\bext\{mL\}/g, '\\text{mL}');
    r = r.replace(/\bext\{mol\}/g, '\\text{mol}');
    r = r.replace(/\bext\{g\}/g, '\\text{g}');
    r = r.replace(/\bext\{L\}/g, '\\text{L}');
    r = r.replace(/\bext\{s\}/g, '\\text{s}');
    r = r.replace(/\bext\{kg\}/g, '\\text{kg}');
    r = r.replace(/\bext\{cm\}/g, '\\text{cm}');
    r = r.replace(/\bext\{m\}/g, '\\text{m}');
    r = r.replace(/\bext\{J\}/g, '\\text{J}');
    r = r.replace(/\bext\{N\}/g, '\\text{N}');
    r = r.replace(/\bext\{Pa\}/g, '\\text{Pa}');
    r = r.replace(/\bext\{K\}/g, '\\text{K}');
    r = r.replace(/\bext\{°C\}/g, '\\text{°C}');
    r = r.replace(/\bext\{pH\}/g, '\\text{pH}');
    r = r.replace(/\bext\{eau\}/g, '\\text{eau}');

    r = r.replace(/(?<![\\a-zA-Z])ext\{([a-zA-Z°]{1,6})\}/g, '\\text{$1}');

    return r;
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. FONCTIONS DE NETTOYAGE
  // ═══════════════════════════════════════════════════════════════

  function replaceUnicodeScripts(text) {
    if (!text || typeof text !== 'string') return text;
    let r = text;

    r = r.replace(/([a-zA-Z0-9}\)\]_\}])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ]+)/g, (m, base, sups) => {
      const conv = sups.split('').map((c) => SUPERSCRIPT_MAP[c] || c).join('');
      return `${base}^{${conv}}`;
    });

    r = r.replace(/([a-zA-Z0-9}\)\]\}])([₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼ]+)/g, (m, base, subs) => {
      const conv = subs.split('').map((c) => SUBSCRIPT_MAP[c] || c).join('');
      return `${base}_{${conv}}`;
    });

    return r;
  }

  // ═══════════════════════════════════════════════════════════════
  // 6-bis. FIX « ADN\to ARN » : flèches LaTeX/ASCII orphelines → Unicode
  // (appliqué HORS des maths délimitées ; répare aussi le contenu stocké)
  // ═══════════════════════════════════════════════════════════════
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

  function fixOrphanArrows(text) {
    if (!text || typeof text !== 'string') return text;
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) return part;
      let r = part.replace(ARROW_LAT2UNI_RE, (m, c) => ARROW_LAT2UNI[c] || m);
      r = r.replace(/<=>/g, '\u21D4').replace(/<->/g, '\u2194').replace(/-->/g, '\u27F6')
           .replace(/==>/g, '\u27F9').replace(/->/g, '\u2192').replace(/=>/g, '\u21D2');
      return r;
    }).join('');
  }

  // ✅ OPTIMISÉ : une seule passe regex au lieu de 200 itérations
  function replaceUnicodeMath(text) {
    if (!text || typeof text !== 'string') return text;

    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

    return parts.map((part, i) => {
      if (i % 2 === 0) return part; // prose : les symboles Unicode restent lisibles
      return part.replace(__UNICODE_REGEX, (match) => UNICODE_MAP[match] || match);
    }).join('');
  }

  // ✅ OPTIMISÉ : utilise la regex pré-compilée
  function fixCommandSpacing(text) {
    if (!text || typeof text !== 'string') return text;
    if (!__fixCommandSpacingRegex) return text;
    return text.replace(__fixCommandSpacingRegex, '$1 ');
  }

  function fixTextInternals(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    for (let pass = 0; pass < 5; pass++) {
      const before = r;

      r = r.replace(/\\text\{([^{}]*)\}/g, (match, inner) => {
        if (!/\\|[_^]/.test(inner)) return match;

        let parts = inner
          .replace(/\\(,|;|:|!|quad|qquad|thinspace|enspace|medspace|thickspace|negthinspace|negmedspace|negthickspace| )/g,
                   '\u0001ESCAPE_\u0001$1\u0001')
          .replace(/\\(cdot|times|div|pm|mp|approx|leq|geq|neq)/g,
                   '\u0001CMD_\u0001$1\u0001')
          .replace(/([_^])(?:\{([^{}]*)\}|([a-zA-Z0-9]))/g, (m, op, braced, single) => {
            const content = braced !== undefined ? braced : single;
            return `\u0001SCRIPT_\u0001${op}${content}\u0001`;
          })
          .split('\u0001')
          .map(s => s.trim())
          .filter(Boolean);

        if (parts.length <= 1) return match;

        let result = '';
        let currentText = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];

          if (part === 'ESCAPE_' || part === 'CMD_' || part === 'SCRIPT_') continue;

          const isEscape = i > 0 && parts[i-1] === 'ESCAPE_';
          const isCmd = i > 0 && parts[i-1] === 'CMD_';
          const isScript = i > 0 && parts[i-1] === 'SCRIPT_';

          if (isEscape) {
            if (currentText.trim()) {
              result += `\\text{${currentText.trim()}}\\,`;
              currentText = '';
            }
            const spaceCmd = part.startsWith(' ') ? ' ' : `\\${part}`;
            result += spaceCmd + ' ';
          } else if (isCmd) {
            if (currentText.trim()) {
              result += `\\text{${currentText.trim()}}\\,`;
              currentText = '';
            }
            result += `\\${part} `;
          } else if (isScript) {
            if (currentText.trim()) {
              result += `\\text{${currentText.trim()}}`;
              currentText = '';
            }
            result += part + ' ';
          } else {
            currentText += part;
          }
        }

        if (currentText.trim()) {
          result += `\\text{${currentText.trim()}}`;
        }

        result = result.replace(/\\,\s*\\,/g, '\\,');
        result = result.replace(/\s+/g, ' ').trim();

        return result;
      });

      if (before === r) break;
    }

    return r;
  }

  function fixUnitCommas(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    r = r.replace(/\\text\{([a-zA-Z]{1,6}),\s*([a-zA-Z]{1,6})([_^]?)\}/g, (match, a, b, script) => {
      return `\\text{${a}}\\cdot\\text{${b}}${script}`;
    });

    r = r.replace(/\\text\{([a-zA-Z]{1,6}),\s*([a-zA-Z]{1,6})([_^]\{[^{}]+\})\}/g, (match, a, b, script) => {
      return `\\text{${a}}\\cdot\\text{${b}}${script}`;
    });

    r = r.replace(/\\text\{([a-zA-Z]{1,6})\s*,\s*([a-zA-Z]{1,6})([_^]?)\}/g, (match, a, b, script) => {
      return `\\text{${a}}\\cdot\\text{${b}}${script}`;
    });

    return r;
  }

  function fixCdotSpacing(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    r = r.replace(/\\cdotp(?=[a-zA-Z])/g, '\\cdot ');
    r = r.replace(/\\cdotp(?![a-zA-Z])/g, '\\cdot ');
    r = r.replace(/\\cdot(?=[a-zA-Z])/g, '\\cdot ');
    r = r.replace(/\\cdot\s*\\cdot/g, '\\cdot');
    r = r.replace(/\\cdot\\cdot/g, '\\cdot');
    r = r.replace(/\\,\s*\\cdot/g, '\\cdot');
    r = r.replace(/\\cdot\s*\\,/g, '\\cdot');

    return r;
  }

  function fixLatexAccents(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    const accents = [
      [/\\'\{?([eEaAiuUoO])/g, (m, c) => ({
        'e':'é','E':'É','a':'á','A':'Á','i':'í','I':'Í','u':'ú','U':'Ú','o':'ó','O':'Ó'
      }[c] || c)],
      [/\\`\{?([eEaAiIuUoO])/g, (m, c) => ({
        'e':'è','E':'È','a':'à','A':'À','i':'ì','I':'Ì','u':'ù','U':'Ù','o':'ò','O':'Ò'
      }[c] || c)],
      [/\\\^\{?([eEaAiIuUoO])/g, (m, c) => ({
        'e':'ê','E':'Ê','a':'â','A':'Â','i':'î','I':'Î','u':'û','U':'Û','o':'ô','O':'Ô'
      }[c] || c)],
      [/\\"\{?([eEaAiIuUoOyY])/g, (m, c) => ({
        'e':'ë','E':'Ë','a':'ä','A':'Ä','i':'ï','I':'Ï','u':'ü','U':'Ü','o':'ö','O':'Ö',
        'y':'ÿ','Y':'Ÿ'
      }[c] || c)],
      [/\\~\{?([nNaAoO])/g, (m, c) => ({
        'n':'ñ','N':'Ñ','a':'ã','A':'Ã','o':'õ','O':'Õ'
      }[c] || c)],
      [/\\c\{?([cC])\}?/g, (m, c) => c === 'c' ? 'ç' : 'Ç'],
      [/\\oe\b/g, 'œ'],
      [/\\OE\b/g, 'Œ'],
      [/\\ae\b/g, 'æ'],
      [/\\AE\b/g, 'Æ'],
      [/\\ss\b/g, 'ß'],
      [/\\o\b/g, 'ø'],
      [/\\O\b/g, 'Ø'],
      [/\\l\b/g, 'ł'],
      [/\\L\b/g, 'Ł'],
      [/\\\\`\{?([aAeE])/g, (m, c) => c === 'a' ? 'à' : c === 'A' ? 'À' : c === 'e' ? 'è' : 'È'],
      [/\\\\`\s*/g, ''],
      [/\\`\s*/g, ''],
    ];

    for (const [regex, replacement] of accents) {
      r = r.replace(regex, replacement);
    }

    return r;
  }

  function normalizeSpacesAndCommas(text) {
    if (!text || typeof text !== 'string') return text;

    let r = text;

    r = r.replace(/\\\s+,/g, '\\,');
    r = r.replace(/\\\s{2,}/g, '\\ ');
    r = r.replace(/([a-zA-Z0-9}]),([a-zA-Z](?![a-z]))/g, '$1\\,$2');
    r = r.replace(/\\ ,/g, '\\,');

    return r;
  }

  function fixOrphanParens(text) {
    if (!text || typeof text !== 'string') return text;
    let r = text;

    r = r.replace(/(\\[a-zA-Z]+(?:\{[^{}]*\})*(?:[_^](?:\{[^{}]*\}|[a-zA-Z0-9]))*[^)()\n]*)\)\s*(?=[.,;:!?\n]|$)/g,
      (match) => match.slice(0, -1));

    return r;
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

  function wrapOrphanLatex(text) {
    if (!text || typeof text !== 'string') return text;
    if (!/\\[a-zA-Z]/.test(text)) return text;

    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);

    return parts.map((part, i) => {
      if (i % 2 === 1) return part;
      return wrapSegmentLatex(part);
    }).join('');
  }

  // ✅ OPTIMISÉ : limitation du backtracking
  function wrapSegmentLatex(segment) {
    if (!segment) return segment;

    let r = segment;

    r = r.replace(
      /(?<![a-zA-Z\\$])([a-zA-Z])([_^])(\{([a-zA-Z0-9]+)\}|([a-zA-Z0-9]))(?![a-zA-Z0-9}])/g,
      (match, letter, op, braced, single) => {
        const content = braced || single;
        return `$${letter}${op}{${content}}$`;
      }
    );

    r = r.replace(/\$([^$]+)\$\$([^$]+)\$/g, '$$$1$2$$');

    if (!/\\[a-zA-Z]/.test(r)) {
      r = r.replace(/\$\s*\$/g, ' ');
      r = r.replace(/\s+/g, ' ').trim();
      return r;
    }

    r = r.replace(
      /\\begin\{([a-zA-Z*]+)\}([\s\S]*?)\\end\{\1\}/g,
      (match) => ` $$${match}$$ `
    );

    r = r.replace(
      /((?:[a-zA-Z0-9()\[\]{}\s=+\-*/<>.,]|\\(?:[a-zA-Z]+\*?(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?|[,;:!]|\\|\s|quad|qquad|thinspace|enspace|medspace|thickspace|negthinspace|negmedspace|negthickspace))+)/g,
      (match) => {
        if (!/\\[a-zA-Z]/.test(match)) return match;
        if (/^https?:\/\//.test(match)) return match;
        if (match.length < 3) return match;
        return ` $$${match.trim()}$$ `;
      }
    );

    // ✅ Limite les itérations de fusion pour éviter le backtracking
    for (let iteration = 0; iteration < 8; iteration++) {
      const before = r;
      r = r.replace(
        /\$\s*([^$]{0,500}?)\s*\$\s*([+\-*/=<>()\[\]{}.,\s]{0,50}?)\s*\$\s*([^$]{0,500}?)\s*\$/g,
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
    inner = fixTextInternals(inner);
    inner = fixUnitCommas(inner);
    inner = fixCdotSpacing(inner);
    inner = inner.replace(/^\$+/, '').replace(/\$+$/, '');

    /* ✅ v6.0 — sanitisation profonde : entités HTML, %/# nus, commandes
       héritées, accolades et \left\right équilibrés, environnements fermés */
    inner = sanitizeFormulaTex(inner);

    return open + inner + close;
  }

  function cleanLatexText(text) {
    if (!text || typeof text !== 'string') return text;
    if (!text.trim()) return text;

    const hasBackslash = text.indexOf('\\') !== -1;
    const hasDollar = text.indexOf('$') !== -1;
    const hasUnicode = hasUnicodeMath(text);
    const hasLatexAccent = /\\['`^"~cC]|\\\\(?:`|')/.test(text);
    const hasBrokenCmd = /(?<![\\a-zA-Z])(?:ext\{|rac\{|imes\s|heta\s|abla\s)/.test(text);

    if (!hasBackslash && !hasDollar && !hasUnicode && !hasLatexAccent && !hasBrokenCmd) return text;

    let r = text;

    r = repairBrokenLatexCommands(r);
    r = fixLatexAccents(r);
    r = normalizeDelimiters(r);
    r = cleanBrokenDelimiters(r);
    r = replaceUnicodeScripts(r);
    r = replaceUnicodeMath(r);
    r = fixOrphanArrows(r);
    r = fixCommandSpacing(r);
    r = fixTextInternals(r);
    r = normalizeSpacesAndCommas(r);
    r = fixUnitCommas(r);
    r = fixCdotSpacing(r);
    r = wrapOrphanLatex(r);

    const parts = r.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
    r = parts.map((part, i) => {
      if (i % 2 === 1) return cleanFormulaContent(part);
      return part;
    }).join('');

    r = fixOrphanParens(r);

    r = r.replace(/[ \t]+/g, ' ');
    r = r.replace(/\s+([.,;:!?])/g, '$1');

    return r;
  }

  function normalizeLatex(input) {
    if (!input || typeof input !== 'string') return '';
    return cleanLatexText(input);
  }

  function fixDelimiters(text) {
    if (!text || typeof text !== 'string') return '';
    let result = text;

    result = result.replace(/\\\((.+?)\\\)/gs, '$$$1$$');
    result = result.replace(/\\\[(.+?)\\\]/gs, '$$$$$1$$$$');
    result = result.replace(/\$\$\$+/g, '$$');

    return result;
  }

  function cleanAIResponse(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;

    cleaned = cleaned.replace(/```(?:json|latex|math)?\s*/gi, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

    cleaned = normalizeLatex(cleaned);
    cleaned = fixDelimiters(cleaned);

    return cleaned;
  }

  function shouldIgnoreNode(node) {
    if (!node || node.nodeType !== 1) return true;

    const tag = (node.tagName || '').toLowerCase();
    if (['script', 'style', 'noscript', 'textarea', 'pre', 'code', 'kbd', 'samp', 'option'].includes(tag)) {
      return true;
    }

    const cls = node.className || '';
    if (typeof cls === 'string') {
      if (cls.includes('katex') || cls.includes('no-katex') || cls.includes('katex-ignore')) {
        return true;
      }
    }

    let parent = node.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      if (parent.classList &&
          (parent.classList.contains('katex') ||
           parent.classList.contains('no-katex') ||
           parent.classList.contains('katex-ignore'))) {
        return true;
      }
      parent = parent.parentElement;
      depth++;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 9-ter. ✅ v6.0 — SANITISATION PROFONDE D'UNE FORMULE + RÉPARATION
  // POST-RENDU + REPLI UNICODE (« il y a toujours des formules mal
  // écrites » — le renforcement au maximum, sans exception visible).
  // ═══════════════════════════════════════════════════════════════

  /* Entités HTML qui fuient dans les réponses IA → caractères réels */
  function decodeHtmlEntities(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }

  /* ½ ⅓ ¼ ¾ ⅔ … → \frac{p}{q} (les fractions Unicode cassent le rendu) */
  const VULGAR_FRACTIONS = {
    '½': '\\frac{1}{2}', '⅓': '\\frac{1}{3}', '⅔': '\\frac{2}{3}',
    '¼': '\\frac{1}{4}', '¾': '\\frac{3}{4}', '⅕': '\\frac{1}{5}',
    '⅖': '\\frac{2}{5}', '⅗': '\\frac{3}{5}', '⅘': '\\frac{4}{5}',
    '⅙': '\\frac{1}{6}', '⅚': '\\frac{5}{6}', '⅐': '\\frac{1}{7}',
    '⅛': '\\frac{1}{8}', '⅜': '\\frac{3}{8}', '⅝': '\\frac{5}{8}',
    '⅞': '\\frac{7}{8}', '⅑': '\\frac{1}{9}'
  };

  /* Commandes héritées de LaTeX 2.09 que KaTeX ne connaît pas */
  const LEGACY_CMD_MAP = [
    [/\B\\rm\s*\{([^{}]*)\}/g, '\\mathrm{$1}'],
    [/\B\\rm\s+([a-zA-Z]+)/g, '\\mathrm{$1}'],
    [/\B\\bf\s*\{([^{}]*)\}/g, '\\mathbf{$1}'],
    [/\B\\bf\s+([a-zA-Z]+)/g, '\\mathbf{$1}'],
    [/\B\\it\s*\{([^{}]*)\}/g, '\\mathit{$1}'],
    [/\B\\it\s+([a-zA-Z]+)/g, '\\mathit{$1}'],
    [/\B\\cal\s*\{([^{}]*)\}/g, '\\mathcal{$1}'],
    [/\B\\cal\s+([a-zA-Z]+)/g, '\\mathcal{$1}'],
    [/\B\\sf\s+([a-zA-Z]+)/g, '\\mathsf{$1}'],
    [/\B\\tt\s+([a-zA-Z]+)/g, '\\mathtt{$1}'],
    [/\B\\Bbb\s+([a-zA-Z])/g, '\\mathbb{$1}'],
    [/\B\\mbox\s*\{?/g, '\\text{'],
    [/\B\\eqalign\s*\{/g, '\\begin{aligned}'],
    [/\B\\displaylines\s*\{/g, '\\begin{gathered}'],
    [/\B\\pmatrix\s*\{/g, '\\begin{pmatrix}'],
    [/\B\\bmatrix\s*\{/g, '\\begin{bmatrix}'],
    [/\B\\cases\s*\{/g, '\\begin{cases}'],
    [/\B\\matrix\s*\{/g, '\\begin{matrix}'],
    [/\B\\nonumber\b/g, ''],
    [/\B\\notag\b/g, ''],
    [/\B\\label\s*\{[^{}]*\}/g, ''],
    [/\B\\ref\s*\{[^{}]*\}/g, ''],
    [/\B\\dsum\b/g, '\\displaystyle\\sum'],
    [/\B\\dint\b/g, '\\displaystyle\\int']
  ];

  /* Équilibre { … } en ignorant les accolades échappées \{ \} */
  function balanceBraces(s) {
    let depth = 0, fixed = s;
    for (let pass = 0; pass < 6; pass++) {
      depth = 0;
      for (let i = 0; i < fixed.length; i++) {
        const c = fixed[i];
        if (c === '\\' && i + 1 < fixed.length) { i++; continue; } // \{ \} \\ …
        if (c === '{') depth++;
        else if (c === '}') depth--;
        if (depth < 0) { /* } en trop → retirée */
          fixed = fixed.slice(0, i) + fixed.slice(i + 1);
          i--; depth = 0;
        }
      }
      if (depth > 0) fixed += '}'.repeat(depth);
      if (depth <= 0) break;
    }
    return fixed;
  }

  /* Équilibre \left … \right (sans \right ⇒ tout le rendu casse) */
  function balanceLeftRight(s) {
    let r = s;
    const count = (re) => (r.match(re) || []).length;
    let open = count(/\\left(?![a-zA-Z])/g) - count(/\\left[.(|[]/g);
    let close = count(/\\right(?![a-zA-Z])/g) - count(/\\right[.)|]/g);
    /* compte simple : \left* vs \right* */
    const l = count(/\\left(?=[^\s])/g), rr = count(/\\right(?=[^\s])/g);
    if (l > rr) r += ' \\right.'.repeat(l - rr);
    else if (rr > l) r = '\\left. '.repeat(rr - l) + r;
    return r;
  }

  /* Ferme les \begin{env} restés ouverts */
  function balanceEnvironments(s) {
    const opens = [];
    const re = /\\(begin|end)\s*\{\s*([a-zA-Z*]+)\s*\}/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      if (m[1] === 'begin') opens.push(m[2]);
      else {
        const i = opens.lastIndexOf(m[2]);
        if (i !== -1) opens.splice(i, 1);
      }
    }
    let r = s;
    for (const env of opens) r += '\n\\end{' + env + '}';
    return r;
  }

  /* ═══ SANITISATION D'UNE FORMULE (contenu déjà délimité $…$ / $$…$$) ═══ */
  /* ═══════════════════════════════════════════════════════════════
     ✅ v8.63a — COUCHE v7 : erreurs récurrentes de GÉNÉRATION IA.
     Les modèles francophones produisent encore : polices TeX héritées
     (\bf, \cal…), \label/\tag, emojis dans les formules, degré « ° »
     nu, et surtout des MOTS FRANÇAIS accentués posés nus dans le mode
     math (caractère Unicode interdit hors \text → erreur rouge).
     Ces réparations s'appliquent AVANT le rendu ET au re-rendu des
     .katex-error (passage dans sanitizeFormulaTex, partagé). ═══ */
  function fixAiLegacyFontCommands(r) {
    r = r.replace(/\\bold(?![a-zA-Z])/g, '\\mathbf');
    r = r.replace(/\\bf(?![a-zA-Z])/g, '\\mathbf');
    r = r.replace(/\\it(?![a-zA-Z])/g, '\\mathit');
    r = r.replace(/\\rm(?![a-zA-Z])/g, '\\mathrm');
    r = r.replace(/\\cal(?![a-zA-Z])/g, '\\mathcal');
    r = r.replace(/\\Bbb(?![a-zA-Z])/g, '\\mathbb');
    r = r.replace(/\\tt(?![a-zA-Z])/g, '\\mathtt');
    return r;
  }

  function stripLatexMetadata(r) {
    r = r.replace(/\\label\s*\{[^{}]*\}/g, '');
    r = r.replace(/\\tag\s*\{[^{}]*\}/g, '');
    r = r.replace(/\\(?:nonumber|notag)(?![a-zA-Z])/g, '');
    r = r.replace(/\\(?:hfill|vfill|noindent|newline|clearpage)(?![a-zA-Z])/g, '');
    r = r.replace(/\\par(?![a-zA-Z])/g, '');
    r = r.replace(/\\displaystyle/g, '');
    return r;
  }

  function removeEmojiInMath(r) {
    /* emoji, pictogrammes, symboles de modificateurs : jamais dans une formule */
    r = r.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}]/gu, ' ');
    return r.replace(/[ \t]{2,}/g, ' ');
  }

  function fixDegreeInMath(r) {
    /* « 30° » → « 30^{\circ} » ; « ° » isolé → « ^{\circ} » */
    r = r.replace(/(\d)\s*°/g, '$1^{\\circ}');
    r = r.replace(/°/g, '^\\circ');
    return r;
  }

  function fixAccentedWordsInMath(r) {
    /* MOTS FRANÇAIS NUS dans le mode math (é, è, à, ç, œ, apostrophes…)
       → enveloppés dans \text{…}. Les \text{…} existants et les mots
       sans accent (variables, sin, cos…) ne sont jamais touchés. */
    var texts = [];
    r = r.replace(/\\text\s*\{[^{}]*\}/g, function (m) {
      texts.push(m);
      return '\u0000T' + (texts.length - 1) + '\u0000';
    });
    r = r.replace(/[A-Za-zÀ-ÖØ-öø-ÿ'’][A-Za-zÀ-ÖØ-öø-ÿ'’\-]*/g, function (m) {
      if (!/[àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ'’]/.test(m)) return m;
      if (/^(?:sin|cos|tan|ln|log|exp|min|max|det|arg|gcd|lcm|cot|sec|csc|deg)$/i.test(m)) return m;
      return '\\text{' + m + '}';
    });
    r = r.replace(/\u0000T(\d+)\u0000/g, function (m, i) {
      return texts[Number(i)] || '';
    });
    return r;
  }

  function sanitizeFormulaTex(tex) {
    if (!tex || typeof tex !== 'string') return tex;
    let r = tex;

    r = decodeHtmlEntities(r);

    /* % et # nus : % mange la fin de la ligne, # casse le rendu */
    r = r.replace(/(?<!\\)%/g, '\\%');
    r = r.replace(/(?<!\\)#/g, '\\#');
    /* & nu SANS environnement d'alignement → échappé */
    if (!/\\begin\s*\{/.test(r)) r = r.replace(/(?<!\\)&/g, '\\&');

    for (const [re, rep] of LEGACY_CMD_MAP) r = r.replace(re, rep);

    /* ✅ v8.63a — couche v7 : erreurs récurrentes de génération IA */
    r = fixAiLegacyFontCommands(r);
    r = stripLatexMetadata(r);
    r = removeEmojiInMath(r);
    r = fixDegreeInMath(r);
    r = fixAccentedWordsInMath(r);

    for (const [glyph, lat] of Object.entries(VULGAR_FRACTIONS)) {
      r = r.split(glyph).join(lat);
    }

    /* √ (…) → \sqrt{…} (le √ mappe vers \sqrt mais les parenthèses restent) */
    for (let pass = 0; pass < 3; pass++) {
      const before = r;
      r = r.replace(/\\sqrt\s*\(([^()]*)\)/g, '\\sqrt{$1}');
      if (r === before) break;
    }

    /* Astérisques Markdown qui fuient : **a** → \mathbf{a}, restes → × */
    r = r.replace(/\*\*([^*]+)\*\*/g, '\\mathbf{$1}');
    r = r.replace(/\*\*/g, '');
    r = r.replace(/(?<!\\)\*/g, '\\times ');

    r = balanceEnvironments(r);
    r = balanceLeftRight(r);
    r = balanceBraces(r);

    /* barre inverse orpheline en fin de formule */
    r = r.replace(/\\+$/, '');

    return r;
  }

  /* ═══ DERNIER FILET : TeX illisible → texte Unicode lisible ═══
     (jamais de source rouge brute à l'écran — le pire cas est une
     formule « à plat » parfaitement lisible par l'élève) */
  const FLAT_MAP = {
    times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤',
    geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
    sim: '∼', simeq: '≃', propto: '∝', infty: '∞', to: '→', gets: '←',
    rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
    Leftrightarrow: '⇔', leftrightarrow: '↔', mapsto: '↦', implies: '⇒',
    iff: '⇔', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃',
    subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅',
    varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧',
    lor: '∨', sum: '∑', prod: '∏', int: '∫', iint: '∬', iiint: '∭',
    oint: '∮', partial: '∂', nabla: '∇', aleph: 'ℵ', ell: 'ℓ',
    hbar: 'ℏ', degree: '°', prime: '′', langle: '⟨', rangle: '⟩',
    lbrace: '{', rbrace: '}', lbrack: '[', rbrack: ']', quad: ' ',
    qquad: '  ', cdots: '⋯', ldots: '…', vdots: '⋮', ddots: '⋱',
    perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', square: '□',
    checkmark: '✓', dagger: '†', star: '⋆', circ: '∘', bullet: '•',
    ast: '∗', oplus: '⊕', otimes: '⊗', ominus: '⊖', equiv: '≡',
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε',
    varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
    pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ',
    varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'ϕ',
    chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ',
    Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ',
    Psi: 'Ψ', Omega: 'Ω'
  };
  const SUPER_FLAT = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
  const SUB_FLAT = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', i: 'ᵢ', j: 'ⱼ' };

  function flatScript(conv, body) {
    const chars = [];
    for (const ch of body) chars.push(conv[ch] || ch);
    return chars.join('');
  }

  function flattenTexToUnicode(tex) {
    if (!tex || typeof tex !== 'string') return '';
    let r = String(tex);
    const MAX_PASSES = 24;
    let pass = 0;
    /* \frac{a}{b} → (a)/(b) ; \sqrt{a} → √(a) ; indices/exposants Unicode */
    while (pass++ < MAX_PASSES) {
      const before = r;
      r = r.replace(/\\(?:d?frac|tfrac|cfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => {
        const needP = (s) => (/^[a-zA-Z0-9]+$/.test(s) ? s : '(' + s + ')');
        return needP(a) + '/' + needP(b);
      });
      r = r.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
      r = r.replace(/\\(?:mathbb|mathbf|mathrm|mathcal|mathfrak|mathsf|mathtt|text|textrm|textsf|texttt|operatorname|boldsymbol)\s*\{([^{}]*)\}/g, '$1');
      r = r.replace(/\\(?:overline|underline|vec|hat|bar|widetilde|widehat|boxed)\s*\{([^{}]*)\}/g, '$1');
      r = r.replace(/\^\s*\{([^{}]*)\}/g, (m, b) => flatScript(SUPER_FLAT, b));
      r = r.replace(/_\s*\{([^{}]*)\}/g, (m, b) => flatScript(SUB_FLAT, b));
      r = r.replace(/\^\s*([a-zA-Z0-9])/g, (m, b) => flatScript(SUPER_FLAT, b));
      r = r.replace(/_\s*([a-zA-Z0-9])/g, (m, b) => flatScript(SUB_FLAT, b));
      r = r.replace(/\\left|\\right|\\!|\\,|\\;|\\:|\\ /g, '');
      r = r.replace(/\\displaystyle|\\limits|\\nolimits|\\big[lr]?|\\Big[lr]?|\\bigg[lr]?|\\Bigg[lr]?/g, '');
      r = r.replace(/\\([a-zA-Z]+)/g, (m, cmd) => {
        if (FLAT_MAP[cmd] !== undefined) return FLAT_MAP[cmd];
        if (cmd === 'begin' || cmd === 'end') return '';
        return '';
      });
      r = r.replace(/[{}]/g, '');
      if (r === before) break;
    }
    return r.replace(/\s+/g, ' ').trim();
  }

  /* ═══ RÉPARATION POST-RENDU : aucune source rouge brute ne reste à l'écran ═══
     KaTeX (throwOnError:false) remplace la formule cassée par
     <span class="katex-error" title="…">source</span> → on retente avec la
     formule SANITISÉE ; si ça casse encore, on écrit la version Unicode à plat. */
  function repairKatexErrors(root) {
    if (typeof katex === 'undefined') return;
    let errs;
    try { errs = (root || document.body).querySelectorAll('.katex-error'); } catch (e) { return; }
    if (!errs || !errs.length) return;

    errs.forEach(function (el) {
      if (el.__arvexaRepaired) return;
      el.__arvexaRepaired = true;

      const src = el.getAttribute('data-original') || el.textContent || '';
      if (!src.trim()) return;
      const displayMode = /\\begin\s*\{(align|align\*|gather|gather\*|equation|equation\*|split|multline|cases|array|matrix)/.test(src)
        || /\\\\/.test(src)
        || (el.parentElement && el.parentElement.classList && el.parentElement.classList.contains('katex-display'));

      const repaired = sanitizeFormulaTex(src);
      let done = false;
      try {
        katex.render(repaired, el, { displayMode, throwOnError: true, strict: false, trust: false, macros: MACROS });
        done = true;
      } catch (e1) {
        try {
          katex.render(repaired, el, { displayMode, throwOnError: false, strict: false, trust: false, macros: MACROS });
          done = !el.querySelector('.katex-error');
        } catch (e2) { done = false; }
      }

      if (done) {
        el.classList.remove('katex-error');
        el.style.removeProperty('color');
        el.removeAttribute('title');
      } else {
        el.textContent = flattenTexToUnicode(src);
        el.classList.add('arvexa-latex-raw');
        el.classList.remove('katex-error');
        el.removeAttribute('title');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 10. RENDU KATEX
  // ═══════════════════════════════════════════════════════════════
  function renderKaTeXInternal(root, options) {
    if (!root) return;

    if (typeof renderMathInElement !== 'function') {
      setTimeout(() => renderKaTeXInternal(root, options), 200);
      return;
    }

    const element = root || document.body;
    if (!element || !document.body.contains(element)) return;

    try {
      renderMathInElement(element, {
        delimiters: DELIMITERS,
        throwOnError: false,
        errorColor: '#ff9a84',
        strict: false,
        trust: false,
        maxSize: 50,
        maxExpand: 2000,
        macros: { ...MACROS, ...(options && options.macros ? options.macros : {}) },
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'kbd', 'samp', 'option'],
        ignoredClasses: ['no-katex', 'katex-ignore', 'katex'],
        ...(options || {})
      });
    } catch (error) {
      console.warn('[KaTeX] render error:', error && error.message);
    }

    /* ✅ v6.0 — AUCUNE source rouge brute ne reste à l'écran : chaque
       .katex-error est re-rendu avec la formule sanitised, sinon aplati
       en Unicode lisible. C'est la couche qui rend les formules « mal
       écrites » visuellement impossibles. */
    try { repairKatexErrors(element); } catch (e) { /* silencieux */ }
  }

  // ═══════════════════════════════════════════════════════════════
  // 11. FALLBACK VISUEL
  // ═══════════════════════════════════════════════════════════════
  function applyFallbackStyle() {
    if (document.getElementById('arvexa-katex-fallback-style')) return;

    const style = document.createElement('style');
    style.id = 'arvexa-katex-fallback-style';
    style.textContent = `
      .katex-error {
        color: #ff9a84 !important;
        background: rgba(255, 154, 132, 0.10) !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-family: 'SF Mono', 'Menlo', 'Consolas', monospace !important;
        font-size: 0.9em !important;
        word-break: break-word !important;
        line-height: 1.5 !important;
        display: inline-block !important;
        max-width: 100% !important;
      }
      .arvexa-latex-raw {
        color: #ffd29d !important;
        background: rgba(255, 210, 157, 0.08) !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-family: 'SF Mono', 'Menlo', 'Consolas', monospace !important;
        font-size: 0.88em !important;
        word-break: break-word !important;
        line-height: 1.5 !important;
        display: inline !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════
  // 12. RENDU GLOBAL
  // ═══════════════════════════════════════════════════════════════
  function renderMath(root) {
    const element = root || document.body;
    if (!element) return;

    try {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (shouldIgnoreNode(node.parentElement)) return NodeFilter.FILTER_REJECT;
            const text = node.textContent;
            if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
            if (/\$|\\\(|\\\[/.test(text) || containsKnownLatex(text)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            if (/(?<![\\a-zA-Z])(?:ext\{|rac\{|imes\s|heta\s|abla\s)/.test(text)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        }
      );

      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);

      nodes.forEach((n) => {
        const original = n.textContent;

        let fixed = repairBrokenLatexCommands(original);
        fixed = fixDelimiters(fixed);
        fixed = replaceUnicodeMath(fixed);   // Unicode → LaTeX DANS les $…$ (fix $x → 3$)
        fixed = fixOrphanArrows(fixed);      // flèches LaTeX/ASCII orphelines → Unicode (fix « ADN\to ARN »)

        if (/\\text\{/.test(fixed)) {
          fixed = fixTextInternals(fixed);
        }

        /* ✅ v6.0 — sanitisation profonde de chaque segment délimité avant
           le premier rendu (accolades équilibrées, % nus, commandes legacy…) */
        const parts6 = fixed.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
        for (let p = 1; p < parts6.length; p += 2) {
          parts6[p] = sanitizeFormulaTex(parts6[p]);
        }
        fixed = parts6.join('');

        if (fixed !== original) n.textContent = fixed;
      });
    } catch (e) {
      // Silencieux
    }

    renderKaTeXInternal(element);
  }

  function renderMathSafe(root) {
    if (!root) return;
    requestAnimationFrame(() => {
      renderMath(root);
      setTimeout(() => renderMath(root), 250);
    });
  }

  function renderKaTeX(root, options) {
    if (!root) return;

    if (typeof renderMathInElement === 'function') {
      renderKaTeXInternal(root, options);
    } else {
      setTimeout(() => renderKaTeX(root, options), 200);
    }
  }

  function hasLatexContent(node) {
    if (!node || node.nodeType !== 1) return false;
    const text = node.textContent || '';
    if (/\$|\\\(|\\\[/.test(text)) return true;
    if (containsKnownLatex(text)) return true;
    if (/(?<![\\a-zA-Z])(?:ext\{|rac\{|imes\s|heta\s|abla\s)/.test(text)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 13. MUTATION OBSERVER
  // ═══════════════════════════════════════════════════════════════
  let observerTimer = null;
  let pendingTargets = new Set();

  function flushPendingTargets() {
    observerTimer = null;
    const targets = Array.from(pendingTargets);
    pendingTargets.clear();

    targets.forEach((target) => {
      if (document.body.contains(target)) {
        try {
          renderMath(target);
        } catch (e) {
          // Silencieux
        }
      }
    });
  }

  function initAutoRender() {
    if (!window.MutationObserver) return;
    if (window.__arvexaKatexObserver) return;
    if (window.__arvexaKatexDisabled) {
      console.log('📐 KaTeX auto-render désactivé');
      return;
    }

    applyFallbackStyle();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) {
            if (node.nodeType === 3 && node.textContent) {
              const parent = node.parentElement;
              if (parent && !shouldIgnoreNode(parent) && hasLatexContent(parent)) {
                pendingTargets.add(parent);
              }
            }
            return;
          }
          if (shouldIgnoreNode(node)) return;
          if (hasLatexContent(node)) {
            pendingTargets.add(node);
          }
        });

        if (mutation.type === 'characterData') {
          const target = mutation.target;
          const parent = target && target.parentElement;
          if (parent && !shouldIgnoreNode(parent) && hasLatexContent(parent)) {
            pendingTargets.add(parent);
          }
        }
      });

      if (pendingTargets.size === 0) return;

      if (observerTimer) clearTimeout(observerTimer);
      observerTimer = setTimeout(flushPendingTargets, 80);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.__arvexaKatexObserver = observer;
    console.log('📐 KaTeX auto-render activé');
  }

  // ═══════════════════════════════════════════════════════════════
  // 14. EXPORT GLOBAL
  // ═══════════════════════════════════════════════════════════════
  window.KaTeXUtils = {
    normalizeLatex,
    fixDelimiters,
    cleanAIResponse,
    cleanLatexText,
    fixTextInternals,
    fixUnitCommas,
    fixCdotSpacing,
    fixLatexAccents,
    normalizeSpacesAndCommas,
    repairBrokenLatexCommands,

    renderMath,
    renderMathSafe,
    renderKaTeX,

    initAutoRender,
    disableAutoRender: () => {
      window.__arvexaKatexDisabled = true;
      if (window.__arvexaKatexObserver) {
        window.__arvexaKatexObserver.disconnect();
        window.__arvexaKatexObserver = null;
      }
    },

    containsKnownLatex,
    hasUnicodeMath,
    fixOrphanArrows,

    sanitizeFormulaTex,
    flattenTexToUnicode,
    repairKatexErrors,

    MACROS,
    DELIMITERS,
    KNOWN_LATEX_COMMANDS
  };

  // ═══════════════════════════════════════════════════════════════
  // 15. AUTO-INIT
  // ═══════════════════════════════════════════════════════════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initAutoRender();
    });
  } else {
    initAutoRender();
  }

  console.log('📐 KaTeXUtils v6.0 chargé (sanitisation + réparation post-rendu)');

})();
