import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { playerOutlook, type Outlook } from '../engine/outlook';

/**
 * One player's outlook, from actual results. In the browser it runs in a worker and arrives after the
 * first render (null until then); without workers (tests) it runs inline. Results are tagged with the
 * player they belong to, so switching players never shows a stale answer. 'failed' when it errors.
 */
export function useOutlook(season: Season, playerId: string): Outlook | 'failed' | null {
  const [result, setResult] = useState<{ playerId: string; outlook: Outlook | 'failed' } | null>(null);
  useEffect(() => {
    if (!playerId) return;
    if (typeof Worker === 'undefined') {
      let outlook: Outlook | 'failed';
      try {
        outlook = playerOutlook(playerId, season.players, season.tournaments, season.rules);
      } catch {
        outlook = 'failed';
      }
      setResult({ playerId, outlook });
      return;
    }
    const worker = new Worker(new URL('./outlook.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Outlook>) => setResult({ playerId, outlook: event.data });
    worker.onerror = worker.onmessageerror = () => setResult({ playerId, outlook: 'failed' });
    worker.postMessage({ season, playerId });
    return () => worker.terminate();
  }, [season, playerId]);
  return result?.playerId === playerId ? result.outlook : null;
}
