// scripts/seed_products.mjs
// ⚡ v1.1 — Crée / met à jour les packs de crédits dans Firestore (products)
// Usage : node scripts/seed_products.mjs <chemin_service_account.json>
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const path = process.argv[2];
if (!path) {
  console.error('Usage : node scripts/seed_products.mjs <chemin_service_account.json>');
  process.exit(1);
}
const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const PRODUCTS = [
  {
    id: 'pack-flash',
    data: {
      type: 'credits',
      title: 'Boost Flash',
      description: '10 requêtes IA pour un coup de pouce immédiat — 7 jours.',
      credits: 10,
      validityDays: 7,
      price: 200,
      currency: 'XOF',
      status: 'approved',
      order: 0,
      updatedAt: FieldValue.serverTimestamp()
    }
  },
  {
    id: 'pack-starter',
    data: {
      type: 'credits',
      title: 'Pack Starter',
      description: '30 requêtes IA pour le Chat ARV, les examens et le planificateur.',
      credits: 30,
      validityDays: 30,
      price: 500,
      currency: 'XOF',
      status: 'approved',
      order: 1,
      updatedAt: FieldValue.serverTimestamp()
    }
  },
  {
    id: 'pack-examen',
    data: {
      type: 'credits',
      title: 'Pack Examen',
      description: '100 requêtes IA — le best-seller des périodes d\u2019examens.',
      credits: 100,
      validityDays: 90,
      price: 1500,
      currency: 'XOF',
      status: 'approved',
      order: 2,
      updatedAt: FieldValue.serverTimestamp()
    }
  },
  {
    id: 'pack-mega',
    data: {
      type: 'credits',
      title: 'Méga Pack',
      description: '300 requêtes IA — la plus rentable, valable 6 mois.',
      credits: 300,
      validityDays: 180,
      price: 3500,
      currency: 'XOF',
      status: 'approved',
      order: 3,
      updatedAt: FieldValue.serverTimestamp()
    }
  }
];

for (const { id, data } of PRODUCTS) {
  await db.collection('products').doc(id).set(data, { merge: true });
  console.log(`✅ products/${id} — ${data.credits} crédits · ${data.price} XOF · ${data.validityDays} j`);
}

console.log('🏁 Seed terminé.');
