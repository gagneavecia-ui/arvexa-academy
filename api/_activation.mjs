// api/_activation.mjs
// ═══════════════════════════════════════════════════════════════════
// ⚡ v8.59a — ACTIVATION PARTAGÉE DES PAIEMENTS SASPAY
// Utilisé par : api/saspay-webhook.mjs (canal webhook signé)
//               api/verifier-paiement.mjs (canal vérification serveur)
//
// 🔒 SÉCURITÉ : n'est JAMAIS appelée sans qu'un enregistrement serveur
// (saspayPendingCheckouts/{reference}) existe, créé par api/creer-checkout
// avec le montant calculé côté serveur. Le montant payé est toujours
// vérifié (>= montant attendu) avant toute activation.
// ═══════════════════════════════════════════════════════════════════

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { notifyTelegramBestEffort, escapeMarkdown } from './_telegram.mjs';

// ⚡ COMMISSION PARRAINAGE : 10 % du montant payé crédité à l'ambassadeur
const REFERRAL_COMMISSION_RATE = 0.10;

/**
 * Active un paiement confirmé :
 *  - kind 'credits'     → crédite aiCredits (transaction) + purchases/{ref}
 *  - kind 'subscription' → active premium + purchases/{ref} + clôt la
 *                          demande manuelle éventuelle
 *  - commission ambassadeur 10 % (non bloquante)
 *
 * @param db        Firestore admin
 * @param pendingRef DocumentReference de saspayPendingCheckouts/{reference}
 * @param pending   Données du checkout enregistré (uid, kind, plan, credits…)
 * @param paidAmount Montant réellement payé (vérifié >= pending.amount)
 * @param meta      { transactionId } — id SasPay éventuel
 * @returns { activated: true, kind } | { activated: false, reason }
 */
export async function activateCheckout(db, pendingRef, pending, paidAmount, meta = {}) {
  const userRef = db.collection('users').doc(pending.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    console.error('🚫 Utilisateur introuvable pour le checkout :', pending.uid, pendingRef.id);
    return { activated: false, reason: 'user_not_found' };
  }

  const now = new Date();

  if (pending.kind === 'credits') {
    // ═══ PACK DE CRÉDITS : créditer + purchase ═══
    const creditsAmount = Math.max(1, Math.floor(Number(pending.credits) || 0));
    const validityDays = Math.max(1, Math.floor(Number(pending.validityDays) || 30));
    const { addCredits } = await import('./_credits.js');
    const creditResult = await addCredits(db, pending.uid, { credits: creditsAmount, validityDays });

    await userRef.collection('purchases').doc(pendingRef.id).set({
      kind: 'credits',
      productId: pending.productId || null,
      title: pending.productTitle || null,
      credits: creditsAmount,
      validityDays,
      amount: paidAmount,
      status: 'granted',
      grantedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(creditResult.expiryMs)
    });
    await pendingRef.update({
      status: 'processed',
      processedAt: FieldValue.serverTimestamp(),
      paidAmount,
      processedVia: meta.processedVia || 'webhook'
    });
    console.log('✅ Crédits ajoutés pour', pending.uid, `(+${creditsAmount}, solde ${creditResult.credits}, ${paidAmount} XOF)`);
  } else {
    // ═══ ABONNEMENT (flux historique) + purchase ═══
    const endDate = new Date(now);
    if (pending.plan === 'annual') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const batch = db.batch();
    batch.update(userRef, {
      subscriptionStatus: 'active',
      premium: true,
      isUnlocked: true,
      subscriptionPlan: pending.plan,
      subscriptionStartDate: Timestamp.fromDate(now),
      subscriptionEndDate: Timestamp.fromDate(endDate),
      saspayTransactionId: meta.transactionId || null,
      saspayReference: pendingRef.id,
      saspayAmountPaid: paidAmount,
      subscriptionPaidAt: FieldValue.serverTimestamp(),
      // ✅ v8.55a — clôt la demande manuelle éventuelle : l'écran
      // « en attente » d'abonnement.html ne doit plus s'afficher.
      manualPaymentRequest: {
        status: 'processed',
        processedVia: 'saspay_webhook',
        processedAt: now.toISOString(),
        reference: pendingRef.id
      }
    });
    batch.update(pendingRef, {
      status: 'processed',
      processedAt: FieldValue.serverTimestamp(),
      paidAmount,
      processedVia: meta.processedVia || 'webhook'
    });
    // ⚡ historique « Ma bibliothèque » (Marketplace)
    batch.set(userRef.collection('purchases').doc(pendingRef.id), {
      kind: 'subscription',
      plan: pending.plan || null,
      amount: paidAmount,
      status: 'granted',
      grantedAt: FieldValue.serverTimestamp(),
      endsAt: Timestamp.fromDate(endDate)
    });
    await batch.commit();

    console.log('✅ Abonnement activé pour', pending.uid, `(${pending.plan}, ${paidAmount} XOF)`);
  }

  // ⚡ CONVERSION PARRAINAGE : créditer la commission de l'ambassadeur
  try {
    const freshSnap = await userRef.get();
    const referredBy = freshSnap.data()?.referredBy;
    if (referredBy && typeof referredBy === 'string') {
      const ambSnap = await db.collection('ambassadors')
        .where('code', '==', referredBy).limit(1).get();
      if (!ambSnap.empty) {
        const ambDoc = ambSnap.docs[0];
        const commission = Math.round(paidAmount * REFERRAL_COMMISSION_RATE);
        const batchRef = db.batch();
        const referralRef = db.collection('referrals').doc(pending.uid);
        const referralSnap = await referralRef.get();
        if (referralSnap.exists) {
          batchRef.update(referralRef, {
            status: 'converted',
            convertedAt: FieldValue.serverTimestamp(),
            amountPaid: paidAmount
          });
        }
        batchRef.update(ambDoc.ref, {
          'stats.converted': FieldValue.increment(1),
          earnings: FieldValue.increment(commission),
          totalEarned: FieldValue.increment(commission),
          updatedAt: FieldValue.serverTimestamp()
        });
        await batchRef.commit();
        console.log('👑 Conversion parrainage :', pending.uid, '→', referredBy, `(+${commission} F)`);
      }
    }
  } catch (refError) {
    console.warn('👑 Parrainage (non bloquant) :', refError.message);
  }

  // ⚡ v8.60a — AVIS PROPRIÉTAIRE : alerte Telegram instantanée à chaque
  // paiement confirmé (canal webhook OU vérification serveur). Strictement
  // non bloquant : une panne Telegram n'affecte jamais l'activation.
  try {
    const u = userSnap.data() || {};
    const nom = escapeMarkdown(u.fullName || u.firstName || 'Élève ARVEXA');
    const email = u.email ? escapeMarkdown(u.email) : '';
    const detail = pending.kind === 'credits'
      ? `Pack de crédits \(+${Math.max(1, Math.floor(Number(pending.credits) || 0))} requêtes\)`
      : `Abonnement ${pending.plan === 'annual' ? 'annuel' : 'mensuel'}`;
    const texte = [
      '💰 *NOUVEAU PAIEMENT ARVEXA*',
      '',
      `📦 *Article :* ${detail}`,
      `💵 *Montant :* ${Math.round(paidAmount).toLocaleString('fr\-FR')} FCFA`,
      `🧾 *Référence :* \`${pendingRef.id}\``,
      `👤 *Utilisateur :* ${nom}${email ? ` \(${email}\)` : ''}`,
      `📡 *Canal :* ${escapeMarkdown(meta.processedVia || 'webhook')}`
    ].join('\n');
    await notifyTelegramBestEffort(texte);
  } catch (tgError) {
    console.warn('📢 Alerte paiement (non bloquant) :', tgError.message);
  }

  return { activated: true, kind: pending.kind };
}
