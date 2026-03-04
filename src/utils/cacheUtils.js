import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

const APP_ID = 'option-focus-v2';

function cacheDocRef(db, collectionName, dateKey, docKey) {
  return doc(db, 'artifacts', APP_ID, 'options-monitor', collectionName, dateKey, docKey);
}

/**
 * Get data from Firestore cache or fetch fresh.
 * Cache is keyed by dateKey (today's date string) — same-day hit, miss on any new day.
 * forceRefresh bypasses cache and overwrites with fresh data.
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
      // Invalid cache entry — delete silently and refetch
      await deleteDoc(docRef).catch(() => {});
    }
  }

  const freshData = await fetchFn();

  if (!isValid || isValid(freshData)) {
    const dataToStore = { ...freshData, fetchedAt: new Date().toISOString() };
    await setDoc(docRef, dataToStore);
    return dataToStore;
  }

  // Data is empty/invalid — return as-is without caching
  return freshData;
}
