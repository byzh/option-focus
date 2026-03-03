import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getLocalTodayString } from './dateUtils';

const APP_ID = 'option-focus-v2';
const CACHE_RETENTION_DAYS = 10;

function cacheDocRef(db, collectionName, dateKey, docKey) {
  return doc(db, 'artifacts', APP_ID, 'options-monitor', collectionName, dateKey, docKey);
}

function metaRef(db, collectionName) {
  return doc(db, 'artifacts', APP_ID, 'options-monitor', collectionName, '_meta', 'dates');
}

/**
 * Get data from Firestore cache or fetch fresh.
 * Cache is valid for the current day (same dateKey = hit).
 *
 * @param {function} [isValid] - Optional fn(data) => bool. If provided:
 *   - existing cache that fails validation is deleted before refetching
 *   - fresh data that fails validation is returned but NOT cached
 */
export async function getCachedOrFetch(db, collectionName, dateKey, docKey, fetchFn, forceRefresh = false, isValid = null) {
  const docRef = cacheDocRef(db, collectionName, dateKey, docKey);

  if (!forceRefresh) {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const cached = snap.data();
      if (!isValid || isValid(cached)) {
        return cached;
      }
      // Stale/invalid cache entry — delete silently and refetch
      await deleteDoc(docRef).catch(() => {});
    }
  }

  const freshData = await fetchFn();

  if (!isValid || isValid(freshData)) {
    const dataToStore = { ...freshData, fetchedAt: new Date().toISOString() };
    await setDoc(docRef, dataToStore);
    return dataToStore;
  }

  // Valid fetch but data is empty/invalid — return as-is without caching
  return freshData;
}

/**
 * Record that a date has been cached (for cleanup tracking).
 */
export async function recordCacheDate(db, collectionName, dateKey) {
  const ref = metaRef(db, collectionName);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().cachedDates || [] : [];
  if (!existing.includes(dateKey)) {
    await setDoc(ref, { cachedDates: [...existing, dateKey] });
  }
}

/**
 * Delete cache documents older than CACHE_RETENTION_DAYS.
 */
export async function cleanupOldCache(db, collectionName) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const ref = metaRef(db, collectionName);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const { cachedDates = [] } = snap.data();
  const datesToDelete = cachedDates.filter(d => d < cutoffStr);

  for (const oldDate of datesToDelete) {
    try {
      const dataDocRef = cacheDocRef(db, collectionName, oldDate, 'data');
      await deleteDoc(dataDocRef);
    } catch (e) {
      console.warn(`Cache cleanup failed for ${collectionName}/${oldDate}:`, e);
    }
  }

  if (datesToDelete.length > 0) {
    const remaining = cachedDates.filter(d => d >= cutoffStr);
    await setDoc(ref, { cachedDates: remaining });
  }
}
