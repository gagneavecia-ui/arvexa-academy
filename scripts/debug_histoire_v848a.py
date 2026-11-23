#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Debug histoire — pourquoi l'analyse n'est pas complète après completeSection."""
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

def post(url, payload, timeout=75):
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    req2 = urllib.request.Request(url, method="POST", headers=headers, data=json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req2, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

code, ch = post(BASE + "/api/progress", {"action": "listChapters", "subject": "histoire"})
chap = next((c for c in ch.get("chapters", []) if c.get("id")), None)
print("chapitre:", chap.get("id"), "-", chap.get("title"))

code, g = post(BASE + "/api/progress", {"action": "getChapter", "subject": "histoire", "chapterId": chap["id"]})
sections = g.get("chapter", {}).get("sections") or g.get("sections") or []
print("sections:", json.dumps(sections, ensure_ascii=False)[:300])
sec = sections[0] if sections else None
if sec:
    sid = sec.get("id") or sec.get("sectionId")
    code, s = post(BASE + "/api/progress", {"action": "getSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
    a = (s.get("section") or {}).get("analysis") or {}
    expl = a.get("explanation") or {}
    print("— explanation:", "oui" if expl.get("understanding") else "non", "| parts:", len(expl.get("parts") or []), "| keyFacts:", len(expl.get("keyFacts") or []))
    print("— structure:", "oui" if a.get("structure") else "NON", json.dumps(a.get("structure"), ensure_ascii=False)[:200] if a.get("structure") else "")
    print("— questions:", len(a.get("questions") or []))
    print("— signature présente ?", "signature" in json.dumps(a))
    if not (expl.get("understanding") and len(expl.get("parts") or []) > 0 and a.get("structure") and len(a.get("questions") or []) >= 4):
        print("→ relance completeSection…")
        t0 = time.time()
        code3, comp = post(BASE + "/api/progress", {"action": "completeSection", "subject": "histoire", "chapterId": chap["id"], "sectionId": sid})
        print(f"completeSection status={code3} elapsed={time.time()-t0:.1f}s")
        print("success:", comp.get("success"), "| complete:", comp.get("complete"), "| missing:", comp.get("missing"))
        if comp.get("error"): print("error:", comp.get("error"))
        a2 = (comp.get("section") or {}).get("analysis") or {}
        print("après complétion → structure:", "oui" if a2.get("structure") else "NON", "| questions:", len(a2.get("questions") or []))
