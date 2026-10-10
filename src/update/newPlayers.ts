import { parseOrThrow, type Result } from '../data/schema';
import { officialRace } from '../engine/countRace';
import type { PlayerMatch } from './feedTypes';
import { newcomers } from './newcomers';
import { TOP, yearOf, type Ctx, type RawTournament } from './shared';

/** IOC codes the WTA displays → ISO 3166-1 alpha-2 (RUS/BLR are shown for players without a flag). */
export const IOC_TO_ISO: Record<string, string> = {
  AND: 'AD', ARG: 'AR', ARM: 'AM', AUS: 'AU', AUT: 'AT', BEL: 'BE', BIH: 'BA', BLR: 'BY', BRA: 'BR', BUL: 'BG', CAN: 'CA',
  CHN: 'CN', COL: 'CO', CRO: 'HR', CZE: 'CZ', DEN: 'DK', EGY: 'EG', ESP: 'ES', EST: 'EE', FIN: 'FI', FRA: 'FR', GBR: 'GB',
  GEO: 'GE', GER: 'DE', GRE: 'GR', HKG: 'HK', HUN: 'HU', INA: 'ID', IND: 'IN', IRL: 'IE', ISR: 'IL', ITA: 'IT', JPN: 'JP',
  KAZ: 'KZ', KOR: 'KR', LAT: 'LV', LTU: 'LT', LUX: 'LU', MEX: 'MX', MNE: 'ME', NED: 'NL', NOR: 'NO', NZL: 'NZ', PHI: 'PH',
  POL: 'PL', POR: 'PT', ROU: 'RO', RUS: 'RU', SLO: 'SI', SRB: 'RS', SUI: 'CH', SVK: 'SK', SWE: 'SE', THA: 'TH', TPE: 'TW',
  TUN: 'TN', TUR: 'TR', UKR: 'UA', USA: 'US', UZB: 'UZ',
};
const MAIN_ROUNDS: Record<string, string> = { R128: 'R128', R64: 'R64', R32: 'R32', R16: 'R16', Q: 'QF', S: 'SF', F: 'F' };
const NEXT_ROUND: Record<string, string> = { R128: 'R64', R64: 'R32', R32: 'R16', R16: 'QF', QF: 'SF', SF: 'F', F: 'W' };
const SKIPPED_LEVELS = new Set(['ITF', 'WTA 125', 'Finals']);
const LEVEL_CATEGORY: Record<string, string> = { 'WTA 500': 'WTA500', 'WTA 250': 'WTA250' };
const REQUIRED_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());

/** Draw types by level and draw size (data/SOURCES.md), falling back to the season's 32-draw table. */
function drawTypeFor(ctx: Ctx, level: string, size: number): string | undefined {
  const tables = ctx.raw.rules.pointsTables;
  const wanted =
    level === 'WTA 500' ? (size === 48 ? 'wta500-48' : size === 28 || size === 30 ? 'wta500-28' : undefined)
    : level === 'WTA 250' && [0, 28, 30, 32].includes(size) ? 'wta250-32'
    : undefined;
  if (!wanted) return undefined;
  if (tables[wanted]) return wanted;
  return Object.keys(tables).find((k) => tables[k]![0]!.round === 'R32' && tables[k]!.length === 6);
}

interface Built { results: Result[]; created: RawTournament[]; problems: string[] }

/** Her race-year results from her match feed, using the conventions in data/SOURCES.md. */
export function buildResults(ctx: Ctx, wtaId: number, feed: PlayerMatch[]): Built {
  const real = ctx.raw.tournaments.filter((t) => t.wtaId !== undefined);
  const start = real.map((t) => t.startDate).sort()[0]!;
  const end = real.map((t) => t.endDate).sort().at(-1)!;
  const groups = new Map<string, PlayerMatch[]>();
  for (const m of feed) {
    const key = `${m.tourn_nbr.trim()}-${m.tourn_year}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const built: Built = { results: [], created: [], problems: [] };
  const side = (m: PlayerMatch) => (m.player_1.trim() === String(wtaId) ? 1 : 2);
  for (const ms of groups.values()) {
    const first = ms[0]!;
    const level = first.tournament?.level ?? first.TournamentLevel ?? '';
    const startDate = first.tournament?.startDate ?? first.StartDate.slice(0, 10);
    if (SKIPPED_LEVELS.has(level) || startDate < start || startDate > end) continue;
    const id = Number(first.tourn_nbr.trim());
    const year = Number(first.tourn_year);
    let t = [...ctx.raw.tournaments, ...built.created].find((x) => x.wtaId === id && yearOf(x) === year);
    if (!t) {
      const info = first.tournament;
      const category = LEVEL_CATEGORY[level];
      const drawType = info ? drawTypeFor(ctx, level, info.singlesDrawSize) : undefined;
      if (!info || !category || !drawType) {
        built.problems.push(`played ${first.TournamentName.trim()} (${level || 'unknown level'}), which isn't tracked and can't be added automatically.`);
        continue;
      }
      t = { id: `${slug(info.city)}-${year}`, wtaId: id, name: titleCase(info.city), category, drawType, startDate: info.startDate, endDate: info.endDate, status: 'completed', byes: [] };
      built.created.push(t);
    }
    if (t.status !== 'completed') continue; // events under way are handled by the events stage
    const points = Math.max(...ms.map((m) => (side(m) === 1 ? m.points_champ_1 : m.points_champ_2) ?? -1));
    if (points < 0) {
      built.problems.push(`no race points published for ${t.name}.`);
      continue;
    }
    const table = ctx.raw.rules.pointsTables[t.drawType]!;
    let round: string | undefined;
    if (t.drawType === 'united-cup') {
      round = table.find((r) => r.points === points)?.round;
    } else {
      const main = ms.filter((m) => m.qpm_flag === 'M');
      const pool = main.length ? main : ms.filter((m) => m.qpm_flag === 'Q');
      const last = pool.reduce((a, b) => (Number(b.tourn_round) > Number(a.tourn_round) ? b : a));
      const won = String(last.winner) === String(side(last));
      if (main.length) {
        const reached = MAIN_ROUNDS[last.round_name.trim()];
        round = reached && (won ? NEXT_ROUND[reached] : reached);
      } else {
        round = won ? 'Q' : `Q${last.tourn_round.trim()}`;
      }
    }
    if (!round) {
      built.problems.push(`couldn't work out her round at ${t.name}.`);
      continue;
    }
    built.results.push({ tournamentId: t.id, round, points });
  }
  const order = (id: string) => [...ctx.raw.tournaments, ...built.created].find((t) => t.id === id)!.startDate;
  built.results.sort((a, b) => order(a.tournamentId).localeCompare(order(b.tournamentId)));
  return built;
}

/** Inserts tournaments in date order, after any placeholders that share a position. */
export function insertTournaments(list: RawTournament[], created: RawTournament[]): RawTournament[] {
  const out = [...list];
  for (const t of created) {
    const at = out.findIndex((x) => !x.id.startsWith('zp-') && x.startDate > t.startDate);
    out.splice(at < 0 ? out.length : at, 0, t);
  }
  return out;
}

/** Zero-pointer attributions of `missing` events that would reproduce `official`. */
export function candidates(ctx: Ctx, results: Result[], official: number, missing: number): string[] {
  const season = parseOrThrow(ctx.raw);
  const free = season.tournaments.filter(
    (t) => t.status === 'completed' && (REQUIRED_CATEGORIES.includes(t.category) || t.id.startsWith('zp-')) && !results.some((r) => r.tournamentId === t.id),
  );
  const found: string[] = [];
  const visit = (from: number, chosen: typeof free) => {
    if (found.length >= 8) return;
    if (chosen.length === missing) {
      const zeros = chosen.map((t) => ({ tournamentId: t.id, round: 'ZP', points: 0 }));
      if (officialRace([...results, ...zeros], season.tournaments, season.rules).total === official) found.push(chosen.map((t) => t.name).join(' + '));
      return;
    }
    for (let i = from; i < free.length; i++) visit(i + 1, [...chosen, free[i]!]);
  };
  if (missing >= 1 && missing <= 3) visit(0, []);
  return found;
}

/**
 * Adds every player in the race's top 40 we don't track yet, counting points from events under way, when her
 * whole season reproduces exactly. Players are never removed during a season.
 */
export function addNewPlayers(ctx: Ctx): void {
  for (const row of newcomers(ctx.raw, ctx.snap)) {
    // Someone in only the live top 40 is added once her season reproduces; until then she's a note, not a block.
    const report = (problem: string): void => {
      if (row.ranking > TOP) ctx.notes.push(`Not tracked yet (live top ${TOP} only): ${problem}`);
      else ctx.problems.push(problem);
    };
    const name = row.player.fullName;
    const feed = ctx.snap.playerMatches[String(row.player.id)];
    const country = IOC_TO_ISO[row.player.countryCode];
    if (!feed) {
      report(`${name} entered the top ${TOP}, but her match feed wasn't fetched.`);
      continue;
    }
    if (!country) {
      report(`${name}: country code ${row.player.countryCode} isn't in the IOC→ISO table (src/update/newPlayers.ts).`);
      continue;
    }
    const built = buildResults(ctx, row.player.id, feed);
    if (built.problems.length) {
      built.problems.forEach((p) => report(`${name}: ${p}`));
      continue;
    }
    const tournaments = insertTournaments(ctx.raw.tournaments, built.created);
    const season = parseOrThrow({ ...ctx.raw, tournaments });
    const total = officialRace(built.results, season.tournaments, season.rules).total;
    if (total !== row.points || built.results.length !== row.tournamentsPlayed) {
      const fits = built.results.length < row.tournamentsPlayed
        ? candidates({ ...ctx, raw: { ...ctx.raw, tournaments } }, built.results, row.points, row.tournamentsPlayed - built.results.length)
        : [];
      report(
        `${name}: her results add up to ${total} from ${built.results.length} events, but the WTA shows ${row.points} from ${row.tournamentsPlayed}.` +
          (fits.length ? ` Zero-pointers that would fit (each needs a source, see data/SOURCES.md): ${fits.join('; ')}.` : ''),
      );
      continue;
    }
    let id = slug(name);
    while (ctx.raw.players.some((p) => p.id === id)) id += '-2';
    ctx.raw.tournaments = tournaments;
    for (const t of built.created) ctx.changes.push(`New tournament: ${t.name} ${yearOf(t)} (${t.category})`);
    ctx.raw.players.push({ id, wtaId: row.player.id, name, country, officialRaceTotal: row.points, results: built.results, live: [] });
    ctx.raw.rules.trackedPlayerCount = ctx.raw.players.length;
    ctx.changes.push(`New player: ${name} (race #${row.ranking}, ${row.points} points${row.ranking > TOP ? `; ${row.live} with the event under way` : ''})`);
  }
}
