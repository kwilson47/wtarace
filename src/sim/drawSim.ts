import type { Bracket, BracketMatch, Slot } from '../draws/bracket';
import { shuffle, type Rng } from './random';
import { winChance } from './ratings';

/** Lines for seeds 1…count: the two ends of the draw, then the free ends of the halves, quarters, eighths… (random within each level). */
export function seedPositions(lines: number, count: number, rng: Rng): number[] {
  const taken = lines > 1 ? [0, lines - 1] : [0];
  for (let segment = lines / 2; taken.length < count && segment >= 1; segment /= 2) {
    const ends: number[] = [];
    for (let start = 0; start < lines; start += segment) {
      for (const end of new Set([start, start + segment - 1])) if (!taken.includes(end)) ends.push(end);
    }
    taken.push(...shuffle(ends, rng));
  }
  return taken.slice(0, count);
}

/** A bracket from its first-round lines, with every match still to play (byes go straight through). */
export function bracketFromLines(lines: Slot[]): Bracket {
  const rounds: BracketMatch[][] = [];
  let entrants: Slot[] = lines;
  for (let round = 1; entrants.length > 1; round++) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      const top = entrants[i] ?? null;
      const bottom = entrants[i + 1] ?? null;
      if (top === 'bye' || bottom === 'bye') {
        const through = top === 'bye' ? bottom : top;
        matches.push({ round, top, bottom, winner: typeof through === 'number' ? through : null, score: '', outcome: 'bye' });
      } else {
        matches.push({ round, top, bottom, winner: null, score: '', outcome: 'pending' });
      }
    }
    rounds.push(matches);
    entrants = matches.map((m) => m.winner);
  }
  return { size: lines.length, rounds };
}

/**
 * A draw for an event whose draw isn't out. The tracked entrants (in seeding order) take the seed places, the
 * top seeds get the byes, the remaining entrants land at random, and field players (negative ids, rated by
 * `fieldRating`) fill the rest.
 */
export function randomDraw(lines: number, drawSize: number, entrants: readonly number[], fieldRating: () => number, rng: Rng) {
  const byeCount = Math.max(0, lines - drawSize);
  const seedCount = Math.min(lines / 2, Math.max(byeCount, drawSize > 32 ? 16 : 8));
  const slots: Slot[] = new Array<Slot>(lines).fill(null);
  const field = new Map<number, number>();
  let nextField = -1;
  const fieldPlayer = () => {
    const id = nextField--;
    field.set(id, fieldRating());
    return id;
  };
  const positions = seedPositions(lines, seedCount, rng);
  positions.forEach((line, i) => {
    slots[line] = entrants[i] ?? fieldPlayer();
    if (i < byeCount) slots[line ^ 1] = 'bye';
  });
  const free = shuffle(slots.flatMap((s, i) => (s === null ? [i] : [])), rng);
  const rest = entrants.slice(seedCount);
  free.forEach((line, i) => {
    slots[line] = rest[i] ?? fieldPlayer();
  });
  const byes = positions.slice(0, byeCount).flatMap((line) => {
    const s = slots[line];
    return typeof s === 'number' && s > 0 ? [s] : [];
  });
  return { bracket: bracketFromLines(slots), field, byes };
}

const decided = (m: BracketMatch) => m.outcome !== 'pending' && m.outcome !== 'scheduled' && m.winner !== null;

/**
 * Plays out every undecided match with the ratings' win chances; results and byes stand. Returns the bracket
 * round each player went out in (rounds + 1 for the champion), for players whose finish was simulated.
 */
export function simulateBracket(bracket: Bracket, ratingOf: (id: number) => number, rng: Rng): Map<number, number> {
  const finish = new Map<number, number>();
  let previous: (number | null)[] = [];
  bracket.rounds.forEach((round, index) => {
    previous = round.map((m, i) => {
      if (m.outcome === 'bye' || decided(m)) return m.winner;
      const a = typeof m.top === 'number' ? m.top : (previous[2 * i] ?? null);
      const b = typeof m.bottom === 'number' ? m.bottom : (previous[2 * i + 1] ?? null);
      if (a === null || b === null) return a ?? b;
      const aWins = rng() < winChance(ratingOf(a), ratingOf(b));
      finish.set(aWins ? b : a, index + 1);
      if (index === bracket.rounds.length - 1) finish.set(aWins ? a : b, index + 2);
      return aWins ? a : b;
    });
  });
  return finish;
}
