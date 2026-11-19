import type { FantasyPosition, PlayerStats, PlayerStatus } from "@/lib/fantasy";

export interface Season { id: string; name: string; isActive: boolean; budget: number; secondHalfFrom?: number | null; teams?: number }
export interface Player {
  id: string; name: string; position: FantasyPosition; price: number; imageUrl: string | null;
  isActive: boolean; status: PlayerStatus; news: string | null;
}
export interface StatRow extends PlayerStats { playerId: string; points: number }
export interface Gameweek {
  id: string; number: number; name: string | null; deadline: string; finalizedAt: string | null; entries: number; stats: StatRow[];
  goalsFor: number | null; goalsAgainst: number | null;
}
export interface AdminData { seasons: Season[]; season: Season | null; players: Player[]; gameweeks: Gameweek[] }

/** POST an admin action; resolves to the JSON on success, or null after showing the error. */
export type Act = (body: Record<string, unknown>, success?: string) => Promise<Record<string, unknown> | null>;
