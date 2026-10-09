import { useEffect, useState } from 'react';

/**
 * A per-browser on/off preference. Starts at `initial` (so it matches the prerendered HTML), then applies
 * the stored choice. Falls back to `initial`, and stops saving, when storage is unavailable.
 */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored === 'true');
    } catch {
      // Private mode or blocked storage: keep the default.
    }
  }, [key]);
  const set = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Keep it for this visit only.
    }
  };
  return [value, set];
}
