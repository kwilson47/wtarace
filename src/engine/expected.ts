import { ZERO_POINTER_ROUND, type Player, type Result, type Tournament } from '../data/schema';

const COMMITMENT_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];

const injuredDuring = (p: Player, t: Tournament) =>
  p.longTermInjury !== undefined && p.longTermInjury.from <= t.startDate && (p.longTermInjury.to === undefined || t.startDate <= p.longTermInjury.to);

/**
 * Zero-pointers she's about to get: events under way (or finished but not yet credited) that she was committed to,
 * and isn't playing. Grand Slams always count; WTA 1000s not during a Long-Term Injury (R §II.A, §VIII.A.4.a.ii).
 */
export function expectedZeroPointers(player: Player, tournaments: Tournament[]): Result[] {
  return tournaments
    .filter(
      (t) =>
        t.status === 'in-progress' &&
        COMMITMENT_CATEGORIES.includes(t.category) &&
        t.commitment?.ranks[player.id] !== undefined &&
        !player.live.some((l) => l.tournamentId === t.id) &&
        !player.results.some((r) => r.tournamentId === t.id) &&
        !(t.category !== 'GS' && injuredDuring(player, t)),
    )
    .map((t) => ({ tournamentId: t.id, round: ZERO_POINTER_ROUND, points: 0 }));
}
