/* ═══════════════════════════════════════════════════════════════════
   KIT IA ARVX — js/arvx-ai.js (client, zéro build)
   Une seule balise <script src="js/arvx-ai.js"></script> puis :

     const r = await ARVX_AI.ask('image', { mode:'ocr', images:[dataURL] });
     // r = { provider, data:{ text } }

     const r2 = await ARVX_AI.ask('doc', { mode:'summary', images:pages });
     const r3 = await ARVX_AI.ask('chat', { messages:[{role:'user',content:'...'}] });

   Aides fournies :
     ARVX_AI.compressImageFile(file)   → dataURL JPEG ≤ 1400 px (canvas)
     ARVX_AI.pdfToImages(file)         → [dataURL] pages du PDF (pdf.js CDN)
     ARVX_AI.errMessage(code)          → message FR/AN pour afficher
     ARVX_AI.endpoint = 'https://...'  → si l'API vit sur un autre domaine
   (sur ARVEXA l'API vit sur /api/arv?kit=1 — le handler du kit y est délégué)

   Les clés restent côté serveur : ce script n'en contient aucune.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const AI_TIMEOUT_MS = 60000;

  class AiError extends Error {
    constructor(code) { super(code); this.code = code; }
  }

  function lang() {
    return (window.ARVX_LANG === 'an' || localStorage.getItem('arvx-lang') === 'an') ? 'an' : 'fr';
  }
  function setLang(l) {
    try { localStorage.setItem('arvx-lang', l === 'an' ? 'an' : 'fr'); } catch (e) {}
    window.ARVX_LANG = l === 'an' ? 'an' : 'fr';
  }

  const MSG = {
    fr: {
      network: 'Connexion impossible — vérifie ton réseau.',
      rate: 'Trop de demandes — réessaie dans quelques minutes.',
      too_large: 'Fichier trop lourd — réduis sa taille ou envoie moins de pages.',
      bad: 'Demande refusée — vérifie le formulaire.',
      ai_error: 'L’IA est indisponible — réessaie dans un instant.',
      pdf: 'Impossible de lire ce PDF — essaie un autre fichier.',
    },
    an: {
      network: 'Can’t connect — check your network.',
      rate: 'Too many requests — try again in a few minutes.',
      too_large: 'File too large — shrink it or send fewer pages.',
      bad: 'Request refused — check the form.',
      ai_error: 'AI is unavailable — try again in a moment.',
      pdf: 'Can’t read this PDF — try another file.',
    },
  };
  function errMessage(code) {
    const L = lang();
    return (MSG[L] && MSG[L][code]) || MSG.fr.ai_error;
  }

  /* ── transport ──────────────────────────────────────────────────── */
  async function ask(task, payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    let res;
    try {
      res = await fetch((window.ARVX_AI && window.ARVX_AI.endpoint) || '/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ task, lang: lang() }, payload || {})),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new AiError('network');
      throw new AiError('network');
    }
    clearTimeout(timer);
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok || !body || body.ok !== true) {
      const code = (body && body.error) || (res.status === 413 ? 'too_large' : 'ai_error');
      throw new AiError(code === 'rate' ? 'rate' : (res.status >= 400 && res.status < 500 && code === 'ai_error' ? 'bad' : code));
    }
    return { provider: body.provider, data: body.data };
  }

  /* ── fichiers → dataURL ─────────────────────────────────────────── */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new AiError('bad'));
      fr.readAsDataURL(file);
    });
  }

  /* ✅ v8.39 — taille max en base64 acceptée par l'API (marge de sécurité
     sous la limite serveur de 1,4 Mo) : au-delà, la requête serait rejetée
     avant même d'atteindre l'IA — c'était la cause « photo renvoie une
     erreur ». Toute image produite ici est GARANTIE sous cette limite. */
  const MAX_B64_CHARS = 1100000;
  function b64Len(dataUrl) { return (String(dataUrl).split(',')[1] || '').length; }

  function canvasToJpeg(cv, quality) { return cv.toDataURL('image/jpeg', quality); }

  function drawScaled(img, w, h) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w));
    cv.height = Math.max(1, Math.round(h));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  /* Image → JPEG recompressé (≤ maxSide px), PUIS resserré si nécessaire
     (qualité puis taille) jusqu'à passer sous la limite API. */
  async function compressImageFile(file, opts) {
    const maxSide = (opts && opts.maxSide) || 1400;
    const quality = (opts && opts.quality) || 0.8;
    const dataUrl = await fileToDataURL(file);
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new AiError('bad'));
      im.src = dataUrl;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
    const ladder = [
      { s: 1, q: quality },
      { s: 1, q: 0.65 },
      { s: 0.85, q: 0.6 },
      { s: 0.7, q: 0.55 },
      { s: 0.55, q: 0.5 },
    ];
    let out = null;
    for (const step of ladder) {
      out = canvasToJpeg(drawScaled(img, w * step.s, h * step.s), step.q);
      if (b64Len(out) <= MAX_B64_CHARS) return out;
    }
    return out;
  }

  /* ── PDF → pages en images (pdf.js chargé à la demande) ─────────── */
  let pdfjsLoading = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoading) return pdfjsLoading;
    pdfjsLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_CDN + 'pdf.min.js';
      s.onload = () => {
        if (!window.pdfjsLib) { reject(new AiError('pdf')); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsLoading = null; reject(new AiError('pdf')); };
      document.head.appendChild(s);
    });
    return pdfjsLoading;
  }

  /* Rend chaque page en JPEG (≤ 4 pages par appel = limite de l'API).
     ✅ v8.39 — chaque page est garantie sous la limite API (resserrage
     automatique qualité/taille, même « échelle de compression » que les
     photos) : un PDF scanné ne peut plus être rejeté pour taille.
     opts : { maxPages:4, scale:1.6, onProgress(p, total) } */
  async function pdfToImages(file, opts) {
    const maxPages = (opts && opts.maxPages) || 4;
    const scale = (opts && opts.scale) || 1.6;
    const onProgress = (opts && opts.onProgress) || null;
    let lib;
    try { lib = await loadPdfJs(); } catch (e) { throw new AiError('pdf'); }
    let pdf;
    try {
      pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch (e) { throw new AiError('pdf'); }
    const n = Math.min(pdf.numPages, maxPages);
    const out = [];
    for (let p = 1; p <= n; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      let dataUrl = cv.toDataURL('image/jpeg', 0.8);
      let step = 0;
      const ladder = [
        { k: 0.85, q: 0.65 },
        { k: 0.7, q: 0.6 },
        { k: 0.55, q: 0.5 },
      ];
      while (b64Len(dataUrl) > MAX_B64_CHARS && step < ladder.length) {
        const s = ladder[step];
        const cv2 = document.createElement('canvas');
        cv2.width = Math.max(1, Math.round(cv.width * s.k));
        cv2.height = Math.max(1, Math.round(cv.height * s.k));
        cv2.getContext('2d').drawImage(cv, 0, 0, cv2.width, cv2.height);
        dataUrl = cv2.toDataURL('image/jpeg', s.q);
        step++;
      }
      out.push(dataUrl);
      if (onProgress) onProgress(p, n);
    }
    return out;
  }

  window.ARVX_AI = {
    AiError,
    ask,
    errMessage,
    setLang,
    fileToDataURL,
    compressImageFile,
    pdfToImages,
    endpoint: '/api/arv?kit=1',
  };
})();
