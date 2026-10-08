import { useMemo } from 'react';
import type { Season } from '../data/schema';
import { checkScenario } from '../engine/checkScenario';
import { eliminatedPlayers } from '../engine/elimination';
import { projectStandings } from '../engine/standings';
import { useScenario } from '../scenario/useScenario';
import type { IgnoredPick } from '../scenario/reconcile';
import { Header } from './Header';
import { ScenarioEditor } from './ScenarioEditor';
import { StandingsTable } from './StandingsTable';
import { useClinched } from './useClinched';

function IgnoredNotice({ ignored, onDismiss }: { ignored: IgnoredPick[]; onDismiss: () => void }) {
  return (
    <div className="notice" role="status">
      <p>Some picks in this link were ignored:</p>
      <ul>
        {ignored.map((i, n) => <li key={n}>{`${i.pick} — ${i.reason}`}</li>)}
      </ul>
      <button type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function App({ season }: { season: Season }) {
  const { scenario, setPick, reset, ignored, dismissIgnored } = useScenario(season);
  const { players, tournaments, rules } = season;
  const rows = useMemo(() => projectStandings(players, scenario, tournaments, rules), [players, scenario, tournaments, rules]);
  const warnings = useMemo(() => checkScenario(scenario, players, tournaments, rules), [players, scenario, tournaments, rules]);
  // From actual results only, so it doesn't change with picks.
  const eliminated = useMemo(() => eliminatedPlayers(players, tournaments, rules), [players, tournaments, rules]);
  const clinched = useClinched(season);
  const byCurrentRank = useMemo(() => {
    const rank = new Map(rows.map((r) => [r.playerId, r.currentRank]));
    return [...players].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }, [rows, players]);

  return (
    <div className="app">
      <Header season={rules.season} lastUpdated={season.meta.lastUpdated} onReset={reset} />
      {ignored.length > 0 && <IgnoredNotice ignored={ignored} onDismiss={dismissIgnored} />}
      <main>
        <StandingsTable rows={rows} eliminated={eliminated} clinched={clinched} />
        <ScenarioEditor season={season} players={byCurrentRank} scenario={scenario} warnings={warnings} onPick={setPick} />
      </main>
    </div>
  );
}
