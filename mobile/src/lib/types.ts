import type { Rarity } from "@shared/cards";
import type { StatsMap } from "@shared/card-rating";

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
