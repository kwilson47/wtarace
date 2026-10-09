import type { Player, RoundPoints, Season, Tournament } from '../data/schema';
import { buildBracket, type Bracket } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { pointsTable } from '../engine/lookup';
import { projectStandings } from '../engine/standings';
import { pickKey, type Scenario } from '../engine/types';
import type { MatchRecord } from '../season/matchSchema';
import { randomDraw, simulateBracket } from './drawSim';
import { buildField, levelOf, sampleField, type Field } from './field';
import { mulberry32, type Rng } from './random';
import { buildRatings, type Ratings } from './ratings';

export const FULL_RUNS = 10_000;
export const DEV_RUNS = 1_000;
export const SEED = 20261009;

interface Event {
  t: Tournament;
  table: RoundPoints[];
  /** The real bracket, when the draw is out and readable. */
  real: Bracket | null;
  lines: number;
  drawSize: number;
  /** Tracked entrants' WTA ids in seeding order (events without a draw). */
  entrants: number[];
}

export interface Simulation {
  ratings: Ratings;
  field: Field;
  byWta: Map<number, Player>;
  events: Event[];
}

const drawSizeOf = (t: Tournament, lines: number) => t.drawSize ?? Number(/-(\d+)$/.exec(t.drawType)?.[1] ?? lines);

/** Ratings, field pools and the events still to play (everything that doesn't change between runs). */
export function prepareSimulation(season: Season, files: Record<string, MatchRecord[]>, draws: Record<string, DrawFile>): Simulation {
  const ratings = buildRatings(season, files);
  const field = buildField(season, files, ratings.rating);
  const byWta = new Map(season.players.flatMap((p) => (p.wtaId === undefined ? [] : [[p.wtaId, p] as const])));
  const rank = (id: number) => ratings.latestRank.get(id) ?? Number.POSITIVE_INFINITY;
  const rating = (id: number) => ratings.rating.get(id) ?? field.value['WTA 500'];
  const events = season.tournaments
    .filter((t) => t.status !== 'completed' && t.drawType !== 'united-cup' && !t.id.startsWith('zp-'))
    .flatMap((t): Event[] => {
      const table = pointsTable(season.rules, t.drawType);
      const lines = 2 ** (table.length - 1);
      const draw = draws[t.id];
      const real = draw ? buildBracket(draw) : null;
      if (real && real.size === lines) return [{ t, table, real, lines, drawSize: draw!.drawSize, entrants: [] }];
      if (t.status === 'in-progress') return []; // no readable draw: alive players keep the round they're in
      const entrants = season.players
        .filter((p) => p.wtaId !== undefined && t.entries?.includes(p.id))
        .map((p) => p.wtaId!)
        .sort((a, b) => rank(a) - rank(b) || rating(b) - rating(a));
      return [{ t, table, real: null, lines, drawSize: drawSizeOf(t, lines), entrants }];
    });
  return { ratings, field, byWta, events };
}

/** One simulated finish to the season: a pick for every tracked player at every event still to play, and the byes it handed out. */
export function simulateRun(sim: Simulation, season: Season, rng: Rng): { scenario: Scenario; tournaments: Tournament[] } {
  const scenario: Record<string, string> = {};
  const byes = new Map<string, string[]>();
  for (const e of sim.events) {
    const level = levelOf(e.t.category);
    let bracket = e.real;
    let field = new Map<number, number>();
    if (!bracket) {
      const d = randomDraw(e.lines, e.drawSize, e.entrants, () => sampleField(sim.field, level, rng), rng);
      bracket = d.bracket;
      field = d.field;
      byes.set(e.t.id, d.byes.map((id) => sim.byWta.get(id)!.id));
    }
    const ratingOf = (id: number) => field.get(id) ?? sim.ratings.rating.get(id) ?? sim.field.value[level];
    for (const [id, round] of simulateBracket(bracket, ratingOf, rng)) {
      const p = sim.byWta.get(id);
      if (p) scenario[pickKey(p.id, e.t.id)] = e.table[round - 1]!.round;
    }
  }
  const tournaments = byes.size ? season.tournaments.map((t) => (byes.has(t.id) ? { ...t, byes: byes.get(t.id)! } : t)) : season.tournaments;
  return { scenario, tournaments };
}

/** Each tracked player's share of simulated finishes in which she qualifies. */
export function simulateChances(
  season: Season,
  files: Record<string, MatchRecord[]>,
  draws: Record<string, DrawFile>,
  { runs, seed }: { runs: number; seed: number },
): Record<string, number> {
  const sim = prepareSimulation(season, files, draws);
  const rng = mulberry32(seed);
  const hits = new Map(season.players.map((p) => [p.id, 0]));
  for (let i = 0; i < runs; i++) {
    const { scenario, tournaments } = simulateRun(sim, season, rng);
    for (const row of projectStandings(season.players, scenario, tournaments, season.rules)) {
      if (row.projectedQualifier !== null) hits.set(row.playerId, hits.get(row.playerId)! + 1);
    }
  }
  return Object.fromEntries([...hits].map(([id, n]) => [id, n / runs]));
}
