#!/usr/bin/env python3
"""verify_v853a_live.py — vérification de la mise en ligne v8.53a."""
import urllib.request, time, sys

BASE = "https://arvexa-academy.vercel.app/"
UA = {"User-Agent": "Mozilla/5.0 (verify-v853a)"}

def get(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")

def wait_sw(timeout_s=420):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            sw = get("service-worker.js")
            if "arvexa-offline-v8.53a" in sw:
                return True, sw, round(time.time() - t0)
        except Exception:
            pass
        time.sleep(15)
    return False, "", round(time.time() - t0)

ok, sw, waited = wait_sw()
print(f"{'PASS' if ok else 'FAIL'} — SW v8.53a en ligne (attente {waited}s)")
if not ok:
    sys.exit(1)

checks = [
    ("index.html", 'id="parcoursTitle"', "titre parcours adaptatif"),
    ("index.html", 'id="psStatStreak"', "stats en dur (série)"),
    ("index.html", 'id="psLacune"', "chip lacune"),
    ("index.html", '.parcours-card::before', "liseré premium"),
    ("quotidien.html", "/api/arv", "QDJ connectée aux IA"),
    ("quotidien.html", "chargerBanque", "repli banque statique"),
    ("quotidien.html", "arvexa-quotidien-ia-v1", "cache IA du jour"),
    ("quotidien.html", "goalTarget", "partage adaptatif"),
    ("quotidien.html", "firebasejs/12.12.1/firebase-app.js", "importmap Firebase"),
    ("progression.html", "function pgSig", "garde une-seule-actualisation (Progression)"),
    ("progression.html", "{ animate: __animate }", "animation unique (Progression)"),
    ("arv-progress.html", "function dashSig", "garde une-seule-actualisation (Résumé)"),
    ("arv-progress.html", "conditions de ton examen", "dé-BAC (Résumé CTA)"),
    ("exam.html", "conditions de ton examen", "dé-BAC (Test moi)"),
    ("exam.html", "Niveau Examen", "dé-BAC (option examen)"),
    ("auth-choice.html", "Prépare tes examens, construis ton avenir", "dé-BAC (auth)"),
    ("outils.html", "conditions réelles de ton examen", "dé-BAC (outils)"),
    ("arv.html", "ton programme, ton niveau ou tes examens", "dé-BAC (Chat IA)"),
    ("abonnement.html", "préparer tes examens en toute confiance", "dé-BAC (abonnement)"),
    ("register.html", "de la 6ᵉ jusqu'à la licence", "dé-BAC (inscription)"),
    ("onboarding.html", "ton parcours vers la réussite.", "dé-BAC (onboarding)"),
    ("arvexa-classes.js", "goalTarget", "helper adaptatif"),
    ("parcours.js", "'🧭 Ton parcours vers ' + target", "carte adaptative"),
]

passed = 0
for path, needle, label in checks:
    try:
        body = get(path)
        p = needle in body
    except Exception as e:
        p, body = False, str(e)
    print(f"{'PASS' if p else 'FAIL'} — {label} ({path})")
    passed += p

print(f"\nRÉSULTAT : {passed}/{len(checks)} PASS")
sys.exit(0 if passed == len(checks) else 1)
