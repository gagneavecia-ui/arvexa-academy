// auth-guard.js — ARVEXA School
// Corrections appliquées :
//  - C1 : redirectTo préserve pathname + search + hash et n'écrase pas redirectAfterLogin
//  - C2 : second niveau d'attente (1500 ms) quand session + userData présents et online
//  - C3 : graceMs par défaut = 600 ms (aligné sur les autres pages protégées)
//  - C4 : listener 'online' relance la résolution si session présente et finish différé
//  - C5 : unsubscribe() systématique dans finish()
//  - C6 : getApps().find('[DEFAULT]') au lieu de getApps()[0]
//  - ✅ v8.61a C7 : STABILISATEUR DE SESSION — les déconnexions « légères »
//    pendant l'utilisation sont corrigées : un null passager émis par Firebase
//    (raté de rafraîchissement de token, micro-coupure réseau) ne déconnecte
//    PLUS l'élève. On observe 20 s ; la session revient dans la quasi-totalité
//    des cas (événement 'arvexa-session-restored' prévient la page) ; sinon on
//    recharge la page, qui repart proprement — jamais d'éjection brutale.
// ================================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDHscOXw3rLuhV6z1Cny-bdYCumqpnG7QE",
  authDomain: "arvexa-fbf10.firebaseapp.com",
  projectId: "arvexa-fbf10",
  storageBucket: "arvexa-fbf10.firebasestorage.app",
  messagingSenderId: "920108330053",
  appId: "1:920108330053:web:f532d71cbc2c824bc7472c"
};

// ✅ C6 — récupérer l'app par défaut, pas "la première app trouvée"
const defaultApp = getApps().find((a) => a.name === '[DEFAULT]');
const app = defaultApp || initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);

let persistenceReady = null;

async function ensurePersistence() {
  if (persistenceReady) return persistenceReady;
  persistenceReady = setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.warn("[AuthGuard] setPersistence:", e.code || e.message);
  });
  return persistenceReady;
}

export async function requireAuth({
  onUser,
  onNoUser,
  onStale,          // ✅ v8.42 — session en cache mais auth lente : PAS de redirection, on peint le cache
  redirectTo = null,
  graceMs = 600,   // ✅ C3 — aligné sur les autres pages protégées
  extraGraceMs = 1500  // ✅ C2 — second niveau quand session + userData
} = {}) {
  // ✅ v8.42 — ANTI-BLOCAGE (demande propriétaire : « l'authentification de
  // chargement est très lente, des fois il faut appuyer sur actualisation ») :
  // setPersistence peut rester suspendu sur certains appareils (IndexedDB
  // saturé, WebView exotique) → course avec 1300 ms : l'écoute de session
  // démarre QUOI QU'IL ARRIVE.
  await Promise.race([
    ensurePersistence(),
    new Promise((r) => setTimeout(r, 1300))
  ]);

  let resolved = false;
  let graceTimer = null;
  let extraGraceTimer = null;
  let maxTimer = null;
  let pollTimer = null;
  let repollTimer = null;
  let unsubscribeFn = null;
  let onlineHandler = null;

  const cleanup = () => {
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
    if (extraGraceTimer) { clearTimeout(extraGraceTimer); extraGraceTimer = null; }
    if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (repollTimer) { clearInterval(repollTimer); repollTimer = null; }
    if (onlineHandler) {
      window.removeEventListener('online', onlineHandler);
      onlineHandler = null;
    }
    // ✅ v8.61a C7 — l'écoute Firebase est maintenant CONSERVÉE après la
    // résolution : c'est elle qui alimente le stabilisateur de session
    // (déconnexions légères). Le désabonnement complet reste disponible
    // via le unsubscribe() renvoyé à la page.
  };

  // ✅ v8.61a C7 — STABILISATEUR DE SESSION (déconnexions légères).
  // N'entre en action qu'APRÈS la résolution initiale : si Firebase émet
  // un null passager alors que l'élève utilisait la page, on ne fait
  // RIEN de brutal — on sonde auth.currentUser chaque seconde pendant
  // 20 s. Dans l'immense majorité des cas la session se réinstalle
  // toute seule (token rafraîchi) → événement 'arvexa-session-restored'
  // et l'élève continue sans rien voir. Si vraiment rien ne revient
  // (et que le réseau est présent), on recharge la page : requireAuth
  // repartira proprement (session restaurée ou renvoi à la connexion).
  let lastKnownUid = null;
  let looseTimer = null;
  const stabilizeLooseSession = () => {
    if (looseTimer) return;
    let tries = 0;
    looseTimer = setInterval(() => {
      tries++;
      if (auth.currentUser) {
        clearInterval(looseTimer); looseTimer = null;
        try {
          window.dispatchEvent(new CustomEvent('arvexa-session-restored',
            { detail: { uid: auth.currentUser.uid } }));
        } catch (e) {}
        return;
      }
      if (tries >= 20) {
        clearInterval(looseTimer); looseTimer = null;
        if (navigator.onLine) {
          try { window.location.reload(); } catch (e) {}
        }
        return;
      }
    }, 1000);
    if (looseTimer && typeof looseTimer.unref === 'function') looseTimer.unref();
  };

  const finish = (user) => {
    if (resolved) return;
    resolved = true;
    if (user) lastKnownUid = user.uid;
    cleanup();  // ✅ C5 — unsubscribe systématique

    if (user) {
      console.log("[AuthGuard] Session restaurée");
      if (typeof onUser === "function") onUser(user);
    } else {
      console.log("[AuthGuard] Aucune session");
      if (typeof onNoUser === "function") {
        onNoUser();
      } else if (redirectTo) {
        // ✅ C1 — préserver l'URL complète et ne pas écraser un redirect existant
        try {
          const existing = sessionStorage.getItem("redirectAfterLogin")
                        || sessionStorage.getItem("redirectAfterAuth");
          if (!existing) {
            sessionStorage.setItem(
              "redirectAfterLogin",
              window.location.pathname + window.location.search + window.location.hash
            );
          }
        } catch (e) {}
        window.location.replace(redirectTo);
      }
    }
  };

  unsubscribeFn = onAuthStateChanged(auth, (user) => {
    // ✅ v8.61a C7 — après résolution : surveillance des déconnexions
    // légères. Un null passager lance la stabilisation (20 s max) ; un
    // retour utilisateur l'arrête et prévient la page.
    if (resolved) {
      if (user) {
        if (looseTimer) { clearInterval(looseTimer); looseTimer = null; }
        if (user.uid !== lastKnownUid) {
          lastKnownUid = user.uid;
          try {
            window.dispatchEvent(new CustomEvent('arvexa-session-restored',
              { detail: { uid: user.uid, changed: true } }));
          } catch (e) {}
        }
      } else if (lastKnownUid) {
        stabilizeLooseSession();
      }
      return;
    }

    if (user) {
      finish(user);
      return;
    }

    // Premier tick null → grâce initiale
    if (graceTimer) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      if (resolved) return;
      if (auth.currentUser) { finish(auth.currentUser); return; }

      const hasSession = localStorage.getItem("arvexa_session");
      const hasUserData = localStorage.getItem("arvexa_user_data");

      // ✅ C2 — second niveau : si session + userData présents et online, on attend davantage
      // avant de considérer l'utilisateur comme déconnecté.
      if (hasSession && hasUserData) {
        if (!navigator.onLine) {
          // Hors-ligne : on attend le retour réseau — le cahier est peint
          // depuis le cache en attendant (v8.42), plus jamais d'écran figé.
          if (!onlineHandler) {
            onlineHandler = () => {
              if (resolved) return;
              if (auth.currentUser) {
                finish(auth.currentUser);
              } else {
                // Réseau revenu mais toujours pas d'utilisateur : on laisse
                // Firebase émettre un nouvel événement, ou on finit après extraGrace.
                if (extraGraceTimer) return;
                extraGraceTimer = setTimeout(() => {
                  extraGraceTimer = null;
                  if (resolved) return;
                  if (auth.currentUser) finish(auth.currentUser);
                  else finish(null);
                }, extraGraceMs);
              }
            };
            window.addEventListener('online', onlineHandler);
          }
          return;
        }

        // Online mais session présente → petite attente supplémentaire
        if (extraGraceTimer) return;
        extraGraceTimer = setTimeout(() => {
          extraGraceTimer = null;
          if (resolved) return;
          if (auth.currentUser) { finish(auth.currentUser); return; }
          finish(null);
        }, extraGraceMs);
        return;
      }

      // Pas de session du tout → déconnecté
      finish(null);
    }, graceMs);

    // ✅ v8.42 — SONDAGE RAPIDE : si la session est déjà restaurée localement
    // mais que l'événement onAuthStateChanged traîne (réseau lent), on la
    // prend telle quelle toutes les 400 ms — instantané, zéro attente.
    pollTimer = setInterval(() => {
      if (resolved) { clearInterval(pollTimer); pollTimer = null; return; }
      if (auth.currentUser) { clearInterval(pollTimer); pollTimer = null; finish(auth.currentUser); }
    }, 400);
    if (pollTimer && typeof pollTimer.unref === 'function') pollTimer.unref();
  });

  maxTimer = setTimeout(() => {
    if (resolved) return;
    if (auth.currentUser) { finish(auth.currentUser); return; }

    // ✅ v8.42 — session + données en cache : JAMAIS de redirection sèche ni
    // d'écran figé. On débloque les rendus (onStale → la page affiche son
    // contenu en cache) et on continue d'essayer en tâche de fond : le
    // réseau peut revenir à tout moment et la session s'installera.
    const hasSession = localStorage.getItem("arvexa_session");
    const hasUserData = localStorage.getItem("arvexa_user_data");
    if (hasSession && hasUserData) {
      if (typeof onStale === "function") { try { onStale(); } catch (e) {} }
      repollTimer = setInterval(() => {
        if (resolved) { clearInterval(repollTimer); repollTimer = null; return; }
        if (auth.currentUser) {
          clearInterval(repollTimer); repollTimer = null;
          finish(auth.currentUser);
        }
      }, 1500);
      if (repollTimer && typeof repollTimer.unref === 'function') repollTimer.unref();
      setTimeout(() => { if (repollTimer) { clearInterval(repollTimer); repollTimer = null; } }, 60000);
      return;
    }
    finish(null);
  }, 5000);

  return { auth, app, unsubscribe: () => { if (unsubscribeFn) { try { unsubscribeFn(); } catch (e) {} unsubscribeFn = null; } cleanup(); } };
}

export { auth, app };
