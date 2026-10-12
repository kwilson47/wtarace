import type { Player, Rules, Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace } from './countRace';
import { playable, remainingWeeks } from './elimination';
import { pickOptions } from './picks';
import { compareEntries, type RankEntry } from './standings';
import { pickKey, type Scenario } from './types';

/**
 * True when every way a rival could finish exactly level with `own` ranks below her on the tiebreaks. Rivals'
 * finishes are every round at every event they can still play, one event a week (more than can happen together,
 * so "true" is certain). `ownTournaments` must include any events `own` refers to.
 */
export function winsEveryTie(own: RankEntry, ownTournaments: Tournament[], rivals: Player[], tournaments: Tournament[], rules: Rules): boolean {
  const target = own.race.total;
  const weeks = remainingWeeks(tournaments);
  for (const p of rivals) {
    const options = playable(p, weeks, rules);
    let beaten = false;
    const visit = (week: number, scenario: Scenario) => {
      if (beaten) return;
      if (week === options.length) {
        const race = countRace(applyScenario(p, scenario, tournaments, rules), tournaments, rules);
        if (race.total === target && compareEntries(own, { id: p.id, race }, ownTournaments, rules) > 0) beaten = true;
        return;
      }
      visit(week + 1, scenario);
      for (const t of options[week]!) {
        const options = pickOptions(p, t, rules);
        if (options.kind === 'open') for (const r of options.rounds) visit(week + 1, { ...scenario, [pickKey(p.id, t.id)]: r.round });
      }
    };
    visit(0, {});
    if (beaten) return false;
  }
  return true;
}
