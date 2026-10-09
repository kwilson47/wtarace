/** The parts of the WTA API responses the updater reads. Field names are the API's own. */
export interface RaceRow {
  ranking: number;
  points: number;
  tournamentsPlayed: number;
  player: { id: number; fullName: string; countryCode: string };
}

export interface CalendarEvent {
  tournamentGroup: { id: number; name: string };
  year: number;
  title: string;
  city: string;
  level: string;
  startDate: string;
  endDate: string;
  /** 'past' | 'live' | 'inProgress' | 'future' */
  status: string;
  singlesDrawSize: number;
}

export interface EventPlayer {
  players: { id: number; fullName: string }[];
  seed: string | number | null;
  entryType: string | null;
}

export interface EventPlayersFeed {
  /** 'LS' singles main draw (entry list before the draw, draw order after); 'RS' singles qualifying. */
  events: { eventTypeCode: string; eventPlayers: EventPlayer[] }[];
}

export interface LiveMatch {
  /** 'S' singles. */
  DrawMatchType: string;
  /** 'M' main draw, 'Q' qualifying. */
  DrawLevelType: string;
  /** 1, 2, … counting from the first round; 'Q', 'S', 'F' for the quarterfinal, semifinal and final. */
  RoundID: string | number;
  /** 'F' finished; anything else not finished. */
  MatchState: string;
  PlayerIDA: string | number;
  PlayerIDB: string | number;
  /** Even: player A won (2, or 4 on retirement); odd: player B won (3, or 5). Missing until played. */
  Winner?: string | number | null;
}

export interface PlayerMatchTournament {
  tournamentGroup: { id: number; name: string };
  year: number;
  title: string;
  city: string;
  level: string;
  startDate: string;
  endDate: string;
  singlesDrawSize: number;
}

export interface PlayerMatch {
  /** WTA tournament id, sometimes with a leading space. */
  tourn_nbr: string;
  tourn_year: string;
  /** 1, 2, … within the draw (main or qualifying). */
  tourn_round: string;
  /** R128 … R16, 'Q' quarterfinal, 'S' semifinal, 'F' final. */
  round_name: string;
  /** 'M' main draw, 'Q' qualifying. */
  qpm_flag: string;
  player_1: string;
  player_2: string;
  /** 1 or 2: which side won. */
  winner: number | string;
  points_champ_1: number | null;
  points_champ_2: number | null;
  StartDate: string;
  TournamentName: string;
  TournamentLevel?: string | null;
  tournament?: PlayerMatchTournament;
}

export interface FeedSnapshot {
  race: RaceRow[];
  calendar: CalendarEvent[];
  /** Keyed by WTA tournament id. */
  eventPlayers: Record<string, EventPlayersFeed>;
  eventMatches: Record<string, LiveMatch[]>;
  /** Keyed by WTA player id; only the feeds the update needs. */
  playerMatches: Record<string, PlayerMatch[]>;
}
