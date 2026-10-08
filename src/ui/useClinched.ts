import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { clinchedPlayers } from '../engine/clinch';

const NONE: ReadonlySet<string> = new Set();

/**
 * Players certain to qualify, from actual results. The search can take a second, so in the browser it
 * runs in a worker and the result arrives after the first render; without workers (tests) it runs inline.
 */
export function useClinched(season: Season): ReadonlySet<string> {
  const [clinched, setClinched] = useState<ReadonlySet<string>>(NONE);
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setClinched(clinchedPlayers(season.players, season.tournaments, season.rules));
      return;
    }
    const worker = new Worker(new URL('./clinch.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<string[]>) => setClinched(new Set(event.data));
    worker.postMessage(season);
    return () => worker.terminate();
  }, [season]);
  return clinched;
}
