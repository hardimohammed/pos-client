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

// Excludes entries already flagged failed — those stopped being
// retried automatically (see markFailed below) and need a human to
// look at them, not another silent replay attempt every time the
// connection blips back on.
export async function getUnsyncedSales() {
  const all = await offlineDb.queuedSales.where('synced').equals(0).toArray();
  return all.filter(e => !e.failed);
}

export async function markSynced(offlineId) {
  await offlineDb.queuedSales.update(offlineId, { synced: 1 });
}

export async function removeQueuedSale(offlineId) {
  await offlineDb.queuedSales.delete(offlineId);
}

export async function unsyncedCount() {
  const all = await offlineDb.queuedSales.where('synced').equals(0).toArray();
  return all.filter(e => !e.failed).length;
}

// A sale the server explicitly rejected (most commonly: real stock
// ran out from under it, e.g. another terminal sold the last units
// while this one was offline) is a genuine business problem, not a
// transient network hiccup — retrying it automatically would just
// fail again forever while looking identical to "still waiting for
// connectivity" in the UI. Flag it separately so it stops being
// retried and surfaces for a human to actually look at.
export async function markFailed(offlineId, errorMessage) {
  await offlineDb.queuedSales.update(offlineId, {
    failed: 1, lastError: errorMessage, failedAt: new Date().toISOString(),
  });
}

export async function getFailedSales() {
  const all = await offlineDb.queuedSales.where('synced').equals(0).toArray();
  return all.filter(e => e.failed);
}

export async function failedCount() {
  const all = await offlineDb.queuedSales.where('synced').equals(0).toArray();
  return all.filter(e => e.failed).length;
}

// Lets a manager retry a specific failed sale by hand (e.g. after
// restocking) without it being swept up in the next automatic sync.
export async function clearFailedFlag(offlineId) {
  await offlineDb.queuedSales.update(offlineId, { failed: 0, lastError: null, failedAt: null });
}
