/* ═══════════════════════════════════════════════════════════════════
   ARVEXA-LOADING-CAP.JS — ⚡ v8.73a — CHARGEMENT 2 SECONDES FIXES
   ─────────────────────────────────────────────────────────────────
   Demande du propriétaire : « le chargement et le squelette dans chaque
   page doivent disparaître en 2 secondes fixes — dès que les 2 secondes
   sont écoulées il disparaît, ça donne le temps à Firebase et à la page
   de charger ses données ».

   Fonctionne avec le mécanisme existant de chaque page :
   - boot inline (#bootLoader + __arvexaBootHide) → appelé proprement
     (les révélations de graphismes de la page sont déclenchées) ;
   - squelettes ARVSkel (gates) → toutes les portes marquées réglées
     (les callbacks de page remplacent le squelette par le contenu dès
     qu'il arrive, même après le cap) ;
   - filet CSS html.arv-cap-done → tout .arv-boot / .arv-sk résiduel
     est masqué quoi qu'il arrive.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var CAP_MS = 2000;
  var fired = false;

  function cap() {
    if (fired) return;
    fired = true;
    /* 1. Levée propre du boot de la page (révélations comprises). */
    try {
      if (typeof window.__arvexaBootHide === 'function') { window.__arvexaBootHide(); }
      else {
        var el = document.getElementById('bootLoader');
        if (el) { el.classList.add('gone'); el.dataset.gone = '1'; }
      }
    } catch (e) {}
    /* 2. Toutes les portes de squelette sont réglées (jamais bloquantes). */
    try {
      if (window.ARVSkel && window.ARVSkel._g) {
        for (var k in window.ARVSkel._g) { window.ARVSkel._g[k] = true; }
        if (typeof window.ARVSkel._fire === 'function') window.ARVSkel._fire();
      }
      if (window.ARVSkel && window.ARVSkel._g && window.ARVSkel._g.__capDone === undefined) {
        window.ARVSkel._g.__capDone = true;
      }
    } catch (e) {}
    /* 3. Filet CSS : aucun squelette ni boot résiduel ne reste visible. */
    try { document.documentElement.classList.add('arv-cap-done'); } catch (e) {}
  }

  function arm() { setTimeout(cap, CAP_MS); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }
  /* Sécurité double : même si DOMContentLoaded est manqué (bfcache), un
     minuteur absolu depuis l'exécution du script ferme le cap à 2 s + marge. */
  setTimeout(cap, CAP_MS + 1200);
})();
