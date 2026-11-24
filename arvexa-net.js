/* ═══════════════════════════════════════════════════════════════
   ARVEXA NET — v8.55a
   ADAPTATION RÉSEAU : le site reste fluide sur TOUTES les connexions
   (très faible 2G → élevée 5G) — demande du propriétaire.

   PRINCIPE :
   1. Détecte la qualité réseau via navigator.connection (effectiveType,
      downlink, saveData) avec repli prudent « mid » si l'API manque.
   2. Pose data-net="slow|mid|fast" sur <html> → le CSS ci-dessous
      DÉSACTIVE ce qui coûte cher sur connexion faible : animations de
      halos/fonds, backdrop-filter, transitions lourdes, smooth scroll,
      lecteur de shimmer — la page reste nette et réactive, sans overdraw.
   3. Émet « arvexa-netchange » + window.ARVEXA_NET pour le JS des pages
      (ex. reporter un chargement non critique).
   4. Idempotent, zéro dépendance, fonctionne offline (cache SW).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ARVEXA_NET__) return;
  window.__ARVEXA_NET__ = true;

  var STYLE = ''
    /* ── SLOW (2G / 3G lent / saveData) : on coupe le coûteux ── */
    + 'html[data-net="slow"] .gradient-bg,'
    + 'html[data-net="slow"] .glow,'
    + 'html[data-net="slow"] .glow-1,'
    + 'html[data-net="slow"] .glow-2,'
    + 'html[data-net="slow"] .glow-3{animation:none!important;}'
    + 'html[data-net="slow"] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}'
    + 'html[data-net="slow"] .shimmer,'
    + 'html[data-net="slow"] .shimmer *,'
    + 'html[data-net="slow"] [class*="shimmer-"]{animation:none!important;}'
    + 'html[data-net="slow"]{scroll-behavior:auto!important;}'
    + 'html[data-net="slow"] *{transition-duration:.01ms!important;animation-duration:.01ms!important;}'
    + 'html[data-net="slow"] .ps-bar-fill,'
    + 'html[data-net="slow"] .progress-fill{transition:none!important;}'
    /* ── MID (3G correct / 4G lente) : on allège seulement le fond ── */
    + 'html[data-net="mid"] .glow,'
    + 'html[data-net="mid"] .glow-1,'
    + 'html[data-net="mid"] .glow-2,'
    + 'html[data-net="mid"] .glow-3{animation:none!important;filter:blur(48px)!important;}'
    + 'html[data-net="mid"]{scroll-behavior:smooth;}'
    + '@media (prefers-reduced-motion:reduce){html[data-net] .glow,html[data-net] .gradient-bg{animation:none!important;}}';

  function injectStyle() {
    if (document.getElementById('arvx-net-style')) return;
    var s = document.createElement('style');
    s.id = 'arvx-net-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  function classify() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return 'mid';
    if (c.saveData) return 'slow';
    var t = String(c.effectiveType || '').toLowerCase();
    if (t === 'slow-2g' || t === '2g') return 'slow';
    if (t === '3g') return 'mid';
    if (t === '4g') return 'fast';
    var dl = Number(c.downlink || 0);
    if (dl > 0 && dl < 0.7) return 'slow';
    if (dl >= 0.7 && dl < 2.5) return 'mid';
    return dl >= 2.5 ? 'fast' : 'mid';
  }

  function apply() {
    var level = classify();
    var prev = document.documentElement.getAttribute('data-net');
    injectStyle();
    document.documentElement.setAttribute('data-net', level);
    window.ARVEXA_NET = {
      level: level,
      isSlow: level === 'slow',
      saveData: !!(navigator.connection && navigator.connection.saveData)
    };
    if (prev && prev !== level) {
      try { window.dispatchEvent(new CustomEvent('arvexa-netchange', { detail: { level: level } })); } catch (e) {}
    }
    return level;
  }

  apply();

  try {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && typeof c.addEventListener === 'function') {
      c.addEventListener('change', apply);
    }
  } catch (e) {}
})();
