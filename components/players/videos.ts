/** A team video as /api/channels/{slug}/videos sends it. */
export interface Video { videoId: string; title: string | null; thumbnailUrl: string | null; publishedAt: string }

/** One player on a video's Man of the Match vote (/api/channels/{slug}/videos/{id}/motm). */
export interface MotmCandidate {
  /** One of the player's cards; send it back as `playerId` to vote. */
  id: string;
  name: string;
  position: string | null;
  imageUrl: string;
  team: string;
  /** From another team's squad (crossover videos). */
  isGuest: boolean;
  votes: number;
  percent: number;
}

export interface MotmResults { video: Video; team: string; totalVotes: number; myVote: string | null; candidates: MotmCandidate[] }

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

/** The big thumbnail (YouTube serves one for every video), or the stored one. */
export const videoThumb = (v: Pick<Video, "videoId" | "thumbnailUrl">, size: "hq" | "mq" = "hq") =>
  size === "hq" ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : v.thumbnailUrl || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`;

export const youTubeUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
