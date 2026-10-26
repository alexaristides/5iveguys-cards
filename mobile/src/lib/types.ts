import type { Rarity } from "@shared/cards";
import type { StatsMap } from "@shared/card-rating";
import type { Chip, EntryScore, FantasyPosition, GameweekStatus, Pick } from "@shared/fantasy";

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

/** A channel from the public /api/channels list. */
export interface World {
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  _count: { userStats: number };
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
  totalPoints: number;
  lastPoints: number | null;
  selectedBy: number;
}

export interface FantasyDraft {
  picks: Pick[];
  captainId: string;
  viceCaptainId: string;
  chip: Chip | null;
  transfersMade: number;
  transferCost: number;
  saved: boolean;
}

export interface FantasyOverview {
  season: { id: string; name: string; budget: number } | null;
  gameweeks: { number: number; name: string | null; deadline: string; status: GameweekStatus }[];
  /** The gameweek being picked for, or null when none is open. */
  nextGameweek: number | null;
  players: FantasyPlayer[];
  team: {
    id: string;
    name: string;
    totalPoints: number;
    rank: number;
    teamCount: number;
    lastGameweek: { number: number; points: number } | null;
    /** The locked squad transfers are counted against (null before the first deadline). */
    baseline: Pick[] | null;
    /** null = unlimited (first team not locked yet). */
    freeTransfers: number | null;
    usedChips: Chip[];
    draft: FantasyDraft | null;
  } | null;
}

export interface FantasyLeaderboardRow {
  rank: number;
  id: string;
  name: string;
  manager: string | null;
  image: string | null;
  totalPoints: number;
  lastPoints: number | null;
}

export interface FantasyLeaderboard {
  teams: FantasyLeaderboardRow[];
  me: FantasyLeaderboardRow | null;
  teamCount: number;
  lastGameweek: number | null;
}

export interface FantasyGameweekResult {
  gameweek: { number: number; name: string | null; deadline: string; status: GameweekStatus };
  team: { id: string; name: string; manager: string | null };
  entry: { picks: Pick[]; captainId: string; viceCaptainId: string; chip: Chip | null; transferCost: number; transfersMade: number } | null;
  score: EntryScore | null;
  lines: Record<string, { label: string; points: number }[]>;
  average: number | null;
  highest: number | null;
}
