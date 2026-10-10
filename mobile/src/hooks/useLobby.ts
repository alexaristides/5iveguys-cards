// Port of the website's hooks/useLobby.ts: lobby state + Pusher events for a PvP match.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssignedPlayer, Formation, MatchSimulation } from "@shared/football";
import { api } from "@/lib/api";
import { getPusher } from "@/lib/pusher";

export interface LobbyPlayer { id: string; name: string | null; image: string | null; teamName: string | null }

export interface StoredSimulation {
  creatorFormation: Formation;
  opponentFormation: Formation;
  creatorLineup: AssignedPlayer[];
  opponentLineup: AssignedPlayer[];
  summary?: MatchSimulation;
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
  matchResult: { winnerId: string | null; scoreline: string; simulation: StoredSimulation | null } | null;
}

export type LobbyRole = "creator" | "opponent" | "visitor";
export type LobbyPhase =
  | "loading" | "error" | "preview" | "waiting" | "squad-pick" | "squad-locked" | "countdown" | "match" | "result";

interface State {
  lobby: LobbyData | null;
  phase: LobbyPhase;
  role: LobbyRole | null;
  opponentSquadLocked: boolean;
  halftimeData: { creatorFormation2: Formation; opponentFormation2: Formation } | null;
}

function computePhase(lobby: LobbyData, uid: string): { phase: LobbyPhase; role: LobbyRole } {
  const role: LobbyRole = lobby.creatorId === uid ? "creator" : lobby.opponentId === uid ? "opponent" : "visitor";
  if (lobby.status === "FINISHED") return { phase: "result", role };
  if (lobby.status === "WAITING") return { phase: role === "creator" ? "waiting" : "preview", role };
  if (role === "visitor") return { phase: "preview", role };
  const mine = role === "creator" ? lobby.creatorSquad : lobby.opponentSquad;
  return { phase: mine ? "squad-locked" : "squad-pick", role };
}

export function useLobby(lobbyId: string, userId: string | undefined) {
  const [state, setState] = useState<State>({
    lobby: null, phase: "loading", role: null, opponentSquadLocked: false, halftimeData: null,
  });
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  const fetchLobby = useCallback(async () => {
    try {
      const data = await api<{ lobby: LobbyData }>(`/api/lobbies/${lobbyId}`);
      return data.lobby;
    } catch {
      return null;
    }
  }, [lobbyId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const lobby = await fetchLobby();
    if (!lobby) { setState((s) => ({ ...s, phase: "error", lobby: null })); return; }
    const { phase, role } = computePhase(lobby, userId);
    setState({ lobby, phase, role, opponentSquadLocked: !!(lobby.creatorSquad && lobby.opponentSquad), halftimeData: null });
  }, [userId, fetchLobby]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load; state is set after the fetch resolves
  useEffect(() => { refresh(); }, [refresh]);

  const handleRef = useRef<(event: string, data: Record<string, unknown>) => void>(() => {});
  const handlePusherEvent = (event: string, d: Record<string, unknown>) => {
    const { phase, role } = stateRef.current;
    if (event === "lobby:joined") {
      const opponent = d.opponent as LobbyPlayer;
      setState((s) => ({
        ...s,
        lobby: s.lobby ? { ...s.lobby, status: "ACTIVE", opponent, opponentId: opponent.id } : s.lobby,
        phase: phase === "waiting" ? "squad-pick" : phase,
      }));
    } else if (event === "lobby:squad_locked") {
      if (d.matchReady) {
        fetchLobby().then((lobby) => {
          if (!lobby) return;
          setState((s) => ({
            ...s, lobby, opponentSquadLocked: true,
            phase: s.phase === "squad-locked" || s.phase === "squad-pick" ? "countdown" : s.phase,
          }));
        });
      } else {
        const by = d.player as string;
        if ((role === "creator" && by === "opponent") || (role === "opponent" && by === "creator")) {
          setState((s) => ({ ...s, opponentSquadLocked: true }));
        }
      }
    } else if (event === "match:fulltime") {
      fetchLobby().then((lobby) => { if (lobby) setState((s) => ({ ...s, lobby })); });
    } else if (event === "match:half2-ready") {
      setState((s) => ({
        ...s,
        halftimeData: {
          creatorFormation2: d.creatorFormation2 as Formation,
          opponentFormation2: d.opponentFormation2 as Formation,
        },
      }));
    }
  };

  useEffect(() => { handleRef.current = handlePusherEvent; });

  // Presence channel: lobby events + opponent-disconnect forfeit (30s, as on the web).
  useEffect(() => {
    if (!userId) return;
    const client = getPusher();
    const name = `presence-lobby-${lobbyId}`;
    const channel = client.subscribe(name);
    const events = ["lobby:joined", "lobby:squad_locked", "match:fulltime", "match:half2-ready"];
    const handlers = events.map((e) => {
      const fn = (data: unknown) => handleRef.current(e, (data ?? {}) as Record<string, unknown>);
      channel.bind(e, fn);
      return [e, fn] as const;
    });

    let forfeitTimer: ReturnType<typeof setTimeout> | null = null;
    const onRemoved = (member: { id: string }) => {
      const { phase, lobby } = stateRef.current;
      if (phase !== "match" || !lobby || member.id === userId) return;
      forfeitTimer = setTimeout(() => {
        api(`/api/lobbies/${lobbyId}/result`, { body: { forfeit: true, winnerId: userId } }).catch(() => {});
      }, 30_000);
    };
    const onAdded = () => { if (forfeitTimer) { clearTimeout(forfeitTimer); forfeitTimer = null; } };
    channel.bind("pusher:member_removed", onRemoved);
    channel.bind("pusher:member_added", onAdded);

    return () => {
      handlers.forEach(([e, fn]) => channel.unbind(e, fn));
      channel.unbind("pusher:member_removed", onRemoved);
      channel.unbind("pusher:member_added", onAdded);
      if (forfeitTimer) clearTimeout(forfeitTimer);
      client.unsubscribe(name);
    };
  }, [lobbyId, userId]);

  const joinLobby = useCallback(async () => {
    const data = await api<{ lobby: LobbyData }>(`/api/lobbies/${lobbyId}/join`, { method: "POST" });
    if (data.lobby && userId) {
      const { phase, role } = computePhase(data.lobby, userId);
      setState({ lobby: data.lobby, phase, role, opponentSquadLocked: false, halftimeData: null });
    }
  }, [lobbyId, userId]);

  const setPhase = useCallback((phase: LobbyPhase) => setState((s) => ({ ...s, phase })), []);

  return { ...state, refresh, fetchLobby, joinLobby, setPhase };
}
