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
  surface?: string;
  /** 'I' indoor, 'O' outdoor. */
  inOutdoor?: string;
}

export interface EventPlayer {
  players: { id: number; fullName: string; countryCode?: string | null }[];
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
  /** 'LS001' is the final, 'LS002'–'LS003' the semifinals, and so on: reliable for upcoming matches too. */
  MatchID?: string;
  PlayerIDA: string | number;
  PlayerIDB: string | number;
  /** Even: player A won (2, or 4 on retirement); odd: player B won (3, or 5). Missing until played. */
  Winner?: string | number | null;
  PlayerNameFirstA?: string;
  PlayerNameLastA?: string;
  PlayerNameFirstB?: string;
  PlayerNameLastB?: string;
  /** IOC codes. */
  PlayerCountryA?: string;
  PlayerCountryB?: string;
  SeedA?: string | number | null;
  SeedB?: string | number | null;
  EntryTypeA?: string | null;
  EntryTypeB?: string | null;
  /** Winner first, sets separated by commas: "7-6(0),6-3"; "6-1,3-0 Ret'd" on a retirement. */
  ScoreString?: string;
}

export interface PlayerMatchTournament {
  tournamentGroup: { id: number; name: string; level?: string };
  year: number;
  title: string;
  city: string;
  /** Missing for some events (e.g. Eastbourne 2025); fall back to tournamentGroup.level. */
  level?: string;
  surface?: string;
  /** 'I' indoor, 'O' outdoor. */
  inOutdoor?: string;
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
  /** 'W' normal, 'R' retirement, 'D' walkover, 'B' bye. */
  reason_code?: string | null;
  scores?: string | null;
  Surface?: string | null;
  city?: string | null;
  entry_type_1?: string | null;
  entry_type_2?: string | null;
  seed_1?: number | string | null;
  seed_2?: number | string | null;
  rank_1?: number | string | null;
  rank_2?: number | string | null;
  points_1?: number | null;
  points_2?: number | null;
  opponent?: { id: number; fullName: string; countryCode: string | null } | null;
}

/** `tournaments/{id}/{year}/draw`: the draw sheets, as JSON nested inside strings. */
export interface DrawFeed {
  drawInfo: string[];
}

export interface FeedSnapshot {
  race: RaceRow[];
  calendar: CalendarEvent[];
  /** Keyed by WTA tournament id. */
  eventPlayers: Record<string, EventPlayersFeed>;
  eventMatches: Record<string, LiveMatch[]>;
  /** Draw sheets, keyed by WTA tournament id; missing when the feed failed (draws then come from the other two). */
  eventDraws?: Record<string, DrawFeed>;
  /** Keyed by WTA player id: every tracked player, plus new top-40 players. */
  playerMatches: Record<string, PlayerMatch[]>;
  /** Tracked players whose match feed failed to load (their match files are kept). */
  playerFeedErrors?: number[];
}
