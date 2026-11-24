// ================================================================
// API CONTACT — ARVEXA School (✅ v8.54a)
// Numéro WhatsApp d'un camarade pour la page « À proximité ».
// Demande du propriétaire : « lorsque l'utilisateur voit quelqu'un qui
// est près de lui il peut appuyer sur sa carte, voir son numéro, puis
// l'appeler ou lui écrire pour des exos et des révisions ».
//
// Sécurité :
//  - Auth Firebase OBLIGATOIRE (Bearer idToken vérifié par firebase-admin).
//  - RÉCIPROCITÉ (même règle que la page) : le demandeur doit LUI-MÊME
//    partager sa position (doc positions/{caller} frais < 24 h) — on ne
//    découvre un numéro qu'en étant soi-même visible sur la carte.
//  - Le camarade doit partager sa position (doc positions/{uid} frais).
//  - Champs renvoyés MINIMAUX : nom + numéro WhatsApp (E.164) — jamais
//    d'email, jamais d'adresse. users/{uid} est fermé au client par les
//    règles Firestore : seul ce endpoint expose le numéro, avec réciprocité.
//  - Rate limit : 20 requêtes/min/IP.
// ================================================================

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestLog = new Map();

const STALE_MS = 24 * 60 * 60 * 1000; // positions > 24 h = périmées

let adminServices;

function getAdminServices() {
  if (adminServices) return adminServices;
  const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credentials) throw new Error('firebase_admin_not_configured');
  const admin = require('firebase-admin');
  const serviceAccount = JSON.parse(credentials);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  adminServices = {
    auth: admin.auth(),
    db: admin.firestore()
  };
  return adminServices;
}

function clientIp(request) {
  return String(
    request.headers['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown'
  ).split(',')[0].trim();
}

function rateLimited(ip) {
  const key = `${ip}|contact`;
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 5000) {
    for (const [k, v] of requestLog) {
      if (v.every((t) => now - t >= WINDOW_MS)) requestLog.delete(k);
    }
  }
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function jsonError(response, status, error, code) {
  return response.status(status).json({
    success: false,
    error,
    ...(code ? { code } : {})
  });
}

async function verifyFirebaseToken(request) {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    return await getAdminServices().auth.verifyIdToken(match[1]);
  } catch (_) {
    return null;
  }
}

function isFresh(ts) {
  return ts && typeof ts.toMillis === 'function' && (Date.now() - ts.toMillis()) < STALE_MS;
}

module.exports = async function handler(request, response) {
  const CORS = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k, v]) => response.setHeader(k, v));
    return response.status(204).end();
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return jsonError(response, 405, 'Méthode non autorisée.');
  }
  if (rateLimited(clientIp(request))) {
    return jsonError(response, 429, 'Beaucoup d\u2019\u00e9l\u00e8ves en ce moment. R\u00e9essaie dans une minute.');
  }

  let caller;
  try {
    caller = await verifyFirebaseToken(request);
  } catch (error) {
    return jsonError(response, 503, 'Service temporairement indisponible.');
  }
  if (!caller) {
    return jsonError(response, 401, 'Connexion requise.', 'AUTH_REQUIRED');
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const targetUid = String(body.uid || '').trim();
  if (!targetUid || targetUid.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(targetUid)) {
    return jsonError(response, 400, 'Identifiant de camarade invalide.');
  }
  if (targetUid === caller.uid) {
    return jsonError(response, 400, 'C\u2019est toi :)' );
  }

  try {
    const { db } = getAdminServices();

    /* RÉCIPROCITÉ : je partage ma position moi-même, fraîche */
    const myPosSnap = await db.collection('positions').doc(caller.uid).get();
    if (!myPosSnap.exists || !isFresh(myPosSnap.data().updatedAt)) {
      return jsonError(response, 403,
        'Active ton partage de localisation pour voir le contact d\u2019un camarade.',
        'RECIPROCITY_REQUIRED');
    }

    /* Le camarade partage aussi sa position (fraîche) */
    const posSnap = await db.collection('positions').doc(targetUid).get();
    if (!posSnap.exists || !isFresh(posSnap.data().updatedAt)) {
      return jsonError(response, 404, 'Ce camarade ne partage plus sa position.',
        'NOT_SHARING');
    }

    /* Profil : nom + numéro WhatsApp */
    const userSnap = await db.collection('users').doc(targetUid).get();
    if (!userSnap.exists) {
      return jsonError(response, 404, 'Camarade introuvable.');
    }
    const u = userSnap.data() || {};
    const whatsapp = String(u.whatsapp || '').trim();
    if (!whatsapp) {
      return response.status(200).json({
        success: true,
        hasNumber: false,
        name: String(u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || posSnap.data().name || 'Camarade').slice(0, 60)
      });
    }

    return response.status(200).json({
      success: true,
      hasNumber: true,
      name: String(u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || posSnap.data().name || 'Camarade').slice(0, 60),
      whatsapp
    });
  } catch (error) {
    console.error('contact error:', error.message);
    return jsonError(response, 500, 'Erreur inattendue.');
  }
};

module.exports.config = { maxDuration: 20 };
