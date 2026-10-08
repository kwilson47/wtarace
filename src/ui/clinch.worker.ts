// Runs the clinch search off the main thread; it can take a second on real data.
import type { Season } from '../data/schema';
import { clinchedPlayers } from '../engine/clinch';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Season>) => void) | null;
  postMessage: (ids: string[]) => void;
};

scope.onmessage = ({ data }) => scope.postMessage([...clinchedPlayers(data.players, data.tournaments, data.rules)]);
