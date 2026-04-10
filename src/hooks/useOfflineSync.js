import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPendingRequests,
  removePendingRequest,
  getPendingCount,
} from '../utils/offlineStorage';

/**
 * Tracks browser online/offline state and flushes any queued
 * offline requests once connectivity returns.
 */
export default function useOfflineSync(supabase, intakeTable = 'resident_intake_requests') {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncInProgress = useRef(false);

  // Keep pending count up to date
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // ignore
    }
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshPendingCount();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingCount]);

  // Auto-flush when coming back online
  const flushQueue = useCallback(async () => {
    if (syncInProgress.current || !supabase) return;
    syncInProgress.current = true;
    setSyncing(true);

    try {
      const pending = await getPendingRequests();
      for (const item of pending) {
        const { offlineId, queued_at: _queuedAt, ...payload } = item;
        const { error } = await supabase.from(intakeTable).insert(payload);
        if (!error) {
          await removePendingRequest(offlineId);
        }
        // If error, leave in queue for next attempt
      }
    } catch {
      // will retry next time
    } finally {
      syncInProgress.current = false;
      setSyncing(false);
      refreshPendingCount();
    }
  }, [supabase, intakeTable, refreshPendingCount]);

  useEffect(() => {
    if (isOnline) {
      flushQueue();
    }
  }, [isOnline, flushQueue]);

  return { isOnline, pendingCount, syncing, flushQueue, refreshPendingCount };
}
