/* ================================================================
   ARVEXA MODAL v1.0 — v8.54a
   Poignée « trait du milieu » + glisser vers le bas pour fermer.
   Demande du propriétaire (v8.54a) : « sur chaque modale tu supprimes
   la croix à droite, à la place tu mets le trait du milieu, et quand
   on appuie et glisse vers le bas ça ferme la modale — tu le rends
   uniforme à toutes les autres, chaque petit trait du milieu doit se
   ressembler dans chaque page qui en contient ».

   Fonctionnement :
   1. Les croix (.modal-close / .arvexa-confirm-close / .picker-close)
      sont MASQUÉES (display:none) mais restent dans le DOM : un clic
      programmatique conserve TOUTE la logique de fermeture propre à
      chaque page (nettoyage, libération de garde, reset de formulaire…).
   2. Une poignée 44×4 (visuel identique au sélecteur de pays de
      l'inscription) est ajoutée en tête de CHAQUE modale.
   3. La faire glisser vers le bas — doigt ou souris — ferme la modale
      au-delà du seuil de distance ou d'un coup de vitesse ; sinon elle
      revient se reposer en douceur.
   4. Détection automatique : modales présentes au chargement ET celles
      injectées plus tard (MutationObserver), sur toutes les pages qui
      chargent ce fichier.
   ================================================================ */
(function () {
  'use strict';

  if (window.__arvexaModalInit) return;
  window.__arvexaModalInit = true;
  window.ARVEXA_MODAL_VERSION = '1.0';

  var REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  /* Racines de modales recensées sur toutes les pages du site (v8.54a) */
  var ROOT_SELECTOR = [
    '.modal',
    '.modal-sheet',
    '.modal-confirm',
    '.arvexa-confirm-modal',
    '.arvexa-popup',
    '.picker-sheet'
  ].join(',');

  /* Croix supprimées (visuellement) — restent fonctionnelles au clic */
  var CLOSE_BTN_SELECTOR = '.modal-close, .arvexa-confirm-close, .picker-close';

  var CSS = [
    '/* ARVEXA MODAL v1.0 — croix supprimée + poignée de glissement (v8.54a) */',
    '.modal-close, .arvexa-confirm-close, .picker-close { display: none !important; }',
    '.arvexa-modal-handle {',
    '  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);',
    '  width: 44px; height: 4px; border-radius: 8px;',
    '  background: rgba(224, 184, 74, 0.35);',
    '  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;',
    '  z-index: 6;',
    '}',
    '.arvexa-modal-handle.arvexa-flow { position: static; transform: none; margin: 12px auto 2px; }',
    '.arvexa-modal-handle:active { cursor: grabbing; }',
    '.arvexa-modal-handle::after { content: ""; position: absolute; inset: -14px -30px; }',
    '.arvexa-modal-pos { position: relative !important; }',
    '.arvexa-modal-dragging { transition: none !important; }',
    '.arvexa-modal-releasing { transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.28s ease !important; }',
    'html[data-theme="light"] .arvexa-modal-handle { background: rgba(154, 114, 9, 0.30); }',
    '@media (prefers-reduced-motion: reduce) { .arvexa-modal-releasing { transition: none !important; } }'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('arvexa-modal-style')) return;
    var style = document.createElement('style');
    style.id = 'arvexa-modal-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ── Fermeture : 1) croix cachée de la page, 2) clic de l'overlay,
        3) Échap — l'ordre préserve toujours la logique de la page ── */
  function closeModal(root) {
    var btn = root.querySelector(CLOSE_BTN_SELECTOR);
    if (btn && document.contains(btn)) {
      btn.click();
      resetInline(root);
      return;
    }
    var overlay = root.parentElement;
    if (overlay && /modal-overlay|modal-backdrop|arvexa-confirm-overlay|arvexa-popup-overlay|picker-overlay/.test(overlay.className || '')) {
      overlay.click();
      resetInline(root);
      return;
    }
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    } catch (e) {}
    resetInline(root);
  }

  function resetInline(root) {
    setTimeout(function () {
      root.style.transform = '';
      root.style.opacity = '';
      root.classList.remove('arvexa-modal-dragging', 'arvexa-modal-releasing');
    }, 60);
  }

  /* ── Glisser vers le bas = fermer ── */
  function attachDrag(root, grip) {
    if (root.__arvexaModalDrag) return;
    root.__arvexaModalDrag = true;

    var dragging = false, startY = 0, dy = 0, lastY = 0, lastT = 0, vel = 0;

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      var t = e.target;
      if (t && t.closest && t.closest('a, button, input, textarea, select, label')) return;
      dragging = true; dy = 0; startY = lastY = e.clientY; lastT = e.timeStamp || performance.now(); vel = 0;
      if (!REDUCED) {
        root.classList.add('arvexa-modal-dragging');
      }
      try { if (grip.setPointerCapture && e.pointerId !== undefined) grip.setPointerCapture(e.pointerId); } catch (err) {}
      if (e.cancelable) e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      dy = e.clientY - startY;
      if (dy < 0) dy = 0; /* on ne tire QUE vers le bas */
      var dt = (e.timeStamp || performance.now()) - lastT;
      if (dt > 0) vel = (e.clientY - lastY) / dt;
      lastY = e.clientY; lastT = e.timeStamp || performance.now();
      if (!REDUCED) {
        root.style.transform = dy ? 'translateY(' + dy + 'px)' : '';
        root.style.opacity = dy ? String(Math.max(0.72, 1 - dy / 700)) : '';
      }
      if (e.cancelable && dy > 6) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      var shouldClose = dy > 90 || (dy > 24 && vel > 0.5) || (REDUCED && dy > 40);
      if (REDUCED) {
        if (shouldClose) { closeModal(root); return; }
      } else {
        root.classList.remove('arvexa-modal-dragging');
        if (shouldClose) {
          closeModal(root);
          return;
        }
        root.classList.add('arvexa-modal-releasing');
        root.style.transform = '';
        root.style.opacity = '';
        setTimeout(function () {
          root.classList.remove('arvexa-modal-releasing');
        }, 300);
      }
      dy = 0;
    }

    grip.addEventListener('pointerdown', onDown);
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
    grip.addEventListener('lostpointercapture', onUp);
  }

  /* ── Préparation d'une modale : poignée + croix masquée + gestes ── */
  function ensure(root) {
    if (!root || !document.contains(root)) return;
    if (root.__arvexaModalDone) return;
    root.__arvexaModalDone = true;

    /* poignée existante ? (sélecteur de pays de l'inscription = flux normal) */
    var grip = null;
    var kids = root.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i] && (kids[i].classList.contains('picker-handle') || kids[i].classList.contains('arvexa-modal-handle'))) {
        grip = kids[i];
        grip.classList.add('arvexa-modal-handle', 'arvexa-flow');
        break;
      }
    }
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'arvexa-modal-handle';
      grip.setAttribute('aria-hidden', 'true');
      root.insertBefore(grip, root.firstChild);
    }
    if (getComputedStyle(root).position === 'static') root.classList.add('arvexa-modal-pos');

    attachDrag(root, grip);
  }

  function scanAll() {
    var roots = document.querySelectorAll(ROOT_SELECTOR);
    for (var i = 0; i < roots.length; i++) ensure(roots[i]);
  }

  /* ── Modales injectées plus tard (innerHTML, createElement…) ── */
  var pending = false;
  function scheduleScan() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      scanAll();
    });
  }

  function initObserver() {
    if (!window.MutationObserver) return;
    var obs = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var added = mutations[m].addedNodes;
        for (var i = 0; i < added.length; i++) {
          var n = added[i];
          if (!n || n.nodeType !== 1) continue;
          if (n.matches && n.matches(ROOT_SELECTOR)) ensure(n);
          else if (n.querySelector) {
            var found = n.querySelectorAll(ROOT_SELECTOR);
            if (found.length) scheduleScan();
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    injectCss();
    scanAll();
    initObserver();
    /* filet : contenu injecté pendant les premières secondes */
    setTimeout(scanAll, 400);
    setTimeout(scanAll, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* API publique (diagnostic + tests) */
  window.ArvexaModal = {
    scan: scanAll,
    close: function (root) { closeModal(root); }
  };
})();
