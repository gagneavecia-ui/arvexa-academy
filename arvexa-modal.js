/* ================================================================
   ARVEXA MODAL v1.2 — v8.65a
   Ouverture « du bas vers le haut » + ligne entière cliquable +
   fermeture en glissée descendue fluide.

   Demandes du propriétaire :
   (v8.54a) « sur chaque modale tu supprimes la croix à droite, à la
   place tu mets le trait du milieu, et quand on appuie et glisse vers
   le bas ça ferme la modale — tu le rends uniforme à toutes les autres ».
   (v8.63a) « c'est uniquement lorsque tu appuies sur la barre et tu
   tires que le modèle se ferme alors que non normalement toute la ligne
   de la barre doit fermer le modèle » + « la fermeture que tu as
   utilisée pour les modèles sont brutales, ne sont pas animées
   fluidement comme dans les autres pages ».
   (v8.65a) « l'ouverture doit être comme une ouverture du bas vers le
   haut pas juste une apparition comme une pop-up » + « la fermeture
   doit être bien propre, sans coupures ni bugs, et lisse : lorsque
   j'appuie sur la barre du haut la page descend directement et
   disparaît ».

   Fonctionnement v1.2 :
   1. OUVERTURE ANIMÉE : chaque modale MONTE DU BAS VERS LE HAUT
      (translateY(100%) → 0, 360 ms, courbe douce). Animation 100 % CSS :
      elle se rejoue automatiquement à CHAQUE réaffichage (display none →
      flex/grid), y compris pour les modales injectées plus tard —
      plus aucune « apparition pop-up ».
   2. Les croix (.modal-close / .arvexa-confirm-close / .picker-close)
      sont MASQUÉES (display:none) mais restent dans le DOM : un clic
      programmatique conserve TOUTE la logique de fermeture propre à
      chaque page (nettoyage, libération de garde, reset de formulaire…).
   3. Une poignée 44×4 + une ZONE DE PRISE pleine largeur (38 px de
      haut) sont ajoutées en tête de CHAQUE modale : un SIMPLE TAP
      n'importe où sur la ligne du haut ferme la modale, et le
      glisser vers le bas fonctionne depuis toute la ligne.
   4. FERMETURE ANIMÉE « la page descend et disparaît » : glissement
      libéré au-delà du seuil de distance ou d'un coup de vitesse ;
      sinon retour en douceur. Toute fermeture (tap, glisser, ArvexaModal.close)
      joue d'abord une DESCENTE COMPLÈTE (translateY(100%) + fondu,
      280 ms, ease-in) AVANT d'appeler la logique de la page — plus
      aucune disparition brutale.
   5. Détection automatique : modales présentes au chargement ET celles
      injectées plus tard (MutationObserver), sur toutes les pages qui
      chargent ce fichier.
   ================================================================ */
(function () {
  'use strict';

  if (window.__arvexaModalInit) return;
  window.__arvexaModalInit = true;
  window.ARVEXA_MODAL_VERSION = '1.2';

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
    '/* ARVEXA MODAL v1.2 — montée du bas + ligne entière + descente fluide (v8.65a) */',
    '.modal-close, .arvexa-confirm-close, .picker-close { display: none !important; }',
    '',
    '/* ✅ v8.65a — OUVERTURE « du bas vers le haut » (demande du propriétaire :',
    '   plus aucune apparition pop-up) : la modale MONTE depuis le bas de',
    '   l\'écran (100 % → 0) avec une courbe douce. Animation CSS pure : elle se',
    '   rejoue automatiquement à CHAQUE affichage (display none → visible), y',
    '   compris pour les modales injectées dynamiquement. fill-mode backwards :',
    '   une fois terminée, l\'animation se retire — le glisser reste libre. */',
    '@keyframes arvexaModalRise {',
    '  from { transform: translateY(100%); opacity: 0.25; }',
    '  55%  { opacity: 1; }',
    '  to   { transform: translateY(0);    opacity: 1; }',
    '}',
    '.modal, .modal-sheet, .modal-confirm, .arvexa-confirm-modal, .arvexa-popup, .picker-sheet {',
    '  animation: arvexaModalRise 0.36s cubic-bezier(0.22, 1, 0.36, 1) backwards !important;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .modal, .modal-sheet, .modal-confirm, .arvexa-confirm-modal, .arvexa-popup, .picker-sheet { animation: none !important; }',
    '}',
    '.arvexa-modal-handle {',
    '  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);',
    '  width: 44px; height: 4px; border-radius: 8px;',
    '  background: rgba(224, 184, 74, 0.35);',
    '  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;',
    '  z-index: 6;',
    '}',
    '.arvexa-modal-handle.arvexa-flow { position: static; transform: none; margin: 12px auto 2px; }',
    '.arvexa-modal-handle:active { cursor: grabbing; }',
    '/* ✅ v8.63a — zone de prise pleine largeur : TOUTE la ligne du haut',
    '   ferme la modale (tap) et accepte le glisser vers le bas. */',
    '.arvexa-modal-tapzone {',
    '  position: absolute; top: 0; left: 0; right: 0; height: 38px;',
    '  cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none;',
    '  z-index: 5; background: transparent; border: none; padding: 0; margin: 0;',
    '}',
    '.arvexa-modal-tapzone:active { cursor: grabbing; }',
    '.arvexa-modal-pos { position: relative !important; }',
    '.arvexa-modal-dragging { transition: none !important; }',
    '.arvexa-modal-releasing { transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.28s ease !important; }',
    '/* ✅ v8.63a — animation de SORTIE douce, identique sur tout le site :',
    '   la modale descend légèrement et s\u2019estompe AVANT que la page ne la',
    '   referme — plus aucune disparition brutale. */',
    '.arvexa-modal-closing {',
    '  transition: transform 0.28s cubic-bezier(0.55, 0, 0.85, 0.45), opacity 0.28s ease !important;',
    '  transform: translateY(100%) !important;',
    '  opacity: 0 !important;',
    '  pointer-events: none !important;',
    '}',
    'html[data-theme="light"] .arvexa-modal-handle { background: rgba(154, 114, 9, 0.30); }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .arvexa-modal-releasing, .arvexa-modal-closing { transition: none !important; }',
    '}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('arvexa-modal-style')) return;
    var style = document.createElement('style');
    style.id = 'arvexa-modal-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ── Fermeture ANIMÉE : 1) animation de sortie, 2) logique de la page
        (croix cachée, clic overlay, ou Échap). Idempotent. ── */
  function closeModal(root) {
    if (!root || root.__arvexaClosing) return;
    root.__arvexaClosing = true;

    var finish = function () {
      root.__arvexaClosing = false;
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
    };

    if (REDUCED) { finish(); return; }
    root.classList.add('arvexa-modal-closing');
    setTimeout(finish, 290);
  }

  function resetInline(root) {
    setTimeout(function () {
      root.style.transform = '';
      root.style.opacity = '';
      root.classList.remove('arvexa-modal-dragging', 'arvexa-modal-releasing', 'arvexa-modal-closing');
    }, 60);
  }

  /* ── Glisser vers le bas = fermer · Tap sur la ligne = fermer ──
     ✅ v1.1 — la garde se fait PAR ÉLÉMENT (grip.__arvexaDragAttached) :
     la poignée ET la zone pleine largeur reçoivent chacune les gestes. */
  function attachDrag(root, grip) {
    if (!grip || grip.__arvexaDragAttached) return;
    grip.__arvexaDragAttached = true;

    var dragging = false, startY = 0, dy = 0, lastY = 0, lastT = 0, startT = 0, vel = 0;

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      var t = e.target;
      if (t && t.closest && t.closest('a, button, input, textarea, select, label')) return;
      dragging = true; dy = 0;
      startY = lastY = e.clientY;
      lastT = startT = e.timeStamp || performance.now();
      vel = 0;
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

    function onUp(e, cancelled) {
      if (!dragging) return;
      dragging = false;
      var dt = (e && e.timeStamp ? e.timeStamp : performance.now()) - startT;
      /* ✅ v8.63a — SIMPLE TAP sur la ligne du haut = fermer (sans
         déplacement, geste court). */
      var isTap = !cancelled && dy < 8 && dt < 500;
      var shouldClose = dy > 90 || (dy > 24 && vel > 0.5) || (REDUCED && dy > 40) || isTap;
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
    grip.addEventListener('pointerup', function (e) { onUp(e, false); });
    grip.addEventListener('pointercancel', function (e) { onUp(e, true); });
    grip.addEventListener('lostpointercapture', function (e) { onUp(e, true); });
  }

  /* ── Préparation d'une modale : poignée + zone pleine largeur + croix
        masquée + gestes ── */
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

    var isFlow = !!grip;
    if (!grip) {
      grip = document.createElement('div');
      grip.className = 'arvexa-modal-handle';
      grip.setAttribute('aria-hidden', 'true');
      root.insertBefore(grip, root.firstChild);
    }
    if (getComputedStyle(root).position === 'static') root.classList.add('arvexa-modal-pos');

    /* ✅ v8.63a — zone de prise pleine largeur : TOUTE la ligne du haut
       ferme la modale (tap ou glisser). Uniquement pour les modales
       positionnées (feuilles/bulles) ; les modales « en flux » gardent
       leur poignée d'origine. */
    if (!isFlow) {
      var tap = document.createElement('div');
      tap.className = 'arvexa-modal-tapzone';
      tap.setAttribute('aria-hidden', 'true');
      root.insertBefore(tap, root.firstChild);
      attachDrag(root, tap);
    }

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
