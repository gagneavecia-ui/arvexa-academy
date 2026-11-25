/*! arvexa-applock.js — v1.0 — v8.63a — ARVEXA School
================================================================
✅ DEMANDE DU PROPRIÉTAIRE (v8.63a) : « comme c'est une application PWA,
lorsqu'on fait un long appui sur une image ou un mot ça déclenche Google
pour faire des recherches alors que nous on veut la transformer en une
application — ça aussi tu bloques ça : il peut ni copier, ni faire la
recherche, ni déclencher Google. »

COMPORTEMENT APPLIQUÉ SUR TOUTES LES PAGES :
  1. SÉLECTION DE TEXTE désactivée partout (user-select:none +
     -webkit-user-select:none + -webkit-touch-callout:none) → l'appui
     long sur un mot ne déclenche plus la sélection, la loupe, ni
     l'overlay de recherche Google.
  2. MENU CONTEXTUEL (appui long Android / clic droit) bloqué partout.
  3. COPIER/COUPER bloqués hors des champs de saisie (l'élève garde la
     main sur SES champs : input, textarea, contenteditable).
  4. Glisser-déposer d'images/liens désactivé (dragstart).
  5. Double-tap zoom et pinch restent gérés par le viewport des pages.
     Les champs de saisie restent 100 % utilisables (saisie, correction).
================================================================ */
(function () {
  'use strict';
  if (window.__arvexaAppLock) return;
  window.__arvexaAppLock = true;
  window.ARVEXA_APPLOCK_VERSION = '1.0';

  /* ── 1. CSS : aucune sélection tactile hors champs de saisie ── */
  var CSS = [
    '/* ARVEXA APPLOCK v1.0 — comportement application (v8.63a) */',
    'html, body, div, span, p, h1, h2, h3, h4, h5, h6, a, img, li, ul, ol,',
    'section, article, header, footer, nav, aside, main, button, label,',
    'strong, em, small, code, pre, table, td, th, figure, figcaption {',
    '  -webkit-user-select: none; user-select: none;',
    '  -webkit-touch-callout: none;',
    '}',
    'input, textarea, select, [contenteditable="true"], [contenteditable=""] {',
    '  -webkit-user-select: text; user-select: text;',
    '  -webkit-touch-callout: default;',
    '}'
  ].join('\n');
  try {
    var style = document.createElement('style');
    style.id = 'arvexa-applock-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  /* Les champs de saisie (et leurs enfants) restent interactifs. */
  function isEditable(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
  }

  /* ── 2. Menu contextuel / appui long → bloqué partout ── */
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  }, { capture: true });

  /* ── 3. Copier / couper : bloqués hors des champs de saisie ── */
  function blockClipboard(e) {
    if (isEditable(e.target)) return; /* ses propres champs restent libres */
    e.preventDefault();
  }
  document.addEventListener('copy', blockClipboard, { capture: true });
  document.addEventListener('cut', blockClipboard, { capture: true });

  /* ── 4. Sélection démarrée au doigt hors champ → annulée ── */
  document.addEventListener('selectstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  }, { capture: true });

  /* ── 5. Glisser d'image / de lien → bloqué ── */
  document.addEventListener('dragstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  }, { capture: true });

  /* ── 6. Filet iOS : appui long sur image/link → pas de fiche Aperçu ── */
  document.addEventListener('touchend', (function () {
    var lastTouch = { t: 0, x: 0, y: 0 };
    return function (e) {
      if (isEditable(e.target)) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      /* rien à faire de spécial : user-select/touch-callout suffisent ;
         ce bloc neutralise un éventuel comportement de sélection résiduel */
      if (e.cancelable && window.getSelection && String(window.getSelection())) {
        try { window.getSelection().removeAllRanges(); } catch (err) {}
      }
      lastTouch.t = Date.now(); lastTouch.x = t.clientX; lastTouch.y = t.clientY;
    };
  })(), { passive: true });
})();
