import type { DrawFile, DrawMatch } from './drawSchema';

/** A bracket line: a player (WTA id), a bye, or not known yet. */
export type Slot = number | 'bye' | null;

export interface BracketMatch {
  round: number;
  top: Slot;
  bottom: Slot;
  winner: number | null;
  score: string;
  outcome: DrawMatch['outcome'] | 'bye' | 'pending';
}

export interface Bracket {
  /** Lines in the first round: the draw size rounded up to a power of two. */
  size: number;
  /** First round first; each round has half as many matches as the one before. */
  rounds: BracketMatch[][];
}

/**
 * Rebuilds the bracket from the draw order. The bracket's empty lines are byes: walking the draw order,
 * a player with no first-round match takes a whole first-round pair (with her bye). Everyone else takes
 * one line. Later rounds pair the winners. Returns null if the draw and its first round don't fit
 * together (e.g. the draw is out but no first-round matches are listed yet).
 */
export function buildBracket(draw: DrawFile): Bracket | null {
  const ids = draw.players.map((p) => p.wtaId);
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, ids.length)));
  const byes = size - ids.length;
  const playing = new Set(draw.matches.filter((m) => m.round === 1).flatMap((m) => [m.a, m.b]));
  const lines: Slot[] = [];
  for (const id of ids) {
    if (byes > 0 && !playing.has(id)) lines.push(id, 'bye');
    else lines.push(id);
  }
  if (lines.length !== size) return null;

  const rounds: BracketMatch[][] = [];
  let entrants: Slot[] = lines;
  for (let round = 1; entrants.length > 1; round++) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      let top: Slot = entrants[i] ?? null;
      let bottom: Slot = entrants[i + 1] ?? null;
      if (top === 'bye' || bottom === 'bye') {
        const through = top === 'bye' ? bottom : top;
        matches.push({ round, top, bottom, winner: typeof through === 'number' ? through : null, score: '', outcome: 'bye' });
        continue;
      }
      const known = [top, bottom].filter((s): s is number => typeof s === 'number');
      const found = draw.matches.find((m) => m.round === round && known.some((id) => id === m.a || id === m.b));
      if (found) {
        // The feed names both players once they're set, even if we haven't seen one of them win yet.
        if (top === null) top = found.a === bottom ? found.b : found.a;
        if (bottom === null) bottom = found.a === top ? found.b : found.a;
      }
      matches.push({ round, top, bottom, winner: found?.winner ?? null, score: found?.score ?? '', outcome: found?.outcome ?? 'pending' });
    }
    rounds.push(matches);
    entrants = matches.map((m) => m.winner);
  }
  return { size, rounds };
}

export function finalists(bracket: Bracket): { champion: number | null; runnerUp: number | null; score: string } {
  const final = bracket.rounds.at(-1)![0]!;
  if (final.winner === null) return { champion: null, runnerUp: null, score: '' };
  const other = final.top === final.winner ? final.bottom : final.top;
  return { champion: final.winner, runnerUp: typeof other === 'number' ? other : null, score: final.score };
}
