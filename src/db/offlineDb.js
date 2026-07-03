// ============================================================
//  pos-client/src/db/offlineDb.js
//  IndexedDB (via Dexie) queue for sales made while offline.
//  Each entry holds the exact payload that would have gone to
//  POST /pos/sales, replayed once the connection returns.
// ============================================================
import Dexie from 'dexie';

export const offlineDb = new Dexie('finsuite_pos_offline');

offlineDb.version(1).stores({
  // offlineId is the app-generated key pos_sales.offline_id matches
  // against — lets the server dedupe if a sync retry double-fires.
  queuedSales: 'offlineId, queuedAt, synced',
});

export async function queueOfflineSale(payload) {
  const offlineId = crypto.randomUUID();
  await offlineDb.queuedSales.add({
    offlineId,
    payload: { ...payload, isOfflineSale: true, offlineId },
    queuedAt: new Date().toISOString(),
    synced: 0,
  });
  return offlineId;
}

export async function getUnsyncedSales() {
  return offlineDb.queuedSales.where('synced').equals(0).toArray();
}

export async function markSynced(offlineId) {
  await offlineDb.queuedSales.update(offlineId, { synced: 1 });
}

export async function removeQueuedSale(offlineId) {
  await offlineDb.queuedSales.delete(offlineId);
}

export async function unsyncedCount() {
  return offlineDb.queuedSales.where('synced').equals(0).count();
}
