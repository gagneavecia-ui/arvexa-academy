/* ================================================================
   ARVEXA SPA ENGINE — navigation instantanée entre pages
   ================================================================
   Principe (comme les vraies applications) :
   - Le document n'est JAMAIS rechargé : on intercepte les clics sur
     les liens internes, on récupère le HTML de la page cible (cache
     mémoire → cache service worker → réseau), on remplace le corps
     du document et on exécute les scripts de la page.
   - Firebase / Auth / i18n / thème restent chargés UNE seule fois :
     plus aucune ré-initialisation à chaque page.
   - Après chaque échange de corps, un DOMContentLoaded « synthétique »
     est émis : tous les scripts globaux (confirm, i18n, banner,
     programmes, streak…) re-lient leurs comportements au nouveau DOM.
   - Slot global window.__ARV_SPA_CLEAN__ : la page qui s'en sert pour
     couper ses écouteurs temps réel (onSnapshot) quand on la quitte.
   - Prefetch : les pages sont téléchargées en silence (survol,
     appui, temps libre) → la navigation est déjà là quand on clique.
   - Repli total : le moindre problème → navigation classique, l'app
     continue de fonctionner exactement comme avant.
   ================================================================ */
(function () {
  'use strict';
  if (window.__ARVEXA_SPA__) return;
  window.__ARVEXA_SPA__ = true;

  var SPA_VERSION = 'v1.1';
  var MEM_MAX = 14;

  // Pages jamais interceptées (techniques / fallback)
  var SKIP_PATHS = ['/404.html', '/offline.html'];
  // Extension non-HTML : navigation ou téléchargement classique
  var SKIP_EXT_RE = /\.(pdf|png|jpe?g|gif|svg|webp|ico|css|js|json|zip|mp3|mp4|woff2?)$/i;

  var mem = new Map();          // url -> { text, ts }
  var loadedSrcs = new Set();   // scripts src déjà exécutés dans ce document
  var spaStyles = [];           // éléments <style>/<link> posés par le moteur
  var inflight = null;          // AbortController de la navigation en cours
  var currentKey = normKey(location.pathname + location.search);

  function normKey(url) { return String(url || '').split('#')[0]; }

  // ────────────────────────────────────────────────────────────────
  // Barre de progression (haut de l'écran)
  // ────────────────────────────────────────────────────────────────
  var bar = null, barTimer = null;
  function barStart() {
    if (bar) return;
    bar = document.createElement('div');
    bar.id = 'arv-spa-bar';
    bar.setAttribute('style',
      'position:fixed;top:0;left:0;height:3px;width:0;z-index:2147483000;' +
      'background:linear-gradient(90deg,#B8860B,#E0B84A);' +
      'transition:width .25s ease;border-radius:0 2px 2px 0;pointer-events:none;');
    document.documentElement.appendChild(bar);
    requestAnimationFrame(function () { if (bar) bar.style.width = '70%'; });
    // Sécurité : si le swap n'arrive jamais, la barre disparaît d'elle-même
    barTimer = setTimeout(barDone, 4000);
  }
  function barDone() {
    clearTimeout(barTimer);
    if (bar) { bar.style.width = '100%'; }
    setTimeout(function () { if (bar) { bar.remove(); bar = null; } }, 180);
  }

  // ────────────────────────────────────────────────────────────────
  // CSS de transition (injecté une fois, indépendant des thèmes)
  // ────────────────────────────────────────────────────────────────
  var styleEl = document.createElement('style');
  styleEl.id = 'arv-spa-css';
  styleEl.textContent =
    '@keyframes arvSpaIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    'body.arv-spa-enter{animation:arvSpaIn .22s cubic-bezier(.25,1,.5,1)}' +
    '@media (prefers-reduced-motion:reduce){body.arv-spa-enter{animation:none}}';
  document.head.appendChild(styleEl);

  // ────────────────────────────────────────────────────────────────
  // Cache mémoire (LRU simple)
  // ────────────────────────────────────────────────────────────────
  function memGet(key) {
    var hit = mem.get(key);
    if (hit) { hit.ts = Date.now(); mem.delete(key); mem.set(key, hit); }
    return hit ? hit.text : null;
  }
  function memSet(key, text) {
    mem.set(key, { text: text, ts: Date.now() });
    if (mem.size > MEM_MAX) {
      var oldest = null, ots = Infinity;
      mem.forEach(function (v, k) { if (v.ts < ots) { ots = v.ts; oldest = k; } });
      if (oldest) mem.delete(oldest);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Chargement d'une page (texte HTML)
  // ────────────────────────────────────────────────────────────────
  function fetchText(url) {
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    if (ctrl) inflight = ctrl;
    var opts = {
      headers: { 'Accept': 'text/html', 'x-arvexa-spa': '1' },
      redirect: 'follow',
      credentials: 'same-origin'
    };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      if (text && text.length > 200) memSet(normKey(url), text);
      return text;
    });
  }
  function abortInflight() {
    if (inflight) { try { inflight.abort(); } catch (e) {} inflight = null; }
  }

  // ────────────────────────────────────────────────────────────────
  // Écart de <head> : styles par page + nouveaux scripts
  // ────────────────────────────────────────────────────────────────
  function syncHead(doc) {
    // 1) Styles : retirer ceux posés par la page précédente, poser ceux de la nouvelle
    var wanted = [];
    Array.prototype.forEach.call(doc.head.querySelectorAll('style'), function (st) {
      wanted.push({ kind: 'style', text: st.textContent });
    });
    Array.prototype.forEach.call(doc.head.querySelectorAll('link[rel="stylesheet"]'), function (lk) {
      var href = lk.getAttribute('href');
      if (!href) return;
      try { href = new URL(href, location.href).href; } catch (e) {}
      wanted.push({ kind: 'link', href: href, media: lk.getAttribute('media') || '' });
    });

    // Styles déjà présents en permanence dans le document courant
    var havePermanent = [];
    Array.prototype.forEach.call(document.head.querySelectorAll('style'), function (st) {
      if (!st.hasAttribute('data-arv-spa')) havePermanent.push({ kind: 'style', text: st.textContent });
    });
    Array.prototype.forEach.call(document.head.querySelectorAll('link[rel="stylesheet"]'), function (lk) {
      var href = lk.getAttribute('href');
      if (!href) return;
      try { href = new URL(href, location.href).href; } catch (e) {}
      havePermanent.push({ kind: 'link', href: href, media: lk.getAttribute('media') || '' });
    });

    function sameItem(a, b) {
      if (a.kind !== b.kind) return false;
      if (a.kind === 'link') return a.href === b.href;
      return (a.text && b.text && a.text.trim() === b.text.trim());
    }
    function have(item) {
      return havePermanent.some(function (h) { return sameItem(h, item); }) ||
             spaStyles.some(function (h) { return sameItem(h, item); });
    }

    // Retrait des styles SPA qui ne servent plus
    spaStyles = spaStyles.filter(function (el) {
      var keep = wanted.some(function (w) { return sameItem(w, {
        kind: el.tagName === 'STYLE' ? 'style' : 'link',
        text: el.tagName === 'STYLE' ? el.textContent : undefined,
        href: el.tagName === 'LINK' ? (el.getAttribute('href') || '') : undefined,
        media: el.tagName === 'LINK' ? (el.getAttribute('media') || '') : undefined
      }); });
      if (!keep) { el.remove(); }
      return keep;
    });

    // Ajout des styles manquants
    wanted.forEach(function (w) {
      if (have(w)) return;
      var el;
      if (w.kind === 'style') {
        el = document.createElement('style');
        el.textContent = w.text;
      } else {
        el = document.createElement('link');
        el.rel = 'stylesheet'; el.href = w.href;
        if (w.media) el.media = w.media;
      }
      el.setAttribute('data-arv-spa', '1');
      document.head.appendChild(el);
      spaStyles.push(el);
    });

    // 2) Scripts <head src> jamais chargés → les charger
    Array.prototype.forEach.call(doc.head.querySelectorAll('script[src]'), function (s) {
      var src = s.getAttribute('src');
      if (!src) return;
      var abs;
      try { abs = new URL(src, location.href).href; } catch (e) { return; }
      if (loadedSrcs.has(abs)) return;
      loadedSrcs.add(abs);
      var el = document.createElement('script');
      Array.prototype.forEach.call(s.attributes, function (a) { el.setAttribute(a.name, a.value); });
      el.src = src;
      if (!el.getAttribute('type')) el.defer = true;
      document.head.appendChild(el);
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Exécution des scripts inline du <head> (idempotents : thème, splash)
  // ────────────────────────────────────────────────────────────────
  function runHeadInline(doc) {
    Array.prototype.forEach.call(doc.head.querySelectorAll('script:not([src])'), function (s) {
      if (!s.textContent || !s.textContent.trim()) return;
      try {
        var el = document.createElement('script');
        Array.prototype.forEach.call(s.attributes, function (a) { el.setAttribute(a.name, a.value); });
        el.textContent = s.textContent;
        document.head.appendChild(el);
      } catch (e) { /* une page peut avoir des scripts non ré-exécutables : on ignore */ }
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Exécution des scripts du corps (dans l'ordre du document)
  // ── v1.1 : les scripts avec src déjà exécutés dans la session sont
  //    sautés (une seule exécution par script externe) ; leur (re)liaison
  //    au nouveau DOM est assurée par le DOMContentLoaded synthétique.
  // ────────────────────────────────────────────────────────────────
  function runBodyScripts(container) {
    var scripts = container.querySelectorAll('script');
    var chain = Promise.resolve();
    Array.prototype.forEach.call(scripts, function (old) {
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          try {
            if (old.src) {
              var abs = null;
              try { abs = new URL(old.getAttribute('src'), location.href).href; } catch (e) {}
              if (abs && loadedSrcs.has(abs)) { resolve(); return; } // déjà exécuté en session
              if (abs) loadedSrcs.add(abs);
            }
            var el = document.createElement('script');
            Array.prototype.forEach.call(old.attributes, function (a) { el.setAttribute(a.name, a.value); });
            if (old.src) {
              el.onload = function () { resolve(); };
              el.onerror = function () { resolve(); };
              el.src = old.src;
            } else {
              el.textContent = old.textContent;
            }
            old.replaceWith(el);
            if (!old.src) resolve(); // inline : exécution synchrone terminée
          } catch (e) { resolve(); }
        });
      });
    });
    return chain;
  }

  // ────────────────────────────────────────────────────────────────
  // Slot de nettoyage : la page qui quitte coupe ses écouteurs temps réel
  // (la page pose window.__ARV_SPA_CLEAN__ = function(){ ...unsub... })
  // ────────────────────────────────────────────────────────────────
  function runCleanup() {
    try {
      if (typeof window.__ARV_SPA_CLEAN__ === 'function') window.__ARV_SPA_CLEAN__();
    } catch (e) { /* jamais bloquer la navigation */ }
    window.__ARV_SPA_CLEAN__ = null;
  }

  // ────────────────────────────────────────────────────────────────
  // DOMContentLoaded synthétique : relance tous les scripts globaux
  // (bindLogoutTriggers, applyContact, programmes.applyHome, banner,
  // streak, boot analytics… enregistrés pendant le 1ᵉʳ chargement)
  // ────────────────────────────────────────────────────────────────
  function fireSyntheticDOMReady() {
    // setTimeout(0) : garantit que les modules inline de la nouvelle page
    // ont fini de s'évaluer (microtasks) avant l'émission de l'événement.
    setTimeout(function () {
      try {
        document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
      } catch (e) {}
      try {
        document.dispatchEvent(new CustomEvent('arvexa:after-spa-swap', { detail: { url: currentKey } }));
      } catch (e) {}
    }, 0);
  }

  // ────────────────────────────────────────────────────────────────
  // ✅ v1.2.1 — Garde Firebase À L'EXÉCUTION.
  // En SPA, le module d'une page se ré-exécute à chaque visite SANS
  // rechargement du document : un 2ᵈ initializeApp(firebaseConfig) lève
  // « app/duplicate-app » et un 2ᵈ initializeFirestore lève aussi — tout le
  // script de la page meurt (plus de données chargées, page figée).
  // Le moteur réécrit donc le code des modules de la page AVANT exécution :
  //   - import getApps complété sur firebase-app.js ;
  //   - = initializeApp(firebaseConfig) → getApps().find('[DEFAULT]') || initializeApp(...)
  //   - initializeFirestore(app, {...}) → try/catch avec repli getFirestore(app)
  //     + import getFirestore complété sur firebase-firestore.js.
  // Idempotent : les pages déjà gardées en dur (v1.2) passent sans toucher.
  // ────────────────────────────────────────────────────────────────
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function patchSdkImport(text, fileSuffix, addName) {
    var re = new RegExp('import\\s*\\{([^}]*)\\}\\s*from\\s*("[^"]*' + escapeRegExp(fileSuffix) + '")', 'g');
    return text.replace(re, function (m, names, from) {
      if (names.indexOf(addName) !== -1) return m; // déjà importé
      var trimmed = names.replace(/\s+/g, ' ').trim();
      return 'import { ' + (trimmed ? trimmed + ', ' : '') + addName + ' } from ' + from;
    });
  }

  function guardInitializeFirestore(text) {
    if (text.indexOf('initializeFirestore(') === -1) return text;
    if (/catch\(_(spa|arvFs)\)/.test(text)) return text; // déjà gardé (v1.1 / v1.2)
    var OPEN = 'initializeFirestore(';
    var out = '';
    var from = 0;
    var guardCount = 0;
    while (true) {
      var idx = text.indexOf(OPEN, from);
      if (idx === -1) { out += text.slice(from); break; }
      // scan des parenthèses jusqu'au fermant de l'appel
      var depth = 0;
      var j = idx + OPEN.length - 1; // sur la parenthèse ouvrante
      var end = -1;
      for (; j < text.length; j++) {
        var c = text.charAt(j);
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end === -1) { out += text.slice(from); break; } // appel mal formé : on ne touche pas
      var call = text.slice(idx, end + 1);
      out += text.slice(from, idx);
      out += '(function(){try{return ' + call + '}catch(_arvFs){return getFirestore(app)}})()';
      guardCount++;
      from = end + 1;
    }
    if (guardCount) {
      text = patchSdkImport(out, 'firebase-firestore.js', 'getFirestore');
    }
    return text;
  }

  function guardFirebase(doc) {
    try {
      Array.prototype.forEach.call(doc.querySelectorAll('script[type="module"]'), function (s) {
        if (s.src) return; // auth-guard.js etc. : déjà gardés, module mis en cache
        var code = s.textContent;
        if (!code || (code.indexOf('initializeApp(') === -1 && code.indexOf('initializeFirestore(') === -1)) return;
        var changed = false;
        // 1) initializeApp(firebaseConfig) — garde anti app/duplicate-app
        if (code.indexOf('initializeApp(firebaseConfig)') !== -1 && code.indexOf("getApps().find(a => a.name === '[DEFAULT]')") === -1) {
          code = code.replace(/=\s*initializeApp\(firebaseConfig\)/g,
            "= (getApps().find(a => a.name === '[DEFAULT]') || initializeApp(firebaseConfig))");
          code = patchSdkImport(code, 'firebase-app.js', 'getApps');
          changed = true;
        }
        // 2) initializeFirestore(app, {...}) — try/catch avec repli getFirestore(app)
        var before = code;
        code = guardInitializeFirestore(code);
        if (code !== before) changed = true;
        if (changed) s.textContent = code;
      });
    } catch (e) { /* jamais faire tomber la navigation à cause du patch */ }
  }

  // ────────────────────────────────────────────────────────────────
  // Échange du corps + initialisation
  // ────────────────────────────────────────────────────────────────
  var scrollMemory = {};

  function swap(doc, url, mode) {
    try { document.dispatchEvent(new CustomEvent('arvexa:before-spa-swap', { detail: { url: url } })); } catch (e) {}
    runCleanup();

    // mémoriser la position de la page qu'on quitte (clé sans ancre)
    scrollMemory[currentKey] = window.scrollY || 0;

    guardFirebase(doc);
    runHeadInline(doc);
    syncHead(doc);

    var newBody = document.importNode(doc.body, true);

    // ✅ v1.1 — le splash n'est joué qu'au premier chargement de la
    // session (marqueur « arvexa_splash_seen ») : dans une navigation SPA
    // on est TOUJOURS en « retour de session » → on retire le splash du
    // corps entrant avant insertion (zéro flash, jamais bloqué devant
    // la page si un script oubliait de l'appeler).
    try {
      if (sessionStorage.getItem('arvexa_splash_seen') === '1') {
        var sp = newBody.querySelector('#appSplash');
        if (sp) sp.remove();
      }
    } catch (e) {}

    newBody.classList.add('arv-spa-enter');
    document.documentElement.replaceChild(newBody, document.body);

    document.title = doc.title || document.title;

    currentKey = normKey(url);
    if (mode === 'pop' && scrollMemory[currentKey] != null) {
      window.scrollTo(0, scrollMemory[currentKey]);
    } else {
      window.scrollTo(0, 0);
    }

    var done = runBodyScripts(newBody);
    setTimeout(function () { newBody.classList.remove('arv-spa-enter'); }, 300);
    done.then(function () { fireSyntheticDOMReady(); });
  }

  // ────────────────────────────────────────────────────────────────
  // Navigation
  // ────────────────────────────────────────────────────────────────
  var navToken = 0;

  function navigate(url, mode) {
    mode = mode || 'push';
    var token = ++navToken;
    var t0 = performance.now();
    var fetchUrl = normKey(url); // ancre : pas de re-fetch, la page suffit

    var cached = memGet(fetchUrl);
    if (cached) {
      // ⚡ Page déjà en mémoire : échange immédiat (0 réseau)
      try {
        var doc0 = new DOMParser().parseFromString(cached, 'text/html');
        if (!doc0.body) throw new Error('corps vide');
        if (mode === 'push') history.pushState({ arvspa: true }, '', url);
        swap(doc0, url, mode);
        return Promise.resolve();
      } catch (e) { mem.delete(fetchUrl); /* retomber sur fetch */ }
    }

    barStart();
    abortInflight();
    return fetchText(fetchUrl)
      .then(function (text) {
        if (token !== navToken) return; // navigation plus récente déjà partie
        barDone();
        var doc = new DOMParser().parseFromString(text, 'text/html');
        if (!doc.body) throw new Error('corps vide');
        if (mode === 'push') history.pushState({ arvspa: true }, '', url);
        swap(doc, url, mode);
        console.info('[ARVEXA SPA]', fetchUrl, Math.round(performance.now() - t0) + 'ms');
      })
      .catch(function (err) {
        if (token !== navToken) return;
        barDone();
        // Repli total : navigation classique (comportement d'avant)
        try { location.assign(url); } catch (e2) {}
      });
  }

  // ────────────────────────────────────────────────────────────────
  // Interception des clics
  // ────────────────────────────────────────────────────────────────
  function linkUrl(a) {
    try {
      var u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return null;
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (SKIP_PATHS.indexOf(u.pathname) !== -1) return null;
      if (SKIP_EXT_RE.test(u.pathname)) return null;
      if (a.hasAttribute('download')) return null;
      var tgt = a.getAttribute('target');
      if (tgt && tgt !== '_self' && tgt !== '') return null;
      if (a.closest('[data-spa="off"]')) return null;
      // même page, juste une ancre → laisser le navigateur gérer
      if (u.pathname + u.search === location.pathname + location.search && u.hash) return null;
      // page courante sans changement réel
      if (u.pathname + u.search === location.pathname + location.search && !u.hash) return null;
      return u.pathname + u.search + (u.hash || '');
    } catch (e) { return null; }
  }

  document.addEventListener('click', function (ev) {
    if (ev.defaultPrevented || ev.button !== 0) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var url = linkUrl(a);
    if (!url) return;
    ev.preventDefault();
    navigate(url, 'push');
  }, { capture: false });

  // ────────────────────────────────────────────────────────────────
  // Retour / avant du navigateur
  // ────────────────────────────────────────────────────────────────
  window.addEventListener('popstate', function () {
    var url = normKey(location.pathname + location.search);
    if (url === currentKey) return;
    navigate(url, 'pop');
  });

  // ────────────────────────────────────────────────────────────────
  // Prefetch : survol / appui → la page est déjà là au clic
  // ────────────────────────────────────────────────────────────────
  var prefetched = new Set();
  function prefetch(url) {
    if (prefetched.has(url) || memGet(url)) return;
    prefetched.add(url);
    fetch(url, { headers: { 'Accept': 'text/html', 'x-arvexa-spa': '1' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { if (t) memSet(url, t); })
      .catch(function () { prefetched.delete(url); });
  }

  document.addEventListener('pointerover', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var url = linkUrl(a);
    if (url) prefetch(url);
  }, { passive: true });

  document.addEventListener('touchstart', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    var url = linkUrl(a);
    if (url) prefetch(url);
  }, { passive: true });

  // ────────────────────────────────────────────────────────────────
  // Précachage silencieux : pendant que l'utilisateur regarde la page,
  // les autres pages de l'app se téléchargent (une par une, tout doux)
  // ────────────────────────────────────────────────────────────────
  var IDLE_PAGES = [
    '/matiere.html', '/parcours.html', '/ma-journee.html', '/quotidien.html',
    '/profil.html', '/exam.html', '/abonnement.html', '/notifications.html',
    '/outils.html', '/classement.html', '/arv.html', '/lecture.html',
    '/planificateur.html', '/exam-history.html', '/chapitre.html',
    '/formulaires.html', '/arv-progress.html', '/tableau-periodique.html'
  ];
  function startIdlePrecache() {
    var conn = navigator.connection || {};
    if (conn.saveData) return;
    if (conn.effectiveType && /2g$/.test(conn.effectiveType)) return;
    var i = 0;
    function step() {
      if (i >= IDLE_PAGES.length) return;
      var p = IDLE_PAGES[i++];
      if (p === location.pathname) { setTimeout(step, 900); return; }
      prefetch(location.origin + p);
      setTimeout(step, 1200);
    }
    setTimeout(step, 3500);
  }

  // ────────────────────────────────────────────────────────────────
  // Boot : recenser les scripts déjà chargés, puis démarrer
  // ────────────────────────────────────────────────────────────────
  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll('script[src]'), function (s) {
      var src = s.getAttribute('src');
      if (!src) return;
      try { loadedSrcs.add(new URL(src, location.href).href); } catch (e) {}
    });
    startIdlePrecache();
    console.info('[ARVEXA SPA] moteur actif ' + SPA_VERSION);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
