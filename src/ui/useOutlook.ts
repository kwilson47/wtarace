import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { playerOutlook, type Outlook } from '../engine/outlook';

/**
 * One player's outlook, from actual results. In the browser it runs in a worker and arrives after the
 * first render (null until then); without workers (tests) it runs inline. Results are tagged with the
 * player they belong to, so switching players never shows a stale answer.
 */
export function useOutlook(season: Season, playerId: string): Outlook | null {
  const [result, setResult] = useState<{ playerId: string; outlook: Outlook } | null>(null);
  useEffect(() => {
    if (!playerId) return;
    if (typeof Worker === 'undefined') {
      setResult({ playerId, outlook: playerOutlook(playerId, season.players, season.tournaments, season.rules) });
      return;
    }
    const worker = new Worker(new URL('./outlook.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Outlook>) => setResult({ playerId, outlook: event.data });
    worker.postMessage({ season, playerId });
    return () => worker.terminate();
  }, [season, playerId]);
  return result?.playerId === playerId ? result.outlook : null;
}
