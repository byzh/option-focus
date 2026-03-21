import { useState, useEffect } from 'react';
import { collection, updateDoc, doc, onSnapshot, writeBatch, deleteField } from 'firebase/firestore';
import { isExpired, getLocalTodayString } from '../utils/dateUtils';

const APP_ID = 'option-focus-v2';

/**
 * Syncs positions and plans from Firestore and auto-closes expired positions.
 * Encapsulates all Firestore subscription and auto-expire logic from App.jsx.
 */
export function useFirestorePositions({ user, db }) {
  const [positions, setPositions] = useState([]);
  const [plans, setPlans] = useState([]);

  // Firestore real-time sync
  useEffect(() => {
    if (!user || !db) return;
    const unsubPos = onSnapshot(
      collection(db, 'artifacts', APP_ID, 'users', user.uid, 'positions'),
      s => setPositions(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => console.error(e)
    );
    const unsubPlans = onSnapshot(
      collection(db, 'artifacts', APP_ID, 'users', user.uid, 'plans'),
      s => setPlans(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => console.error(e)
    );
    return () => { unsubPos(); unsubPlans(); };
  }, [user, db]);

  // Auto-close expired positions
  useEffect(() => {
    if (!user || !db || positions.length === 0) return;

    positions.forEach(p => {
      if (p.assetType === 'STOCK') return; // stocks never expire
      if (!isExpired(p.expiration)) return;

      const today = getLocalTodayString();
      const historyArr = p.history || [];
      const hasAutoExpireRecord = historyArr.some(h => h.action === 'AUTO_EXPIRE');
      // If reopened after expiration date, require manual close — skip auto-expire
      const reopenEntry = historyArr.find(h => h.action === 'REOPEN');
      const reopenedAfterExpiry = reopenEntry && reopenEntry.date > p.expiration;

      if (p.status !== 'CLOSED' && !hasAutoExpireRecord && !reopenedAfterExpiry) {
        console.log(`Auto-closing expired position: ${p.ticker}`);
        updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id), {
          status: 'CLOSED',
          closePrice: 0,
          dateClosed: today,
          history: [{ date: today, action: 'AUTO_EXPIRE', closePrice: 0, notes: '自动过期' }, ...(p.history || [])]
        }).catch(e => console.error('Failed to auto-close:', e));
      } else if (p.status === 'CLOSED' && !hasAutoExpireRecord) {
        console.log(`Adding auto-expire record to: ${p.ticker}`);
        updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id), {
          history: [{ date: p.dateClosed || today, action: 'AUTO_EXPIRE', closePrice: 0, notes: '自动过期' }, ...(p.history || [])]
        }).catch(e => console.error('Failed to add auto-expire record:', e));
      }
    });
  }, [positions, user, db]);

  // One-time migration: reopen STOCK positions wrongly auto-expired by old buggy code.
  // Targets only STOCK positions whose history contains an AUTO_EXPIRE entry.
  // Safe to run repeatedly — exits immediately when no dirty data exists.
  useEffect(() => {
    if (!user || !db || positions.length === 0) return;

    const dirty = positions.filter(
      p => p.assetType === 'STOCK' && (p.history || []).some(h => h.action === 'AUTO_EXPIRE')
    );
    if (dirty.length === 0) return;

    console.log(`[repair] Found ${dirty.length} wrongly auto-expired STOCK position(s). Repairing...`);
    const batch = writeBatch(db);
    dirty.forEach(p => {
      const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id);
      batch.update(ref, {
        status: 'OPEN',
        closePrice: deleteField(),
        dateClosed: deleteField(),
        // Remove phantom option fields written by old handleSubmit
        type: deleteField(),
        strike: deleteField(),
        expiration: deleteField(),
        rollCredit: deleteField(),
        leapsId: deleteField(),
        // Strip AUTO_EXPIRE entries from history, preserve everything else
        history: (p.history || []).filter(h => h.action !== 'AUTO_EXPIRE'),
      });
      console.log(`[repair] Reopening STOCK ${p.ticker} (id: ${p.id})`);
    });

    batch.commit()
      .then(() => console.log('[repair] STOCK repair migration complete.'))
      .catch(e => console.error('[repair] Migration failed:', e));
  }, [positions, user, db]);

  return { positions, plans };
}
