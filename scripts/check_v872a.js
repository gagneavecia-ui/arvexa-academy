#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════
   AUDIT TECHNIQUE v8.72a — HTML / CSS / JS sur toutes les pages
   (1) équilibre des balises structurantes par page
   (2) ids dupliqués par page
   (3) liens internes → fichiers existants
   (4) syntaxe des <script> inline (extraction + node --check)
   (5) équilibre des accolades de chaque bloc <style>
   (6) résidus interdits / références mortes aux éléments retirés
   (7) limite Vercel Hobby : 12 fonctions serverless dans api/
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const T = (label, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (extra ? ' — ' + extra : '')); }
};

const pages = fs.readdirSync('.').filter((f) => f.endsWith('.html'));
console.log('Pages HTML : ' + pages.length);

/* ── 1 & 2 & 3 & 6 : par page ── */
for (const f of pages) {
  const htmlFull = fs.readFileSync(f, 'utf8');
  /* ⚠️ les templates JS (innerHTML = `...`) contiennent du HTML avec des ids
     répétés entre états — on audite donc la STRUCTURE hors des <script>. */
  const html = htmlFull.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
  // 1. équilibre
  const counts = {};
  for (const tag of ['div', 'section', 'span', 'button', 'form', 'header', 'footer', 'main', 'style', 'a', 'h1', 'h2', 'h3', 'ul', 'li', 'table', 'tr']) {
    const open = (html.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
    const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== close) { counts[tag] = open + '/' + close; }
  }
  T(f + ' : balises équilibrées', Object.keys(counts).length === 0, JSON.stringify(counts));
  // 2. ids dupliqués
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  T(f + ' : ids uniques', dup.length === 0, [...new Set(dup)].join(', '));
  // 3. liens internes
  const links = [...html.matchAll(/href="([a-z0-9-]+\.html)([#?][^"]*)?"/gi)].map((m) => m[1]);
  const missing = [...new Set(links.filter((l) => !fs.existsSync(l)))];
  T(f + ' : liens internes', missing.length === 0, missing.join(', '));
  // 6. résidus
  const residue = [];
  if (/creditsGrid|renderCreditsBalance|loadCreditsPacks/.test(htmlFull)) residue.push('refs packs abonnement');
  T(f + ' : résidus packs supprimés', residue.length === 0, residue.join(', '));
}

/* ── 4 : syntaxe inline (toutes pages) ── */
{
  let scripts = 0, bad = 0;
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(html))) {
      i++; scripts++;
      const attrs = m[1] || '';
      if (/importmap|application\/(ld\+)?json/.test(attrs)) continue;
      const code = m[2];
      if (!code.trim()) continue;
      const isModule = /type="module"/.test(attrs);
      const stripped = isModule
        ? code.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '').replace(/^\s*import\s*['"][^'"]+['"];?\s*$/gm, '')
        : code;
      const tmp = path.join('/tmp', 'aud_' + f.replace(/[^\w]/g, '_') + '_' + i + '.js');
      fs.writeFileSync(tmp, stripped);
      try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); }
      catch (e) { bad++; console.log('    FAIL ' + f + ' script#' + i + ' : ' + (e.stderr || '').toString().split('\n').slice(0, 3).join(' | ')); }
    }
  }
  T('syntaxe inline : ' + scripts + ' scripts', bad === 0, bad + ' en erreur');
}

/* ── 5 : accolades CSS ── */
for (const f of pages) {
  const html = fs.readFileSync(f, 'utf8');
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m, i = 0, ok = true;
  while ((m = re.exec(html))) {
    i++;
    const css = m[1];
    const o = (css.match(/{/g) || []).length, c = (css.match(/}/g) || []).length;
    if (o !== c) { ok = false; console.log('    ' + f + ' style#' + i + ' : ' + o + ' { / ' + c + ' }'); }
  }
  T(f + ' : accolades CSS (' + i + ' blocs)', ok);
}

/* ── 7 : fonctions serverless ── */
const api = fs.readdirSync('api').filter((f) => !f.startsWith('_') && /\.(js|mjs)$/.test(f));
T('limite Hobby 12 fonctions api/', api.length <= 12, api.length + ' fonctions : ' + api.join(', '));

/* ── SW ── */
const sw = fs.readFileSync('service-worker.js', 'utf8');
T('SW_VERSION v8.72a (let)', /let SW_VERSION = 'arvexa-online-v8\.72a';/.test(sw));

console.log('\n═══ AUDIT v8.72a : ' + pass + ' PASS / ' + fail + ' FAIL — taux ' + (100 * pass / (pass + fail)).toFixed(1) + ' % ═══');
process.exit(fail ? 1 : 0);
