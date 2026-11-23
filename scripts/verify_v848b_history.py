#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vérification finale v8.48b — complétion SENSIBLE AU PROFIL sur les sections
histoire EXISTANTES (créées sous v8.47e/v8.48a, aujourd'hui incomplètes) :
l'explication narrative (keyFacts, sans parts) doit compter COMPLÈTE."""
import json, urllib.request, urllib.error

BASE = "https://arvexa-academy.vercel.app"
WEB_KEY = "AIzaSyBEbYuuUlNCLMBUHClv4UnyownNHw2q3_g"
EMAIL = "eleve.zu9a09a5@arvexa-probe.test"
PASSWORD = "Probe!2026xzu9a09a5"

results = []
def check(name, ok, detail=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

req = urllib.request.Request(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={WEB_KEY}",
    method="POST", headers={"Content-Type": "application/json"},
    data=json.dumps({"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}).encode())
with urllib.request.urlopen(req, timeout=30) as r:
    token = json.loads(r.read().decode())["idToken"]

def post(payload, timeout=75):
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    req2 = urllib.request.Request(BASE + "/api/progress", method="POST", headers=headers, data=json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req2, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

code, ch = post({"action": "listChapters", "subject": "histoire"})
chap = next((c for c in ch.get("chapters", []) if c.get("id")), None)
code, g = post({"action": "getChapter", "subject": "histoire", "chapterId": chap["id"]})
sections = g.get("chapter", {}).get("sections") or g.get("sections") or []

for sec in sections:
    sid = sec.get("id") or sec.get("sectionId")
    code, s = post({"action": "getSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
    sc = s.get("section") or {}
    a = sc.get("analysis") or {}
    expl = a.get("explation") if False else (a.get("explanation") or {})
    avant = {"parts": len(expl.get("parts") or []), "keyFacts": len(expl.get("keyFacts") or []),
             "structure": bool(a.get("structure")), "questions": len(a.get("questions") or [])}
    code3, comp = post({"action": "completeSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
    ok = code3 == 200 and comp.get("success") and comp.get("alreadyComplete") is True
    check(f"histoire « {str(sc.get('title'))[:45]} » déjà complète (profil-aware)", ok,
          f"avant={json.dumps(avant)} alreadyComplete={comp.get('alreadyComplete')} complete={comp.get('complete')} missing={comp.get('missing')}")
    # signature jamais stockée
    code4, s4 = post({"action": "getSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
    a4 = (s4.get("section") or {}).get("analysis") or {}
    def find_sig(obj, depth=0):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "signature": return True
                if find_sig(v, depth + 1): return True
        elif isinstance(obj, list):
            return any(find_sig(v, depth + 1) for v in obj)
        return False
    check(f"histoire « {str(sc.get('title'))[:45]} » : aucun champ signature stocké", not find_sig(a4))

print()
n_ok = sum(1 for _, ok in results if ok)
print(f"BILAN : {n_ok}/{len(results)} PASS")
import sys
sys.exit(0 if n_ok == len(results) else 1)
