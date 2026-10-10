import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  EMPTY_EXHIBITION_STATS, mergeExhibitionMatch,
  type ExhibitionStats, type MatchPlayerEntry,
} from "@shared/exhibition-stats";

// On-device Exhibition hall of fame (the website keeps the same thing in localStorage).
const KEY = "exhibition_stats_v1";

export async function readExhibitionStats(): Promise<ExhibitionStats> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ExhibitionStats) : null;
    return parsed && typeof parsed.gamesPlayed === "number" ? parsed : EMPTY_EXHIBITION_STATS;
  } catch {
    return EMPTY_EXHIBITION_STATS;
  }
}

export async function recordExhibitionMatch(entries: MatchPlayerEntry[]): Promise<ExhibitionStats> {
  const next = mergeExhibitionMatch(await readExhibitionStats(), entries);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}
