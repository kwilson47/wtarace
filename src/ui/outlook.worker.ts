// Works out one player's outlook off the main thread; the searches can take a few seconds on real data.
import type { Season } from '../data/schema';
import { playerOutlook, type Outlook } from '../engine/outlook';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ season: Season; playerId: string }>) => void) | null;
  postMessage: (outlook: Outlook) => void;
};

scope.onmessage = ({ data }) =>
  scope.postMessage(playerOutlook(data.playerId, data.season.players, data.season.tournaments, data.season.rules));
