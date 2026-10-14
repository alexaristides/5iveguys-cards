import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Record3 } from "./types";

// On-device 5IVE STREET records: against the CPU, and online against friends.
const KEY = { cpu: "street_record_v1", online: "street_online_record_v1" };
const EMPTY: Record3 = { wins: 0, draws: 0, losses: 0 };

export async function readStreetRecord(online = false): Promise<Record3> {
  try {
    const raw = await AsyncStorage.getItem(online ? KEY.online : KEY.cpu);
    const parsed = raw ? (JSON.parse(raw) as Record3) : null;
    return parsed && typeof parsed.wins === "number" ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** `mine`: your goals, `theirs`: the other side's. */
export async function recordStreetResult(mine: number, theirs: number, online = false): Promise<Record3> {
  const r = await readStreetRecord(online);
  const next = {
    wins: r.wins + (mine > theirs ? 1 : 0),
    draws: r.draws + (mine === theirs ? 1 : 0),
    losses: r.losses + (mine < theirs ? 1 : 0),
  };
  await AsyncStorage.setItem(online ? KEY.online : KEY.cpu, JSON.stringify(next)).catch(() => {});
  return next;
}
