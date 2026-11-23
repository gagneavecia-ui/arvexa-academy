#!/usr/bin/env node
// Sonde directe — l'explication HISTOIRE passe-t-elle la signature sur Groq ?
// Reproduit EXACTEMENT le prompt serveur (extraction vm) + la validation.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'api', 'progress.js'), 'utf8');
function slice(a, b) { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return src.slice(i, j); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  slice('const AI_SIGNATURE =', 'let adminServices = null;') + '\n' +
  slice('const LATEX_RULES =', '// PROMPTS PAR PROFIL') + '\n' +
  slice('function buildScientificPrompts', 'function buildFallbackAnalysis'), ctx);

const tasks = ctx.getPromptsForProfile('history', { subjectLabel: 'Histoire', rawInput: `Les traités de paix après la Première Guerre mondiale. Le traité de Versailles est signé le 28 juin 1919 entre les vainqueurs et l'Allemagne, jugée seule responsable de la guerre (article 231). L'Allemagne perd l'Alsace-Lorraine au profit de la France, ses colonies et doit payer des réparations énormes. Le traité de Saint-Germain (1919) démantèle l'Autriche-Hongrie ; le traité de Trianon (1920) réduit la Hongrie ; la SDN créée en 1920 à Genève doit garantir la paix mais reste faible : les États-Unis refusent d'y entrer et le Sénat américain rejette le traité de Versailles en 1920.` });
const expl = tasks.find((t) => t.name === 'explanation');
console.log('— prompt length:', expl.userPrompt.length, '| signature dans le prompt :', expl.userPrompt.includes('ARVEXA-COMPLETE'));

const KEY = process.env.GROQ_API_KEY || ''; // cle JAMAIS en dur : export GROQ_API_KEY=... avant execution
const MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile'];

(async () => {
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({
          model, temperature: 0.3, max_tokens: 3800, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: 'Tu produis EXCLUSIVEMENT du JSON valide, sans commentaire.' }, { role: 'user', content: expl.userPrompt }]
        })
      });
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      const data = await res.json();
      if (!res.ok) { console.log(`[${model}] HTTP ${res.status} en ${el}s — ${JSON.stringify(data).slice(0, 150)}`); continue; }
      const choice = data.choices?.[0] || {};
      const raw = choice.message?.content || '';
      const finish = choice.finish_reason;
      let parsed = null, parseErr = null;
      try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()); }
      catch (e) {
        // repairJson simplifié
        let s = raw.trim(); const f = s.indexOf('{'), l = s.lastIndexOf('}');
        const cand = l > f ? s.slice(f, l + 1) : s.slice(f);
        try { parsed = JSON.parse(cand); } catch (e2) { parseErr = e2.message; }
      }
      const parts = parsed?.parts?.length || 0;
      console.log(`[${model}] ${el}s | finish=${finish} | signature=${parsed?.signature === 'ARVEXA-COMPLETE' ? 'OUI' : 'NON'} | parts=${parts} | keyFacts=${parsed?.keyFacts?.length || 0} | tail="${raw.slice(-90).replace(/\n/g, '⏎')}"`);
    } catch (e) {
      console.log(`[${model}] exception — ${e.message}`);
    }
  }
})();
