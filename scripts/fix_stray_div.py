#!/usr/bin/env python3
"""v8.72a-fix — retire le </div> orphelin après </style> (résidu v8.71a
« squelettes inline ») dans les 6 pages signalées par l'audit."""
import sys

FILES = ['calculatrice.html', 'formulaires.html', 'mathmind.html',
         'outils.html', 'tableau-periodique.html', 'whatsapp.html']

OLD = "</style>\n\n</div>\n<script>\n(function(){"
NEW = "</style>\n\n<script>\n(function(){"

for f in FILES:
    src = open(f, encoding='utf-8').read()
    n = src.count(OLD)
    if n != 1:
        print(f'{f} : motif trouvé {n} fois — ABANDON')
        sys.exit(1)
    open(f, 'w', encoding='utf-8').write(src.replace(OLD, NEW))
    print(f'{f} : </div> orphelin retiré')
