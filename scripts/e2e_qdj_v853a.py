#!/usr/bin/env python3
"""e2e_qdj_v853a.py — E2E réel : connexion sonde → /api/arv (prompt QDJ) → JSON quiz."""
import json, urllib.request, sys

API_KEY = "AIzaSyDHscOXw3rLuhV6z1Cny-bdYCumqpnG7QE"
EMAIL = "eleve.zu9a09a5@arvexa-probe.test"
PASSWORD = "Probe!2026xzu9a09a5"
BASE = "https://arvexa-academy.vercel.app"

def post(url, payload, token=None):
    data = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "e2e-v853a"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())

# 1) Connexion
auth = post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
            {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True})
tok = auth["idToken"]
print("PASS — connexion sonde (uid %s)" % auth.get("localId", "?")[:8])

# 2) Cours du Résumé (même appel que quotidien.html)
try:
    dash = post(BASE + "/api/progress", {"action": "getDashboard"}, tok)
    subs = [s for s in (dash.get("subjects") or []) if (s.get("sectionsCount") or 0) > 0]
    print(f"PASS — getDashboard : {len(subs)} matière(s) active(s) → prompt ancré dans les cours")
except Exception as e:
    print("WARN — getDashboard indisponible (%s) : le prompt passe en générique" % e)

# 3) Appel IA QDJ (même prompt que la page)
msg = ("Tu génères la « Question du jour » d'ARVEXA School.\n\n"
       "NIVEAU DE L'ÉLÈVE : Terminale D.\n"
       "COURS SUIVIS PAR CET ÉLÈVE (cahier Résumé) :\n"
       "1. Mathématiques — 2 sections\n\n"
       "CONSIGNE : crée EXACTEMENT 4 questions de quiz INÉDITES pour AUJOURD'HUI, ancrées EN PRIORITÉ "
       "dans les cours suivis par cet élève (sinon, programme officiel de son niveau). Questions courtes, "
       "QCM à 4 choix avec exactement UNE bonne réponse, explication en 1-2 phrases.\n\n"
       "RÉPONSE : UNIQUEMENT un tableau JSON STRICT, sans texte avant/après, sans balises markdown :\n"
       '[{"matiere":"…","chapitre":"…","question":"…","options":["…","…","…","…"],"bonne":0,"explication":"…"}]')
r = post(BASE + "/api/arv", {"message": msg}, tok)
reply = r.get("reply", "")
print(f"INFO — IA répondue ({len(reply)} car.), fallback={r.get('fallback')}")

# 4) Même parsing que la page
def extract_json(txt):
    import re
    t = txt.strip()
    t = re.sub(r"```(?:json)?", "", t)
    s, e = t.find("["), t.rfind("]")
    if s == -1 or e <= s:
        raise ValueError("pas de JSON")
    chunk = t[s:e + 1]
    # ✅ v8.53a — passe atomique : paires JSON valides gardées, \X invalide doublé
    chunk = re.sub(r'\\(["\\/bfnrtu])|\\([\s\S])',
                   lambda m: ('\\' + m.group(1)) if m.group(1) else ('\\\\' + m.group(2)),
                   chunk)
    return json.loads(chunk)

qs = extract_json(reply)
good = [q for q in qs if isinstance(q, dict) and q.get("question") and isinstance(q.get("options"), list) and len(q["options"]) >= 2]
print(f"{'PASS' if len(good) >= 2 else 'FAIL'} — quiz IA parsé : {len(good)} question(s) valide(s) / {len(qs)}")
for q in good[:2]:
    print("   • [%s] %s → %d options (bonne #%s)" % (q.get("matiere", "?"), q["question"][:60], len(q["options"]), q.get("bonne")))
sys.exit(0 if len(good) >= 2 else 1)
