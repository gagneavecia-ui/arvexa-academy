#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cible la section histoire NOUVELLE (v8.48a) et son état exact + relance."""
import json, time, urllib.request, urllib.error

BASE = "https://arvexa-academy.vercel.app"
WEB_KEY = "AIzaSyDHscOXw3rLuhV6z1Cny-bdYCumqpnG7QE"
EMAIL = "eleve.zu9a09a5@arvexa-probe.test"
PASSWORD = "Probe!2026xzu9a09a5"

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
new = next((s for s in sections if "traités de paix après" in str(s.get("title", ""))), None)
print("section cible:", new.get("id"), "|", new.get("title"), "| questionsCount:", new.get("questionsCount"))

sid = new["id"]
code, s = post({"action": "getSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
a = (s.get("section") or {}).get("analysis") or {}
expl = a.get("explanation") or {}
print("— understanding:", len(str(expl.get("understanding") or "")), "car | parts:", len(expl.get("parts") or []), "| keyFacts:", len(expl.get("keyFacts") or []))
print("— structure:", "oui" if a.get("structure") else "NON", "| questions:", len(a.get("questions") or []))
print("— contient 'signature' ?", "signature" in json.dumps(a, ensure_ascii=False))
print("— fallback ?", a.get("fallback"))

if not (expl.get("understanding") and len(expl.get("parts") or []) > 0 and a.get("structure") and len(a.get("questions") or []) >= 4):
    print("→ INCOMPLÈTE — relance completeSection et affiche TOUT")
    t0 = time.time()
    code3, comp = post({"action": "completeSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
    print(f"completeSection status={code3} elapsed={time.time()-t0:.1f}s | success={comp.get('success')} complete={comp.get('complete')} missing={comp.get('missing')}")
    if comp.get("error"): print("error:", comp.get("error"))
    a2 = (comp.get("section") or {}).get("analysis") or {}
    e2 = a2.get("explanation") or {}
    print("après → parts:", len(e2.get("parts") or []), "| structure:", "oui" if a2.get("structure") else "NON", "| questions:", len(a2.get("questions") or []))
