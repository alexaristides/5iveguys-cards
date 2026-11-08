import type { Rarity } from "@shared/cards";
import type { StatsMap } from "@shared/card-rating";
import type { Chip, EntryScore, FantasyPosition, GameweekStatus, Pick, PlayerStatus, Squad } from "@shared/fantasy";

/** A card row from the database (as returned by the website's API). */
export interface DbCard {
  id: string;
  name: string;
  kit: string | null;
  rarity: Rarity;
  imageUrl: string;
  backImageUrl?: string | null;
  attribute: string | null;
  position: string | null;
  description?: string | null;
  channelId?: string;
}

export interface Me {
  points: number;
  totalEarned: number;
  watchTimeSeconds: number;
  cardCount: number;
  cards: { id: string; cardId: string; card: DbCard | null; obtainedAt: string }[];
  youtubeSync: { isSubscribed: boolean; lastSynced: string | null } | null;
  youtubeChannelId: string | null;
  lastDailyReward: string | null;
}

export interface Account {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  hasYoutubeScope: boolean;
}

export interface Video {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  watchedByMe: boolean;
}

export interface PackCardResult {
  id: string;
  name: string;
  image: string;
  rarity: Rarity;
  kit?: string;
  isDuplicate: boolean;
  refundPoints: number;
}

export interface PackOpenResult {
  cards: PackCardResult[];
  remainingPoints: number;
  totalRefund: number;
  duplicateCount: number;
}

export interface VotesResponse {
  averages: StatsMap;
  userVote: StatsMap | null;
  voteCount: number;
  position: string | null;
}

export interface CollectionItem {
  id: string;
  cardId: string;
  channel: { slug: string; name: string } | null;
  card: DbCard | null;
}

export interface Record3 {
  wins: number;
  losses: number;
  draws: number;
}

export interface MotmCandidate {
  /** One of the player's cards; send it back as `playerId` to vote. */
  id: string;
  name: string;
  position: string | null;
  imageUrl: string;
  team: string;
  /** From another channel's squad (crossover videos). */
  isGuest: boolean;
  votes: number;
  percent: number;
}

export interface MotmResults {
  video: { videoId: string; title: string | null; thumbnailUrl: string | null; publishedAt: string };
  team: string;
  totalVotes: number;
  myVote: string | null;
  /** Most votes first. */
  candidates: MotmCandidate[];
}

// ── Fantasy Div 1 ──────────────────────────────────────────────────────────────

export interface FantasyPlayer {
  id: string;
  name: string;
  position: FantasyPosition;
  /** Tenths of £1m. */
  price: number;
  imageUrl: string | null;
  isActive: boolean;
  status: PlayerStatus;
  news: string | null;
  totalPoints: number;
  /** Average points over the last 4 scored gameweeks. */
  form: number;
  lastPoints: number | null;
  /** Price move after the last scored gameweek. */
  priceChange: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  selectedBy: number;
}

export interface FantasyDraft {
  picks: Pick[];
  captainId: string;
  viceCaptainId: string;
  chip: Chip | null;
  transfersMade: number;
  transferCost: number;
  bank: number;
  saved: boolean;
}

export interface FantasyGameweek {
  number: number;
  name: string | null;
  deadline: string;
  status: GameweekStatus;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface FantasyOverview {
  season: { id: string; name: string; budget: number; secondHalfFrom: number | null } | null;
  gameweeks: FantasyGameweek[];
  /** The gameweek being picked for, or null when none is open. */
  nextGameweek: number | null;
  /** The latest gameweek that has kicked off. */
  currentGameweek: number | null;
  players: FantasyPlayer[];
  team: {
    id: string;
    name: string;
    totalPoints: number;
    rank: number;
    previousRank: number | null;
    teamCount: number;
    lastGameweek: { number: number; points: number; rank: number | null } | null;
    value: number | null;
    /** The locked team and bank transfers are made from (null before the first deadline). */
    baseline: Squad | null;
    /** null = unlimited (first team not locked yet). */
    freeTransfers: number | null;
    availableChips: Chip[];
    chipsPlayed: { chip: Chip; gameweek: number }[];
    draft: FantasyDraft | null;
  } | null;
}

export interface FantasyLeagueRow {
  rank: number;
  previousRank: number | null;
  id: string;
  name: string;
  manager: string | null;
  image: string | null;
  totalPoints: number;
  lastPoints: number | null;
  mine?: boolean;
}

export interface FantasyLeaderboard {
  teams: FantasyLeagueRow[];
  me: FantasyLeagueRow | null;
  teamCount: number;
  lastGameweek: number | null;
}

export interface FantasyLeagueStandings {
  league: { id: string; name: string; code: string; isMember: boolean };
  lastGameweek: number | null;
  teams: FantasyLeagueRow[];
}

export interface FantasyLeagueSummary {
  id: string;
  name: string;
  code: string;
  members: number;
  rank: number;
}

export interface FantasyGameweekResult {
  gameweek: FantasyGameweek;
  team: { id: string; name: string; manager: string | null };
  entry: { picks: Pick[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number; transfersMade: number } | null;
  score: EntryScore | null;
  gameweekRank: number | null;
  lines: Record<string, { label: string; points: number }[]>;
  average: number | null;
  highest: number | null;
}

export interface FantasyHistory {
  team: { id: string; name: string; manager: string | null; totalPoints: number };
  weeks: {
    number: number;
    name: string | null;
    status: GameweekStatus;
    points: number | null;
    overallPoints: number | null;
    overallRank: number | null;
    gameweekRank: number | null;
    transfersMade: number;
    transferCost: number;
    chip: Chip | null;
    bank: number;
    value: number;
  }[];
}

export interface FantasyPlayerDetail {
  player: {
    id: string; name: string; position: FantasyPosition; price: number; imageUrl: string | null;
    status: PlayerStatus; news: string | null; isActive: boolean;
  };
  gameweeks: {
    number: number;
    name: string | null;
    result: string | null;
    status: GameweekStatus;
    played: boolean;
    points: number;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    bonus: number;
    priceChange: number;
  }[];
}
