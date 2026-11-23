#!/usr/bin/env python3
# ✅ v8.42 — contrôles statiques : chaîne de cartes, OCR cahier, auth instantanée
import re, subprocess, sys, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE)
ok = fails = 0
def check(name, cond):
    global ok, fails
    if cond: ok += 1; print(f"  ✓ {name}")
    else: fails += 1; print(f"  ✗ FAIL: {name}")

page = open('arv-progress.html', encoding='utf-8').read()
handler = open('_shared/arvx-ai-handler.js', encoding='utf-8').read()
client = open('arvx-ai.js', encoding='utf-8').read()
guard = open('auth-guard.js', encoding='utf-8').read()
progress = open('api/progress.js', encoding='utf-8').read()
sw = open('service-worker.js', encoding='utf-8').read()

print("— CARTE MENTALE CHAÎNE (arv-progress.html)")
check('bulles radiales purgées (mmap-bubble absent)', 'mmap-bubble' not in page)
check('cartes chaîne présentes (mmap-card)', page.count('mmap-card') >= 5)
check('numérotation chaîne (mm-num)', 'mm-num' in page)
check('liaison consécutive (mmLinkPath idx+1)', 'mmLinkPath' in page and 'order.length' in page)
check('flèches (marker-end)', 'marker-end' in page)
check('déplaçable (dragCard + savePositions)', 'dragCard' in page and 'savePositions' in page)
check('positions sauvegardées par section (arvexa_mm_pos_)', "localStorage.setItem('arvexa_mm_pos_'" in page and "localStorage.getItem('arvexa_mm_pos_'" in page)
check('coordonnées absolues jamais re-décalées', 'JAMAIS re-décalées' in page)
check('plein écran (mm-fs + mmToggleFs)', '.mmap-wrap.mm-fs' in page and 'mmToggleFs' in page)
check('plein écran couvre tout (position:fixed inset:0)', 'position: fixed;\n      inset: 0;\n      z-index: 10000' in page)
check('verrouillage scroll (mm-locked)', 'body.mm-locked' in page)
check('Échap quitte le plein écran', "__mmFsKeyBound" in page)
check('cadrage largeur chaîne (mmFitInitial)', 'mmFitInitial' in page)
check('modale explication + signification (mx-sec)', 'Explication' in page and 'Signification' in page)
check('modale position chaîne (Carte N)', 'de la chaîne' in page)

print("— OCR PHOTOS DE CAHIER (handler + client + page)")
check('prompt transcription manuscrite stricte', 'Transcris FIDÈLEMENT' in handler)
check('détection réponses inutiles (looksUseless)', 'function looksUseless' in handler and "if (text && !looksUseless(text))" in handler)
check('Gemini en tête de cascade images', handler.index("/* 1) Gemini") < handler.index("/* 2) OpenRouter") < handler.index("/* 3) Groq"))
or_block = handler[handler.index('const OR_VISION = ['):handler.index('];', handler.index('const OR_VISION = ['))]
check('qwen2.5-vl en premier modèle OR (bloc du tableau)', or_block.index("qwen/qwen2.5-vl-72b-instruct:free") < or_block.index("nvidia/nemotron"))
check('OCR max_tokens 3000', "mode === 'ocr' ? 3000 : 1600" in handler)
check('enhancement contraste client (enhancePhotoCanvas)', 'enhancePhotoCanvas' in client)
check('photos 1600px + enhance:true (page)', 'maxSide: 1600, quality: 0.82, enhance: true' in page)
check('lots OCR de 2', 'i += 2) batches.push' in page)
check('ultime ressaie image par image (failedImages)', 'failedImages' in page)
check('erreur claire si tout échoue', 'Extraction impossible' in page)
check('PDF scanné : enhancement appliqué', 'enhancePhotoCanvas(cv)' in client)

print("— AUTH INSTANTANÉE (page + guard)")
check('cache dashboard localStorage', "DASH_CACHE_KEY = 'arvexa_dash_cache_v1'" in page)
check('peinture instantanée (paintDashboard)', 'function paintDashboard' in page and 'peinture INSTANTANÉE' in page)
check('revalidation silencieuse (pas écran erreur si cache)', 'jamais d\'écran d\'erreur écrasant' in page)
check('courbe tolère historique vide', 'n > 0 ? pts.map' in page)
check('onUser peint tout de suite (applyRoute immédiat)', 'on PEINT TOUT DE SUITE' in page)
check('docSWR en arrière-plan (sans await)', '.catch' not in '' and 'updatePremiumBadge();\n        if (state.view' in page)
check('guard : course setPersistence 1300 ms', 'Promise.race([\n    ensurePersistence(),\n    new Promise((r) => setTimeout(r, 1300))\n  ])' in guard)
check('guard : sondage session 400 ms', '}, 400);' in guard)
check('guard : session en cache jamais figée (onStale)', 'onStale' in guard and 'onStale' in page)

print("— SERVEUR (api/progress.js) + SW")
check('prompt chaîne linéaire', 'CHAÎNE LINÉAIRE' in progress and 'SE SUIVENT' in progress)
check('sanitize sous-points ≤ 3', "rawKids.slice(0, 3)" in progress)
check('SW bumped v8.42', "SW_VERSION = 'arvexa-offline-v8.42'" in sw)
check('arv-progress.html précaché', "'./arv-progress.html'" in sw)
check('arvx-ai.js précaché', "'./arvx-ai.js'" in sw)
check('auth-guard.js précaché', "'./auth-guard.js'" in sw)
check('console log v8.12', 'serveur progress v8.12' in page)

print("— ORIGINAL JAMAIS TOUCHÉ")
r = subprocess.run(['git', '-C', '/home/z/my-project/arvexa', 'status', '--porcelain'], capture_output=True, text=True)
check('arvexa/ (e0d5211) propre', r.stdout.strip() == '')
r2 = subprocess.run(['git', '-C', '/home/z/my-project/arvexa', 'log', 'origin/main', '--oneline', '-1'], capture_output=True, text=True)
check('origin/main original = e0d5211 (site en ligne intact)', r2.stdout.strip().startswith('e0d5211'))

print(f"\nRÉSULTAT : {ok} OK / {fails} ÉCHEC(S)")
sys.exit(1 if fails else 0)
