/* ================================================================
   parcours.js v1.0 — ARVEXA School — MODÈLE A « Ton parcours vers le BAC »
   Brouillon (arvexa-brouillon.vercel.app) — le site ne s'ouvre plus sur
   une liste de matières mais sur UNE route guidée qui mélange les 57
   chapitres semaine par semaine jusqu'au BAC.
   - Données : parcours.json (généré au build, plan indicatif)
   - Progression : localStorage « arv-parcours-v1 » (étapes validées)
     + auto-détection des chapitres lus via « arvexa_read_parts »
   - S'affiche sur index.html (#parcoursCard) et sur parcours.html
   ================================================================ */
(function () {
  'use strict';

  var STORE = 'arv-parcours-v1';
  var READ_KEY = 'arvexa_read_parts';

  /* ---------- CSS injecté (carte d'accueil) ---------- */
  var CSS = [
    '.parcours-card{--pc-b:var(--accent-bright,#E0B84A);position:relative;overflow:hidden}',
    '.pc-wrap{font-family:Inter,sans-serif}',
    '.pc-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}',
    '.pc-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:var(--pc-b);background:rgba(var(--rgb-soft,224,184,74),.10);border:1px solid rgba(var(--rgb-soft,224,184,74),.25);padding:6px 12px;border-radius:999px}',
    '.pc-week{margin-left:auto;font-size:12px;color:var(--text-dim,#8A8A7A)}',
    '.pc-subject{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#0A0A0A;padding:6px 14px;border-radius:999px}',
    '.pc-title{font-family:\'Playfair Display\',serif;font-size:26px;font-weight:700;color:var(--text-light,#F5F0E8);line-height:1.25;margin:12px 0 6px;overflow-wrap:anywhere}',
    '.pc-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--text-dim,#8A8A7A);margin-bottom:16px}',
    '.pc-meta i{color:var(--pc-b)}',
    '.pc-bar{height:10px;border-radius:999px;background:var(--bg-surface,#141414);overflow:hidden;margin-bottom:8px}',
    '.pc-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent,#B8860B),var(--accent-bright,#E0B84A));transition:width .5s ease}',
    '.pc-stats{display:flex;justify-content:space-between;font-size:13px;color:var(--text-dim,#8A8A7A);margin-bottom:18px;gap:8px;flex-wrap:wrap}',
    '.pc-stats strong{color:var(--text-light,#F5F0E8)}',
    '.pc-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}',
    '.pc-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none;border:none;cursor:pointer}',
    '.pc-btn-main{background:linear-gradient(135deg,var(--accent-bright,#E0B84A),var(--accent,#B8860B));color:var(--on-gold,#0A0A0A);box-shadow:0 6px 18px rgba(184,134,11,.25)}',
    '.pc-btn-ghost{background:var(--bg-surface,#141414);color:var(--text-light,#F5F0E8);border:1px solid rgba(255,255,255,.12)}',
    '.pc-links{margin-top:14px;font-size:13px}',
    '.pc-links a{color:var(--text-dim,#8A8A7A);text-decoration:none}',
    '.pc-links a:hover{color:var(--pc-b)}',
    '.pc-done-note{display:inline-flex;align-items:center;gap:8px;color:#7AE04A;font-weight:600}',
    '.pc-class{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--text-dim,#8A8A7A);margin:2px 0 12px}',
    '.pc-class i{color:var(--pc-b)}',
    '.pc-class strong{color:var(--text-light,#F5F0E8);font-weight:600}',
    '.pc-hero .pc-class{margin:0 0 6px}',
    /* ✅ v8.46a — CARTE INTELLIGENTE de l\'accueil : PLUS PETITE, MOINS
       D\'ÉLÉMENTS, PLUS MAGNIFIQUE (demande propriétaire : « tu l\'as rendu un
       peu comme basique donc rend le plus petit moins d\'éléments et plus
       magnifique »). UNE ligne d\'en-tête (parcours + BAC), UNE phrase fine,
       UNE ligne métrique (temps + trait de progression + %), UNE action.
       Fini les 3 boîtes de statistiques — le luxe est dans la sobriété. */
    '.ps-wrap{display:flex;flex-direction:column;gap:9px;cursor:pointer}',
    '.ps-head{display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.ps-title{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:var(--text-dim,#8A8A7A)}',
    '.ps-title i{color:var(--accent-bright,#E0B84A);font-size:11px}',
    '.ps-bac{display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--accent-bright,#E0B84A);background:rgba(var(--rgb-soft,224,184,74),.10);border:1px solid rgba(var(--rgb-soft,224,184,74),.22);padding:3px 9px;border-radius:999px;white-space:nowrap}',
    '.ps-phrase{font-size:13.5px;font-weight:600;line-height:1.5;color:var(--text-light,#F5F0E8);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.ps-phrase em{font-style:normal;color:var(--accent-bright,#E0B84A);font-weight:700}',
    '.ps-meta{display:flex;align-items:center;gap:9px}',
    '.ps-time{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--text-dim,#8A8A7A);white-space:nowrap}',
    '.ps-time i{color:var(--accent-bright,#E0B84A);font-size:10.5px}',
    '.ps-bar{flex:1;height:4px;border-radius:999px;background:var(--bg-surface,#141414);overflow:hidden}',
    '.ps-bar-fill{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent,#B8860B),var(--accent-bright,#E0B84A));transition:width .5s ease;box-shadow:0 0 8px rgba(224,184,74,.35)}',
    '.ps-pct{font-size:11px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--accent-bright,#E0B84A);min-width:30px;text-align:right}',
    '.ps-cta{display:flex;align-items:center;gap:9px;font-size:12.5px;font-weight:700;color:var(--text-light,#F5F0E8);background:linear-gradient(135deg,rgba(var(--rgb-soft,224,184,74),.14),rgba(var(--rgb-soft,224,184,74),.07));border:1px solid rgba(var(--rgb-soft,224,184,74),.28);border-radius:999px;padding:9px 14px;transition:transform .2s ease,background .2s ease;overflow:hidden;white-space:nowrap}',
    '.ps-cta > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ps-cta i{margin-left:auto;color:var(--accent-bright,#E0B84A);flex-shrink:0}',
    '.ps-wrap:active .ps-cta{transform:scale(.985);background:rgba(var(--rgb-soft,224,184,74),.18)}',
    '@media (max-width:560px){.pc-title{font-size:21px}.pc-btn{width:100%;justify-content:center}}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('pc-style')) return;
    var s = document.createElement('style');
    s.id = 'pc-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- données ---------- */
  var M = null;            // manifest
  var validated = {};      // numéro d'étape -> true (validation manuelle)
  var readParts = {};      // "subject_idx" -> {section lue -> true}

  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || '{}');
      validated = raw.validated || {};
    } catch (e) { validated = {}; }
    try {
      var parts = JSON.parse(localStorage.getItem(READ_KEY) || '[]') || [];
      readParts = {};
      parts.forEach(function (k) {
        var pp = String(k).split('_');
        if (pp.length >= 3) {
          var key = pp[0] + '_' + pp[1];
          (readParts[key] = readParts[key] || {})[pp.slice(2).join('_')] = true;
        }
      });
    } catch (e) { readParts = {}; }
  }

  function saveValidated() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ validated: validated }));
    } catch (e) { /* quota */ }
  }

  function readCount(step) {
    var s = readParts[step.subject + '_' + step.chapterIdx];
    return s ? Object.keys(s).length : 0;
  }

  function status(step) {
    if (validated[step.n] || (step.totalSections && readCount(step) >= step.totalSections)) return 'done';
    if (readCount(step) > 0) return 'started';
    return 'todo';
  }

  function doneCount() {
    return M.steps.filter(function (s) { return status(s) === 'done'; }).length;
  }

  /* ---------- helpers ---------- */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function chapterLink(step) {
    return 'chapitre.html?subject=' + step.subject + '&chapter=' + step.chapterIdx;
  }

  function daysToBac() {
    try {
      if (window.ARVEXA_getExamDate) {
        return Math.max(0, Math.ceil((window.ARVEXA_getExamDate() - Date.now()) / 86400000));
      }
    } catch (e) { /* fallback */ }
    if (M && M.bacDate) {
      var d = new Date(M.bacDate + 'T09:00:00');
      return Math.max(0, Math.ceil((d - Date.now()) / 86400000));
    }
    return null;
  }

  function fmtDate(iso) {
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (e) { return iso; }
  }

  /* ✅ v8.34 — la VRAIE classe complète de l'élève (index.html publie
     window.ARVEXA_USER_PROFILE + l'événement « arvexa:profile ») :
     « Terminale C », « Troisième », « Bac Pro comptabilité »… */
  function classLineHtml() {
    var c = '';
    try {
      var up = window.ARVEXA_USER_PROFILE || {};
      var CL = window.ARVEXA_CLASSES;
      if (CL && (up.classId || up.customClass)) {
        c = CL.full(up.classId, up.customClass, up.series) || '';
      }
    } catch (e) { c = ''; }
    return c
      ? '<div class="pc-class"><i class="fas fa-graduation-cap"></i> Ta classe : <strong>' + esc(c) + '</strong></div>'
      : '';
  }

  function currentStep() {
    for (var i = 0; i < M.steps.length; i++) {
      if (status(M.steps[i]) !== 'done') return M.steps[i];
    }
    return null; // parcours terminé
  }

  /* ---------- carte « étape » (réutilisée index + page) ---------- */
  function stepCardHtml(step) {
    var st = status(step);
    var pct = Math.round(doneCount() / M.steps.length * 100);
    var subj = M.subjects[step.subject] || {};
    var finish = M.finishDate ? fmtDate(M.finishDate) : '';
    var d = daysToBac();
    var head = st === 'done'
      ? '<span class="pc-done-note"><i class="fas fa-circle-check"></i> Chapitre maîtrisé</span>'
      : '<span class="pc-badge"><i class="fas fa-route"></i> Étape ' + step.n + ' / ' + M.steps.length + '</span>'
        + '<span class="pc-week">Semaine ' + step.week + ' · ' + fmtDate(step.dateStart) + ' → ' + fmtDate(step.dateEnd) + '</span>';
    var action = st === 'done'
      ? '<button class="pc-btn pc-btn-ghost" data-pc-unvalidate="' + step.n + '"><i class="fas fa-rotate-left"></i> Reprendre cette étape</button>'
      : '<a class="pc-btn pc-btn-main" href="' + chapterLink(step) + '"><i class="fas fa-play"></i> ' + (st === 'started' ? 'Reprendre ce chapitre' : 'Commencer ce chapitre') + '</a>'
        + '<button class="pc-btn pc-btn-ghost" data-pc-validate="' + step.n + '"><i class="fas fa-circle-check"></i> Je valide cette étape</button>';
    return ''
      + '<div class="pc-top">' + head + '</div>'
      + '<span class="pc-subject" style="background:' + subj.color + '"><i class="fas ' + subj.icon + '"></i> ' + esc(subj.label) + '</span>'
      + '<div class="pc-title">' + esc(step.title) + '</div>'
      + classLineHtml()
      + '<div class="pc-meta">'
      +   '<span><i class="fas fa-clock"></i> ~' + step.durationMin + ' min</span>'
      +   '<span><i class="fas fa-list-check"></i> ' + step.totalSections + ' sections</span>'
      +   (d != null ? '<span><i class="fas fa-flag-checkered"></i> BAC dans ' + d + ' jours</span>' : '')
      + '</div>'
      + '<div class="pc-bar"><div class="pc-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<div class="pc-stats"><span><strong>' + doneCount() + '</strong> / ' + M.steps.length + ' étapes</span>'
      +   '<span><strong>' + pct + '%</strong> du parcours</span>'
      +   (finish ? '<span>Fin prévue : <strong>' + finish + '</strong></span>' : '')
      + '</div>'
      + '<div class="pc-actions">' + action + '</div>'
      + '<div class="pc-links"><a href="parcours.html"><i class="fas fa-map"></i> Voir tout mon parcours</a>'
      +   ' &nbsp;·&nbsp; <a href="parcours.html#matieres"><i class="fas fa-book"></i> Toutes les matières</a></div>';
  }

  function doneBannerHtml() {
    return '<div class="pc-top"><span class="pc-badge"><i class="fas fa-trophy"></i> Parcours terminé</span></div>'
      + '<div class="pc-title">Les 57 chapitres sont maîtrisés !</div>'
      + classLineHtml()
      + '<div class="pc-meta"><span><i class="fas fa-stopwatch"></i> Il reste ' + (daysToBac() || '—') + ' jours avant le BAC : passe dans Test moi.</span></div>'
      + '<div class="pc-actions"><a class="pc-btn pc-btn-main" href="exam.html"><i class="fas fa-stopwatch"></i> Test moi</a>'
      + '<a class="pc-btn pc-btn-ghost" href="parcours.html"><i class="fas fa-map"></i> Revoir mon parcours</a></div>';
  }

  /* ---------- rendu index ---------- */
  // ✅ v8.43 — CARTE INTELLIGENTE « Ton parcours vers le BAC » : simple et
  // luxueuse. La carte COMPARE le temps passé entre les chapitres/sections
  // (getSmartCard — instantané depuis le cache, puis frais) et détecte la
  // LACUNE ; au toucher, elle mène DIRECTEMENT au chapitre concerné
  // (demande propriétaire : « il compare les temps entre les différentes
  // chapitres et sections qu'on a passés, en fonction de ce temps il
  // déterminera là où l'utilisateur a des lacunes, et quand l'utilisateur
  // touche la carte il mène directement au chapitre concerné »).
  var SMART_CACHE_KEY = 'arv_smart_cache_v1';
  var DASH_CACHE_KEY = 'arvexa_dash_cache_v1'; // écrit par la page Résumé (bloc smart v8.43)

  function readSmartCache() {
    try {
      var d = JSON.parse(localStorage.getItem(SMART_CACHE_KEY) || 'null');
      if (d && d.success && d.study) return d;
    } catch (e) {}
    try {
      var dash = JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null');
      if (dash && dash.smart && dash.subjects) {
        return { success: true, study: dash.smart.study || dash.studyTime, summary: dash.summary, subjects: dash.subjects, lacune: dash.smart.lacune || null };
      }
    } catch (e) {}
    return null;
  }

  function fetchSmart() {
    if (typeof window.__arvexaGetIdToken !== 'function') return Promise.resolve(null);
    return Promise.resolve()
      .then(function () { return window.__arvexaGetIdToken(); })
      .then(function (token) {
        if (!token) return null;
        return fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ action: 'getSmartCard' })
        });
      })
      .then(function (r) { return r ? r.json() : null; })
      .then(function (data) {
        if (data && data.success && data.study) {
          try {
            localStorage.setItem(SMART_CACHE_KEY, JSON.stringify({
              at: Date.now(), success: true,
              study: data.study, summary: data.summary,
              subjects: data.subjects, lacune: data.lacune
            }));
          } catch (e) {}
          renderIndexCard();
          return data;
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function fmtMinLocal(m) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 1) return '0 min';
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return r === 0 ? h + ' h' : h + ' h ' + (r < 10 ? '0' : '') + r;
  }

  function smartPhrase(d) {
    var subjects = (d && Array.isArray(d.subjects) ? d.subjects : [])
      .filter(function (s) { return (s.sectionsCount || 0) > 0; })
      .slice()
      .sort(function (a, b) { return (b.minutes || 0) - (a.minutes || 0); });
    var nS = (d && d.summary && d.summary.totalSections) || 0;
    if (subjects.length === 0 || nS === 0) {
      return { html: 'Ajoute ton premier cours dans <em>Résumé</em> — l\'IA le classe pour toi.', cta: 'Ouvrir le Résumé', href: 'arv-progress.html' };
    }
    var top = subjects[0];
    var lac = d.lacune || null;
    // ✅ v8.46a — phrases COURTES (carte plus petite, moins d\'éléments) :
    // l\'essentiel tient en 1-2 lignes, la cta porte l\'action précise.
    if (lac && lac.subject && lac.id) {
      if ((lac.studyMinutes || 0) < 5) {
        return {
          html: 'Ton temps va surtout à ' + esc(top.label) + ' — <em>' + esc(lac.title) + '</em> attend encore : c\'est ta lacune du moment.',
          cta: 'Reprendre ' + lac.title,
          href: 'arv-progress.html#/chapter/' + lac.subject + '/' + lac.id
        };
      }
      return {
        html: '<em>' + esc(lac.title) + '</em> en ' + esc(lac.subjectLabel) + ' est ta lacune — ' + esc(fmtMinLocal(lac.studyMinutes)) + ' pour ' + lac.sectionsCount + ' section' + (lac.sectionsCount > 1 ? 's' : '') + '. Un point à revoir.',
        cta: 'Reprendre ' + lac.title,
        href: 'arv-progress.html#/chapter/' + lac.subject + '/' + lac.id
      };
    }
    return { html: 'Temps bien réparti sur ' + subjects.length + ' matière' + (subjects.length > 1 ? 's' : '') + ' — chaque chapitre compte.', cta: 'Ouvrir le Résumé', href: 'arv-progress.html' };
  }

  function renderSmartCard(el, d) {
    var ph = smartPhrase(d || {});
    var study = (d && d.study) || {};
    var summary = (d && d.summary) || {};
    var bac = daysToBac();
    var pct = M ? Math.round(doneCount() / Math.max(1, M.steps.length) * 100) : null;

    // ✅ v8.46a — 4 éléments AU LIEU DE 6 : en-tête (titre + BAC), phrase,
    // métrique fine (temps + trait + %), action. Compact et luxueux.
    var html = '<div class="ps-wrap" id="psWrap">';
    html += '<div class="ps-head">'
      + '<span class="ps-title"><i class="fas fa-route"></i> Ton parcours</span>'
      + (bac != null ? '<span class="ps-bac"><i class="fas fa-flag-checkered"></i> BAC · ' + bac + ' j</span>' : '')
      + '</div>';
    html += '<div class="ps-phrase">' + ph.html + '</div>';
    html += '<div class="ps-meta">'
      + '<span class="ps-time"><i class="fas fa-clock"></i> ' + esc(study.totalLabel || fmtMinLocal(study.totalMinutes || 0)) + '</span>'
      + (pct != null ? '<span class="ps-bar"><span class="ps-bar-fill" style="width:' + pct + '%"></span></span><span class="ps-pct">' + pct + ' %</span>' : '<span class="ps-bar"><span class="ps-bar-fill" style="width:0%"></span></span>')
      + '</div>';
    html += '<div class="ps-cta"><span><i class="fas fa-location-dot"></i> ' + esc(ph.cta) + '</span><i class="fas fa-arrow-right"></i></div>';
    html += '</div>';
    el.innerHTML = html;
    var wrap = el.querySelector('#psWrap');
    if (wrap) {
      wrap.addEventListener('click', function () { window.location.href = ph.href; });
    }
  }

  function renderIndexCard() {
    var el = document.getElementById('parcoursCard');
    if (!el) return;
    injectCss();
    el.classList.add('parcours-card', 'pc-wrap');
    renderSmartCard(el, readSmartCache());
  }

  /* ---------- rendu parcours.html ---------- */
  function renderPage() {
    var root = document.getElementById('pcApp');
    if (!root) return;
    injectCss(); /* les classes pc-* partagées (carte étape) sont injectées aussi ici */
    var cur = currentStep();
    var pct = Math.round(doneCount() / M.steps.length * 100);
    var weekNow = cur ? cur.week : (M.steps.length ? M.steps[M.steps.length - 1].week : 1);

    var html = '<section class="pc-hero">'
      + '<div class="pc-hero-badge"><i class="fas fa-route"></i> Ton parcours vers le BAC</div>'
      + '<h1 class="pc-hero-title">Une seule route, ' + M.steps.length + ' étapes, <em>zéro hésitation</em></h1>'
      + '<p class="pc-hero-sub">Le programme mêle toutes les matières semaine par semaine jusqu\'au BAC. '
      + 'Valide une étape dès que tu maîtrises son chapitre — le parcours avance, toi aussi.</p>'
      + classLineHtml()
      + '<div class="pc-hero-stats">'
      +   '<div class="pc-stat"><strong>' + doneCount() + '</strong><span>étapes faites</span></div>'
      +   '<div class="pc-stat"><strong>' + pct + '%</strong><span>du parcours</span></div>'
      +   '<div class="pc-stat"><strong>S' + weekNow + '</strong><span>semaine actuelle</span></div>'
      +   '<div class="pc-stat"><strong>' + fmtDate(M.finishDate) + '</strong><span>fin prévue</span></div>'
      + '</div></section>';

    html += '<section class="pc-current"><h2 class="pc-h2"><i class="fas fa-location-dot"></i> Ton étape maintenant</h2>'
      + '<div class="pc-card">' + (cur ? stepCardHtml(cur) : doneBannerHtml()) + '</div></section>';

    /* frise par semaines */
    html += '<section class="pc-timeline"><h2 class="pc-h2"><i class="fas fa-map"></i> Le plan complet</h2>';
    var byWeek = {};
    M.steps.forEach(function (s) { (byWeek[s.week] = byWeek[s.week] || []).push(s); });
    Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; }).forEach(function (w) {
      var ms = (M.milestones || []).find(function (m) { return m.week === w; });
      if (ms) {
        html += '<a class="pc-milestone" href="' + ms.link + '"><i class="fas fa-stopwatch"></i><span>'
          + esc(ms.label) + ' — semaine ' + w + '</span><strong>' + fmtDate(ms.date) + '</strong></a>';
      }
      html += '<div class="pc-weekblock"><div class="pc-weekhead"><strong>Semaine ' + w + '</strong><span>'
        + fmtDate(byWeek[w][0].dateStart) + ' → ' + fmtDate(byWeek[w][byWeek[w].length - 1].dateEnd) + '</span></div>';
      byWeek[w].forEach(function (s) {
        var st = status(s);
        var dot = st === 'done' ? '<span class="pc-dot done"><i class="fas fa-check"></i></span>'
          : st === 'started' ? '<span class="pc-dot started"><i class="fas fa-half-stroke-circle"></i></span>'
          : '<span class="pc-dot"></span>';
        html += '<div class="pc-row ' + st + '">' + dot
          + '<span class="pc-num">' + s.n + '</span>'
          + '<span class="pc-ico" style="background:' + (M.subjects[s.subject] || {}).color + '"><i class="fas ' + (M.subjects[s.subject] || {}).icon + '"></i></span>'
          + '<div class="pc-rowmain"><div class="pc-rowtitle">' + esc(s.title) + '</div>'
          + '<div class="pc-rowsub">' + esc((M.subjects[s.subject] || {}).label) + ' · ~' + s.durationMin + ' min · ' + s.totalSections + ' sections</div></div>'
          + '<a class="pc-mini" href="' + chapterLink(s) + '"><i class="fas fa-' + (st === 'todo' ? 'play' : 'arrow-right') + '"></i> ' + (st === 'todo' ? 'Commencer' : 'Ouvrir') + '</a>'
          + '<button class="pc-mini pc-val' + (st === 'done' ? ' on' : '') + '" data-pc-toggle="' + s.n + '" title="Valider / annuler"><i class="fas fa-check"></i></button>'
          + '</div>';
      });
      html += '</div>';
    });
    html += '<a class="pc-milestone bac" href="index.html"><i class="fas fa-graduation-cap"></i><span>BAC 2027 — le grand jour</span><strong>'
      + fmtDate(M.bacDate) + '</strong></a></section>';

    /* matières (accès complet conservé) */
    html += '<section class="pc-subjects" id="matieres"><h2 class="pc-h2"><i class="fas fa-book"></i> Toutes les matières</h2>'
      + '<p class="pc-note">Le parcours décide de l\'ordre — mais garde la main : ouvre une matière librement.</p><div class="pc-subjgrid">';
    Object.keys(M.subjects).forEach(function (k) {
      var s = M.subjects[k];
      html += '<a class="pc-subjcard" href="matiere.html?subject=' + k + '">'
        + '<span class="pc-ico lg" style="background:' + s.color + '"><i class="fas ' + s.icon + '"></i></span>'
        + '<strong>' + esc(s.label) + '</strong><span class="pc-subjn">' + s.chapters + ' chapitres</span></a>';
    });
    html += '</div></section>'
      + '<p class="pc-footnote">Plan indicatif généré le ' + fmtDate(M.generated.slice(0, 10)) + ' — v1.0 Modèle A.</p>';

    root.innerHTML = html;
  }

  /* ---------- interactions ---------- */
  function onClick(e) {
    var t = e.target.closest('[data-pc-validate],[data-pc-unvalidate],[data-pc-toggle]');
    if (!t) return;
    e.preventDefault();
    var n = parseInt(t.getAttribute('data-pc-validate') || t.getAttribute('data-pc-unvalidate') || t.getAttribute('data-pc-toggle'), 10);
    if (isNaN(n)) return;
    if (t.hasAttribute('data-pc-unvalidate')) {
      delete validated[n];
    } else if (t.hasAttribute('data-pc-toggle')) {
      if (validated[n]) delete validated[n]; else validated[n] = true;
    } else {
      validated[n] = true;
    }
    saveValidated();
    renderIndexCard();
    renderPage();
  }

  function init(manifest) {
    M = manifest;
    loadLocal();
    document.addEventListener('click', onClick);
    renderIndexCard();
    renderPage();
    // ✅ v8.43 — temps réels de la carte intelligente : au démarrage + à
    // chaque retour sur l'accueil (visible).
    setTimeout(fetchSmart, 1200);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { loadLocal(); renderIndexCard(); renderPage(); setTimeout(fetchSmart, 400); }
    });
  }

  function boot() {
    fetch('parcours.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(init)
      .catch(function (err) {
        console.warn('[parcours] manifest indisponible :', err);
        // ✅ v8.43 — même sans le manifest, la carte INTELLIGENTE reste
        // fonctionnelle (cache local + getSmartCard) : seul le trait de
        // progression du plan officiel disparaît.
        M = null;
        renderIndexCard();
        setTimeout(fetchSmart, 800);
      });
  }

  /* ✅ v8.34 — quand le profil arrive (index.html), la carte affiche
     immédiatement la vraie classe, sans attendre un re-rendu. */
  window.addEventListener('arvexa:profile', function () {
    renderIndexCard(); // ✅ v8.43 — la carte intelligente n'a pas besoin du manifest
    if (!M) return;
    renderPage();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
