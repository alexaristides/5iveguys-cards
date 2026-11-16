import { useCallback, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useQuery } from "@tanstack/react-query";
import type { FantasyPosition, PlayerStats, PlayerStatus } from "@shared/fantasy";
import { api } from "./api";

/** The website's ADMIN_SECRET, entered once on this phone. */
const SECRET_KEY = "fantasy_admin_secret";

export interface AdminPlayer { id: string; name: string; position: FantasyPosition; price: number; isActive: boolean; status: PlayerStatus; news: string | null }
export interface AdminGameweek {
  id: string; number: number; name: string | null; deadline: string; finalizedAt: string | null;
  goalsFor: number | null; goalsAgainst: number | null; entries: number;
  stats: (PlayerStats & { playerId: string; points: number })[];
}
export interface AdminData {
  season: { id: string; name: string; isActive: boolean; budget: number } | null;
  players: AdminPlayer[];
  gameweeks: AdminGameweek[];
}

export function useAdminSecret() {
  const [secret, setSecret] = useState<string | null | undefined>(undefined);
  useEffect(() => { SecureStore.getItemAsync(SECRET_KEY).then(setSecret).catch(() => setSecret(null)); }, []);
  const save = useCallback(async (next: string | null) => {
    if (next) await SecureStore.setItemAsync(SECRET_KEY, next);
    else await SecureStore.deleteItemAsync(SECRET_KEY);
    setSecret(next);
  }, []);
  return { secret, save };
}

export const adminApi = <T,>(secret: string, body?: Record<string, unknown>) =>
  api<T>("/api/admin/fantasy", { body, headers: { "x-admin-secret": secret } });

/** The active season's players and gameweeks with their stats. */
export function useFantasyAdmin(secret: string | null | undefined) {
  return useQuery({
    queryKey: ["fantasy-admin"],
    queryFn: () => adminApi<AdminData>(secret!),
    enabled: !!secret,
    retry: false,
  });
}
