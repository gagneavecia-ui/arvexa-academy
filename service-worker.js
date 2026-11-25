// ================================================================
// SERVICE WORKER — ARVEXA School
// ✅ v8.61a — MODE 100 % EN LIGNE (demande du propriétaire) :
//   « on va enlever le mode hors ligne pour éviter de mettre des pages
//    en cache… le site sera 100 % en ligne ».
// ─────────────────────────────────────────────────────────────────
// Ce service worker est NEUTRE et VOLONTAIREMENT sans interception :
//   1. INSTALL  → skipWaiting immédiat (remplace toute ancienne version
//      qui précachait des pages — cause des données d'un autre compte
//      affichées après un changement de compte).
//   2. ACTIVATE → SUPPRESSION DE TOUS LES CACHES (Cache Storage) de
//      l'origine, puis clients.claim() pour prendre le contrôle tout
//      de suite, sans attendre un rechargement.
//   3. FETCH    → AUCUNE interception : chaque requête part sur le réseau
//      (fraîcheur garantie, zéro page périmée, zéro fuite entre comptes).
// Le fichier DOIT rester à cette URL : c'est lui qui évince, chez chaque
// appareil déjà installé, l'ancien SW qui mettait les pages en cache.
// ================================================================

let SW_VERSION = 'arvexa-online-v8.71a';

self.addEventListener('install', (event) => {
  // Aucun précache : rien à mettre en cache, jamais.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (e) { /* purge best-effort */ }
    try { await self.clients.claim(); } catch (e) {}
    try {
      const all = await self.clients.matchAll({ includeUncontrolled: true });
      all.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION }));
    } catch (e) {}
  })());
});

// ─── PASS-THROUGH TOTAL ───
// Pas de gestionnaire fetch : le navigateur va toujours sur le réseau.
// (Aucun écouteur 'fetch' n'est volontairement posé — toute réponse
// interceptée, même en network-first, peut servir une réponse stockée.)
self.addEventListener('message', (event) => {
  try {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') self.skipWaiting();
    if (data.type === 'GET_VERSION') {
      if (event.source && event.source.postMessage) {
        event.source.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
      }
    }
  } catch (e) {}
});
