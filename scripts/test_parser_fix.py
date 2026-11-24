#!/usr/bin/env python3
"""Test standalone du parseur durci (échappements invalides du modèle)."""
import re, json

def extract_json(txt):
    t = txt.strip()
    t = re.sub(r"```(?:json)?", "", t)
    s, e = t.find("["), t.rfind("]")
    if s == -1 or e <= s:
        raise ValueError("pas de JSON")
    chunk = t[s:e + 1]
    chunk = re.sub(r'\\(["\\/bfnrtu])|\\([\s\S])',
                   lambda m: ('\\' + m.group(1)) if m.group(1) else ('\\\\' + m.group(2)),
                   chunk)
    return json.loads(chunk)

bad1 = "[{\"question\":\"Qu\\'est-ce ?\",\"options\":[\"l\\'inconnue\",\"b\",\"c\",\"d\"],\"bonne\":0}]"
print("apostrophe \\' :", len(extract_json(bad1)))
bad2 = '[{"question":"Regex \\d+ match ?","options":["a","b","c","d"],"bonne":0}]'
print("backslash-d    :", len(extract_json(bad2)))
good = '[{"question":"A\\nB","options":["a","b"],"bonne":0}]'
print("\\n valide gardé :", len(extract_json(good)))
backsl = '[{"question":"Chemin C:\\\\Users","options":["a","b"],"bonne":0}]'
print("\\\\ valide gardé :", len(extract_json(backsl)))
print("OK — parseur durci au vert")
