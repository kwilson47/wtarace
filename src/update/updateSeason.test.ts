import { describe, expect, it } from 'vitest';
import { drawFeed, drawList, liveMatches, match, playerMatch, raceRows, snapshot, TOURNAMENT_IDS, updaterSeason } from './testFeeds';
import { playerFeedsNeeded, updateSeason } from './updateSeason';

describe('updateSeason: totals', () => {
  it('takes official totals from the race ranking feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { cat: 141 });
    const result = updateSeason(raw, snap);
    expect(result.raw.players.find((p) => p.id === 'cat')!.officialRaceTotal).toBe(141);
    expect(result.changes).toContain('Race total: Cat Gamma 140 → 141');
  });

  it('reports a total that no longer reproduces, instead of publishing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { bea: 800 });
    expect(updateSeason(raw, snap).problems).toContain('Bea Beta (bea): engine total 765 ≠ official 800');
  });

  it('reports a tracked player missing from the race feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = snap.race.filter((r) => r.player.id !== 3);
    expect(updateSeason(raw, snap).problems).toContain('Cat Gamma is tracked but missing from the race ranking feed.');
  });

  it('never changes the input it was given', () => {
    const raw = updaterSeason();
    const copy = structuredClone(raw);
    updateSeason(raw, snapshot(raw));
    expect(raw).toEqual(copy);
  });
});

const player = (raw: ReturnType<typeof updaterSeason>, id: string) => raw.players.find((p) => p.id === id)!;
const liveOf = (raw: ReturnType<typeof updaterSeason>, id: string, t: string) => player(raw, id).live?.find((l) => l.tournamentId === t);

describe('updateSeason: events in progress', () => {
  it('records the draw size and each alive player position', () => {
    const result = updateSeason(updaterSeason(), snapshot());
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.drawSize).toBe(32);
    expect(liveOf(result.raw, 'ana', 'live')).toEqual({ tournamentId: 'live', state: 'alive', round: 'QF', drawPosition: 1 });
    expect(liveOf(result.raw, 'bea', 'live')).toEqual({ tournamentId: 'live', state: 'eliminated', round: 'R16' });
  });

  it('moves a winner on and keeps credited points', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1)]);
    const result = updateSeason(raw, snap);
    expect(liveOf(result.raw, 'ana', 'live')).toMatchObject({ state: 'alive', round: 'SF' });
    expect(player(result.raw, 'ana').results.find((r) => r.tournamentId === 'live')).toEqual({ tournamentId: 'live', round: 'SF', points: 10 });
    expect(result.changes).toContain('Live Masters: Ana Alpha alive in SF');
  });

  it('marks a loser out, without a draw position', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 105)]);
    const result = updateSeason(raw, snap);
    expect(liveOf(result.raw, 'ana', 'live')).toEqual({ tournamentId: 'live', state: 'eliminated', round: 'QF' });
    expect(result.changes).toContain('Live Masters: Ana Alpha out in QF');
  });

  it('starts an event: status, byes, draw, live rounds and 0-point results', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.calendar.find((c) => c.tournamentGroup.id === TOURNAMENT_IDS.next)!.status = 'live';
    // A 28 draw: byes at 1, 8, 21 and 28; ana (1) has one, cat (5) plays and wins her first round.
    snap.eventPlayers[TOURNAMENT_IDS.next!] = { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(28, { 1: 1, 5: 3 }) }] };
    const playing = [...Array(28).keys()].map((i) => i + 1).filter((p) => ![1, 8, 21, 28].includes(p));
    const id = (p: number) => (p === 1 ? 1 : p === 5 ? 3 : 100 + p);
    snap.eventMatches[TOURNAMENT_IDS.next!] = Array.from({ length: 12 }, (_, i) => {
      const a = id(playing[2 * i]!);
      const b = id(playing[2 * i + 1]!);
      return match(1, a, b, b === 3 ? 3 : a);
    });
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    const next = result.raw.tournaments.find((t) => t.id === 'next')!;
    expect(next).toMatchObject({ status: 'in-progress', drawSize: 28, byes: ['ana'] });
    expect(next.entries).toBeUndefined();
    expect(liveOf(result.raw, 'ana', 'next')).toEqual({ tournamentId: 'next', state: 'alive', round: 'R16', drawPosition: 1 });
    expect(liveOf(result.raw, 'cat', 'next')).toEqual({ tournamentId: 'next', state: 'alive', round: 'R16', drawPosition: 5 });
    expect(player(result.raw, 'cat').results.find((r) => r.tournamentId === 'next')).toEqual({ tournamentId: 'next', round: 'R16', points: 0 });
  });

  it('reports an in-progress event whose draw is missing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = [];
    expect(updateSeason(raw, snap).problems).toContain("Live Masters is in progress but its draw isn't in the feeds.");
  });
});

describe('updateSeason: entry lists', () => {
  it('records tracked players on an upcoming entry list', () => {
    const result = updateSeason(updaterSeason(), snapshot());
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.entries).toEqual(['ana', 'cat']);
    expect(result.changes).toContain('Next Open entries: +Ana Alpha, +Cat Gamma');
  });

  it('keeps the previous list when the feed empties or more than halves', () => {
    const raw = updaterSeason();
    raw.tournaments.find((t) => t.id === 'next')!.entries = ['ana', 'bea', 'cat'];
    const snap = snapshot(raw);
    snap.eventPlayers[TOURNAMENT_IDS.next!] = { events: [{ eventTypeCode: 'RS', eventPlayers: drawList(4, {}) }] };
    const result = updateSeason(raw, snap);
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.entries).toEqual(['ana', 'bea', 'cat']);
    expect(result.notes).toContain('Next Open: the entry list came back with 0 of our 3 entrants, so the previous list was kept.');
  });
});

describe('updateSeason: a finished event', () => {
  const finalPlayed = () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1), match('S', 1, 111, 1), match('F', 1, 117, 1)]);
    return { raw, snap };
  };

  it('waits while the WTA has not credited it: still in progress, the champion alive in W', () => {
    const { raw, snap } = finalPlayed();
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.status).toBe('in-progress');
    expect(liveOf(result.raw, 'ana', 'live')).toMatchObject({ state: 'alive', round: 'W' });
    expect(result.notes).toContain('Live Masters: finished; waiting for the WTA to credit its points.');
  });

  it('credits it once the official totals include it, leaving every other stored result alone', () => {
    const { raw, snap } = finalPlayed();
    snap.race = raceRows(raw, { ana: 1220 });
    snap.playerMatches = {
      '1': [playerMatch({ tourn_nbr: ' 905', player_1: '1', points_champ_1: 100 })],
      '2': [playerMatch({ tourn_nbr: '905', player_1: '2', points_champ_1: 5 })],
    };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.status).toBe('completed');
    expect(player(result.raw, 'ana').results.find((r) => r.tournamentId === 'live')).toEqual({ tournamentId: 'live', round: 'W', points: 100 });
    expect(player(result.raw, 'ana').live).toEqual([]);
    for (const id of ['ana', 'bea', 'cat']) {
      const completed = (rs: { tournamentId: string }[]) => rs.filter((r) => r.tournamentId !== 'live' && r.tournamentId !== 'next');
      expect(completed(player(result.raw, id).results)).toEqual(completed(player(raw, id).results));
    }
    expect(result.changes).toContain('Live Masters: points credited, event completed');
  });
});

describe('updateSeason: a new player in the top 40', () => {
  const withDee = (played: number) => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race.push({ ranking: 4, points: 101, tournamentsPlayed: played, player: { id: 4, fullName: 'Dee Delta', countryCode: 'FRA' } });
    snap.playerMatches['4'] = [
      playerMatch({ tourn_nbr: '903', player_1: '4', round_name: 'R32', tourn_round: '1', winner: 2, points_champ_1: 1, StartDate: '2026-04-06T00:00:00+00:00' }),
      playerMatch({
        tourn_nbr: '908', player_1: '4', round_name: 'F', tourn_round: '5', winner: 1, points_champ_1: 100, StartDate: '2026-06-01T00:00:00+00:00',
        tournament: { tournamentGroup: { id: 908, name: 'NEWTOWN' }, year: 2026, title: 'Newtown Open - Newtown', city: 'NEWTOWN', level: 'WTA 250', startDate: '2026-06-01', endDate: '2026-06-07', singlesDrawSize: 32 },
      }),
    ];
    return { raw, snap };
  };

  it('adds her season, and any event we did not track, when her total and event count reproduce', () => {
    const { raw, snap } = withDee(2);
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    const dee = player(result.raw, 'dee-delta');
    expect(dee).toMatchObject({ wtaId: 4, name: 'Dee Delta', country: 'FR', officialRaceTotal: 101 });
    expect(dee.results).toEqual([
      { tournamentId: 'c500', round: 'R32', points: 1 },
      { tournamentId: 'newtown-2026', round: 'W', points: 100 },
    ]);
    expect(result.raw.tournaments.find((t) => t.id === 'newtown-2026')).toMatchObject({
      wtaId: 908, name: 'Newtown', category: 'WTA250', drawType: 'd32', startDate: '2026-06-01', endDate: '2026-06-07', status: 'completed', byes: [],
    });
    expect(result.raw.rules.trackedPlayerCount).toBe(4);
    expect(result.changes).toContain('New player: Dee Delta (race #4, 101 points)');
  });

  it('stops with the likely zero-pointers when her event count does not reproduce', () => {
    const { raw, snap } = withDee(3);
    const result = updateSeason(raw, snap);
    expect(result.raw.players.some((p) => p.wtaId === 4)).toBe(false);
    expect(result.problems[0]).toContain('Dee Delta: her results add up to 101 from 2 events, but the WTA shows 101 from 3.');
    expect(result.problems[0]).toContain('Slam Open');
  });
});

describe('playerFeedsNeeded', () => {
  it('asks for new top-40 players and for players at a finished event', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    expect(playerFeedsNeeded(raw, snap)).toEqual([]);
    snap.race.push({ ranking: 4, points: 1, tournamentsPlayed: 1, player: { id: 4, fullName: 'Dee Delta', countryCode: 'FRA' } });
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1), match('S', 1, 111, 1), match('F', 1, 117, 1)]);
    expect(playerFeedsNeeded(raw, snap).sort()).toEqual([1, 2, 4]);
  });
});

describe('updateSeason: review fixes', () => {
  it('adds a new player whose points came from an event credited in the same run', () => {
    // Dee (untracked) reached the Live Masters final; the WTA has now credited the event (ana won it).
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1), match('S', 1, 111, 1), match('F', 1, 4, 1)]);
    snap.race = raceRows(raw, { ana: 1220 });
    snap.race.push({ ranking: 4, points: 41, tournamentsPlayed: 2, player: { id: 4, fullName: 'Dee Delta', countryCode: 'FRA' } });
    snap.playerMatches = {
      '1': [playerMatch({ tourn_nbr: '905', player_1: '1', points_champ_1: 100 })],
      '2': [playerMatch({ tourn_nbr: '905', player_1: '2', points_champ_1: 5 })],
      '4': [
        playerMatch({ tourn_nbr: '903', player_1: '4', round_name: 'R32', winner: 2, points_champ_1: 1, StartDate: '2026-04-06T00:00:00+00:00' }),
        playerMatch({ tourn_nbr: '905', player_1: '4', round_name: 'F', tourn_round: '5', winner: 2, points_champ_1: 40, StartDate: '2026-10-05T00:00:00+00:00' }),
      ],
    };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(player(result.raw, 'dee-delta').results).toEqual([
      { tournamentId: 'c500', round: 'R32', points: 1 },
      { tournamentId: 'live', round: 'F', points: 40 },
    ]);
  });

  it('turns an internal error into a problem instead of throwing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('QX', 1, 105)]);
    const result = updateSeason(raw, snap);
    expect(result.problems.some((p) => p.startsWith('The updater hit an error'))).toBe(true);
  });

  it('flags a tracked player who has dropped out of a draw under way', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventPlayers[TOURNAMENT_IDS.live!] = { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(32, { 9: 2 }) }] };
    expect(updateSeason(raw, snap).problems).toContain("Live Masters: Ana Alpha has a result there but isn't in the draw any more.");
  });

  it('does not infer byes when the count does not fit the bracket', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    // ana withdrew and a lucky loser (777) took her first-round match; the players feed still lists ana.
    // The first round still has 16 matches, so only the bye count against the bracket can catch it.
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches().map((m) => (String(m.RoundID) === '1' && m.PlayerIDA === '1' ? { ...m, PlayerIDA: '777', Winner: '2' } : m));
    const result = updateSeason(raw, snap);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.byes).toEqual([]);
  });

  it('records a qualifying loss at an event under way, and counts qualifying entrants as entered', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    const q = (round: number, a: number, b: number, winner: number) => ({ ...match(round, a, b, winner), DrawLevelType: 'Q' });
    snap.eventMatches[TOURNAMENT_IDS.live!] = [...liveMatches(), q(1, 3, 501, 3), q(2, 3, 502, 502)];
    snap.eventPlayers[TOURNAMENT_IDS.next!] = { events: [{ eventTypeCode: 'RS', eventPlayers: drawList(2, { 1: 2 }) }, { eventTypeCode: 'LS', eventPlayers: drawList(1, { 1: 1 }) }] };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(player(result.raw, 'cat').results.find((r) => r.tournamentId === 'live')).toEqual({ tournamentId: 'live', round: 'Q2', points: 0 });
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.entries).toEqual(['ana', 'bea']);
  });
});

describe('updateSeason: draw sheets and live newcomers', () => {
  it("takes byes from the draw sheet before the first round is listed", () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    // Next Open (32 lines): bea seeded on line 31 with the bye on line 32; ana (who the fixture gives a bye) now plays.
    const lines: [number, string, string, string][] = Array.from({ length: 32 }, (_, i) => [200 + i, `Player ${200 + i}`, '', '']);
    lines[0] = [1, 'Ana Alpha', '', ''];
    lines[30] = [0, 'Bye', '', ''];
    lines[31] = [2, 'Bea Beta', '1', ''];
    snap.eventDraws = { [TOURNAMENT_IDS.next!]: drawFeed(lines) };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.byes).toEqual(['bea']);
  });

  it("notes, but doesn't block on, a player in only the live top 40 whose season doesn't reproduce", () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    // Player 105 (through to the live event's quarterfinals) is 50th in the race feed, but 9,000 + 10 puts her in the live top 40.
    snap.race.push({ ranking: 50, points: 9000, tournamentsPlayed: 5, player: { id: 105, fullName: 'Eve Echo', countryCode: 'FRA' } });
    snap.playerMatches['105'] = [];
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.players.some((p) => p.wtaId === 105)).toBe(false);
    expect(result.notes.join(' ')).toContain('Eve Echo');
  });
});

