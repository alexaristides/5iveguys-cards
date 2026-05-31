"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import seedrandom from "seedrandom";
import { QRCodeSVG } from "qrcode.react";
import {
  type Formation, type FootballCard, type LineupSlot, type AssignedPlayer,
  type MatchSimulation,
  buildSlots, slotsToLineup, simulateMatch,
} from "@/lib/football";
import { useLobby, type StoredSimulation } from "@/hooks/useLobby";
import { useMatchSync } from "@/hooks/useMatchSync";
import FormationPitchSelector from "@/components/football/FormationPitchSelector";
import FootballPitch from "@/components/football/FootballPitch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiCard {
  cardId: string;
  card: {
    id: string; name: string; kit: string | null;
    rarity: string; imageUrl: string; attribute: string | null;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 10 }: { src?: string | null; name?: string | null; size?: number }) {
  const cls = `relative rounded-full overflow-hidden bg-zinc-800 shrink-0 w-${size} h-${size}`;
  return (
    <div className={cls}>
      {src ? (
        <Image src={src} alt={name ?? ""} fill className="object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-white text-sm font-bold">{(name ?? "?")[0]}</span>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LobbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: lobbyId } = use(params);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;

  const { lobby, phase, role, opponentSquadLocked, joinLobby, setPhase } = useLobby(
    lobbyId,
    sessionStatus === "loading" ? undefined : userId,
  );

  // Squad selection
  const [ownedCards, setOwnedCards] = useState<FootballCard[]>([]);
  const [formation, setFormation] = useState<Formation>("2-2-2");
  const [lineup, setLineup] = useState<LineupSlot[]>(() => buildSlots("2-2-2"));
  const [loadingCards, setLoadingCards] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Match state
  const [simulation, setSimulation] = useState<MatchSimulation | null>(null);
  const [creatorLineup, setCreatorLineup] = useState<AssignedPlayer[]>([]);
  const [opponentLineup, setOpponentLineup] = useState<AssignedPlayer[]>([]);
  const [creatorFormation, setCreatorFormation] = useState<Formation>("2-2-2");
  const [opponentFormation, setOpponentFormation] = useState<Formation>("2-2-2");

  // Countdown
  const [countdown, setCountdown] = useState<number | null>(null);

  // Match sync (creator publishes ticks, opponent subscribes)
  const { publishEvent } = useMatchSync({
    lobbyId,
    isCreator: role === "creator",
    enabled: phase === "match",
  });

  // Redirect if unauthenticated
  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.push("/");
  }, [sessionStatus, router]);

  // Fetch user's cards once we're in squad-pick phase
  useEffect(() => {
    if (phase !== "squad-pick" || ownedCards.length > 0 || loadingCards) return;
    setLoadingCards(true);
    fetch("/api/user/collection")
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((data) => {
        const seen = new Set<string>();
        const cards: FootballCard[] = [];
        for (const item of (data.cards ?? []) as ApiCard[]) {
          if (!item.card || seen.has(item.card.id)) continue;
          seen.add(item.card.id);
          cards.push({
            id: item.card.id, name: item.card.name,
            rarity: item.card.rarity as FootballCard["rarity"],
            attribute: (item.card.attribute ?? "Skill") as FootballCard["attribute"],
            imageUrl: item.card.imageUrl, kit: item.card.kit ?? null,
          });
        }
        setOwnedCards(cards);
      })
      .finally(() => setLoadingCards(false));
  }, [phase, ownedCards.length, loadingCards]);

  // When both squads locked, fetch the simulation and run countdown
  const buildSimulation = useCallback((stored: StoredSimulation) => {
    const rng = seedrandom(lobbyId);
    const sim = simulateMatch(
      stored.creatorLineup, stored.opponentLineup,
      stored.creatorFormation, stored.opponentFormation, rng,
    );
    setSimulation(sim);
    setCreatorLineup(stored.creatorLineup);
    setOpponentLineup(stored.opponentLineup);
    setCreatorFormation(stored.creatorFormation);
    setOpponentFormation(stored.opponentFormation);
  }, [lobbyId]);

  useEffect(() => {
    if (phase !== "countdown" || !lobby?.matchResult?.simulation) return;
    buildSimulation(lobby.matchResult.simulation);

    // 3-2-1 countdown, then start match
    setCountdown(3);
    const tick = (n: number) => {
      if (n <= 0) { setCountdown(null); setPhase("match"); return; }
      setTimeout(() => { setCountdown(n - 1); tick(n - 1); }, 1000);
    };
    tick(3);
  }, [phase, lobby?.matchResult, buildSimulation, setPhase]);

  // When the match was already played (FINISHED on page load), show result
  useEffect(() => {
    if (phase === "result" && lobby?.matchResult?.simulation && !simulation) {
      buildSimulation(lobby.matchResult.simulation);
    }
  }, [phase, lobby?.matchResult, simulation, buildSimulation]);

  async function handleJoin() {
    const ok = await joinLobby();
    if (!ok) alert("Could not join — lobby may be full or expired.");
  }

  async function handleSubmitSquad() {
    const assigned = slotsToLineup(lineup);
    if (assigned.length < 7) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const slots = lineup
        .filter((s) => s.card !== null)
        .map((s) => ({ position: s.position, posIndex: s.posIndex, cardId: s.card!.id }));
      const res = await fetch(`/api/lobbies/${lobbyId}/squad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formation, slots }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSubmitError(err.error ?? "Failed to submit squad");
        return;
      }
      setPhase("squad-locked");
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMatchComplete() {
    if (role !== "creator") { setPhase("result"); return; }
    // Creator persists the result
    await fetch(`/api/lobbies/${lobbyId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setPhase("result");
  }

  function copyLink() {
    const url = `${window.location.origin}/lobby/${lobbyId}`;
    navigator.clipboard?.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    });
  }

  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}/lobby/${lobbyId}` : `/lobby/${lobbyId}`;
  const filledCount = lineup.filter((s) => s.card !== null).length;
  const canSubmit = filledCount === 7;

  const myName = role === "creator" ? lobby?.creator.name : lobby?.opponent?.name;
  const opponentName = role === "creator" ? lobby?.opponent?.name : lobby?.creator.name;
  const opponentAvatar = role === "creator" ? lobby?.opponent?.image : lobby?.creator.image;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (sessionStatus === "loading" || phase === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pageWrapper = (children: React.ReactNode) => (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-green-900/10 blur-3xl" />
      </div>
      <div className="relative max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/game" className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm">← Game</Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400 text-sm font-mono truncate max-w-[160px]">{lobbyId}</span>
          {lobby?.creator && lobby?.opponent && (
            <>
              <span className="text-zinc-700">/</span>
              <span className="text-zinc-300 text-sm font-semibold">
                {lobby.creator.name} vs {lobby.opponent.name}
              </span>
            </>
          )}
        </div>
        {children}
      </div>
    </main>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return pageWrapper(
      <div className="text-center py-24">
        <p className="text-5xl mb-4">🏟</p>
        <h2 className="text-white font-bold text-xl mb-2">Lobby unavailable</h2>
        <p className="text-zinc-500 text-sm mb-6">This lobby may have expired or the match is already underway.</p>
        <Link href="/game" className="px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-500 transition-all">
          Back to Game
        </Link>
      </div>
    );
  }

  // ── Preview (visitor: sees invite, Join button) ─────────────────────────────
  if (phase === "preview") {
    return pageWrapper(
      <div className="max-w-sm mx-auto text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-zinc-900 border border-zinc-700 mb-5">
          <Avatar src={lobby?.creator.image} name={lobby?.creator.name} size={20} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">{lobby?.creator.name ?? "Someone"}&apos;s Lobby</h2>
        <p className="text-zinc-500 text-sm mb-8">wants to challenge you to a 7v7 match!</p>
        <button
          onClick={handleJoin}
          className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/40 active:scale-95"
        >
          ⚔️ Join Match
        </button>
      </div>
    );
  }

  // ── Waiting (creator: invite link + QR) ────────────────────────────────────
  if (phase === "waiting") {
    return pageWrapper(
      <div className="max-w-sm mx-auto text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-900/30 border border-green-700/40 mb-5">
          <span className="text-4xl">🏟</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Your lobby is ready!</h2>
        <p className="text-zinc-500 text-sm mb-6">Share the link or QR code with your opponent</p>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 mb-4">
          <div className="flex justify-center mb-4">
            <QRCodeSVG value={inviteUrl} size={140} bgColor="transparent" fgColor="#ffffff" />
          </div>
          <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
            <span className="text-zinc-400 text-xs flex-1 truncate">{inviteUrl}</span>
            <button
              onClick={copyLink}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                linkCopied ? "bg-green-700 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
              }`}
            >
              {linkCopied ? "✓ Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
          <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          Waiting for an opponent…
        </div>
      </div>
    );
  }

  // ── Squad pick ──────────────────────────────────────────────────────────────
  if (phase === "squad-pick") {
    return pageWrapper(
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My squad picker */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-white font-bold text-sm">Your Squad</span>
            <span className="text-zinc-500 text-xs ml-1">(only you can see this)</span>
          </div>

          {loadingCards ? (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : ownedCards.length < 7 ? (
            <div className="text-center py-12 text-zinc-500">
              <p className="text-4xl mb-3">⚽</p>
              <p className="text-zinc-300 font-semibold">You need at least 7 cards</p>
              <p className="text-sm mt-1">Open some packs first!</p>
            </div>
          ) : (
            <>
              <FormationPitchSelector
                ownedCards={ownedCards}
                formation={formation}
                lineup={lineup}
                onFormationChange={(f) => setFormation(f)}
                onLineupChange={(s) => setLineup(s)}
              />
              {submitError && <p className="text-red-400 text-sm text-center mt-3">{submitError}</p>}
              <button
                onClick={handleSubmitSquad}
                disabled={!canSubmit || submitting}
                className={`w-full mt-4 py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2
                  ${canSubmit && !submitting
                    ? "bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40 active:scale-95"
                    : "bg-zinc-900 text-zinc-600 border border-zinc-800 cursor-not-allowed"
                  }`}
              >
                {submitting && <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {canSubmit ? "Lock In Squad ⚔️" : `Fill ${7 - filledCount} more position${7 - filledCount !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>

        {/* Opponent status */}
        <div className="flex flex-col items-center justify-center rounded-2xl bg-zinc-900/60 border border-zinc-800 p-8 text-center">
          <Avatar src={opponentAvatar} name={opponentName} size={14} />
          <p className="text-white font-bold text-base mt-3">{opponentName ?? "Opponent"}</p>
          {opponentSquadLocked ? (
            <div className="flex items-center gap-2 mt-3 text-green-400 text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Squad locked ✓
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3 text-zinc-500 text-sm">
              <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
              Picking team…
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Squad locked ────────────────────────────────────────────────────────────
  if (phase === "squad-locked") {
    return pageWrapper(
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-900/30 border border-green-700/40 mb-5">
          <span className="text-4xl">✅</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Squad locked in!</h2>

        {opponentSquadLocked ? (
          <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
            <div className="w-4 h-4 border-2 border-green-600 border-t-green-400 rounded-full animate-spin" />
            Both squads ready — preparing the match…
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-zinc-500 text-sm">
            <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
            Waiting for {opponentName ?? "opponent"} to pick their squad…
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-6">
          <div className="text-center">
            <Avatar src={session?.user?.image} name={myName} size={12} />
            <p className="text-zinc-300 text-xs mt-1 font-semibold">You</p>
            <p className="text-green-400 text-[10px] mt-0.5">Ready ✓</p>
          </div>
          <span className="text-zinc-700 text-2xl font-bold">vs</span>
          <div className="text-center">
            <Avatar src={opponentAvatar} name={opponentName} size={12} />
            <p className="text-zinc-300 text-xs mt-1 font-semibold">{opponentName ?? "Opponent"}</p>
            {opponentSquadLocked
              ? <p className="text-green-400 text-[10px] mt-0.5">Ready ✓</p>
              : <p className="text-zinc-500 text-[10px] mt-0.5 animate-pulse">Picking…</p>
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Countdown ───────────────────────────────────────────────────────────────
  if (phase === "countdown") {
    return pageWrapper(
      <div className="text-center py-24">
        <p className="text-zinc-400 text-sm uppercase tracking-widest mb-4">Match starting</p>
        <div className="text-8xl font-black text-white tabular-nums transition-all duration-300">
          {countdown === 0 ? "⚽" : countdown}
        </div>
      </div>
    );
  }

  // ── Match ───────────────────────────────────────────────────────────────────
  if (phase === "match" && simulation) {
    const userIsCreator = role === "creator";
    const userLineup  = userIsCreator ? creatorLineup  : opponentLineup;
    const cpuLineupPv = userIsCreator ? opponentLineup : creatorLineup;
    const uForm       = userIsCreator ? creatorFormation  : opponentFormation;
    const cForm       = userIsCreator ? opponentFormation : creatorFormation;
    const uLabel      = myName ?? "You";
    const cLabel      = opponentName ?? "Opponent";

    return pageWrapper(
      <div className="w-full">
        {/* Player header */}
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <Avatar src={session?.user?.image} name={myName} size={8} />
            <span className="text-white font-bold text-sm">{myName ?? "You"}</span>
          </div>
          <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">PvP Match</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">{opponentName ?? "Opponent"}</span>
            <Avatar src={opponentAvatar} name={opponentName} size={8} />
          </div>
        </div>

        <FootballPitch
          simulation={simulation}
          userLineup={userLineup}
          cpuLineup={cpuLineupPv}
          userFormation={uForm}
          cpuFormation={cForm}
          skipReveal
          userLabel={uLabel}
          cpuLabel={cLabel}
          onEventFired={publishEvent}
          onComplete={handleMatchComplete}
        />
      </div>
    );
  }

  // ── Result ──────────────────────────────────────────────────────────────────
  if (phase === "result") {
    const mr = lobby?.matchResult;
    const userIsCreator = role === "creator";
    const myScore  = simulation ? (userIsCreator ? simulation.userScore : simulation.cpuScore)  : 0;
    const oppScore = simulation ? (userIsCreator ? simulation.cpuScore  : simulation.userScore) : 0;
    const winnerId = mr?.winnerId ?? null;
    const myId = userId;
    const iWon   = myId && winnerId === myId;
    const isDraw = winnerId === null;

    const cfg = isDraw
      ? { label: "Draw",     color: "text-zinc-200",  bg: "from-zinc-700/20",   emoji: "🤝" }
      : iWon
      ? { label: "Victory!", color: "text-green-400", bg: "from-green-900/25", emoji: "🏆" }
      : { label: "Defeat",   color: "text-red-400",   bg: "from-red-900/25",   emoji: "😞" };

    return pageWrapper(
      <div className="max-w-sm mx-auto text-center">
        <div className={`rounded-2xl bg-gradient-to-b ${cfg.bg} to-transparent border border-zinc-800 p-8 mb-5`}>
          <div className="text-6xl mb-3">{cfg.emoji}</div>
          <h2 className={`text-3xl font-black mb-4 ${cfg.color}`}>{cfg.label}</h2>
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="text-center">
              <Avatar src={session?.user?.image} name={myName} size={10} />
              <p className="text-zinc-400 text-xs mt-1">{myName ?? "You"}</p>
            </div>
            <div className="text-5xl font-black text-white">
              {myScore}<span className="text-zinc-600 text-3xl mx-2">–</span>{oppScore}
            </div>
            <div className="text-center">
              <Avatar src={opponentAvatar} name={opponentName} size={10} />
              <p className="text-zinc-400 text-xs mt-1">{opponentName ?? "Opponent"}</p>
            </div>
          </div>
        </div>

        {/* Goals */}
        {simulation && (myScore > 0 || oppScore > 0) && (
          <div className="mb-5 rounded-xl bg-zinc-900/60 border border-zinc-800 px-4 py-3 text-left">
            <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider mb-2">Goals</div>
            <div className="flex gap-6">
              {myScore > 0 && (
                <div className="flex-1">
                  <div className="text-blue-400 text-[10px] font-bold mb-1">YOU</div>
                  {simulation.events
                    .filter((ev) => ev.type === "goal" && ((userIsCreator && ev.team === "user") || (!userIsCreator && ev.team === "cpu")))
                    .map((ev, i) => {
                      const scorer = (userIsCreator ? creatorLineup : opponentLineup).find((p) => p.card.id === ev.scorerCardId)?.card.name ?? "—";
                      return (
                        <div key={i} className="text-zinc-300 text-xs py-0.5">
                          ⚽ <span className="font-semibold">{scorer}</span>
                          <span className="text-zinc-600 ml-1">{ev.minute}&apos;</span>
                        </div>
                      );
                    })}
                </div>
              )}
              {oppScore > 0 && (
                <div className="flex-1">
                  <div className="text-red-400 text-[10px] font-bold mb-1">OPPONENT</div>
                  {simulation.events
                    .filter((ev) => ev.type === "goal" && ((userIsCreator && ev.team === "cpu") || (!userIsCreator && ev.team === "user")))
                    .map((ev, i) => {
                      const scorer = (userIsCreator ? opponentLineup : creatorLineup).find((p) => p.card.id === ev.scorerCardId)?.card.name ?? "—";
                      return (
                        <div key={i} className="text-zinc-300 text-xs py-0.5">
                          ⚽ <span className="font-semibold text-zinc-400">{scorer}</span>
                          <span className="text-zinc-600 ml-1">{ev.minute}&apos;</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/game?tab=pvp"
            className="flex-1 py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/40"
          >
            ⚔️ Play Again
          </Link>
          <Link
            href="/dashboard"
            className="px-5 py-4 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 text-sm font-bold transition-all"
          >
            Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Fallback
  return pageWrapper(
    <div className="flex justify-center py-24">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
