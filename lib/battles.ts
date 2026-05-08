import { type Rarity } from "./cards";

export const ROLL_RANGES: Record<Rarity, [number, number]> = {
  common:    [1,  10],
  rare:      [11, 25],
  epic:      [26, 50],
  legendary: [51, 100],
};

export const MIN_WAGER = 10;

export function rollForRarity(rarity: Rarity): number {
  const [min, max] = ROLL_RANGES[rarity];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export type BattleStatus = "PENDING" | "RESOLVED" | "CANCELLED";

export interface BattleChallenger {
  id: string;
  name: string | null;
  image: string | null;
}

export interface BattleEntry {
  id: string;
  challengerId: string;
  challenger: BattleChallenger;
  challengerCardId: string;
  wager: number;
  createdAt: string;
  status: BattleStatus;
}

export interface ResolvedBattle {
  winnerId: string | null;
  challengerRoll: number;
  acceptorRoll: number;
  pot: number;
  tie: boolean;
  remainingPoints: number;
}
