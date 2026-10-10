import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useChannel } from "./channel";
import type { Account, CollectionItem, DbCard, Me, Record3, Video, VotesResponse } from "./types";

/** Refetch when a screen comes back into focus (skips the first focus, which mounts). */
export function useRefreshOnFocus(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) { first.current = false; return; }
      refetch();
    }, [refetch]),
  );
}

/** Points, owned cards and YouTube state for the selected channel. */
export function useMe() {
  const { slug } = useChannel();
  return useQuery({
    queryKey: ["me", slug],
    queryFn: () => api<Me>(`/api/user?channelSlug=${slug}`),
  });
}

export function useAccount() {
  return useQuery({ queryKey: ["account"], queryFn: () => api<Account>("/api/account") });
}

export function useChannelCards() {
  const { slug } = useChannel();
  return useQuery({
    queryKey: ["channel-cards", slug],
    queryFn: () => api<{ cards: DbCard[] }>(`/api/channels/${slug}/cards`).then((r) => r.cards),
    staleTime: 5 * 60_000,
  });
}

/** Every owned card across channels (squad picking for games). */
export function useCollection() {
  return useQuery({
    queryKey: ["collection"],
    queryFn: () => api<{ cards: CollectionItem[] }>("/api/user/collection").then((r) => r.cards),
  });
}

export function useVideos() {
  const { slug } = useChannel();
  return useQuery({
    queryKey: ["videos", slug],
    queryFn: () => api<{ videos: Video[] }>(`/api/channels/${slug}/videos?page=1`).then((r) => r.videos),
  });
}

export function useVotes(cardId: string) {
  return useQuery({
    queryKey: ["votes", cardId],
    queryFn: () => api<VotesResponse>(`/api/cards/${cardId}/votes`),
  });
}

/** Fan-voted overall per card, for sorting the collection by rating. */
export function useRatings() {
  const { slug } = useChannel();
  return useQuery({
    queryKey: ["ratings", slug],
    queryFn: () =>
      api<{ cards: { id: string; overall: number }[] }>(`/api/cards/ratings?sort=top&channelSlug=${slug}`)
        .then((r) => new Map(r.cards.map((c) => [c.id, c.overall]))),
    staleTime: 5 * 60_000,
  });
}

export function useFootballRecord() {
  return useQuery({ queryKey: ["record", "cpu"], queryFn: () => api<Record3>("/api/football") });
}

export function usePvpRecord() {
  return useQuery({
    queryKey: ["record", "pvp"],
    queryFn: () =>
      api<{ pvpWins: number; pvpLosses: number; pvpDraws: number }>("/api/pvp/record")
        .then((r) => ({ wins: r.pvpWins, losses: r.pvpLosses, draws: r.pvpDraws })),
  });
}
