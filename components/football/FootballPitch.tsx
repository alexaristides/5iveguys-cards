"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useMemo } from "react";
import type { AssignedPlayer, Formation, MatchEvent, MatchSimulation, Rarity } from "@/lib/football";
import { FORMATIONS, getPlayerRating } from "@/lib/football";

const MATCH_DURATION = 32; // seconds of real time

type PosMap = { GK: number[][]; DEF: number[][]; MID: number[][]; ATT: number[][] };

const USER_POSITIONS: Record<Formation, PosMap> = {
  "2-2-2": { GK: [[50,90]], DEF: [[28,76],[72,76]], MID: [[28,62],[72,62]], ATT: [[35,47],[65,47]] },
  "3-2-1": { GK: [[50,90]], DEF: [[18,76],[50,76],[82,76]], MID: [[32,62],[68,62]], ATT: [[50,47]] },
  "1-3-2": { GK: [[50,90]], DEF: [[50,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[33,47],[67,47]] },
  "2-3-1": { GK: [[50,90]], DEF: [[30,76],[70,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[50,47]] },
};

function mirrorY(map: PosMap): PosMap {
  const m = (y: number) => 100 - y;
  return { GK: map.GK.map(([x,y])=>[x,m(y)]), DEF: map.DEF.map(([x,y])=>[x,m(y)]), MID: map.MID.map(([x,y])=>[x,m(y)]), ATT: map.ATT.map(([x,y])=>[x,m(y)]) };
}

const CPU_POSITIONS: Record<Formation, PosMap> = Object.fromEntries(
  (Object.entries(USER_POSITIONS) as [Formation, PosMap][]).map(([f, p]) => [f, mirrorY(p)])
) as Record<Formation, PosMap>;

function getCoord(player: AssignedPlayer, formation: Formation, team: "user" | "cpu"): [number, number] {
  const map = team === "user" ? USER_POSITIONS[formation] : CPU_POSITIONS[formation];
  const coords = map[player.position];
  return (coords[player.posIndex] ?? coords[0]) as [number, number];
}

const RARITY_RING: Record<Rarity, string> = {
  common: "ring-zinc-400", rare: "ring-blue-400", epic: "ring-purple-400", legendary: "ring-amber-400",
};

const POS_COLOR: Record<string, string> = {
  GK: "bg-yellow-600/80 text-yellow-100", DEF: "bg-blue-700/80 text-blue-100",
  MID: "bg-green-700/80 text-green-100",  ATT: "bg-red-700/80 text-red-100",
};

const ATTR_ICON: Record<string, string> = { Pace: "⚡", Power: "💪", Skill: "🎯" };

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗",
  kickoff: "🏁", halftime: "⏸", fulltime: "🔔", possession: "●",
  freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
};

function getBallTarget(event: MatchEvent, tick: number): { x: number; y: number } {
  const j = (n: number) => n + Math.sin(tick * 2.3 + n) * 2.5;
  switch (event.type) {
    case "kickoff": case "halftime": case "fulltime": case "possession":
      return { x: 50, y: 50 };
    case "goal":
      return event.team === "user" ? { x: j(50), y: 5 } : { x: j(50), y: 95 };
    case "save": case "miss": case "nearpost":
      return event.phase === "user-attack" ? { x: j(50), y: j(18) } : { x: j(50), y: j(82) };
    case "counter":
      return event.phase === "user-attack" ? { x: j(45), y: j(35) } : { x: j(45), y: j(65) };
    default:
      return event.phase === "user-attack" ? { x: j(48), y: j(30) } : event.phase === "cpu-attack" ? { x: j(48), y: j(70) } : { x: j(50), y: j(50) };
  }
}

function getHalftimeTip(userScore: number, cpuScore: number): string {
  const d = userScore - cpuScore;
  if (d >= 3)  return "You're cruising — switch to Defensive to protect your lead!";
  if (d === 2) return "Two goals up — consider sitting deeper in the second half!";
  if (d === 1) return "One ahead — keep it tight and hit them on the counter!";
  if (d === -1) return "One down — push forward, but don't leave yourself exposed!";
  if (d <= -2) return "Time to go Attacking — you need goals in the second half!";
  return "Level pegging — the second half will decide everything!";
}

// ── CPU reveal screen ─────────────────────────────────────────────────────────

function CpuReveal({
  cpuLineup, cpuFormation, onStart,
}: { cpuLineup: AssignedPlayer[]; cpuFormation: Formation; onStart: () => void }) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (countdown <= 0) { onStart(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onStart]);

  return (
    <div className="w-full max-w-sm mx-auto animate-fade-in">
      <div className="text-center mb-5">
        <div className="text-zinc-500 text-xs font-semibold uppercase tracking-widest mb-1">Your Opponent</div>
        <h2 className="text-2xl font-black text-white">{FORMATIONS[cpuFormation].label}</h2>
        <p className="text-red-400 text-sm font-medium">{FORMATIONS[cpuFormation].desc}</p>
      </div>

      <div className="space-y-2 mb-5">
        {cpuLineup.map((p) => (
          <div key={p.card.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="relative w-10 h-14 rounded-lg overflow-hidden ring-1 ring-red-500/40 shrink-0">
              <Image src={p.card.imageUrl} alt={p.card.name} fill className="object-cover" sizes="40px" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${POS_COLOR[p.position]}`}>
                  {p.position}
                </span>
                <span className="text-white text-sm font-semibold truncate">{p.card.name}</span>
              </div>
              <div className="text-zinc-500 text-xs mt-0.5">
                {ATTR_ICON[p.card.attribute]} {p.card.attribute} · <span className="capitalize">{p.card.rarity}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-white font-black text-lg leading-none">{getPlayerRating(p.card, p.position)}</div>
              <div className="text-zinc-600 text-[10px]">OVR</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95"
      >
        <span>⚽</span>
        {countdown > 0 ? `Kick Off in ${countdown}…` : "Kick Off!"}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  simulation: MatchSimulation;
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userFormation: Formation;
  cpuFormation: Formation;
  onComplete: () => void;
}

export default function FootballPitch({
  simulation, userLineup, cpuLineup, userFormation, cpuFormation, onComplete,
}: Props) {
  const { events } = simulation;

  // Pre-match reveal
  const [matchStarted, setMatchStarted] = useState(false);

  // Animation state
  const startRef      = useRef<number | null>(null);
  const lastEventRef  = useRef(-1);
  const tickRef       = useRef(0);
  const pausedRef     = useRef(false);
  const pauseWallRef  = useRef(0);

  const [elapsed, setElapsed]               = useState(0);
  const [ball, setBall]                     = useState({ x: 50, y: 50 });
  const [score, setScore]                   = useState({ user: 0, cpu: 0 });
  const [feed, setFeed]                     = useState<MatchEvent[]>([]);
  const [goalFlash, setGoalFlash]           = useState<"user" | "cpu" | null>(null);
  const [flashCardId, setFlashCardId]       = useState<string | null>(null);
  const [currentMinute, setCurrentMinute]   = useState(0);
  const [playerOffsets, setPlayerOffsets]   = useState<Record<string, { x: number; y: number }>>({});
  const [showHalftime, setShowHalftime]     = useState(false);

  useEffect(() => {
    const offsets: Record<string, { x: number; y: number }> = {};
    [...userLineup, ...cpuLineup].forEach((p) => {
      offsets[p.card.id] = { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2 };
    });
    setPlayerOffsets(offsets);
  }, [userLineup, cpuLineup]);

  // Halftime top performer
  const halftimePerformer = useMemo(() => {
    const htIdx = events.findIndex((e) => e.type === "halftime");
    if (htIdx < 0) return null;
    const cardMap = new Map<string, { name: string; imageUrl: string }>();
    userLineup.forEach((p) => cardMap.set(p.card.id, { name: p.card.name, imageUrl: p.card.imageUrl }));

    const inv = new Map<string, { name: string; goals: number; assists: number; imageUrl: string }>();
    for (const ev of events.slice(0, htIdx)) {
      if (ev.type !== "goal" || ev.team !== "user") continue;
      for (const [id, type] of [[ev.scorerCardId, "goal"], [ev.assisterCardId, "assist"]] as [string | undefined, string][]) {
        if (!id) continue;
        const card = cardMap.get(id);
        if (!card) continue;
        const e = inv.get(id) ?? { name: card.name, goals: 0, assists: 0, imageUrl: card.imageUrl };
        if (type === "goal") e.goals++; else e.assists++;
        inv.set(id, e);
      }
    }
    let best = null, bestScore = 0;
    for (const v of inv.values()) {
      const s = v.goals * 3 + v.assists;
      if (s > bestScore) { bestScore = s; best = v; }
    }
    return best;
  }, [events, userLineup]);

  function handleResumeSecondHalf() {
    const pauseDuration = performance.now() - pauseWallRef.current;
    startRef.current! += pauseDuration;
    pausedRef.current = false;
    setShowHalftime(false);
  }

  useEffect(() => {
    if (!matchStarted) return;
    const rafId = { current: 0 };

    function frame(ts: number) {
      if (startRef.current === null) startRef.current = ts;

      if (pausedRef.current) {
        rafId.current = requestAnimationFrame(frame);
        return;
      }

      const elapsedSecs = Math.min((ts - startRef.current) / 1000, MATCH_DURATION);
      tickRef.current = elapsedSecs;
      const matchMinute = (elapsedSecs / MATCH_DURATION) * 90;
      setElapsed(elapsedSecs);
      setCurrentMinute(Math.round(matchMinute));

      let activeIdx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].minute <= matchMinute) activeIdx = i;
      }

      if (activeIdx > lastEventRef.current) {
        lastEventRef.current = activeIdx;
        const ev = events[activeIdx];
        setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
        setFeed((prev) => [ev, ...prev].slice(0, 10));

        if (ev.type === "goal") {
          setGoalFlash(ev.team);
          setFlashCardId(ev.scorerCardId ?? null);
          setTimeout(() => { setGoalFlash(null); setFlashCardId(null); }, 2000);
        }

        if (ev.type === "halftime") {
          pausedRef.current = true;
          pauseWallRef.current = performance.now();
          setShowHalftime(true);
        }
      }

      const target = getBallTarget(events[activeIdx], elapsedSecs);
      setBall((prev) => ({
        x: prev.x + (target.x - prev.x) * 0.08,
        y: prev.y + (target.y - prev.y) * 0.08,
      }));

      if (elapsedSecs < MATCH_DURATION) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        onComplete();
      }
    }

    rafId.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId.current);
  }, [events, onComplete, matchStarted]);

  const progress = (elapsed / MATCH_DURATION) * 100;

  function PlayerToken({ player, formation, team }: { player: AssignedPlayer; formation: Formation; team: "user" | "cpu" }) {
    const [bx, by] = getCoord(player, formation, team);
    const phase = playerOffsets[player.card.id] ?? { x: 0, y: 0 };
    const ox = Math.sin(elapsed * 1.2 + phase.x) * 1.2;
    const oy = Math.sin(elapsed * 0.9 + phase.y) * 1.0;
    const activePhase = events[lastEventRef.current]?.phase;

    // Attackers push forward during their team's attack
    let extraY = 0;
    if (team === "user" && activePhase === "user-attack" && player.position === "ATT") extraY = -2.5;
    if (team === "cpu"  && activePhase === "cpu-attack"  && player.position === "ATT") extraY = 2.5;

    // Goal scorer moves toward goal
    const isScorer = flashCardId === player.card.id;
    let goalPushY = 0;
    if (isScorer) {
      goalPushY = team === "user" ? -6 : 6;
    }

    return (
      <div
        className={`absolute ${isScorer ? "z-30" : "z-10"}`}
        style={{
          left: `${bx + ox}%`,
          top: `${by + oy + extraY + goalPushY}%`,
          transform: "translate(-50%, -50%)",
          transition: isScorer ? "top 0.4s ease-out, left 0.4s ease-out" : "top 0.7s ease-out, left 0.7s ease-out",
        }}
      >
        <div
          className={`relative w-6 h-6 sm:w-8 sm:h-8 rounded-full ring-2 overflow-hidden shadow-lg transition-all duration-300
            ${RARITY_RING[player.card.rarity]}
            ${isScorer ? "scale-150 ring-4 ring-yellow-400 shadow-yellow-400/60" : ""}
          `}
          title={`${player.card.name} (${player.position})`}
        >
          <Image
            src={player.card.imageUrl}
            alt={player.card.name}
            fill
            className="object-cover object-top"
            sizes="32px"
          />
          {/* Team colour tint */}
          <div className={`absolute inset-0 pointer-events-none ${team === "user" ? "bg-blue-500/25" : "bg-red-500/30"}`} />
        </div>
      </div>
    );
  }

  // ── Pre-match reveal ────────────────────────────────────────────────────────
  if (!matchStarted) {
    return <CpuReveal cpuLineup={cpuLineup} cpuFormation={cpuFormation} onStart={() => setMatchStarted(true)} />;
  }

  const htScore = simulation.halftimeScore;

  return (
    <>
    {/* Halftime modal — fixed so it never clips the pitch on any screen size */}
    {showHalftime && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-center">
          <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mb-2">Half Time</div>
          <div className="text-white text-4xl font-black mb-4">{htScore.user}–{htScore.cpu}</div>
          {halftimePerformer && (
            <div className="mb-4 flex items-center gap-3 bg-zinc-800/60 rounded-xl px-3 py-2.5 text-left">
              <div className="relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-amber-500/60 shrink-0">
                <Image src={halftimePerformer.imageUrl} alt={halftimePerformer.name} fill className="object-cover object-top" sizes="40px" />
              </div>
              <div className="min-w-0">
                <div className="text-zinc-400 text-[9px] uppercase tracking-wider mb-0.5">Best so far</div>
                <div className="text-white text-sm font-bold truncate">{halftimePerformer.name}</div>
                <div className="text-amber-400 text-xs mt-0.5">
                  {halftimePerformer.goals > 0 && `${halftimePerformer.goals} goal${halftimePerformer.goals > 1 ? "s" : ""}`}
                  {halftimePerformer.goals > 0 && halftimePerformer.assists > 0 && " · "}
                  {halftimePerformer.assists > 0 && `${halftimePerformer.assists} assist${halftimePerformer.assists > 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
          )}
          <p className="text-zinc-400 text-sm mb-5 leading-relaxed">{getHalftimeTip(htScore.user, htScore.cpu)}</p>
          <button
            onClick={handleResumeSecondHalf}
            className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all active:scale-95"
          >
            ⚽ Second Half
          </button>
        </div>
      </div>
    )}
    <div className="flex flex-col lg:flex-row gap-4 w-full max-w-3xl mx-auto">
      {/* Pitch */}
      <div className="relative w-full lg:w-64 xl:w-72 shrink-0">
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{ paddingTop: "150%", background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}
        >
          <div className="absolute inset-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={i % 2 === 0 ? "absolute inset-x-0 bg-black/[0.04]" : "absolute inset-x-0"}
                style={{ top: `${i * 12.5}%`, height: "12.5%" }} />
            ))}
            <div className="absolute inset-[4%] border border-white/25 rounded-sm" />
            <div className="absolute left-[4%] right-[4%] border-t border-white/25" style={{ top: "50%" }} />
            <div className="absolute rounded-full border border-white/25"
              style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }} />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }} />
            <div className="absolute border border-white/20 border-t-0"
              style={{ width: "46%", left: "27%", top: "4%", height: "15%" }} />
            <div className="absolute border border-white/20 border-b-0"
              style={{ width: "46%", left: "27%", bottom: "4%", height: "15%" }} />
            <div className="absolute border border-white/40 border-t-0 bg-white/5"
              style={{ width: "22%", left: "39%", top: 0, height: "4%" }} />
            <div className="absolute border border-white/40 border-b-0 bg-white/5"
              style={{ width: "22%", left: "39%", bottom: 0, height: "4%" }} />

            <div className="absolute top-[4.5%] left-1/2 -translate-x-1/2 text-red-300/70 text-[8px] font-bold uppercase tracking-widest">CPU</div>
            <div className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 text-blue-300/70 text-[8px] font-bold uppercase tracking-widest">YOU</div>

            {userLineup.map((p) => <PlayerToken key={p.card.id} player={p} formation={userFormation} team="user" />)}
            {cpuLineup.map((p)  => <PlayerToken key={p.card.id} player={p} formation={cpuFormation}  team="cpu"  />)}

            {/* Ball */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{ left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)" }} />

            {/* Goal flash */}
            {goalFlash && (
              <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none
                ${goalFlash === "user" ? "bg-blue-500/25" : "bg-red-500/25"}`}>
                <span className="text-4xl font-black text-white drop-shadow-lg animate-bounce">GOAL!</span>
                <span className="text-xs text-white/80 font-bold mt-1">
                  {goalFlash === "user" ? "YOU SCORED!" : "CPU SCORED"}
                </span>
              </div>
            )}

            {/* Scoreboard — derived from feed[0] so score and commentary are always in sync */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5 bg-black/55 backdrop-blur-sm">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[7px] font-bold">Y</div>
                <span className="text-white text-xs font-bold">{feed[0]?.scoreUser ?? 0}</span>
              </div>
              <div className="text-white/60 text-[9px] font-mono">{currentMinute}&apos;</div>
              <div className="flex items-center gap-1">
                <span className="text-white text-xs font-bold">{feed[0]?.scoreCpu ?? 0}</span>
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] font-bold">C</div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div className="h-full bg-white/40 transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>

            {/* Halftime — rendered as fixed modal outside the pitch so it doesn't clip on mobile */}
          </div>
        </div>
      </div>

      {/* Commentary feed */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Live Commentary</span>
          <span className="ml-auto text-zinc-500 text-xs font-mono">{currentMinute}&apos;</span>
        </div>

        <div className="flex flex-col gap-1.5 overflow-hidden">
          {feed.length === 0 && <div className="text-zinc-600 text-sm italic">Waiting for kick off…</div>}
          {feed.map((ev, i) => (
            <div
              key={`${ev.minute}-${i}`}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-all
                ${i === 0 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-900/50"}
                ${ev.type === "goal" && ev.team === "user" ? "!border-blue-500/50 !bg-blue-900/20" : ""}
                ${ev.type === "goal" && ev.team === "cpu"  ? "!border-red-500/50  !bg-red-900/20"  : ""}
                ${ev.type === "yellowcard" ? "!border-yellow-700/30 !bg-yellow-900/10" : ""}
              `}
            >
              <span className="shrink-0 text-base leading-none mt-0.5">{EVENT_ICON[ev.type] ?? "●"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 text-xs font-mono mr-1.5">{ev.minute}&apos;</span>
                <span className={`text-sm ${ev.type === "goal" ? "font-semibold text-white" : "text-zinc-300"}`}>
                  {ev.description}
                </span>
              </div>
              {(ev.type === "goal" || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-xs font-bold text-white/70 ml-1">{ev.scoreUser}–{ev.scoreCpu}</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto pt-3 flex flex-wrap gap-2">
          {(["legendary", "epic", "rare", "common"] as const).map((r) => (
            <div key={r} className="flex items-center gap-1 text-xs text-zinc-500">
              <div className={`w-2.5 h-2.5 rounded-full ring-1 ${RARITY_RING[r]} bg-zinc-700`} />
              {r}
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
