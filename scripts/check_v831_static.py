#!/usr/bin/env python3
"""check_v831_static.py — vérifications statiques de la v8.31 (inscription 5 étapes).
Extrait le module inline de register.html, vérifie la syntaxe JS (node --check),
l'équilibre HTML et la cohérence des IDs entre HTML et JS."""
import re
import subprocess
import sys
from pathlib import Path

REPO = Path('/home/z/my-project/arvexa')
REG = REPO / 'register.html'
html = REG.read_text(encoding='utf-8')
errors = []
oks = []

# 1. Équilibre HTML de register.html
def balance(name, text):
    for tag in ['div', 'section', 'form', 'label', 'span', 'button', 'select', 'main', 'header', 'footer']:
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

# 4. Invariants fonctionnels v8.31
html_only = html.split('<script type="module">')[0]  # sans le JS inline
checks = [
    ('5 panneaux d\'étapes', html.count('class="step-panel') == 5),
    ('5 points de progression', len(re.findall(r'class="step-dot', html)) == 5),
    ('4 cartes de classe', html_only.count('name="classId"') == 4),
    ('3 chips de série', html_only.count('name="series"') == 3),
    ('sélecteur pays présent', 'id="countrySelect"' in html),
    ('chip indicatif présent', 'id="dialChip"' in html),
    ('54 pays AFRIQUE', 'AFRIQUE.length === 54' in html),
    ('détection préfixe intelligent', 'detectCountryFromDigits' in html),
    ('compte créé à l\'étape 5 seulement', 'UNIQUEMENT à l\'étape 5' in html),
    ('classId dynamique (fini hardcode)', "classId: classIdValue" in html),
    ('exam dynamique bepc/bac', "exam: examValue" in html),
    ('series si terminale', 'profileData.series = seriesValue' in html),
    ('whatsapp dans le profil', 'whatsapp: whatsappValue' in html),
    ('redirection onboarding directe', "window.location.replace('onboarding.html')" in html),
    ('plus de redirection whatsapp.html', "window.location.replace('whatsapp.html')" not in html),
    ('plus de hardcode terminale_d', "classId: 'terminale_d'" not in html),
    ('tracking étapes', 'inscription_etape_' in html),
    ('brouillon sans mot de passe', 'password' not in re.search(r'const DRAFT_KEYS = \[(.*?)\]', html, re.S).group(1)),
]
for label, ok in checks:
    (oks if ok else errors).append(('OK  ' if ok else 'FAIL') + ' ' + label)

print('\n'.join(oks))
if errors:
    print('\n=== ERREURS ===')
    print('\n'.join(errors))
    sys.exit(1)
print(f'\nTOUT OK ({len(oks)} vérifications)')
