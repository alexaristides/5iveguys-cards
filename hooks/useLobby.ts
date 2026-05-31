"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import type { AssignedPlayer, Formation } from "@/lib/football";

export interface LobbyPlayer {
  id: string;
  name: string | null;
  image: string | null;
}

export interface StoredSimulation {
  simulation: import("@/lib/football").MatchSimulation;
  creatorFormation: Formation;
  opponentFormation: Formation;
  creatorLineup: AssignedPlayer[];
  opponentLineup: AssignedPlayer[];
}

export interface LobbyMatchResult {
  lobbyId: string;
  player1Id: string;
  player2Id: string;
  winnerId: string | null;
  scoreline: string;
  simulation: StoredSimulation | null;
}

export interface LobbyData {
  id: string;
  status: "WAITING" | "ACTIVE" | "FINISHED";
  creatorId: string;
  opponentId: string | null;
  creator: LobbyPlayer;
  opponent: LobbyPlayer | null;
  creatorSquad: object | null;
  opponentSquad: object | null;
  matchResult: LobbyMatchResult | null;
}

export type LobbyRole = "creator" | "opponent" | "visitor";

export type LobbyPhase =
  | "loading"
  | "error"
  | "preview"       // visitor sees creator name + Join button
  | "waiting"       // creator waiting for opponent
  | "squad-pick"    // ACTIVE: picking squad
  | "squad-locked"  // submitted own squad, waiting for opponent
  | "countdown"     // both squads in, 3-2-1 countdown
  | "match"         // match in progress
  | "result";       // match over

interface State {
  lobby: LobbyData | null;
  phase: LobbyPhase;
  role: LobbyRole | null;
  opponentSquadLocked: boolean;
}

export function useLobby(lobbyId: string, userId: string | null | undefined) {
  const [state, setState] = useState<State>({
    lobby: null, phase: "loading", role: null, opponentSquadLocked: false,
  });

  const handleRef = useRef<(event: string, data: unknown) => void>(() => {});
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchLobby = useCallback(async (): Promise<LobbyData | null> => {
    const res = await fetch(`/api/lobbies/${lobbyId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.lobby as LobbyData;
  }, [lobbyId]);

  const computePhase = useCallback((lobby: LobbyData, uid: string): { phase: LobbyPhase; role: LobbyRole } => {
    const role: LobbyRole =
      lobby.creatorId === uid ? "creator" :
      lobby.opponentId === uid ? "opponent" : "visitor";

    if (lobby.status === "FINISHED") return { phase: "result", role };
    if (lobby.status === "WAITING") {
      return { phase: role === "creator" ? "waiting" : "preview", role };
    }
    // ACTIVE
    if (role === "visitor") return { phase: "preview", role };
    const mySquad = role === "creator" ? lobby.creatorSquad : lobby.opponentSquad;
    return { phase: mySquad ? "squad-locked" : "squad-pick", role };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const lobby = await fetchLobby();
    if (!lobby) { setState((s) => ({ ...s, phase: "error", lobby: null })); return; }
    const { phase, role } = computePhase(lobby, userId);
    const opponentSquadLocked = !!(lobby.creatorSquad && lobby.opponentSquad);
    setState({ lobby, phase, role, opponentSquadLocked });
  }, [userId, fetchLobby, computePhase]);

  // Initial load
  useEffect(() => {
    if (!userId) return;
    refresh();
  }, [userId, refresh]);

  // Pusher subscription
  handleRef.current = (event: string, data: unknown) => {
    const d = data as Record<string, unknown>;
    const { phase: currentPhase, role, lobby } = stateRef.current;

    if (event === "lobby:joined") {
      setState((s) => ({
        ...s,
        lobby: s.lobby ? { ...s.lobby, status: "ACTIVE", opponent: d.opponent as LobbyPlayer, opponentId: (d.opponent as LobbyPlayer).id } : s.lobby,
        phase: currentPhase === "waiting" ? "squad-pick" : currentPhase,
      }));
    } else if (event === "lobby:squad_locked") {
      if (d.matchReady) {
        // Both squads in — fetch full lobby then transition to countdown
        fetchLobby().then((updatedLobby) => {
          if (!updatedLobby || !userId) return;
          setState((s) => ({
            ...s,
            lobby: updatedLobby,
            opponentSquadLocked: true,
            phase: s.phase === "squad-locked" || s.phase === "squad-pick" ? "countdown" : s.phase,
          }));
        });
      } else {
        // One side locked; if it's the opponent from our perspective, mark them ready
        const lockedBy = d.player as string;
        const isOpponentLocked =
          (role === "creator" && lockedBy === "opponent") ||
          (role === "opponent" && lockedBy === "creator");
        if (isOpponentLocked) {
          setState((s) => ({ ...s, opponentSquadLocked: true }));
        }
      }
    } else if (event === "match:fulltime") {
      // Fetch updated result from DB
      fetchLobby().then((updatedLobby) => {
        if (!updatedLobby) return;
        setState((s) => ({ ...s, lobby: updatedLobby, phase: "result" }));
      });
    }
    void lobby;
  };

  useEffect(() => {
    if (!userId) return;
    const client = getPusherClient();

    // Use presence channel so we can detect disconnects for forfeit
    const channelName = `presence-lobby-${lobbyId}`;
    const channel = client.subscribe(channelName);

    const cb = (event: string) => (data: unknown) => handleRef.current(event, data);
    const joinedCb = cb("lobby:joined");
    const squadCb = cb("lobby:squad_locked");
    const fulltimeCb = cb("match:fulltime");

    channel.bind("lobby:joined", joinedCb);
    channel.bind("lobby:squad_locked", squadCb);
    channel.bind("match:fulltime", fulltimeCb);

    return () => {
      channel.unbind("lobby:joined", joinedCb);
      channel.unbind("lobby:squad_locked", squadCb);
      channel.unbind("match:fulltime", fulltimeCb);
      client.unsubscribe(channelName);
    };
  }, [lobbyId, userId]);

  // Forfeit detection via presence channel member_removed
  useEffect(() => {
    if (!userId) return;
    const client = getPusherClient();
    const channelName = `presence-lobby-${lobbyId}`;
    const channel = client.subscribe(channelName);
    let forfeitTimer: ReturnType<typeof setTimeout> | null = null;

    const onMemberRemoved = (member: { id: string }) => {
      const { phase: currentPhase, lobby: currentLobby } = stateRef.current;
      if (currentPhase !== "match") return;
      const isOpponent = member.id !== userId;
      if (!isOpponent || !currentLobby) return;

      forfeitTimer = setTimeout(() => {
        fetch(`/api/lobbies/${lobbyId}/result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forfeit: true, winnerId: userId }),
        }).catch(() => {});
      }, 30000);
    };

    channel.bind("pusher:member_removed", onMemberRemoved);
    return () => {
      channel.unbind("pusher:member_removed", onMemberRemoved);
      if (forfeitTimer) clearTimeout(forfeitTimer);
    };
  }, [lobbyId, userId]);

  const joinLobby = useCallback(async () => {
    const res = await fetch(`/api/lobbies/${lobbyId}/join`, { method: "POST" });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.lobby && userId) {
      const { phase, role } = computePhase(data.lobby, userId);
      setState({ lobby: data.lobby, phase, role, opponentSquadLocked: false });
    }
    return true;
  }, [lobbyId, userId, computePhase]);

  const setPhase = useCallback((phase: LobbyPhase) => {
    setState((s) => ({ ...s, phase }));
  }, []);

  return { ...state, refresh, fetchLobby, joinLobby, setPhase };
}
