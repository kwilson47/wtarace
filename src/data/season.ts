import meta from '../../data/meta.json';
import players from '../../data/players.json';
import rules from '../../data/rules.json';
import tournaments from '../../data/tournaments.json';
import { parseOrThrow } from './schema';

export const season = parseOrThrow({ rules, tournaments, players, meta });
