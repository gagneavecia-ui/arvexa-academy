/* ═══════════════════════════════════════════════════════════════════
   ARVEXA-CACHE.JS — ✅ v8.61a MODE 100 % EN LIGNE
   ─────────────────────────────────────────────────────────────────
   Demande du propriétaire : « on enlève le mode hors ligne… le site
   sera 100 % en ligne ». La lecture cache-first (IndexedDB) est
   SUPPRIMÉE : chaque lecture part sur le serveur Firestore. Les mêmes
   données ne peuvent plus être resservies d'un appareil à un autre
   compte — chaque compte ne voit que ses données fraîches.
   L'API (readCacheDoc / docSWR) est conservée à l'identique pour que
   les pages qui l'importent continuent de fonctionner sans modification.
   ═══════════════════════════════════════════════════════════════════ */
import { getDoc } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

/* Lecture SERVEUR (aucun cache local). null si absent/erreur. */
export async function readCacheDoc(ref) {
  try {
    const snap = await getDoc(ref, { source: 'server' });
    return snap && snap.exists() ? snap : null;
  } catch (e) {
    return null;
  }
}

/* Lecture serveur unique : onData(fresh) dès que Firestore répond.
   compareFn est conservée pour compatibilité d'appel (plus de couche
   cache à comparer). */
export function docSWR(ref, onData, compareFn) {
  return (async () => {
    try {
      const fresh = await getDoc(ref, { source: 'server' });
      if (fresh.exists()) onData(fresh);
    } catch (e) { /* réseau indisponible : rien à afficher côté cache */ }
  })();
}
