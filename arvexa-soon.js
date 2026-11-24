/* ═══════════════════════════════════════════════════════════════
   ARVEXA SOON — v8.55a
   Toast uniforme « bientôt disponible » pour les entrées de menu et
   les boutons dont la page sera conçue plus tard (Marketplace,
   Ambassadeur ARVEXA…).

   UTILISATION : n'importe quel élément avec l'attribut data-soon :
     <a href="#" data-soon="Marketplace arrive bientôt">…</a>
   Au clic : preventDefault + toast aux couleurs du site (or sur nuit),
   auto-dismiss 2,8 s. Aucune dépendance, idempotent, exclusif au
   document courant (listener attaché une seule fois).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ARVEXA_SOON__) return;
  window.__ARVEXA_SOON__ = true;

  var STYLE = ''
    + '.arvx-soon-toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,14px);'
    + 'z-index:13000;display:flex;align-items:center;gap:10px;max-width:min(92vw,420px);'
    + 'padding:13px 18px;border-radius:14px;background:rgba(10,10,10,0.92);'
    + 'border:1px solid rgba(224,184,74,0.35);box-shadow:0 12px 34px rgba(0,0,0,0.45);'
    + 'color:#F5F0E8;font-family:Inter,system-ui,sans-serif;font-size:13.5px;font-weight:600;'
    + 'letter-spacing:0.01em;opacity:0;pointer-events:none;'
    + 'transition:opacity .22s ease,transform .22s ease;backdrop-filter:blur(10px);}'
    + '.arvx-soon-toast.show{opacity:1;transform:translate(-50%,0);}'
    + '.arvx-soon-toast .ico{font-size:16px;line-height:1;}'
    + '.arvx-soon-toast .txt{overflow-wrap:anywhere;}'
    + '[data-theme="light"] .arvx-soon-toast{background:rgba(245,240,232,0.96);color:#0A0A0A;}'
    + '@media (prefers-reduced-motion:reduce){.arvx-soon-toast{transition:none;}}';

  function injectStyle() {
    if (document.getElementById('arvx-soon-style')) return;
    var s = document.createElement('style');
    s.id = 'arvx-soon-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  var el = null;
  var hideTimer = null;

  function ensureToast() {
    if (el && document.body.contains(el)) return el;
    injectStyle();
    el = document.createElement('div');
    el.className = 'arvx-soon-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="ico" aria-hidden="true">✨</span><span class="txt"></span>';
    document.body.appendChild(el);
    return el;
  }

  function showToast(msg) {
    var t = ensureToast();
    var txt = t.querySelector('.txt');
    if (txt) txt.textContent = msg || 'Bientôt disponible';
    // re-déclenche la transition proprement
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  function bind(root) {
    var nodes = (root || document).querySelectorAll('[data-soon]:not([data-soon-bound])');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.setAttribute('data-soon-bound', '1');
      n.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showToast(this.getAttribute('data-soon'));
      });
    }
  }

  function init() { bind(document); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Éléments injectés dynamiquement (menus re-rendus) : observation légère
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) bind(muts[i].target);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) { /* vieux navigateur : init() suffit */ }

  window.ARVEXA_SOON = { show: showToast };
})();
