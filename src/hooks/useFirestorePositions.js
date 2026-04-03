import { useState, useEffect } from 'react';
import { collection, updateDoc, doc, onSnapshot } from 'firebase/firestore';
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
        updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id), {
          status: 'CLOSED',
          closePrice: 0,
          dateClosed: today,
          history: [{ date: today, action: 'AUTO_EXPIRE', closePrice: 0, notes: '自动过期' }, ...(p.history || [])]
        }).catch(e => console.error('Failed to auto-close:', e));
      } else if (p.status === 'CLOSED' && !hasAutoExpireRecord) {
        updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'positions', p.id), {
          history: [{ date: p.dateClosed || today, action: 'AUTO_EXPIRE', closePrice: 0, notes: '自动过期' }, ...(p.history || [])]
        }).catch(e => console.error('Failed to add auto-expire record:', e));
      }
    });
  }, [positions, user, db]);

  return { positions, plans };
}
