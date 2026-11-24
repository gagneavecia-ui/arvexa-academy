// api/_telegram.mjs
// ═══════════════════════════════════════════════════════════════════
// ⚡ v8.60a — NOTIFICATIONS TELEGRAM PARTAGÉES (module interne)
// Utilisé par : api/telegram.js (avis + candidatures ambassadeur)
//               api/_activation.mjs (alertes de paiement)
//
// 🔒 Le token et l'identifiant de chat vivent UNIQUEMENT dans les
//    variables d'environnement Vercel (TELEGRAM_BOT_TOKEN /
//    TELEGRAM_CHAT_ID). Aucune clé n'apparaît dans le code client.
//    Le fichier commence par « _ » : il ne compte PAS comme fonction
//    serverless (limite Hobby = 12 fonctions).
// ═══════════════════════════════════════════════════════════════════

export function telegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function escapeMarkdown(text) {
  return String(text || '').replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('Telegram non configuré sur le serveur.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  return fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    }),
    signal: controller.signal
  }).then(async (response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.description || `Telegram HTTP ${response.status}`);
    }
    return data;
  }).finally(() => clearTimeout(timeout));
}

/**
 * Alerte « best-effort » : ne JAMAIS faire échouer un paiement ou une
 * candidature parce que Telegram est indisponible — on log et on continue.
 */
export async function notifyTelegramBestEffort(text) {
  try {
    await sendTelegramMessage(text);
    return true;
  } catch (error) {
    console.warn('📢 Notification Telegram indisponible (non bloquant) :', error.message);
    return false;
  }
}
