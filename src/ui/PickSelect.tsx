import type { Player, Rules, Tournament } from '../data/schema';
import { pickOptions } from '../engine/picks';

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
          <option value="">{options.allowNone ? 'Not playing' : `Alive in ${options.currentRound?.label} — no pick`}</option>
          {options.rounds.map((r, i) => (
            <option key={r.round} value={r.round}>
              {i === options.rounds.length - 1 ? r.label : `Lost in ${r.label}`}
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
