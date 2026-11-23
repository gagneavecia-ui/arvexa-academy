#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vérification LIVE v8.48a — fin de génération garantie + signature.
Scénarios (demande propriétaire : « la génération ne termine jamais, il y a des
coupures… à la fin tu mets une signature qui prouve que l'IA a terminé la
section complète » + « rigueur au niveau des matières ») :
  0. site en ligne + SW v8.48a + client (badge, mini-signature, swallow, z-index)
  1. auth sonde → idToken
  2. PHYSIQUE (cinématique) : createSection → analyse COMPLÈTE en < 60 s
     (explication + parties + structure + questions) — sinon completeSection
     jusqu'à complétude (bouton « Terminer la section »)
  3. PHYSIQUE : generateSectionExtras → QCM + carte mentale (complets)
  4. HISTOIRE : createSection → rigueur (aucune formule LaTeX dans le résumé,
     dates/acteurs présents)
  5. completeSection sur section déjà complète → alreadyComplete
"""
import json, time, urllib.request, urllib.error, sys

BASE = "https://arvexa-academy.vercel.app"
WEB_KEY = "AIzaSyDHscOXw3rLuhV6z1Cny-bdYCumqpnG7QE"
EMAIL = "eleve.zu9a09a5@arvexa-probe.test"
PASSWORD = "Probe!2026xzu9a09a5"

results = []
def check(name, ok, detail=""):
    results.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def post(url, payload, token=None, timeout=75):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, method="POST", headers=headers, data=json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode() or "{}")
        except Exception: return e.code, {}

def get(url, timeout=30):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""

# ── 0. Site & client ──
code, body = get(BASE + "/service-worker.js")
check("0.1 site en ligne + SW v8.48b", code == 200 and b"arvexa-offline-v8.48b" in body, f"status={code}")

code, body = get(BASE + "/arv-progress.html")
html = body.decode("utf-8", "replace")
check("0.2 badge signature doré servi", "signé ARVEXA IA" in html and "Résumé complet" in html)
check("0.3 mini-signature QCM/carte servie", html.count("mini-signature") >= 2)
check("0.4 appui simple (swallow click fantôme)", "openModal.__swallow" in html)
check("0.5 z-index modale 11000 (au-dessus du plein écran)", "z-index: 11000" in html)
check("0.6 bouton Terminer branché", "callApi('completeSection'" in html)

# ── 1. Auth ──
req = urllib.request.Request(
    f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={WEB_KEY}",
    method="POST", headers={"Content-Type": "application/json"},
    data=json.dumps({"email": EMAIL, "password": PASSWORD, "returnSecureToken": True}).encode())
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        auth = json.loads(r.read().decode())
    token = auth["idToken"]
    check("1.1 connexion sonde OK", True)
except Exception as e:
    check("1.1 connexion sonde OK", False, str(e)[:120]); sys.exit(1)

def api(action, payload):
    return post(BASE + "/api/progress", {"action": action, **payload}, token)

def analyse_ok(a, profile=None):
    expl = a.get("explanation") or {}
    parts = expl.get("parts") or []
    facts = expl.get("keyFacts") or []
    und = str(expl.get("understanding") or "")
    # ✅ histoire-géo = narratif par conception : pas de « parts » exigées
    expl_ok = len(und.strip()) > 20 and "pas pu être générée" not in und and "indisponible" not in und
    if profile == "history":
        expl_ok = expl_ok and len(facts) >= 3
    else:
        expl_ok = expl_ok and len(parts) > 0
    return (expl_ok
            and isinstance(a.get("structure"), dict) and len(a["structure"]) > 0
            and len(a.get("questions") or []) >= 4)

# ── 2. PHYSIQUE (cinématique) — création + complétude ──
CINE = ("La cinématique du point matériel. La vitesse moyenne se calcule en divisant la distance parcourue "
        "par la durée du trajet : v_moy = d / Δt, avec d en mètres (m) et Δt en secondes (s). "
        "La vitesse instantanée est la vitesse à un instant précis, mesurée par le compteur d'une voiture. "
        "L'accélération moyenne mesure la variation de la vitesse par unité de temps : a_moy = (v - v0) / Δt. "
        "Pour un mouvement rectiligne uniformément accéléré (MRUA), la vitesse varie selon v = v0 + a·t et la "
        "position selon x = x0 + v0·t + 0,5·a·t². La chute libre est un MRUA où a = g ≈ 9,81 m/s², dirigé vers "
        "le bas. Exemple : une voiture démarre avec a = 2 m/s² ; après 5 s, v = 10 m/s et elle a parcouru 25 m.")

code, ch = api("listChapters", {"subject": "physique"})
chap_id = None
if code == 200 and ch.get("success"):
    for c in (ch.get("chapters") or []):
        if "cinématique" in str(c.get("title", "")).lower() or "cinematique" in str(c.get("title", "")).lower():
            chap_id = c.get("id"); break
if not chap_id and code == 200 and ch.get("success"):
    code2, nc = api("createChapter", {"subject": "physique", "title": "Cinématique (sonde v8.48a)"})
    if code2 == 200 and nc.get("success"): chap_id = nc.get("chapter", {}).get("id")
check("2.1 chapitre cinématique prêt", Boolean := bool(chap_id), f"id={chap_id}")

sec_id = None; elapsed = None
if chap_id:
    t0 = time.time()
    code, sec = api("createSection", {"subject": "physique", "chapterId": chap_id, "rawInput": CINE})
    elapsed = time.time() - t0
    check("2.2 createSection 200 en < 60 s", code == 200 and sec.get("success") and elapsed < 60,
          f"status={code} elapsed={elapsed:.1f}s")
    if code == 200 and sec.get("success"):
        sec_id = sec["sectionId"]; s = sec["section"]; a = s.get("analysis") or {}
        meta = sec.get("meta") or {}
        check("2.3 analyse complète dès la 1re passe", analyse_ok(a, "scientific"),
              f"parts={len((a.get('explanation') or {}).get('parts') or [])} questions={len(a.get('questions') or [])} structure={'oui' if a.get('structure') else 'non'} elapsedMs={meta.get('elapsedMs')}")
        print(f"   meta.providers={json.dumps(meta.get('providers', {}))}")
        if meta.get("failures"): print(f"   meta.failures={json.dumps(meta.get('failures'))[:400]}")
        if not analyse_ok(a, "scientific"):
            code3, comp = api("completeSection", {"subject": "physique", "chapterId": chap_id, "sectionId": sec_id})
            a = ((comp.get("section") or {}).get("analysis") or {})
            check("2.4 « Terminer la section » complète l'analyse", code3 == 200 and comp.get("success") and analyse_ok(a, "scientific"),
                  f"status={code3} complete={comp.get('complete')} missing={comp.get('missing')}")

# ── 3. PHYSIQUE — extras QCM + carte mentale ──
if sec_id and chap_id:
    t0 = time.time()
    code, ex = api("generateSectionExtras", {"subject": "physique", "chapterId": chap_id, "sectionId": sec_id, "parts": ["qcm", "mindmap"]})
    el = time.time() - t0
    ok_ex = code == 200 and ex.get("success")
    qcm = ex.get("qcm") or []; mm = ex.get("mindmap") or {}
    check("3.1 extras générés en < 60 s", ok_ex and el < 60, f"status={code} elapsed={el:.1f}s")
    check("3.2 QCM complet (3-6 questions)", ok_ex and 3 <= len(qcm) <= 6, f"n={len(qcm)}")
    check("3.3 carte mentale complète (idée + 2-6 branches + enfants)", ok_ex and mm.get("idea") and len(mm.get("steps") or []) >= 2,
          f"branches={len(mm.get('steps') or [])}")
    if mm.get("steps"):
        avec_enfants = sum(1 for st in mm["steps"] if len(st.get("children") or []) > 0)
        check("3.4 branches reliées à des enfants (hiérarchie)", avec_enfants >= 1, f"{avec_enfants}/{len(mm['steps'])}")
        check("3.5 explication + signification sur la carte mère", bool(mm.get("detail")) and bool(mm.get("signif")))

# ── 4. HISTOIRE — rigueur : aucune formule, dates/acteurs présents ──
code, hch = api("listChapters", {"subject": "histoire"})
hchap = None
if code == 200 and hch.get("success"):
    for c in (hch.get("chapters") or []):
        hchap = c.get("id"); break
HIST = ("Les traités de paix après la Première Guerre mondiale. Le traité de Versailles est signé le 28 juin 1919 "
        "entre les vainqueurs et l'Allemagne, jugée seule responsable de la guerre (article 231). L'Allemagne perd "
        "l'Alsace-Lorraine au profit de la France, ses colonies et doit payer des réparations énormes. Le traité "
        "de Saint-Germain (1919) démantèle l'Autriche-Hongrie ; le traité de Neuilly (1919) sanctionne la Bulgarie ; "
        "le traité de Trianon (1920) réduit la Hongrie ; le traité de Sèvres (1920) puis de Lausanne (1923) "
        "redessinent l'Empire ottoman. La Société des Nations (SDN), créée en 1920 à Genève, doit garantir la paix "
        "mais reste faible : les États-Unis refusent d'y entrer et le Sénat américain rejette le traité de Versailles en 1920.")

if hchap:
    t0 = time.time()
    code, hsec = api("createSection", {"subject": "histoire", "chapterId": hchap, "rawInput": HIST})
    el = time.time() - t0
    if code == 200 and hsec.get("success"):
        hsec_id = hsec["sectionId"]; ha = hsec.get("section", {}).get("analysis") or {}
        if not analyse_ok(ha):
            code3, comp = api("completeSection", {"subject": "histoire", "chapterId": hchap, "sectionId": hsec_id})
            ha = ((comp.get("section") or {}).get("analysis") or {})
        expl = ha.get("explanation") or {}
        full_text = json.dumps(ha, ensure_ascii=False).lower()
        formulas = ("\\frac" in full_text) or ("\\cdot" in full_text) or ("\\sqrt" in full_text)
        check("4.1 histoire : création + complétude", analyse_ok(ha, "history"), f"status={code} elapsed={el:.1f}s")
        check("4.2 histoire : RIGUEUR — aucune formule mathématique", not formulas)
        check("4.3 histoire : points clés présents", len(expl.get("keyFacts") or []) >= 3, f"keyFacts={len(expl.get('keyFacts') or [])}")
        dates_ok = ("1919" in full_text) and ("versailles" in full_text)
        check("4.4 histoire : dates/faits du cours conservés", dates_ok)
    else:
        check("4.1 histoire : création", False, f"status={code} {json.dumps(hsec)[:200]}")
else:
    check("4.1 histoire : chapitre existant", False, "aucun chapitre histoire")

# ── 5. completeSection sur section déjà complète → alreadyComplete ──
if sec_id and chap_id:
    code, comp = api("completeSection", {"subject": "physique", "chapterId": chap_id, "sectionId": sec_id})
    check("5.1 completeSection idempotent (alreadyComplete)", code == 200 and comp.get("success") and comp.get("alreadyComplete") is True,
          f"status={code} alreadyComplete={comp.get('alreadyComplete')}")

print()
n_ok = sum(1 for _, ok in results if ok)
print(f"BILAN : {n_ok}/{len(results)} PASS")
sys.exit(0 if n_ok == len(results) else 1)
