/* ═══════════════════════════════════════════════════════════════════
   ARVEXA SCHOOL — ARVEXA-CLASSES.JS (✅ v8.34)
   Registre central d'AFFICHAGE des classes : DU COLLÈGE À L'UNIVERSITÉ.
   10 classes proposées à l'inscription (modale custom v8.34, liste
   validée par le propriétaire) :
     Collège    : 6ᵉ, 5ᵉ, 4ᵉ, 3ᵉ (BEPC en fin de cycle)
     Lycée      : Seconde, Première, Terminale (BAC — séries A / C / D)
     Université : Licence 1 (L1), Licence 2 (L2), Licence 3 (L3)
   + CLASSE LIBRE (« custom ») : l'élève écrit lui-même sa classe réelle
   ou son niveau professionnel dans le champ de saisie de l'inscription.
   ✅ v8.34 — PLUS DE DURÉE/SESSION D'EXAMEN (consigne propriétaire :
   « il y a plusieurs domaines, il y en a d'autres classes qui n'ont
   même pas d'examen ») : examYear n'est plus demandé aux nouveaux
   comptes ; les anciens comptes qui l'ont gardent leur affichage.
   Utilisé par onboarding.html, profil.html et parcours.js (accueil).
   api/arv.js (serveur Node) garde sa propre copie de ce registre.
   Legacy : 'terminale_d' (comptes v ≤ 8.30) reste affiché tel quel.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LABELS = {
    sixieme: '6ᵉ',
    cinquieme: '5ᵉ',
    quatrieme: '4ᵉ',
    troisieme: '3ᵉ',
    seconde: '2ᵉ',
    premiere: '1ʳᵉ',
    terminale: 'Tle',
    licence1: 'L1',
    licence2: 'L2',
    licence3: 'L3',
    custom: 'Ta classe',
    terminale_d: 'Terminale D' // legacy v ≤ 8.30
  };

  var LONG = {
    sixieme: 'Sixième',
    cinquieme: 'Cinquième',
    quatrieme: 'Quatrième',
    troisieme: 'Troisième',
    seconde: 'Seconde',
    premiere: 'Première',
    terminale: 'Terminale',
    licence1: 'Licence 1',
    licence2: 'Licence 2',
    licence3: 'Licence 3',
    custom: 'Classe personnalisée',
    terminale_d: 'Terminale D'
  };

  // Domaine d'étude (groupes de la modale d'inscription + affichage)
  var DOMAIN = {
    sixieme: 'college',
    cinquieme: 'college',
    quatrieme: 'college',
    troisieme: 'college',
    seconde: 'lycee',
    premiere: 'lycee',
    terminale: 'lycee',
    licence1: 'superieur',
    licence2: 'superieur',
    licence3: 'superieur',
    custom: 'libre',
    terminale_d: 'lycee'
  };

  // Examen national associé à la classe (null = aucun — plusieurs
  // domaines n'en ont pas).
  var EXAMS = {
    troisieme: 'BEPC',
    terminale: 'BAC',
    terminale_d: 'BAC'
  };

  // Objectif affiché quand la classe n'a pas d'examen national.
  var GOALS = {
    sixieme: 'Collège en route',
    cinquieme: 'Collège en route',
    quatrieme: 'BEPC en vue',
    seconde: 'BAC en vue',
    premiere: 'BAC en vue',
    licence1: 'Réussir ta licence',
    licence2: 'Réussir ta licence',
    licence3: 'Réussir ta licence',
    custom: 'Ton objectif'
  };

  // Ordre officiel de la modale d'inscription (v8.34, liste validée).
  var ORDER = [
    'sixieme', 'cinquieme', 'quatrieme', 'troisieme',
    'seconde', 'premiere', 'terminale',
    'licence1', 'licence2', 'licence3'
  ];

  window.ARVEXA_CLASSES = {
    /** Libellé court : '6ᵉ', '3ᵉ', 'Tle', 'L2', 'Terminale D' (legacy). */
    label: function (classId) {
      if (!classId) return LABELS.terminale_d;
      return LABELS[classId] || classId;
    },
    /** Libellé long : 'Sixième', 'Troisième', 'Licence 2'… */
    long: function (classId) {
      if (!classId) return LONG.terminale_d;
      return LONG[classId] || classId;
    },
    /** Domaine : 'college' | 'lycee' | 'superieur' | 'libre'. */
    domain: function (classId) {
      return DOMAIN[classId] || null;
    },
    /** Examen national : 'BEPC', 'BAC' ou null (aucun examen national). */
    exam: function (classId) {
      return EXAMS[classId] || null;
    },
    /** ✅ v8.53a — CIBLE adaptative (fini le « site 100 % BAC », demande du
        propriétaire : « tout ce qui fait référence [au BAC] tu le remplaces
        par des choses plus intelligentes et adaptées à tous les niveaux et
        domaines ») : renvoie la cible du parcours de CETTE classe —
        « le BAC » (Terminale), « le BEPC » (3ᵉ, 4ᵉ en vue), « ta licence »
        (L1/L2/L3), « ton objectif » (6ᵉ/5ᵉ/classe libre). */
    goalTarget: function (classId) {
      var exam = EXAMS[classId];
      if (exam) return 'le ' + exam;
      var g = GOALS[classId] || '';
      if (/BEPC/i.test(g)) return 'le BEPC';
      if (/BAC/i.test(g)) return 'le BAC';
      if (/licence/i.test(g)) return 'ta licence';
      return 'ton objectif';
    },
    /** Objectif affiché : « BEPC 2027 » (legacy avec session), « BAC »,
        « BAC en vue », « Réussir ta licence », « Ton objectif »… */
    goal: function (classId, year) {
      if (!classId) return 'Préparer le BAC';
      var exam = EXAMS[classId];
      if (exam) return year ? exam + ' ' + year : exam;
      return GOALS[classId] || 'Préparer le BAC';
    },
    /** ✅ v8.34 — VRAIE classe complète (accueil « Ton parcours », profil) :
        full('terminale', '', 'C') → « Terminale C » ;
        full('custom', 'Bac Pro comptabilité') → « Bac Pro comptabilité » ;
        full('troisieme') → « Troisième ». */
    full: function (classId, customClass, series) {
      if (classId === 'custom') {
        var t = String(customClass || '').trim();
        return t || 'Ta classe';
      }
      var base = LONG[classId] || classId || 'Terminale D';
      if (classId === 'terminale' && series) return base + ' ' + String(series).toUpperCase();
      return base;
    },
    /** Compte legacy (créé avant v8.31) : pas de vraie classe connue. */
    isLegacy: function (classId) {
      return !classId || classId === 'terminale_d';
    },
    /** Ordre officiel des 10 classes de la modale. */
    all: function () {
      return ORDER.slice(0);
    }
  };
})();
