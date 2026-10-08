import { useState } from 'react';

/** A per-browser on/off preference. Falls back to `initial` (and stops saving) when storage is unavailable. */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === 'true';
    } catch {
      return initial;
    }
  });
  const set = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Private mode or blocked storage: keep it for this visit only.
    }
  };
  return [value, set];
}
