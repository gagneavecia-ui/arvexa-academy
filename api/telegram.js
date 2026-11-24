// api/telegram.js
// ═══════════════════════════════════════════════════════════════════
// ⚡ v8.60a — DEUX TYPES DE NOTIFICATIONS VERS LE PROPRIÉTAIRE :
//   1. kind « avis » (défaut, rétrocompatible)      → avis / suggestions
//   2. kind « ambassadeur »                          → dépôt de candidature
// Le token et le chat vivent dans les variables d'environnement Vercel.
// ═══════════════════════════════════════════════════════════════════

const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 120;
const ALLOWED_CATEGORIES = new Set(['general', 'bug', 'suggestion', 'contenu', 'autre']);
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

const requestLog = new Map();

function getClientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  return (forwarded ? forwarded.split(',')[0] : request.socket?.remoteAddress || 'unknown').trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function escapeMarkdown(text) {
  return String(text || '').replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendTelegramMessage(text) {
  const { sendTelegramMessage: send } = await import('./_telegram.mjs');
  return send(text);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const origin = request.headers.origin;
  const allowedOrigin = process.env.APP_ORIGIN;
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return response.status(403).json({ error: 'Origine non autorisée.' });
  }

  if (isRateLimited(getClientIp(request))) {
    return response.status(429).json({ error: 'Service momentanément saturé. Réessaie dans quelques secondes.' });
  }

  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const kind = String(body.kind || 'avis').trim();

  // ═══ CANDIDATURE AMBASSADEUR ═══
  if (kind === 'ambassadeur') {
    const userName = String(body.userName || '').trim().slice(0, MAX_NAME_LENGTH);
    const userEmail = String(body.userEmail || '').trim();
    const phone = String(body.phone || '').trim().slice(0, 20);
    const country = String(body.country || '').trim().slice(0, 40);
    const establishment = String(body.establishment || '').trim().slice(0, 80);
    const promoName = String(body.promoName || '').trim().slice(0, 80);
    const promoSize = parseInt(body.promoSize, 10);
    const inviteCount = parseInt(body.inviteCount, 10);
    const motivation = String(body.motivation || '').trim().slice(0, 500);

    if (!userEmail || userEmail.length > 254 || !/^\S+@\S+\.\S+$/.test(userEmail)) {
      return response.status(400).json({ error: 'Adresse e-mail invalide.' });
    }
    if (!phone) {
      return response.status(400).json({ error: 'Téléphone invalide.' });
    }

    const text = [
      '👑 *NOUVELLE CANDIDATURE AMBASSADEUR*',
      '',
      `👤 *Candidat :* ${escapeMarkdown(userName || 'Élève ARVEXA')}`,
      `📧 *Email :* ${escapeMarkdown(userEmail)}`,
      `📱 *Téléphone :* ${escapeMarkdown(phone)}`,
      country ? `🌍 *Pays :* ${escapeMarkdown(country)}` : '',
      establishment ? `🏫 *Établissement :* ${escapeMarkdown(establishment)}` : '',
      promoName ? `🎓 *Promo :* ${escapeMarkdown(promoName)}` : '',
      Number.isInteger(promoSize) ? `👥 *Élèves dans sa promo :* ${promoSize}` : '',
      Number.isInteger(inviteCount) ? `📣 *Peut inviter :* ${inviteCount} élèves` : '',
      motivation ? `\n💬 *Motivation :*\n${escapeMarkdown(motivation)}` : ''
    ].filter(Boolean).join('\n');

    try {
      await sendTelegramMessage(text);
      return response.status(200).json({ ok: true });
    } catch (error) {
      console.error('Telegram notification failed:', error.message);
      return response.status(502).json({ error: 'Candidature enregistrée, mais notification Telegram indisponible.' });
    }
  }

  // ═══ AVIS (flux historique) ═══
  const userName = String(body.userName || '').trim();
  const userEmail = String(body.userEmail || '').trim();
  const message = String(body.message || '').trim();
  const category = String(body.category || '').trim();
  const rating = Number(body.rating);

  if (!userName || userName.length > MAX_NAME_LENGTH) {
    return response.status(400).json({ error: 'Nom utilisateur invalide.' });
  }
  if (userEmail.length > 254 || (userEmail && !/^\S+@\S+\.\S+$/.test(userEmail))) {
    return response.status(400).json({ error: 'Adresse e-mail invalide.' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return response.status(400).json({ error: 'Note invalide.' });
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return response.status(400).json({ error: 'Catégorie invalide.' });
  }
  if (message.length < 10 || message.length > MAX_MESSAGE_LENGTH) {
    return response.status(400).json({ error: 'Message invalide.' });
  }

  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const text = [
    '🎯 *NOUVEL AVIS ARVEXA*',
    '',
    `👤 *Utilisateur :* ${escapeMarkdown(userName)}`,
    userEmail ? `📧 *Email :* ${escapeMarkdown(userEmail)}` : '',
    `${stars} *Note :* ${rating}/5`,
    `🏷️ *Catégorie :* ${escapeMarkdown(category)}`,
    '',
    '*Message :*',
    escapeMarkdown(message)
  ].filter(Boolean).join('\n');

  try {
    await sendTelegramMessage(text);
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
    return response.status(502).json({ error: 'Avis enregistré, mais notification Telegram indisponible.' });
  }
};
