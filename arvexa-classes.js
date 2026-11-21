/* ═══════════════════════════════════════════════════════════════════
   ARVEXA SCHOOL — ARVEXA-CLASSES.JS (✅ v8.31)
   Registre central d'AFFICHAGE des classes : la 3ᵉ entre dans ARVEXA
   (consigne propriétaire : « au lieu de se baser uniquement sur le
   baccalauréat, on se base sur les classes du lycée et la troisième »).
   Deux examens nationaux : BEPC (3ᵉ) et BAC (Terminale).
   2ᵉ et 1ʳᵉ : pas d'examen national — objectif BAC en vue.
   Utilisé par onboarding.html et profil.html (affichage dynamique).
   api/arv.js (serveur Node) garde sa propre copie de ce registre.
   Legacy : 'terminale_d' (comptes v ≤ 8.30) reste affiché tel quel.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LABELS = {
    troisieme: '3ᵉ',
    seconde: '2ᵉ',
    premiere: '1ʳᵉ',
    terminale: 'Tle',
    terminale_d: 'Terminale D' // legacy v ≤ 8.30
  };

  var LONG = {
    troisieme: 'Troisième',
    seconde: 'Seconde',
    premiere: 'Première',
    terminale: 'Terminale',
    terminale_d: 'Terminale D'
  };

  // Examen national associé à la classe (null = aucun)
  var EXAMS = {
    troisieme: 'BEPC',
    terminale: 'BAC',
    terminale_d: 'BAC'
  };

  window.ARVEXA_CLASSES = {
    /** Libellé court : '3ᵉ', '2ᵉ', '1ʳᵉ', 'Tle', 'Terminale D' (legacy). */
    label: function (classId) {
      if (!classId) return LABELS.terminale_d;
      return LABELS[classId] || classId;
    },
    /** Libellé long : 'Troisième', 'Seconde', 'Première', 'Terminale'. */
    long: function (classId) {
      if (!classId) return LONG.terminale_d;
      return LONG[classId] || classId;
    },
    /** Examen national : 'BEPC', 'BAC' ou null (2ᵉ, 1ʳᵉ). */
    exam: function (classId) {
      return EXAMS[classId] || null;
    },
    /** Objectif affiché : « BEPC 2026 », « BAC 2026 », « Préparer le BAC ». */
    goal: function (classId, year) {
      var exam = EXAMS[classId];
      if (exam) return exam + ' ' + year;
      return 'Préparer le BAC';
    },
    /** Compte legacy (créé avant v8.31) : pas de vraie classe connue. */
    isLegacy: function (classId) {
      return !classId || classId === 'terminale_d';
    }
  };
})();
