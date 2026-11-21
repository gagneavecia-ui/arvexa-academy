#!/usr/bin/env python3
"""check_v831_static.py — vérifications statiques du wizard d'inscription
(v8.31 : 5 étapes ; v8.32 : session d'examen + modales 100 % custom).
Extrait le module inline de register.html, vérifie la syntaxe JS
(node --check), l'équilibre HTML, la cohérence des IDs HTML↔JS, les
invariants fonctionnels et les garde-fous des fichiers en cascade
(firestore.rules, api/arv.js, onboarding.html, arvexa-i18n.js)."""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path('/home/z/my-project/arvexa-academy')  # v8.33 : la copie academy (l'original arvexa. reste intouché)
REG = REPO / 'register.html'
html = REG.read_text(encoding='utf-8')
errors = []
oks = []

# 1. Équilibre HTML de register.html
def balance(name, text):
    for tag in ['div', 'section', 'form', 'label', 'span', 'button', 'main', 'header', 'footer', 'ul', 'li', 'h2']:
        opens = len(re.findall(rf'<{tag}[\s>]', text))
        closes = len(re.findall(rf'</{tag}>', text))
        if opens != closes:
            errors.append(f'{name}: <{tag}> déséquilibré ({opens} ouvrants / {closes} fermants)')
    oks.append(f'{name}: équilibre HTML OK')

balance('register.html', html)

# 2. Extraction du module inline → node --check
mods = re.findall(r'<script type="module">(.*?)</script>', html, re.S)
if not mods:
    errors.append('register.html: aucun module inline trouvé')
else:
    mjs = Path('/tmp/reg_module.mjs')
    mjs.write_text(mods[-1], encoding='utf-8')
    r = subprocess.run(['node', '--check', str(mjs)], capture_output=True, text=True)
    if r.returncode == 0:
        oks.append('register.html: node --check module inline OK')
    else:
        errors.append('register.html: ERREUR SYNTAXE JS\n' + r.stderr[:1500])

# 3. IDs référencés dans le JS → présents dans le HTML
ids_js = set(re.findall(r"\$\('([A-Za-z0-9_-]+)'\)", mods[-1])) if mods else set()
missing = [i for i in sorted(ids_js) if f'id="{i}"' not in html]
if missing:
    errors.append('register.html: IDs manquants dans le HTML: ' + ', '.join(missing))
else:
    oks.append(f'register.html: {len(ids_js)} IDs référencés tous présents')

# 4. Invariants fonctionnels v8.31 + v8.32
html_only = html.split('<script type="module">')[0]  # sans le JS inline
m_draft = re.search(r'const DRAFT_KEYS = \[(.*?)\]', html, re.S)
draft_no_password = bool(m_draft) and 'password' not in m_draft.group(1)
checks = [
    ('5 panneaux d\'étapes', html.count('class="step-panel') == 5),
    ('5 points de progression', len(re.findall(r'class="step-dot', html)) == 5),
    ('4 cartes de classe', html_only.count('name="classId"') == 4),
    ('3 chips de série', html_only.count('name="series"') == 3),
    ('sélecteur pays CUSTOM présent', 'id="countryPickerBtn"' in html),
    ('AUCUN select natif (style navigateur banni)', '<select' not in html),
    ('chip indicatif présent', 'id="dialChip"' in html),
    ('54 pays AFRIQUE', 'AFRIQUE.length === 54' in html),
    ('détection préfixe intelligent', 'detectCountryFromDigits' in html),
    ('modale uniforme présente', 'id="pickerOverlay"' in html),
    ('modale réutilisable (openPicker)', 'function openPicker(' in html),
    ('bloc session présent (étape 3)', 'id="sessionPickerBtn"' in html),
    ('session cachée par défaut', 'id="sessionBlock" hidden' in html),
    ('session ouverte si examen (3ᵉ/Tle)', 'sessionBlock.hidden = !info.exam' in html),
    ('session remise à zéro pour 2ᵉ/1ʳᵉ', 'state.values.examYear = null;' in html),
    ('sessions dynamiques depuis la date', 'function sessionOptions()' in html),
    ('temps restant (mois)', 'function monthsUntil(' in html and 'function monthsLabel(' in html),
    ('session obligatoire 3ᵉ/Tle', "Choisis ta session d'examen pour continuer." in html),
    ('examYear dans le brouillon', 'draft.examYear = state.values.examYear' in html),
    ('compte créé à l\'étape 5 seulement', 'UNIQUEMENT à l\'étape 5' in html),
    ('classId dynamique (fini hardcode)', "classId: classIdValue" in html),
    ('exam dynamique bepc/bac', "exam: examValue" in html),
    ('examYear dans le profil', 'profileData.examYear = examYearValue' in html),
    ('examYear notif admin', 'examYear: examYearValue || null' in html),
    ('series si terminale', 'profileData.series = seriesValue' in html),
    ('whatsapp dans le profil', 'whatsapp: whatsappValue' in html),
    ('redirection onboarding directe', "window.location.replace('onboarding.html')" in html),
    ('plus de redirection whatsapp.html', "window.location.replace('whatsapp.html')" not in html),
    ('plus de hardcode terminale_d', "classId: 'terminale_d'" not in html),
    ('tracking étapes', 'inscription_etape_' in html),
    ('tracking session', 'inscription_session_' in html),
    ('tracking pays', 'inscription_pays_' in html),
    ('brouillon sans mot de passe', draft_no_password),
]
for label, ok in checks:
    (oks if ok else errors).append(('OK  ' if ok else 'FAIL') + ' ' + label)

# 5. Cascade — fichiers liés
def check_file(path, patterns, name):
    try:
        txt = path.read_text(encoding='utf-8')
    except FileNotFoundError:
        errors.append(f'{name}: fichier introuvable')
        return
    for pat, label in patterns:
        (oks if re.search(pat, txt) else errors).append(
            ('OK  ' if re.search(pat, txt) else 'FAIL') + f' {name}: {label}')

check_file(REPO / 'firestore.rules', [
    (r"examYear is number", 'examYear borné (number)'),
    (r"examYear >= 2026", 'borne min 2026'),
    (r"examYear <= 2050", 'borne max 2050'),
], 'firestore.rules')
check_file(REPO / 'api' / 'arv.js', [
    (r"Number\.isInteger\(u\.examYear\)", 'contexte examYear'),
    (r"Session : \$\{p\.examYear\}", 'prompt session + temps restant'),
], 'api/arv.js')
check_file(REPO / 'onboarding.html', [
    (r"data\.examYear \|\| getBacYear\(\)", 'objectif = session choisie en priorité'),
], 'onboarding.html')
check_file(REPO / 'arvexa-i18n.js', [
    (r'"Temps restant avant l\'examen"', 'clé FR label session'),
    (r'"Quand passes-tu ton examen \?"', 'clé FR titre modale'),
    (r'"BAC en vue"', 'clé FR BAC en vue'),
], 'arvexa-i18n.js')

# 6. node --check des JS liés
for js in ['service-worker.js', 'arvexa-i18n.js', 'arvexa-classes.js', 'api/arv.js', 'analytics.js']:
    r = subprocess.run(['node', '--check', str(REPO / js)], capture_output=True, text=True)
    if r.returncode == 0:
        oks.append(f'OK   {js}: node --check')
    else:
        errors.append(f'FAIL {js}: ERREUR SYNTAXE\n' + r.stderr[:500])

# 7. Version SW v8.32
sw = (REPO / 'service-worker.js').read_text(encoding='utf-8')
(oks if "arvexa-offline-v8.32" in sw else errors).append(
    'OK  ' if "arvexa-offline-v8.32" in sw else 'FAIL service-worker.js: version v8.32')

# 8. Équilibre HTML onboarding/profil
for name in ['onboarding.html', 'profil.html']:
    txt = (REPO / name).read_text(encoding='utf-8')
    bal_ok = True
    for tag in ['div', 'section', 'form', 'label', 'span', 'button', 'main', 'header', 'footer']:
        if len(re.findall(rf'<{tag}[\s>]', txt)) != len(re.findall(rf'</{tag}>', txt)):
            bal_ok = False
            errors.append(f'{name}: <{tag}> déséquilibré')
    if bal_ok:
        oks.append(f'{name}: équilibre HTML OK')

print('\n'.join(oks))
if errors:
    print('\n=== ERREURS ===')
    print('\n'.join(errors))
    sys.exit(1)
print(f'\nTOUT OK ({len(oks)} vérifications)')
