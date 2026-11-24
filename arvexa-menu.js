/* ═══════════════════════════════════════════════════════════════
   ARVEXA — MENU LATÉRAL INSTANTANÉ (v8.60a)
   ═══════════════════════════════════════════════════════════════
   ⚡ Demande du propriétaire : « même si je recharge la page et que
      j'appuie directement sur le bouton menu, il doit s'ouvrir sans
      bug » — le menu ne doit JAMAIS attendre Firebase ni les données.

   Ce fichier est un script CLASSIQUE (pas un module) : il s'exécute
   dès que le DOM est prêt, sans attendre les imports Firebase des
   modules ES des pages. Il est l'UNIQUE responsable du menu : les
   anciens écouteurs des modules des pages ont été retirés pour
   éviter les double-basculements.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function bindMenu() {
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (!toggle || !sidebar || !overlay) return false;
    if (toggle.dataset.arvexaMenuBound === '1') return true;
    toggle.dataset.arvexaMenuBound = '1';

    function isOpen() { return sidebar.classList.contains('open'); }
    function open() {
      sidebar.classList.add('open');
      overlay.classList.add('active');
      try {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Fermer le menu');
      } catch (e) {}
    }
    function close() {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
      try {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Ouvrir le menu');
      } catch (e) {}
    }

    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      if (isOpen()) close(); else open();
    });
    overlay.addEventListener('click', close);
    // Échap ferme le menu ; un clic sur un lien du menu le referme
    // avant la navigation (impression de rapidité).
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
    sidebar.addEventListener('click', function (e) {
      // Un clic sur un lien de navigation referme le menu avant la
      // navigation (impression de rapidité). Les boutons internes
      // (déconnexion, sous-menus) ne ferment pas ici.
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link && !link.id) close();
    });
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindMenu);
  } else {
    bindMenu();
  }
  // Ré-binda possible après une injection dynamique de sidebar.
  window.ARVEXA_BIND_MENU = bindMenu;
})();
