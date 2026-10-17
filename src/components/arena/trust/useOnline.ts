import { useEffect, useState } from 'react';

/**
 * `navigator.onLine`, live. A `false` is trustworthy (the device has no
 * network); a `true` only means "a network exists" — a school Wi-Fi with no
 * upstream reads as online. That is why this is ONE of the signals behind
 * the connection pill, never the whole answer.
 */
export function readOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(readOnline);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    setOnline(readOnline());
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Calls `fn` each time the browser comes back online. */
export function useOnReconnect(fn: () => void): void {
  useEffect(() => {
    window.addEventListener('online', fn);
    return () => window.removeEventListener('online', fn);
  }, [fn]);
}
