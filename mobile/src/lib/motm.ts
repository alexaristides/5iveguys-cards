import { Linking } from "react-native";
import type { Video } from "./types";

/** "3h ago", "2d ago", "just now". */
export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** The big thumbnail (YouTube serves one for every video). */
export const videoThumb = (v: Pick<Video, "videoId" | "thumbnailUrl">, size: "hq" | "mq" = "hq") =>
  size === "hq" ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : v.thumbnailUrl || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

/** Opens the video in the YouTube app (or Safari without it). */
export const watchOnYouTube = (videoId: string) => Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
