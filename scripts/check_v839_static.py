#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Contrôles statiques v8.39 — chaîne IA robuste · matières dynamiques · PDF 7 Mo."""
import subprocess, sys, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
PASS, FAIL = [], []

def check(name, cond):
    (PASS if cond else FAIL).append(name)

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

page = read('arv-progress.html')
kit  = read('_shared/arvx-ai-handler.js')
cli  = read('arvx-ai.js')
api  = read('api/progress.js')
sw   = read('service-worker.js')

# ── 1. Cartes matières DYNAMIQUES (accueil) ──────────────────────
check('1.1  cartes matières : filtre sectionsCount>0', 'activeSubjects = safeSubjectsList.filter((s) => (s.sectionsCount || 0) > 0)' in page)
check('1.2  plus de cartes fixes ALL_SUBJECT_KEYS.map', 'ALL_SUBJECT_KEYS.map(' not in page)
check('1.3  compteur Mes matières = actives', '${activeSubjects.length}' in page)
check('1.4  état vide invitant (nouvel élève)', 'Tes matières apparaîtront ici' in page)
check('1.5  grille seulement si matières actives', 'activeSubjects.length > 0' in page and '<div class="subjects-grid">' in page)

# ── 2. PDF — limite 7 Mo + extraction robuste ────────────────────
check('2.1  garde 7 Mo (PDF_MAX_BYTES)', 'const PDF_MAX_BYTES = 7 * 1024 * 1024;' in page)
check('2.2  message refus > 7 Mo', 'PDF trop volumineux' in page and 'la taille maximale est 7 Mo' in page)
check('2.3  desc modale PDF mentionne 7 Mo', "Envoie ton cours PDF (max 7 Mo)" in page)
check('2.4  OCR scanné élargi à 10 pages', 'maxPages: 10' in page and 'maxPages: 6' not in page)
check('2.5  couche texte PDF toujours 10 pages', 'Math.min(pdf.numPages, 10)' in page)

# ── 3. OCR client anti-erreur ─────────────────────────────────────
check('3.1  acOcrImages : 3 essais par lot', 'tries < 3' in page)
check('3.2  acOcrImages : repli image par image', 'for (const im of imgs)' in page)
check('3.3  images GARANTIES sous limite API (client)', 'MAX_B64_CHARS' in cli and '1100000' in cli)
check('3.4  échelle de compression photos (ladder)', cli.count('ladder') >= 2)
check('3.5  pages PDF resserrées si trop lourdes', 'while (b64Len(dataUrl) > MAX_B64_CHARS' in cli)

# ── 4. Kit IA — cascade serveur robuste ───────────────────────────
check('4.1  7 modèles vision OpenRouter', kit.count(':free') >= 7)
check('4.2  modèle openrouter/free fantôme retiré', "'openrouter/free'" not in kit)
check('4.3  Gemini multi-modèles', "GEMINI_MODELS = ['gemini-flash-latest', 'gemini-2.0-flash']" in kit)
check('4.4  Gemini double auth (AQ. et AIza)', "x-goog-api-key" in kit and "Authorization: 'Bearer ' + process.env.GEMINI_API_KEY" in kit)
check('4.5  Groq 2 modèles vision', 'llama-4-maverick-17b-128e-instruct' in kit)
check('4.6  retentes auto 429/5xx (kit)', kit.count('await sleep(RETRY_BACKOFF_MS)') >= 3)
check('4.7  budget élargi 50 s', 'TOTAL_BUDGET_MS = 50000' in kit)
check('4.8  délai par essai 17 s', 'PROVIDER_TIMEOUT_MS = 17000' in kit)
check('4.9  maxDuration 60 (kit)', 'module.exports.maxDuration = 60' in kit)
check('4.10 chat texte aussi en cascade (Gemini+Groq)', 'Relais Gemini (texte)' in kit and 'Relais Groq (texte)' in kit)

# ── 5. api/progress — cascade callProvider ────────────────────────
check('5.1  Groq fallback llama-3.1-8b-instant', "fallbackModels: ['llama-3.1-8b-instant']" in api)
check('5.2  OpenRouter replis gratuits', 'openai/gpt-oss-20b' in api and 'meta-llama/llama-3.3-70b-instruct:free' in api)
check('5.3  Gemini replis flash-latest', "fallbackModels: ['gemini-flash-latest', 'gemini-2.0-flash']" in api)
check('5.4  attemptProviderOnce présent', 'async function attemptProviderOnce(' in api)
check('5.5  callProvider cascade', 'const models = [provider.model]' in api and 'provider.fallbackModels' in api)
check('5.6  retente sur retryable', "res.kind === 'retryable' && tries === 0" in api)
check('5.7  auth invalide → fournisseur suivant direct', "res.kind === 'auth'" in api)
check('5.8  parseProviderJson extrait', 'function parseProviderJson(' in api)
check('5.9  Gemini clé query + header', "x-goog-api-key': provider.key" in api and 'encodeURIComponent(provider.key)' in api)

# ── 6. Détection non-cours ────────────────────────────────────────
check('6.1  isStudy dans le prompt', '"isStudy"' in api and 'isStudy":true' in api)
check('6.2  NOT_COURSE 422', "code: 'NOT_COURSE'" in api and 'status: 422' in api)
check('6.3  SUBJECT_UNKNOWN 422', "code: 'SUBJECT_UNKNOWN'" in api)
check('6.4  isStudy=false → vote notStudy', 'sawNotStudy' in api)
check('6.5  isStudy absent = compat true', "parsed?.isStudy !== false" in api)
check('6.6  client gère NOT_COURSE', "e.code === 'NOT_COURSE'" in page)
check('6.7  saisie élève retrouvée', '__acResumeText' in page and 'window.__acResumeText = rawInput' in page)
check('6.8  modale rouvre sur la vérif', "acMode = 'texte'; showVerifyMode();" in page)

# ── 7. Versions / hygiène ─────────────────────────────────────────
check('7.1  SW bump v8.39', "SW_VERSION = 'arvexa-offline-v8.39'" in sw and 'v8.38' not in sw.split('\n')[5][:120])
check('7.2  log page v8.9', 'serveur progress v8.9' in page)
check('7.3  log serveur v8.9', '[PROGRESS v8.9]' in api and 'v8.8]' not in api)

# ── 8. Syntaxe node ───────────────────────────────────────────────
for f in ['api/progress.js', '_shared/arvx-ai-handler.js', 'arvx-ai.js', 'service-worker.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    check(f'8.x  node --check {f}', r.returncode == 0)

# ── 9. Original INTACT (e0d5211) ──────────────────────────────────
r = subprocess.run(['git', '-C', '../arvexa', 'rev-parse', 'HEAD'], capture_output=True, text=True)
check('9.1  original arvexa untouched e0d5211', r.stdout.strip() == 'e0d5211' + r.stdout.strip()[7:] and r.stdout.strip().startswith('e0d5211'))
r2 = subprocess.run(['git', '-C', '../arvexa', 'status', '--porcelain'], capture_output=True, text=True)
check('9.2  original arvexa working tree clean', r2.stdout.strip() == '')

# ── Rapport ───────────────────────────────────────────────────────
print(f'PASS {len(PASS)} / {len(PASS) + len(FAIL)}')
for f in FAIL:
    print('FAIL:', f)
sys.exit(1 if FAIL else 0)
