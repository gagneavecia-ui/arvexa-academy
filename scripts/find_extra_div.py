#!/usr/bin/env python3
"""Localise le </div> surnuméraire (hors <script>) page par page."""
import re, sys

PAGES = ['calculatrice.html', 'formulaires.html', 'mathmind.html', 'outils.html',
         'tableau-periodique.html', 'whatsapp.html']

for f in PAGES:
    src = open(f, encoding='utf-8').read()
    src = re.sub(r'<script[^>]*>[\s\S]*?</script>', '<script></script>', src)
    src = re.sub(r'<!--[\s\S]*?-->', '', src)  # retirer les commentaires
    lines = src.split('\n')
    depth = 0
    neg = []
    for i, l in enumerate(lines, 1):
        opens = len(re.findall(r'<div(\s|>)', l))
        closes = len(re.findall(r'</div>', l))
        depth += opens - closes
        if depth < 0:
            neg.append((i, l.strip()[:110]))
            depth = 0  # continuer pour trouver d'autres anomalies
    print(f'{f} : profondeur finale = {depth}' + (f'  → fermé en trop aux lignes {neg}' if neg else ''))
