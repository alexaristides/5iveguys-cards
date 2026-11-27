import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Bump to show the tour to everyone again (say after a big new feature). */
const KEY = "tour_seen_v2"; // v2: the fantasy-only app (2026-11-27)

/** Whether this device has seen the welcome tour (null while loading), and a way to mark it seen. */
export function useTourSeen(): [boolean | null, () => void] {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setSeen(v === "1")).catch(() => setSeen(true));
  }, []);
  const markSeen = useCallback(() => {
    setSeen(true);
    AsyncStorage.setItem(KEY, "1").catch(() => {});
  }, []);
  return [seen, markSeen];
}
