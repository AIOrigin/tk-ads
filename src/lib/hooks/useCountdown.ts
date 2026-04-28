'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useCountdown() {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    setSeconds(0);
  }, [clearTimer]);

  const start = useCallback(
    (durationSeconds: number) => {
      const nextSeconds = Math.max(0, Math.ceil(durationSeconds));
      clearTimer();
      setSeconds(nextSeconds);

      if (nextSeconds <= 0) return;

      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          if (current <= 1) {
            clearTimer();
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [clearTimer]
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { seconds, start, reset };
}
