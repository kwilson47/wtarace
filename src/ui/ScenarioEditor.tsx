import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Rules, Season, Tournament } from '../data/schema';
import type { Warning } from '../engine/checkScenario';
import { pickKey, type Scenario } from '../engine/types';
import { categoryLabel } from './format';
import { PickSelect } from './PickSelect';
import { PlayerOutlook } from './PlayerOutlook';
import { useOutlook } from './useOutlook';
import { warningsByPick } from './warningText';

type OnPick = (playerId: string, tournamentId: string, round: string | null) => void;

interface Props {
  season: Season;
  /** Tracked players in current-rank order. */
  players: Player[];
  scenario: Scenario;
  warnings: Warning[];
  onPick: OnPick;
  onLoad: (scenario: Scenario) => void;
  /** Opens the By player tab on this player (from ?player=). */
  focusPlayer?: string;
}

interface PanelProps {
  tournaments: Tournament[];
  players: Player[];
  rules: Rules;
  scenario: Scenario;
  messages: Map<string, string[]>;
  onPick: OnPick;
}

const live = (t: Tournament) => (t.status === 'in-progress' ? ' — LIVE' : '');
const eventName = (t: Tournament) => `${t.name}${live(t)}`;
const eventOption = (t: Tournament) => `${t.name} (${categoryLabel(t.category)})${live(t)}`;

/** Clears every existing pick among `picks`; disabled when there is nothing to clear. */
function ClearButton({ label, picks, scenario, onPick }: {
  label: string;
  picks: { playerId: string; tournamentId: string }[];
  scenario: Scenario;
  onPick: OnPick;
}) {
  const picked = picks.filter((p) => scenario[pickKey(p.playerId, p.tournamentId)] !== undefined);
  return (
    <button
      type="button"
      className="clear"
      disabled={picked.length === 0}
      onClick={() => picked.forEach((p) => onPick(p.playerId, p.tournamentId, null))}
    >
      {label}
    </button>
  );
}

function Cell({ player, tournament, rules, scenario, messages, onPick }: Omit<PanelProps, 'tournaments' | 'players'> & { player: Player; tournament: Tournament }) {
  const key = pickKey(player.id, tournament.id);
  return (
    <PickSelect
      player={player}
      tournament={tournament}
      rules={rules}
      value={scenario[key]}
      onChange={(round) => onPick(player.id, tournament.id, round)}
      messages={messages.get(key) ?? []}
    />
  );
}

function ByTournament({ tournaments, players, ...rest }: PanelProps) {
  const [id, setId] = useState(tournaments[0].id);
  const tournament = tournaments.find((t) => t.id === id) ?? tournaments[0];
  // With a published entry list, entered players come first (each part keeps current-rank order).
  const entries = tournament.entries;
  const groups: { heading: string | null; players: Player[] }[] = entries
    ? [
        { heading: 'Entered', players: players.filter((p) => entries.includes(p.id)) },
        { heading: 'Not on the entry list', players: players.filter((p) => !entries.includes(p.id)) },
      ].filter((g) => g.players.length > 0)
    : [{ heading: null, players }];
  return (
    <div role="tabpanel">
      <label className="picker">
        Tournament{' '}
        <select id="tournament-select" value={tournament.id} onChange={(e) => setId(e.target.value)}>
          {tournaments.map((t) => <option key={t.id} value={t.id}>{eventOption(t)}</option>)}
        </select>
      </label>
      <ClearButton
        label={`Clear picks for ${tournament.name}`}
        picks={players.map((p) => ({ playerId: p.id, tournamentId: tournament.id }))}
        scenario={rest.scenario}
        onPick={rest.onPick}
      />
      <ul className="picks">
        {groups.map((g) => (
          <Fragment key={g.heading ?? 'all'}>
            {g.heading && <li className="group-heading">{g.heading}</li>}
            {g.players.map((p) => (
              <li key={p.id}>
                <span className="who">{p.name}</span>
                <Cell player={p} tournament={tournament} {...rest} />
              </li>
            ))}
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

function ByPlayer({ season, onLoad, initialId, tournaments, players, ...rest }: PanelProps & { season: Season; onLoad: (scenario: Scenario) => void; initialId?: string }) {
  const [id, setId] = useState(initialId ?? players[0]?.id ?? '');
  const player = players.find((p) => p.id === id) ?? players[0];
  const outlook = useOutlook(season, player?.id ?? '');
  if (!player) return null;
  return (
    <div role="tabpanel">
      <label className="picker">
        Player{' '}
        <select id="player-select" value={player.id} onChange={(e) => setId(e.target.value)}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <PlayerOutlook player={player} outlook={outlook} players={players} season={season} onLoad={onLoad} />
      <ClearButton
        label={`Clear ${player.name}'s picks`}
        picks={tournaments.map((t) => ({ playerId: player.id, tournamentId: t.id }))}
        scenario={rest.scenario}
        onPick={rest.onPick}
      />
      <ul className="picks">
        {tournaments.map((t) => (
          <li key={t.id}>
            <span className="who">
              {eventName(t)} <span className="tag">{categoryLabel(t.category)}</span>
              {t.entries?.includes(player.id) && <span className="tag entered">Entered</span>}
            </span>
            <Cell player={player} tournament={t} {...rest} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScenarioEditor({ season, players, scenario, warnings, onPick, onLoad, focusPlayer }: Props) {
  const [tab, setTab] = useState<'tournament' | 'player'>('tournament');
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusPlayer) return;
    setTab('player');
    sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [focusPlayer]);
  const remaining = useMemo(
    () => season.tournaments.filter((t) => t.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [season],
  );
  const messages = useMemo(() => warningsByPick(warnings, season), [warnings, season]);

  if (remaining.length === 0) {
    return <section className="editor" aria-label="Scenario editor" ref={sectionRef}><p>No tournaments remain before the Finals.</p></section>;
  }
  const panelProps: PanelProps = { tournaments: remaining, players, rules: season.rules, scenario, messages, onPick };
  return (
    <section className="editor" aria-label="Scenario editor" ref={sectionRef}>
      <h2>Your scenario</h2>
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={tab === 'tournament'} onClick={() => setTab('tournament')}>By tournament</button>
        <button type="button" role="tab" aria-selected={tab === 'player'} onClick={() => setTab('player')}>By player</button>
      </div>
      {tab === 'tournament' ? <ByTournament {...panelProps} /> : <ByPlayer {...panelProps} season={season} onLoad={onLoad} initialId={focusPlayer} />}
      <div className="footnotes">
        <p>Projections never add zero-pointers for skipped mandatory events. Those depend on WTA rulings such as injury exemptions.</p>
        <p>Without draw data we can't tell when two players you've picked would have to meet earlier in the draw.</p>
        <p>Projections keep each player's current commitment zero-pointers; playing extra events doesn't remove them here.</p>
      </div>
    </section>
  );
}
