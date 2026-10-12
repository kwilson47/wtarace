import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { countRace } from './countRace';
import { winsEveryTie } from './ties';

const { players, tournaments, rules } = season;
const cat = players.find((p) => p.id === 'cat')!;
const entry = (results: { tournamentId: string; round: string; points: number }[]) => ({ id: 'own', race: countRace(results, tournaments, rules) });

describe('winsEveryTie', () => {
  it('is true when every way a rival can finish level ranks below her on the tiebreaks', () => {
    // 160 with 100 WTA 1000 points; Cat reaches 160 only with a semifinal at Next Open or Clash Cup, with 40.
    const own = entry([{ tournamentId: 'm1000', round: 'W', points: 100 }, { tournamentId: 'c500', round: 'SF', points: 20 }, { tournamentId: 'c250', round: 'F', points: 40 }]);
    expect(own.race.total).toBe(160);
    expect(winsEveryTie(own, tournaments, [cat], tournaments, rules)).toBe(true);
  });

  it('is false when a rival can finish level and win the tiebreak', () => {
    // 160 with only 10 WTA 1000 points: Cat, level on 160 with 40, ranks ahead.
    const own = entry([
      { tournamentId: 'm1000', round: 'QF', points: 10 },
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'c250', round: 'F', points: 40 },
      { tournamentId: 'slam', round: 'R128', points: 10 },
    ]);
    expect(own.race.total).toBe(160);
    expect(winsEveryTie(own, tournaments, [cat], tournaments, rules)).toBe(false);
  });

  it('is true when no rival can finish exactly level', () => {
    const own = entry([{ tournamentId: 'm1000', round: 'W', points: 100 }, { tournamentId: 'c500', round: 'SF', points: 20 }, { tournamentId: 'c250', round: 'SF', points: 20 }, { tournamentId: 'slam', round: 'R128', points: 10 }]);
    expect(own.race.total).toBe(150);
    // Cat reaches 150 with a quarterfinal (10): 40 WTA 1000 points against her 100, so she wins that tie too.
    expect(winsEveryTie(own, tournaments, [cat], tournaments, rules)).toBe(true);
  });
});
