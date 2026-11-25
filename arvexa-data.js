/* ================================================================
   arvexa-data.js — ✅ v8.68a — CACHE DE DONNÉES POUR ENTRÉE < 0,5 s
   (demande du propriétaire : « l'entrée de chaque page doit être rapide
   en moins de 0,5 seconde, les données Firebase de l'utilisateur doivent
   s'afficher d'abord »).

   Principe : à la levée du cache de chargement, la page mémorise le
   contenu peint (ARVData.save — données Firebase comprises). À la
   navigation suivante, ce contenu est repeint SYNCHRONIQUEMENT avant
   même l'exécution des modules Firebase : les données de l'élève sont
   visibles en < 0,5 s ; le rendu Firebase frais arrive ensuite derrière
   et rafraîchit le contenu (comme la snapshot de l'accueil).

   Sécurité : lié à l'uid de la session (arvexa_session) — jamais les
   données d'un autre élève ; TTL 12 h ; sessionStorage uniquement,
   rien ne survit à la fermeture de l'app ; garde-fou de quota.
   ================================================================ */
(function () {
  'use strict';
  var PREFIX = 'arvexa_ps_';
  var MAX_AGE = 12 * 60 * 60 * 1000; /* 12 h, comme la snapshot de l'accueil */
  var MAX_BYTES = 450000;            /* garde-fou quota sessionStorage */

  function uidNow() {
    try {
      var s = JSON.parse(sessionStorage.getItem('arvexa_session') || 'null');
      return (s && s.uid) || null;
    } catch (e) { return null; }
  }

  function pickContainer() {
    return document.querySelector('main')
      || document.getElementById('mainContainer')
      || document.getElementById('mainArea')
      || document.getElementById('content')
      || document.querySelector('.shell')
      /* ✅ v8.68a — marketplace & co. : contenu dans un .container enfant
         direct de <body> (relevé sur le DOM réel de production) */
      || (document.body && document.body.querySelector(':scope > .container'))
      || null;
  }

  /* Appelé par le cache de chargement au moment de la levée : le contenu
     affiché (éléments + données) devient la snapshot de la navigation
     suivante. */
  function save(key) {
    try {
      var uid = uidNow();
      if (!uid) return; /* hors session : rien à mémoriser */
      var c = pickContainer();
      if (!c) return;
      var html = c.innerHTML || '';
      if (html.length < 200 || html.length > MAX_BYTES) return;
      sessionStorage.setItem(PREFIX + key, JSON.stringify({ uid: uid, savedAt: Date.now(), html: html }));
    } catch (e) { /* quota indisponible : la page suivante chargera normalement */ }
  }

  /* Appelé par la page AVANT l'exécution des modules Firebase : repeint
     instantanément le contenu de la navigation précédente. Le rendu
     Firebase frais remplacera ce contenu quand il sera prêt. */
  function restore(key) {
    try {
      if (window.__ARVEXA_PAGE_RESTORED__) return;
      var uid = uidNow();
      if (!uid) return;
      var raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return;
      var p = JSON.parse(raw);
      if (!p || !p.html || p.uid !== uid) return;
      if (Date.now() - (p.savedAt || 0) > MAX_AGE) {
        try { sessionStorage.removeItem(PREFIX + key); } catch (e) {}
        return;
      }
      var c = pickContainer();
      if (!c) return;
      c.innerHTML = p.html;
      c.setAttribute('data-arv-restored', '1');
      window.__ARVEXA_PAGE_RESTORED__ = true;
    } catch (e) { /* snapshot illisible : chargement normal */ }
  }

  window.ARVData = { save: save, restore: restore, pickContainer: pickContainer };
})();
