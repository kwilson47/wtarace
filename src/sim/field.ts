import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';
import type { Rng } from './random';
import { LEVELS, median, type Level } from './ratings';

export interface Field {
  /** Ratings to draw field players from, per level. */
  pools: Record<Level, number[]>;
  /** The typical field player per level (the pool median): for unrated players in real draws. */
  value: Record<Level, number>;
}

export function levelOf(category: string): Level {
  if (category === 'WTA1000' || category === 'WTA1000C') return 'WTA 1000';
  if (category === 'WTA250') return 'WTA 250';
  return 'WTA 500';
}

/** The ratings of the untracked players our players met in main draws, per level; levels are combined if any has fewer than `minPool`. */
export function buildField(season: Season, files: Record<string, MatchRecord[]>, rating: ReadonlyMap<number, number>, minPool = 20): Field {
  const tracked = new Set(season.players.flatMap((p) => (p.wtaId === undefined ? [] : [p.wtaId])));
  const ids = Object.fromEntries(LEVELS.map((l) => [l, new Set<number>()])) as Record<Level, Set<number>>;
  for (const p of season.players) {
    for (const m of files[p.id] ?? []) {
      const id = m.opponent.id;
      if (id === null || m.qualifying || m.team || tracked.has(id) || !(LEVELS as readonly string[]).includes(m.level)) continue;
      ids[m.level as Level].add(id);
    }
  }
  let pools = Object.fromEntries(LEVELS.map((l) => [l, [...ids[l]].flatMap((id) => (rating.has(id) ? [rating.get(id)!] : []))])) as Record<Level, number[]>;
  if (LEVELS.some((l) => pools[l].length < minPool)) {
    const all = LEVELS.flatMap((l) => pools[l]);
    pools = Object.fromEntries(LEVELS.map((l) => [l, all])) as Record<Level, number[]>;
  }
  return { pools, value: Object.fromEntries(LEVELS.map((l) => [l, median(pools[l])])) as Record<Level, number> };
}

export function sampleField(field: Field, level: Level, rng: Rng): number {
  const pool = field.pools[level];
  return pool.length ? pool[Math.floor(rng() * pool.length)]! : field.value[level];
}
