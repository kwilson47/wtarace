import { describe, expect, it } from 'vitest';
import { drawList, liveMatches, match, playerMatch, raceRows, snapshot, TOURNAMENT_IDS, updaterSeason } from './testFeeds';
import { updateSeason } from './updateSeason';

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
