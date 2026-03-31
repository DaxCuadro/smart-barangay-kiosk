import { useEffect, useRef } from 'react';

const IDLE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];

/**
 * Calls `onIdle` after `timeoutMs` of inactivity (no touch/mouse/key events).
 * Resets the timer on any interaction.
 */
export default function useIdleReset(onIdle, timeoutMs = 120000) {
  const timerRef = useRef(null);
  const callbackRef = useRef(onIdle);

  useEffect(() => {
    callbackRef.current = onIdle;
  });

  useEffect(() => {
    if (!timeoutMs || timeoutMs <= 0) return undefined;

    function resetTimer() {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        callbackRef.current?.();
      }, timeoutMs);
    }

    resetTimer();

    IDLE_EVENTS.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      clearTimeout(timerRef.current);
      IDLE_EVENTS.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [timeoutMs]);
}
