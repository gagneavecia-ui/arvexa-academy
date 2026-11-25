/* ═══════════════════════════════════════════════════════════════════
   ARVEXA — ARVEXA-SIDEBAR.JS (v8.62a)
   BARRE DU HAUT UNIFIÉE — même menu sur TOUTES les pages.
   ═══════════════════════════════════════════════════════════════════
   Demande du propriétaire : « On va unifier la barre du haut dans
   chaque page — ajoute le bouton menu à côté du nom de la page et le
   bouton de rafraîchissement, comme la page abonnement et les autres. »

   Rôle de ce script (chargé en defer par les pages qui n'ont PAS de
   menu latéral natif) :
     1. Injecter le menu latéral (drawer) identique à celui de
        abonnement.html / index.html — même navigation, même style,
        mode clair et mode sombre suivis via les tokens arvexa-ui.css.
     2. Le lier au bouton ☰ #menuToggle de la barre du haut :
        ouverture INSTANTANÉE au clic — n'attend jamais Firebase ni
        les données (même consigne que arvexa-menu.js v8.60a).
     3. Garantir le bouton rafraîchir ↻ (#headerRefreshBtn) dans la
        barre du haut si la page n'en a pas déjà un.
     4. « Donner mon avis » → index.html?avis=1 (même comportement que
        le menu d'accueil) et « Déconnexion » → window.arvexaLogout()
        (modale uniforme + signOut Firebase, fournie par
        arvexa-confirm.js présent sur toutes les pages).

   Ce script est CLASSIQUE (pas un module) : il s'exécute dès que le
   DOM est prêt, sans attendre les imports Firebase des pages.
   Il n'intervient PAS sur les pages qui possèdent déjà #sidebar
   (index, abonnement, profil, notifications, progression,
   localisation, mathmind) : leur menu natif reste le seul actif.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Navigation officielle (identique au menu d'accueil) ── */
  var NAV = [
    { href: 'index.html',        icon: 'fa-home',           label: 'Accueil' },
    { href: 'progression.html',  icon: 'fa-chart-line',     label: 'Progression' },
    { href: 'profil.html',       icon: 'fa-user',           label: 'Mon profil' },
    { href: 'abonnement.html',   icon: 'fa-crown',          label: 'Mon abonnement' },
    { href: 'notifications.html', icon: 'fa-bell',          label: 'Notifications' },
    { href: 'arv-progress.html', icon: 'fa-graduation-cap', label: 'Résumé' },
    { href: 'outils.html',       icon: 'fa-toolbox',        label: 'Outils' },
    { href: 'localisation.html', icon: 'fa-location-dot',   label: 'À proximité' },
    { href: 'marketplace.html',  icon: 'fa-store',          label: 'Marketplace' }
  ];

  /* ── CSS du drawer — éléments dédiés #arvxSidebar* (aucune collision
     avec le style des pages). Les tokens viennent d'arvexa-ui.css :
     le mode clair/sombre est suivi automatiquement. ── */
  var CSS = [
    '#arvxSidebarOverlay{display:none;position:fixed;top:0;left:0;width:100%;height:100vh;',
    'background:rgba(0,0,0,.6);z-index:99;opacity:0;transition:opacity .3s ease;}',
    '#arvxSidebarOverlay.active{display:block;opacity:1;}',
    '#arvxSidebar{position:fixed;top:0;left:-280px;width:280px;height:100vh;',
    'background:rgba(var(--rgb-veil),0.97);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);',
    'border-right:1px solid rgba(224,184,74,.06);',
    'padding:calc(24px + var(--safe-top,0px)) 16px calc(24px + var(--safe-bottom,0px));',
    'display:flex;flex-direction:column;z-index:100;overflow-y:auto;',
    'transition:left .3s cubic-bezier(.25,1,.5,1);}',
    '#arvxSidebar.open{left:0;}',
    '#arvxSidebar .arvx-sb-logo{display:flex;align-items:center;text-decoration:none;',
    'color:var(--text-light);font-size:20px;font-weight:700;',
    "font-family:'Playfair Display',Georgia,serif;letter-spacing:2px;",
    'padding-bottom:20px;margin-bottom:16px;border-bottom:1px solid rgba(var(--rgb-soft),.04);}',
    '#arvxSidebar .arvx-sb-logo span{',
    'background:linear-gradient(90deg,var(--accent),var(--accent-bright),var(--accent));',
    '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;',
    'font-style:italic;margin-left:4px;}',
    '#arvxSidebar .arvx-sb-nav{flex:1;display:flex;flex-direction:column;gap:2px;}',
    '#arvxSidebar .arvx-sb-nav a{display:flex;align-items:center;gap:12px;padding:10px 14px;',
    'border-radius:10px;border:1px solid transparent;color:var(--text-dim);text-decoration:none;',
    'transition:all .15s ease;font-size:13px;font-weight:500;}',
    '#arvxSidebar .arvx-sb-nav a i{width:20px;text-align:center;font-size:15px;}',
    '#arvxSidebar .arvx-sb-nav a:hover{color:var(--text-light);background:rgba(var(--rgb-soft),.03);}',
    '#arvxSidebar .arvx-sb-nav a.active{color:var(--text-light);background:rgba(224,184,74,.08);',
    'border-color:rgba(224,184,74,.12);}',
    '#arvxSidebar .arvx-sb-nav a.active i{color:var(--accent-bright);}',
    '#arvxSidebar .arvx-sb-avis{color:var(--accent-bright);background:rgba(184,134,11,.06);',
    'border-color:rgba(184,134,11,.12)!important;margin-top:4px;}',
    '#arvxSidebar .arvx-sb-avis:hover{background:rgba(184,134,11,.12);color:var(--accent-bright);}',
    '#arvxSidebar .arvx-sb-divider{height:1px;background:rgba(var(--rgb-soft),.04);margin:6px 0;}',
    '#arvxSidebar .arvx-sb-bottom{margin-top:auto;padding-top:12px;',
    'border-top:1px solid rgba(var(--rgb-soft),.04);}',
    '#arvxSidebar .arvx-sb-bottom a{color:var(--text-muted);font-size:12px;}',
    '#arvxSidebar .arvx-sb-bottom a:hover{color:var(--text-dim);}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('arvxSidebarStyles')) return;
    var st = document.createElement('style');
    st.id = 'arvxSidebarStyles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function injectSidebar() {
    /* Une page avec son propre menu (#sidebar) n'est pas touchée. */
    if (document.getElementById('sidebar') || document.getElementById('arvxSidebar')) return false;
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var links = NAV.map(function (item) {
      var active = path === item.href.toLowerCase() ? ' class="active"' : '';
      return '<a href="' + item.href + '"' + active + '><i class="fas ' + item.icon +
             '"></i> ' + item.label + '</a>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.id = 'arvxSidebarOverlay';
    var aside = document.createElement('aside');
    aside.id = 'arvxSidebar';
    aside.setAttribute('aria-label', 'Menu principal');
    aside.innerHTML =
      '<a href="index.html" class="arvx-sb-logo">ARVEX<span>A School</span></a>' +
      '<nav class="arvx-sb-nav">' + links +
      '<div class="arvx-sb-divider"></div>' +
      '<a href="index.html?avis=1" class="arvx-sb-avis"><i class="fas fa-star"></i> Donner mon avis</a>' +
      '<div class="arvx-sb-divider"></div>' +
      '<div class="arvx-sb-bottom">' +
      '<a href="#" id="arvxSbLogout"><i class="fas fa-sign-out-alt"></i> Déconnexion</a>' +
      '</div></nav>';
    document.body.appendChild(overlay);
    document.body.appendChild(aside);
    return true;
  }

  function bindDrawer() {
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('arvxSidebar');
    var overlay = document.getElementById('arvxSidebarOverlay');
    if (!toggle || !sidebar || !overlay) return;
    if (toggle.dataset.arvxSbBound === '1') return;
    toggle.dataset.arvxSbBound = '1';

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
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
    sidebar.addEventListener('click', function (e) {
      var link = e.target && e.target.closest ? e.target.closest('a') : null;
      if (link && link.id !== 'arvxSbLogout') close();
    });

    /* Déconnexion : modale uniforme + signOut (arvexa-confirm.js). */
    var logout = document.getElementById('arvxSbLogout');
    if (logout && logout.dataset.arvxLogoutBound !== '1') {
      logout.dataset.arvxLogoutBound = '1';
      logout.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof window.arvexaLogout === 'function') { window.arvexaLogout(); return; }
        try {
          sessionStorage.clear();
          localStorage.removeItem('arvexa_session');
          localStorage.removeItem('arvexa_user_data');
          localStorage.removeItem('arvexa_last_uid');
        } catch (err) {}
        window.location.replace('auth-choice.html');
      });
    }
  }

  /* ── Bouton rafraîchir ↻ garanti dans la barre du haut ──
     N'intervient que si la page n'a déjà AUCUN bouton de refresh
     (#refreshBtn / #headerRefreshBtn). Rechargement simple. */
  function ensureRefreshButton() {
    if (document.getElementById('refreshBtn') ||
        document.getElementById('headerRefreshBtn')) return;
    var header = document.querySelector('header.header, header.page-header');
    if (!header) return;
    var actions = header.querySelector('.header-actions, .header-right');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'header-actions';
      header.appendChild(actions);
    }
    var btn = document.createElement('button');
    btn.id = 'headerRefreshBtn';
    btn.setAttribute('aria-label', 'Rafraîchir');
    btn.setAttribute('title', 'Rafraîchir');
    btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    btn.addEventListener('click', function () { window.location.reload(); });
    actions.appendChild(btn);
  }

  function init() {
    injectStyles();
    injectSidebar();
    bindDrawer();
    ensureRefreshButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
