import type { Player, RoundPoints, Rules, Tournament } from '../data/schema';
import { pickOptions } from '../engine/picks';

/** Short round names so the dropdowns fit on a phone: R32, QF, SF, final; anything else keeps its label. */
function shortRound(r: RoundPoints): string {
  if (/^R\d+$/.test(r.round) || r.round === 'QF' || r.round === 'SF') return r.round;
  return r.round === 'F' ? 'final' : r.label;
}

interface Props {
  player: Player;
  tournament: Tournament;
  rules: Rules;
  value: string | undefined;
  onChange: (round: string | null) => void;
  messages: string[];
}

export function PickSelect({ player, tournament, rules, value, onChange, messages }: Props) {
  const options = pickOptions(player, tournament, rules);
  return (
    <span className="pick">
      {options.kind === 'locked' ? (
        <span className="locked">{options.label}</span>
      ) : (
        <select
          aria-label={`${player.name} at ${tournament.name}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{options.allowNone ? 'Not playing' : `Alive in ${options.currentRound ? shortRound(options.currentRound) : ''} — no pick`}</option>
          {options.rounds.map((r, i) => (
            <option key={r.round} value={r.round}>
              {i === options.rounds.length - 1 ? r.label : `Lost in ${shortRound(r)}`}
            </option>
          ))}
        </select>
      )}
      {messages.map((m) => (
        <span key={m} className="warning">{m}</span>
      ))}
    </span>
  );
}
