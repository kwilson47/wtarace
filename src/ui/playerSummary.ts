import type { Season } from '../data/schema';
import { officialRace } from '../engine/countRace';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { splitPickKey, type Scenario } from '../engine/types';
import { encodeScenario } from '../scenario/url';
import { formatPoints } from './format';

/** The homepage with these picks loaded; "as things stand" is the plain homepage. */
export function scenarioLink(scenario: Scenario): string {
  const encoded = encodeScenario(scenario);
  return encoded ? `/?s=${encoded}` : '/';
}

const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** "wins Wuhan, Ningbo and Tokyo" / "wins Ningbo and reaches the Tokyo final". */
export function routePhrase(route: Scenario, season: Season): string {
  const picks = Object.entries(route)
    .map(([key, round]) => ({ round, t: season.tournaments.find((t) => t.id === splitPickKey(key).tournamentId)! }))
    .sort((a, b) => a.t.startDate.localeCompare(b.t.startDate));
  const titles = picks.filter((p) => p.round === 'W').map((p) => p.t.name);
  const others = picks
    .filter((p) => p.round !== 'W')
    .map(({ round, t }) => {
      if (round === 'F') return `reaches the ${t.name} final`;
      if (round === 'SF') return `reaches the ${t.name} semifinals`;
      if (round === 'QF') return `reaches the ${t.name} quarterfinals`;
      const label = pointsTable(season.rules, t.drawType).find((r) => r.round === round)?.label ?? round;
      return `reaches the ${label} at ${t.name}`;
    });
  return list([...(titles.length ? [`wins ${list(titles)}`] : []), ...others]);
}

/** One or two sentences for the page description and link previews. */
export function playerSummary(season: Season, playerId: string, rank: number, outlook: Outlook): string {
  const player = season.players.find((p) => p.id === playerId)!;
  const total = officialRace(player.results, season.tournaments, season.rules).total;
  const standing = `${player.name} is #${rank} in the ${season.rules.season} Race to the WTA Finals with ${formatPoints(total)} points.`;
  const status =
    player.qualified || outlook.status === 'qualified' ? 'She has qualified for the WTA Finals.'
    : outlook.status === 'out' ? 'She can no longer qualify.'
    : outlook.guaranteedRoute ? `She's certain to qualify if she ${routePhrase(outlook.guaranteedRoute, season)}.`
    : outlook.eventsLeft ? 'She needs other results to go her way to qualify.'
    : 'She has no events left, so it depends on other players.';
  return `${standing} ${status}`;
}
