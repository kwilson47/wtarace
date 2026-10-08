import { useCallback, useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { pickKey, type Scenario } from '../engine/types';
import { reconcileScenario, type IgnoredPick } from './reconcile';
import { decodeScenario, encodeScenario } from './url';

const PARAM = 's';

function loadFromUrl(season: Season): { scenario: Scenario; ignored: IgnoredPick[] } {
  const decoded = decodeScenario(new URLSearchParams(window.location.search).get(PARAM));
  const reconciled = reconcileScenario(decoded.scenario, season);
  const n = decoded.malformed.length;
  const unreadable: IgnoredPick[] = n > 0 ? [{ pick: `${n} unreadable entr${n === 1 ? 'y' : 'ies'}`, reason: 'unreadable' }] : [];
  return { scenario: reconciled.scenario, ignored: [...unreadable, ...reconciled.ignored] };
}

export function useScenario(season: Season) {
  const [initial] = useState(() => loadFromUrl(season));
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [ignored, setIgnored] = useState<IgnoredPick[]>(initial.ignored);

  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = encodeScenario(scenario);
    if (encoded) url.searchParams.set(PARAM, encoded);
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url);
  }, [scenario]);

  const setPick = useCallback((playerId: string, tournamentId: string, round: string | null) => {
    setScenario((prev) => {
      const next = { ...prev };
      const key = pickKey(playerId, tournamentId);
      if (round === null) delete next[key];
      else next[key] = round;
      return next;
    });
  }, []);

  const reset = useCallback(() => setScenario({}), []);
  const load = useCallback((next: Scenario) => setScenario(next), []);
  const dismissIgnored = useCallback(() => setIgnored([]), []);

  return { scenario, setPick, reset, load, ignored, dismissIgnored };
}
