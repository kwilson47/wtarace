import type { ReactNode } from 'react';
import type { Player, Season } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { splitPickKey, type Scenario } from '../engine/types';
import { formatPoints } from './format';

/** One line per player in `players` order: "Live Masters: Lost in Final; Next Open: Winner". */
export function describePicks(scenario: Scenario, players: Player[], season: Season): { name: string; picks: string }[] {
  const byPlayer = new Map<string, { tournamentId: string; round: string }[]>();
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    byPlayer.set(playerId, [...(byPlayer.get(playerId) ?? []), { tournamentId, round }]);
  }
  return players
    .filter((p) => byPlayer.has(p.id))
    .map((p) => {
      const picks = byPlayer
        .get(p.id)!
        .map((pick) => ({ ...pick, t: season.tournaments.find((t) => t.id === pick.tournamentId)! }))
        .sort((a, b) => a.t.startDate.localeCompare(b.t.startDate))
        .map(({ t, round }) => {
          const table = pointsTable(season.rules, t.drawType);
          const label = table.find((r) => r.round === round)!.label;
          return `${t.name}: ${round === table.at(-1)!.round ? label : `Lost in ${label}`}`;
        });
      return { name: p.name, picks: picks.join('; ') };
    });
}

function Example({ title, scenario, players, season, onLoad, scenarioHref }: {
  title: string;
  scenario: Scenario;
  players: Player[];
  season: Season;
  onLoad?: (scenario: Scenario) => void;
  scenarioHref?: (scenario: Scenario) => string;
}) {
  const lines = describePicks(scenario, players, season);
  return (
    <section className="example" aria-label={title}>
      <p>
        <strong>{title}</strong>
        {lines.length === 0 ? ': as things stand, if nobody earns more points.' : ':'}
      </p>
      {lines.length > 0 && (
        <ul>
          {lines.map((l) => <li key={l.name}>{`${l.name} — ${l.picks}`}</li>)}
        </ul>
      )}
      {scenarioHref ? (
        <a className="button" href={scenarioHref(scenario)}>Try this scenario</a>
      ) : (
        <button type="button" title="Replaces your current picks" onClick={() => onLoad?.(scenario)}>Load this scenario</button>
      )}
    </section>
  );
}

interface Props {
  player: Player;
  /** null while it is being worked out; 'failed' if that errored. */
  outlook: Outlook | 'failed' | null;
  /** Tracked players in current-rank order, for listing example picks. */
  players: Player[];
  season: Season;
  /** Loads an example into the visitor's picks (homepage). */
  onLoad?: (scenario: Scenario) => void;
  /** Links each example to the homepage instead (player pages). */
  scenarioHref?: (scenario: Scenario) => string;
  heading?: string;
}

export function PlayerOutlook({ player, outlook, players, season, onLoad, scenarioHref, heading }: Props) {
  let body: ReactNode;
  if (outlook === null) {
    body = (
      <p className="muted" role="status">
        Working out her chances
        <span className="working-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
      </p>
    );
  }
  else if (outlook === 'failed') body = <p>We couldn't work out her chances.</p>;
  else if (outlook.status === 'qualified') body = <p>{`${player.name} has qualified for the WTA Finals.`}</p>;
  else if (outlook.status === 'out') body = <p>{`${player.name} can no longer qualify.`}</p>;
  else {
    const route = outlook.guaranteedRoute && describePicks(outlook.guaranteedRoute, [player], season)[0];
    const own = route
      ? `She's certain to qualify with these results of her own, whatever anyone else does — ${route.picks}.`
      : outlook.eventsLeft
        ? 'No results of her own are enough by themselves, so she also needs help from others.'
        : 'She has no events left, so it depends on other players.';
    body = (
      <>
        <p>{own}</p>
        {outlook.safeAt === null ? (
          <p>We couldn't prove a points total that is always enough.</p>
        ) : (
          <p>
            {`Safe at ${formatPoints(outlook.safeAt)} points: finishing with at least this many guarantees a place, however she gets there`}
            {outlook.eligibleNow ? '.' : ', once she meets the event minimum.'}
          </p>
        )}
        {outlook.qualifyExample ? (
          <Example title="How she could qualify" scenario={outlook.qualifyExample} players={players} season={season} onLoad={onLoad} scenarioHref={scenarioHref} />
        ) : (
          <p>We couldn't find a simple way for her to qualify.</p>
        )}
        {outlook.missExample ? (
          <Example title="How she could miss out" scenario={outlook.missExample} players={players} season={season} onLoad={onLoad} scenarioHref={scenarioHref} />
        ) : (
          <p>We couldn't build an example of her missing out to show here.</p>
        )}
        <p className="note">{`In these examples, players not listed earn no more points.${scenarioHref ? '' : ' Loading one replaces your current picks.'}`}</p>
      </>
    );
  }
  return (
    <section className="outlook" aria-label="Chances">
      <h3>{heading ?? `${player.name}'s chances`}</h3>
      {body}
    </section>
  );
}
