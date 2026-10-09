import { parseOrThrow, type RoundPoints, type Season, type SeasonInput } from '../data/schema';

// SYNTHETIC TEST DATA. These rules, points and players are invented so the
// arithmetic in tests is easy to follow. They are NOT real WTA values.

const d32: RoundPoints[] = [
  { round: 'R32', label: 'Round of 32', points: 1 },
  { round: 'R16', label: 'Round of 16', points: 5 },
  { round: 'QF', label: 'Quarterfinal', points: 10 },
  { round: 'SF', label: 'Semifinal', points: 20 },
  { round: 'F', label: 'Final', points: 40 },
  { round: 'W', label: 'Winner', points: 100 },
];

const gs128: RoundPoints[] = [
  { round: 'R128', label: 'Round of 128', points: 10 },
  { round: 'R64', label: 'Round of 64', points: 20 },
  { round: 'R32', label: 'Round of 32', points: 40 },
  { round: 'R16', label: 'Round of 16', points: 80 },
  { round: 'QF', label: 'Quarterfinal', points: 160 },
  { round: 'SF', label: 'Semifinal', points: 320 },
  { round: 'F', label: 'Final', points: 640 },
  { round: 'W', label: 'Winner', points: 1000 },
];

export function rawSeason(): SeasonInput {
  return {
    rules: {
      season: 2026,
      maxCountedResults: 4,
      requiredGroups: [
        { categories: ['GS'], count: 1 },
        { categories: ['WTA1000C'], count: 1 },
      ],
      excludedCategories: ['ITF'],
      pointsTables: { d32, gs128 },
      byeRule: 'points-of-previous-round',
      tiebreakers: [
        { kind: 'pointsIn', categories: ['GS', 'WTA1000C'] },
        { kind: 'highestIn', categories: ['GS', 'WTA1000C', 'WTA1000', 'WTA500', 'WTA250'] },
      ],
      qualification: {
        places: 2,
        championPlace: { categories: ['GS'], fromRank: 2, toRank: 3 },
        minEvents: { count: 2, categories: ['WTA1000C', 'WTA1000', 'WTA500'] },
      },
      trackedPlayerCount: 3,
    },
    tournaments: [
      { id: 'slam', name: 'Slam Open', category: 'GS', drawType: 'gs128', startDate: '2026-01-12', endDate: '2026-01-25', status: 'completed', byes: [] },
      { id: 'm1000', name: 'Mandatory 1000', category: 'WTA1000C', drawType: 'd32', startDate: '2026-03-02', endDate: '2026-03-08', status: 'completed', byes: [] },
      { id: 'c500', name: 'City 500', category: 'WTA500', drawType: 'd32', startDate: '2026-04-06', endDate: '2026-04-12', status: 'completed', byes: [] },
      { id: 'c250', name: 'Town 250', category: 'WTA250', drawType: 'd32', startDate: '2026-05-04', endDate: '2026-05-10', status: 'completed', byes: [] },
      { id: 'live', name: 'Live Masters', category: 'WTA1000', drawType: 'd32', startDate: '2026-10-05', endDate: '2026-10-12', status: 'in-progress', byes: [] },
      { id: 'next', name: 'Next Open', category: 'WTA500', drawType: 'd32', startDate: '2026-10-12', endDate: '2026-10-18', status: 'upcoming', byes: ['ana'] },
      { id: 'clash', name: 'Clash Cup', category: 'WTA250', drawType: 'd32', startDate: '2026-10-14', endDate: '2026-10-20', status: 'upcoming', byes: [] },
    ],
    players: [
      {
        // Required: slam 1000 + m1000 20. Optional best 2 of (100, 40, 10) = 140. Total 1160.
        id: 'ana', name: 'Ana Alpha', country: 'ES', officialRaceTotal: 1160, qualified: true,
        results: [
          { tournamentId: 'slam', round: 'W', points: 1000 },
          { tournamentId: 'm1000', round: 'SF', points: 20 },
          { tournamentId: 'c500', round: 'W', points: 100 },
          { tournamentId: 'c250', round: 'F', points: 40 },
          { tournamentId: 'live', round: 'QF', points: 10 },
        ],
        live: [{ tournamentId: 'live', state: 'alive', round: 'QF' }],
      },
      {
        // 640 + 100 + 20 + 5 = 765 (exactly 4 results, all count).
        id: 'bea', name: 'Bea Beta', country: 'US', officialRaceTotal: 765, qualified: false,
        results: [
          { tournamentId: 'slam', round: 'F', points: 640 },
          { tournamentId: 'm1000', round: 'W', points: 100 },
          { tournamentId: 'c500', round: 'SF', points: 20 },
          { tournamentId: 'live', round: 'R16', points: 5 },
        ],
        live: [{ tournamentId: 'live', state: 'eliminated', round: 'R16' }],
      },
      {
        // Zero-pointer at the slam. 0 + 40 + 100 = 140. Not in the live draw.
        id: 'cat', name: 'Cat Gamma', country: 'PL', officialRaceTotal: 140, qualified: false,
        results: [
          { tournamentId: 'slam', round: 'ZP', points: 0 },
          { tournamentId: 'm1000', round: 'F', points: 40 },
          { tournamentId: 'c250', round: 'W', points: 100 },
        ],
        live: [],
      },
    ],
    meta: { lastUpdated: '2026-10-07T12:00:00Z' },
  };
}

export const season = parseOrThrow(rawSeason());

/**
 * xen (970) can only be passed by ana and bea (950 each), and each needs to reach the final of the
 * in-progress `live` event (F = 980, W = 1040). Two places, no champion place, no other remaining
 * events, and a 0-point tracked player so nobody outside the list can get close.
 */
export function bracketSeason(anaPosition: number, beaPosition: number, xenQualifyingPoints = 130, caraPosition?: number): Season {
  const raw: SeasonInput = rawSeason();
  raw.rules.maxCountedResults = 10;
  raw.rules.trackedPlayerCount = caraPosition === undefined ? 4 : 5;
  raw.rules.qualification = { places: 2, championPlace: null, minEvents: null };
  raw.tournaments = raw.tournaments
    .filter((t) => t.status !== 'upcoming')
    .map((t) => (t.id === 'live' ? { ...t, drawSize: 32 } : t));
  const contender = (id: string, name: string, drawPosition: number) => ({
    id, name, country: 'US', officialRaceTotal: 0,
    results: [
      { tournamentId: 'slam', round: 'F', points: 640 },
      { tournamentId: 'm1000', round: 'W', points: 100 },
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'c250', round: 'W', points: 100 },
      { tournamentId: 'live', round: 'QF', points: 10 },
    ],
    live: [{ tournamentId: 'live', state: 'alive' as const, round: 'QF', drawPosition }],
  });
  raw.players = [
    {
      id: 'xen', name: 'Xen Xi', country: 'US', officialRaceTotal: 0,
      results: [
        { tournamentId: 'slam', round: 'F', points: 640 },
        { tournamentId: 'm1000', round: 'W', points: 100 },
        { tournamentId: 'c500', round: 'W', points: 100 },
        { tournamentId: 'c250', round: 'Q', points: xenQualifyingPoints },
      ],
    },
    contender('ana', 'Ana Alpha', anaPosition),
    contender('bea', 'Bea Beta', beaPosition),
    ...(caraPosition === undefined ? [] : [contender('cara', 'Cara Gamma', caraPosition)]),
    { id: 'low', name: 'Low Lima', country: 'US', officialRaceTotal: 0, results: [] },
  ];
  return parseOrThrow(raw);
}
