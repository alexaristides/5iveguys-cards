"use client";

import { useCallback, useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import type { MatchEvent } from "@/lib/football";

interface UseMatchSyncOptions {
  lobbyId: string;
  isCreator: boolean;
  enabled: boolean;
  onTick?: (event: MatchEvent, index: number) => void;
  onHalftime?: (event: MatchEvent) => void;
  onFulltime?: (event: MatchEvent) => void;
  onMatchComplete?: () => void;
}

/**
 * Creator: provides an `publishEvent` function to call when each match event fires.
 *          Sends the event to POST /api/lobbies/[id]/tick, which pushes to Pusher.
 * Opponent: subscribes to Pusher match:tick / match:halftime / match:fulltime events.
 */
export function useMatchSync({
  lobbyId, isCreator, enabled,
  onTick, onHalftime, onFulltime, onMatchComplete,
}: UseMatchSyncOptions) {
  const callbackRef = useRef({ onTick, onHalftime, onFulltime, onMatchComplete });
  callbackRef.current = { onTick, onHalftime, onFulltime, onMatchComplete };

  // Creator publishes events to the server → Pusher
  const publishEvent = useCallback(async (event: MatchEvent, index: number) => {
    if (!isCreator || !enabled) return;
    try {
      await fetch(`/api/lobbies/${lobbyId}/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIndex: index, event }),
      });
    } catch { /* non-critical */ }
  }, [lobbyId, isCreator, enabled]);

  // Opponent subscribes to Pusher events
  useEffect(() => {
    if (!enabled || isCreator) return;

    const client = getPusherClient();
    const channelName = `presence-lobby-${lobbyId}`;
    const channel = client.subscribe(channelName);

    const onTick = (data: { eventIndex: number; event: MatchEvent }) => {
      callbackRef.current.onTick?.(data.event, data.eventIndex);
    };
    const onHalftime = (data: { event: MatchEvent }) => {
      callbackRef.current.onHalftime?.(data.event);
    };
    const onFulltime = (data: { event: MatchEvent }) => {
      callbackRef.current.onFulltime?.(data.event);
      callbackRef.current.onMatchComplete?.();
    };

    channel.bind("match:tick", onTick);
    channel.bind("match:halftime", onHalftime);
    channel.bind("match:fulltime", onFulltime);

    return () => {
      channel.unbind("match:tick", onTick);
      channel.unbind("match:halftime", onHalftime);
      channel.unbind("match:fulltime", onFulltime);
    };
  }, [lobbyId, isCreator, enabled]);

  return { publishEvent };
}
