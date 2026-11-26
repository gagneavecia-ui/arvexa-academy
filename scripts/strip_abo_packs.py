#!/usr/bin/env python3
"""v8.72a — retire le bloc JS « packs de requêtes » de abonnement.html
(packs déplacés vers marketplace.html à la demande du propriétaire)."""
import re, sys

PATH = 'abonnement.html'
src = open(PATH, encoding='utf-8').read()
lines = src.split('\n')

# 1. Bornes du gros bloc : du commentaire d'en-tête v8.57a jusqu'à la
#    fermeture de manualWhatsApp (fonction désormais inutilisée ici).
start = end = None
for i, l in enumerate(lines):
    if start is None and 'RECHARGES DE REQUÊTES (packs de crédits IA)' in l:
        start = i - 1  # ligne // ===== au-dessus
    if 'function manualWhatsApp(label, price) {' in l:
        # chercher la fermeture : première ligne exactement '}' après
        for j in range(i + 1, len(lines)):
            if lines[j].strip() == '}' and lines[j].startswith('}'):
                end = j
                break
        break
if start is None or end is None:
    sys.exit('bornes introuvables')
print(f'Bloc packs : lignes {start+1} à {end+1}')
del lines[start:end + 1]

# 2. Call sites restants
out = []
removed = 0
for l in lines:
    s = l.strip()
    if s.startswith('renderCreditsBalance(') or s == 'loadCreditsPacks();':
        removed += 1
        continue
    out.append(l)
print(f'Call sites retirés : {removed}')
open(PATH, 'w', encoding='utf-8').write('\n'.join(out))
