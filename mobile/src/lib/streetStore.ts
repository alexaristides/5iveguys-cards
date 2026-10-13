import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Record3 } from "./types";

// On-device 5IVE STREET record (the game is played offline against the CPU).
const KEY = "street_record_v1";
const EMPTY: Record3 = { wins: 0, draws: 0, losses: 0 };

export async function readStreetRecord(): Promise<Record3> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record3) : null;
    return parsed && typeof parsed.wins === "number" ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

export async function recordStreetResult(home: number, away: number): Promise<Record3> {
  const r = await readStreetRecord();
  const next = {
    wins: r.wins + (home > away ? 1 : 0),
    draws: r.draws + (home === away ? 1 : 0),
    losses: r.losses + (home < away ? 1 : 0),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}
