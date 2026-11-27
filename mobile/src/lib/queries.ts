import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { MOTM_CHANNEL } from "./config";
import type {
  Account, FantasyGameweekResult, FantasyHistory, FantasyLeaderboard, FantasyLeagueStandings, FantasyLeagueSummary,
  FantasyOverview, FantasyPlayerDetail, MotmResults, Video,
} from "./types";

export function useAccount() {
  return useQuery({ queryKey: ["account"], queryFn: () => api<Account>("/api/account") });
}

/** Fantasy Div 1: the season, players, gameweeks and your team. */
export function useFantasy() {
  return useQuery({ queryKey: ["fantasy"], queryFn: () => api<FantasyOverview>("/api/fantasy") });
}

export function useFantasyLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ["fantasy-leaderboard", limit],
    queryFn: () => api<FantasyLeaderboard>(`/api/fantasy/leaderboard?limit=${limit}`),
  });
}

/** A team's points for a locked gameweek (yours unless teamId is given). */
export function useFantasyGameweek(number: number | null, teamId?: string) {
  return useQuery({
    queryKey: ["fantasy-gameweek", number, teamId ?? "me"],
    queryFn: () => api<FantasyGameweekResult>(`/api/fantasy/gameweeks/${number}${teamId ? `?teamId=${teamId}` : ""}`),
    enabled: number !== null,
  });
}

/** A team's season gameweek by gameweek (yours without a teamId). */
export function useFantasyHistory(teamId?: string) {
  return useQuery({
    queryKey: ["fantasy-history", teamId ?? "me"],
    queryFn: () => api<FantasyHistory>(`/api/fantasy/history${teamId ? `?teamId=${teamId}` : ""}`),
  });
}

export function useFantasyPlayer(id: string) {
  return useQuery({ queryKey: ["fantasy-player", id], queryFn: () => api<FantasyPlayerDetail>(`/api/fantasy/players/${id}`) });
}

/** Your private leagues. */
export function useFantasyLeagues(enabled = true) {
  return useQuery({
    queryKey: ["fantasy-leagues"],
    queryFn: () => api<{ leagues: FantasyLeagueSummary[] }>("/api/fantasy/leagues"),
    enabled,
  });
}

export function useFantasyLeague(id: string) {
  return useQuery({ queryKey: ["fantasy-league", id], queryFn: () => api<FantasyLeagueStandings>(`/api/fantasy/leagues/${id}`) });
}

/** The team's videos, newest first, 24 a page. */
export function useVideos() {
  return useInfiniteQuery({
    queryKey: ["videos", MOTM_CHANNEL],
    queryFn: ({ pageParam }) =>
      api<{ videos: Video[]; total: number; page: number; pageSize: number }>(`/api/channels/${MOTM_CHANNEL}/videos?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });
}

/** Man of the Match standings for one video, and your vote. */
export function useMotm(videoId: string) {
  return useQuery({
    queryKey: ["motm", videoId],
    queryFn: () => api<MotmResults>(`/api/channels/${MOTM_CHANNEL}/videos/${videoId}/motm`),
  });
}
