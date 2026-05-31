"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useMemo } from "react";
import type { AssignedPlayer, Formation, MatchEvent, MatchSimulation, Rarity } from "@/lib/football";
import { FORMATIONS, getPlayerRating } from "@/lib/football";

const MATCH_DURATION = 32;

// ── Pitch position maps ───────────────────────────────────────────────────────

type PosMap = { GK: number[][]; DEF: number[][]; MID: number[][]; ATT: number[][] };

const USER_POSITIONS: Record<Formation, PosMap> = {
  "2-2-2": { GK: [[50,90]], DEF: [[28,76],[72,76]], MID: [[28,62],[72,62]], ATT: [[35,47],[65,47]] },
  "3-2-1": { GK: [[50,90]], DEF: [[18,76],[50,76],[82,76]], MID: [[32,62],[68,62]], ATT: [[50,47]] },
  "1-3-2": { GK: [[50,90]], DEF: [[50,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[33,47],[67,47]] },
  "2-3-1": { GK: [[50,90]], DEF: [[30,76],[70,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[50,47]] },
};

function mirrorY(map: PosMap): PosMap {
  const m = (y: number) => 100 - y;
  return {
    GK:  map.GK.map(([x,y])  => [x,m(y)]),
    DEF: map.DEF.map(([x,y]) => [x,m(y)]),
    MID: map.MID.map(([x,y]) => [x,m(y)]),
    ATT: map.ATT.map(([x,y]) => [x,m(y)]),
  };
}

const CPU_POSITIONS: Record<Formation, PosMap> = Object.fromEntries(
  (Object.entries(USER_POSITIONS) as [Formation, PosMap][]).map(([f, p]) => [f, mirrorY(p)])
) as Record<Formation, PosMap>;

function getCoord(player: AssignedPlayer, formation: Formation, team: "user" | "cpu"): [number, number] {
  const map = team === "user" ? USER_POSITIONS[formation] : CPU_POSITIONS[formation];
  const coords = map[player.position];
  return (coords[player.posIndex] ?? coords[0]) as [number, number];
}

// ── Tactical position shifts based on match phase ─────────────────────────────
// Returns [extraX, extraY] offsets. Y: negative = toward CPU goal (up), positive = toward user goal (down).

function getPositionOffset(
  player: AssignedPlayer,
  team: "user" | "cpu",
  phase: string,
  baseX: number,
): [number, number] {
  const [dY, cmpX] = (() => {
    if (team === "user") {
      if (phase === "user-attack") {
        if (player.position === "ATT") return [-11, 0];
        if (player.position === "MID") return [-5, 0];
        if (player.position === "DEF") return [-1, 0];
        return [0, 0]; // GK
      }
      if (phase === "cpu-attack") {
        if (player.position === "ATT") return [5, 0];
        if (player.position === "MID") return [5, 0];
        if (player.position === "DEF") return [6, (50 - baseX) * 0.18]; // compress toward centre
        return [0, (50 - baseX) * 0.12]; // GK also centres slightly
      }
    } else {
      // CPU team — inverted Y
      if (phase === "cpu-attack") {
        if (player.position === "ATT") return [11, 0];
        if (player.position === "MID") return [5, 0];
        if (player.position === "DEF") return [1, 0];
        return [0, 0];
      }
      if (phase === "user-attack") {
        if (player.position === "ATT") return [-5, 0];
        if (player.position === "MID") return [-5, 0];
        if (player.position === "DEF") return [-6, (50 - baseX) * 0.18];
        return [0, (50 - baseX) * 0.12];
      }
    }
    return [0, 0];
  })();
  return [cmpX, dY];
}

// ── Ball event zones (pre-computed per event to avoid per-frame random jitter) ─

function computeEventZone(ev: MatchEvent): { x: number; y: number } {
  const rx = (a: number, b: number) => a + Math.random() * (b - a);
  switch (ev.type) {
    case "kickoff": case "halftime": case "fulltime":
      return { x: 50, y: 50 };
    case "goal":
      return ev.team === "user"
        ? { x: rx(38, 62), y: 3 }
        : { x: rx(38, 62), y: 97 };
    case "save":
      return ev.team === "user"
        ? { x: rx(35, 65), y: 14 }
        : { x: rx(35, 65), y: 86 };
    case "nearpost":
      return ev.team === "user"
        ? { x: Math.random() > 0.5 ? rx(28, 38) : rx(62, 72), y: 8 }
        : { x: Math.random() > 0.5 ? rx(28, 38) : rx(62, 72), y: 92 };
    case "miss":
      return ev.team === "user"
        ? { x: Math.random() > 0.5 ? rx(15, 30) : rx(70, 85), y: 10 }
        : { x: Math.random() > 0.5 ? rx(15, 30) : rx(70, 85), y: 90 };
    case "tackle": case "clearance":
      return ev.phase === "user-attack"
        ? { x: rx(30, 70), y: rx(22, 32) }
        : { x: rx(30, 70), y: rx(68, 78) };
    case "counter":
      return ev.team === "user"
        ? { x: rx(35, 65), y: rx(35, 45) }
        : { x: rx(35, 65), y: rx(55, 65) };
    case "freekick": case "yellowcard":
      return ev.phase === "user-attack"
        ? { x: rx(30, 70), y: rx(28, 38) }
        : { x: rx(30, 70), y: rx(62, 72) };
    case "possession":
      return { x: rx(35, 65), y: rx(42, 58) };
    default:
      return { x: 50, y: 50 };
  }
}

// ── Momentum delta per event ──────────────────────────────────────────────────

function momentumDelta(ev: MatchEvent): number {
  const u = (n: number) => ev.team === "user" ? n : -n;
  switch (ev.type) {
    case "goal":       return u(35);
    case "nearpost":   return u(10);
    case "save":       return u(-6);   // shot saved → defending team's momentum
    case "miss":       return u(-8);
    case "counter":    return u(12);
    case "possession": return u(4);
    case "tackle":     return u(-6);   // tackled = lost ball
    case "clearance":  return u(-4);
    default:           return 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getHalftimeTip(u: number, c: number): string {
  const d = u - c;
  if (d >= 3)  return "You're cruising — hold Defensive in the second half!";
  if (d === 2) return "Two goals up — consider sitting deeper to protect the lead!";
  if (d === 1) return "One ahead — stay compact and hit them on the counter!";
  if (d === -1) return "One down — time to take more risks in the second half!";
  if (d <= -2) return "Go Attacking — you need goals in the second half!";
  return "Level pegging — the second half will decide everything!";
}

// ── CpuReveal with card flip animation ───────────────────────────────────────

function CpuReveal({
  cpuLineup, cpuFormation, onStart,
}: { cpuLineup: AssignedPlayer[]; cpuFormation: Formation; onStart: () => void }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [countdown, setCountdown]         = useState(5);

  // Reveal cards one by one every 350ms
  useEffect(() => {
    if (revealedCount >= cpuLineup.length) return;
    const t = setTimeout(() => setRevealedCount((c) => c + 1), 350);
    return () => clearTimeout(t);
  }, [revealedCount, cpuLineup.length]);

  // Countdown starts after all cards revealed
  useEffect(() => {
    if (revealedCount < cpuLineup.length) return;
    if (countdown <= 0) { onStart(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, revealedCount, cpuLineup.length, onStart]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="text-center mb-5">
        <div className="text-zinc-500 text-xs font-semibold uppercase tracking-widest mb-1">Your Opponent</div>
        <h2 className="text-2xl font-black text-white">{FORMATIONS[cpuFormation].label}</h2>
        <p className="text-red-400 text-sm font-medium">{FORMATIONS[cpuFormation].desc}</p>
      </div>

      {/* Card flip reveal */}
      <div className="space-y-2 mb-5">
        {cpuLineup.map((p, i) => {
          const isRevealed = i < revealedCount;
          return (
            <div
              key={p.card.id}
              style={{ perspective: "800px" }}
            >
              <div
                style={{
                  transformStyle: "preserve-3d",
                  transform: isRevealed ? "rotateY(0deg)" : "rotateY(-180deg)",
                  transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)",
                  position: "relative",
                  minHeight: "60px",
                }}
              >
                {/* Front (card face) */}
                <div
                  style={{ backfaceVisibility: "hidden" }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800"
                >
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
                {/* Back (card back — dark green) */}
                <div
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    position: "absolute",
                    inset: 0,
                  }}
                  className="rounded-xl bg-green-900/60 border border-green-700/40 flex items-center justify-center"
                >
                  <span className="text-green-700 text-2xl">⚽</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onStart}
        className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
      >
        <span>⚽</span>
        {revealedCount < cpuLineup.length
          ? "Revealing lineup…"
          : countdown > 0
          ? `Kick Off in ${countdown}…`
          : "Kick Off!"}
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
  /** PvP: skip the CPU card-reveal pre-match animation */
  skipReveal?: boolean;
  /** PvP: label shown on the scoreboard for the user side (default "Y") */
  userLabel?: string;
  /** PvP: label shown on the scoreboard for the CPU side (default "C") */
  cpuLabel?: string;
  /** PvP: called each time a new match event fires — creator uses this to publish ticks */
  onEventFired?: (event: MatchEvent, index: number) => void;
}

export default function FootballPitch({
  simulation, userLineup, cpuLineup, userFormation, cpuFormation, onComplete,
  skipReveal = false, userLabel = "Y", cpuLabel = "C", onEventFired,
}: Props) {
  const { events } = simulation;

  const [matchStarted, setMatchStarted]     = useState(() => skipReveal);
  const [elapsed, setElapsed]               = useState(0);
  const [ball, setBall]                     = useState({ x: 50, y: 50 });
  const [currentMinute, setCurrentMinute]   = useState(0);
  const [feed, setFeed]                     = useState<MatchEvent[]>([]);
  const [goalFlash, setGoalFlash]           = useState<"user" | "cpu" | null>(null);
  const [spotlightCardId, setSpotlightCardId] = useState<string | null>(null);
  const [possessorCardId, setPossessorCardId] = useState<string | null>(null);
  const [playerOffsets, setPlayerOffsets]   = useState<Record<string, { x: number; y: number }>>({});
  const [showHalftime, setShowHalftime]     = useState(false);
  const [activePhase, setActivePhase]       = useState<string>("kickoff");

  // Momentum: -100 (full CPU) to +100 (full user). Display: 0-100.
  const momentumRef = useRef(0);
  const [displayMomentum, setDisplayMomentum] = useState(50);

  // Live match stats
  const statsRef = useRef({ userShots: 0, cpuShots: 0, userSaves: 0, cpuSaves: 0, userPoss: 0, cpuPoss: 0 });
  const [liveStats, setLiveStats]           = useState(statsRef.current);

  // RAF control refs
  const startRef         = useRef<number | null>(null);
  const lastEventRef     = useRef(-1);
  const tickRef          = useRef(0);
  const halftimePausedRef = useRef(false);
  const momentPausedRef  = useRef(false);
  const pauseWallRef     = useRef(0);

  // Ball bezier path
  const ballPathRef  = useRef<{ fx:number;fy:number;tx:number;ty:number;cx:number;cy:number;t0:number;dur:number } | null>(null);
  const ballPosRef   = useRef({ x: 50, y: 50 });
  const eventZoneRef = useRef({ x: 50, y: 50 });
  const queueBallRef = useRef<{ x: number; y: number } | null>(null); // queued after goal reset

  function launchBall(toX: number, toY: number, gameTime: number) {
    const { x: fx, y: fy } = ballPosRef.current;
    const dx = toX - fx, dy = toY - fy;
    const dist = Math.hypot(dx, dy) || 1;
    const arc  = 0.28;
    ballPathRef.current = {
      fx, fy, tx: toX, ty: toY,
      cx: (fx + toX) / 2 + (-dy / dist) * dist * arc,
      cy: (fy + toY) / 2 + (dx  / dist) * dist * arc,
      t0: gameTime,
      dur: Math.max(0.22, Math.min(0.65, dist / 75)),
    };
  }

  useEffect(() => {
    const offsets: Record<string, { x: number; y: number }> = {};
    [...userLineup, ...cpuLineup].forEach((p) => {
      offsets[p.card.id] = { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2 };
    });
    setPlayerOffsets(offsets);
  }, [userLineup, cpuLineup]);

  const halftimePerformer = useMemo(() => {
    const htIdx = events.findIndex((e) => e.type === "halftime");
    if (htIdx < 0) return null;
    const cardMap = new Map<string, { name: string; imageUrl: string }>();
    userLineup.forEach((p) => cardMap.set(p.card.id, { name: p.card.name, imageUrl: p.card.imageUrl }));
    const inv = new Map<string, { name: string; goals: number; assists: number; imageUrl: string }>();
    for (const ev of events.slice(0, htIdx)) {
      if (ev.type !== "goal" || ev.team !== "user") continue;
      for (const [id, type] of [[ev.scorerCardId, "goal"], [ev.assisterCardId, "assist"]] as [string|undefined, string][]) {
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
    const d = performance.now() - pauseWallRef.current;
    startRef.current! += d;
    halftimePausedRef.current = false;
    setShowHalftime(false);
  }

  useEffect(() => {
    if (!matchStarted) return;
    const rafId = { current: 0 };

    function frame(ts: number) {
      if (startRef.current === null) startRef.current = ts;

      if (halftimePausedRef.current || momentPausedRef.current) {
        rafId.current = requestAnimationFrame(frame);
        return;
      }

      const elapsedSecs = Math.min((ts - startRef.current) / 1000, MATCH_DURATION);
      tickRef.current = elapsedSecs;
      const gameMin = (elapsedSecs / MATCH_DURATION) * 90;
      setElapsed(elapsedSecs);
      setCurrentMinute(Math.round(gameMin));

      // Find active event
      let activeIdx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].minute <= gameMin) activeIdx = i;
      }

      // Handle newly fired events
      if (activeIdx > lastEventRef.current) {
        lastEventRef.current = activeIdx;
        const ev = events[activeIdx];
        onEventFired?.(ev, activeIdx);

        setFeed((prev) => [ev, ...prev].slice(0, 12));
        setActivePhase(ev.phase);

        // Ball zone for this event
        const zone = computeEventZone(ev);
        eventZoneRef.current = zone;
        launchBall(zone.x, zone.y, elapsedSecs);

        // Momentum
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        momentumRef.current = clamp(momentumRef.current * 0.88 + momentumDelta(ev), -100, 100);
        setDisplayMomentum(50 + momentumRef.current / 2);

        // Live stats
        const s = { ...statsRef.current };
        const shotTypes = ["goal", "save", "miss", "nearpost"] as const;
        if ((shotTypes as readonly string[]).includes(ev.type)) {
          if (ev.team === "user") s.userShots++; else s.cpuShots++;
        }
        if (ev.type === "save") {
          if (ev.team === "user") s.cpuSaves++; else s.userSaves++;
        }
        if (ev.type === "possession" || ev.type === "counter") {
          if (ev.team === "user") s.userPoss++; else s.cpuPoss++;
        }
        statsRef.current = s;
        setLiveStats({ ...s });

        // Possessor ring
        const possLineup   = ev.team === "user" ? userLineup : cpuLineup;
        const defLineup    = ev.team === "user" ? cpuLineup  : userLineup;
        let possCard: AssignedPlayer | undefined;
        if (ev.type === "save" || ev.type === "clearance") {
          possCard = defLineup.find((p) => p.position === (ev.type === "save" ? "GK" : "DEF"));
        } else if (ev.type === "tackle") {
          possCard = defLineup.find((p) => p.position === "DEF");
        } else if (ev.type === "possession") {
          possCard = possLineup.find((p) => p.position === "MID");
        } else {
          possCard = possLineup.find((p) => p.position === "ATT") ?? possLineup.find((p) => p.position === "MID");
        }
        setPossessorCardId(possCard?.card.id ?? null);

        // Spotlight on big events
        if (ev.type === "goal") {
          setGoalFlash(ev.team);
          setSpotlightCardId(ev.scorerCardId ?? null);
          // Dramatic 2s pause
          momentPausedRef.current = true;
          const momentStart = performance.now();
          setTimeout(() => {
            const d = performance.now() - momentStart;
            startRef.current! += d;
            momentPausedRef.current = false;
            setGoalFlash(null);
            setSpotlightCardId(null);
            setPossessorCardId(null);
            // Queue ball to center after goal
            queueBallRef.current = { x: 50, y: 50 };
          }, 2000);
        } else if (ev.type === "save") {
          const savingGk = defLineup.find((p) => p.position === "GK");
          setSpotlightCardId(savingGk?.card.id ?? null);
          setTimeout(() => setSpotlightCardId(null), 1500);
        } else if (ev.type === "halftime") {
          halftimePausedRef.current = true;
          pauseWallRef.current = performance.now();
          setShowHalftime(true);
        }
      }

      // Queued ball reset (after goal pause ends)
      if (queueBallRef.current && !momentPausedRef.current) {
        const q = queueBallRef.current;
        queueBallRef.current = null;
        launchBall(q.x, q.y, elapsedSecs);
      }

      // Ball bezier
      if (ballPathRef.current) {
        const p = ballPathRef.current;
        const rawT = (elapsedSecs - p.t0) / p.dur;
        const t = Math.max(0, Math.min(1, rawT));
        const u = 1 - t;
        const x = u*u*p.fx + 2*u*t*p.cx + t*t*p.tx;
        const y = u*u*p.fy + 2*u*t*p.cy + t*t*p.ty;
        ballPosRef.current = { x, y };
        setBall({ x, y });
        if (t >= 1) ballPathRef.current = null;
      } else {
        // Gentle drift toward event zone when path is done
        const z = eventZoneRef.current;
        const nx = ballPosRef.current.x + (z.x - ballPosRef.current.x) * 0.015;
        const ny = ballPosRef.current.y + (z.y - ballPosRef.current.y) * 0.015;
        ballPosRef.current = { x: nx, y: ny };
        setBall({ x: nx, y: ny });
      }

      if (elapsedSecs < MATCH_DURATION) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        onComplete();
      }
    }

    rafId.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId.current);
  }, [events, onComplete, matchStarted, userLineup, cpuLineup]);

  const progress = (elapsed / MATCH_DURATION) * 100;
  const htScore  = simulation.halftimeScore;

  // Possession % from stats
  const totalPoss = liveStats.userPoss + liveStats.cpuPoss;
  const userPossPct = totalPoss > 0 ? Math.round((liveStats.userPoss / totalPoss) * 100) : 50;

  // ── Player token ──────────────────────────────────────────────────────────

  function PlayerToken({ player, formation, team }: { player: AssignedPlayer; formation: Formation; team: "user" | "cpu" }) {
    const [bx, by] = getCoord(player, formation, team);
    const phase     = playerOffsets[player.card.id] ?? { x: 0, y: 0 };
    const wobbleX   = Math.sin(elapsed * 1.1 + phase.x) * 1.1;
    const wobbleY   = Math.sin(elapsed * 0.85 + phase.y) * 0.9;
    const [extraX, extraY] = getPositionOffset(player, team, activePhase, bx);

    const isSpotlight  = spotlightCardId === player.card.id;
    const isPossessor  = possessorCardId === player.card.id && !isSpotlight;
    const isGoalScorer = isSpotlight && goalFlash !== null;

    return (
      <div
        className={`absolute ${isSpotlight ? "z-30" : "z-10"}`}
        style={{
          left: `${bx + wobbleX + extraX}%`,
          top:  `${by + wobbleY + extraY}%`,
          transform: "translate(-50%, -50%)",
          transition: isGoalScorer
            ? "top 0.4s ease-out, left 0.4s ease-out"
            : "top 0.7s cubic-bezier(0.4,0,0.2,1), left 0.7s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Possessor ring */}
        {isPossessor && (
          <div className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-pulse scale-125 z-10" />
        )}
        {/* Spotlight ring */}
        {isSpotlight && (
          <div className="absolute inset-0 rounded-full ring-4 ring-yellow-400 animate-pulse scale-150 z-10" />
        )}
        <div
          className={`relative rounded-full ring-2 overflow-hidden shadow-lg transition-all duration-300
            ${RARITY_RING[player.card.rarity]}
            ${isSpotlight ? "w-10 h-10 sm:w-12 sm:h-12" : "w-6 h-6 sm:w-8 sm:h-8"}
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
          <div className={`absolute inset-0 pointer-events-none ${team === "user" ? "bg-blue-500/20" : "bg-red-500/25"}`} />
        </div>
      </div>
    );
  }

  // ── Pre-match CPU reveal ──────────────────────────────────────────────────

  if (!matchStarted) {
    return <CpuReveal cpuLineup={cpuLineup} cpuFormation={cpuFormation} onStart={() => setMatchStarted(true)} />;
  }

  return (
    <>
    {/* Halftime fixed modal */}
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

    <div className="flex flex-row gap-2 sm:gap-4 w-full max-w-3xl mx-auto">
      {/* Pitch */}
      <div className="relative w-[42%] sm:w-52 lg:w-64 xl:w-72 shrink-0">
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{ paddingTop: "150%", background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}
        >
          <div className="absolute inset-0">
            {/* Pitch markings */}
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

            {/* Players */}
            {userLineup.map((p) => <PlayerToken key={p.card.id} player={p} formation={userFormation} team="user" />)}
            {cpuLineup.map((p)  => <PlayerToken key={p.card.id} player={p} formation={cpuFormation}  team="cpu"  />)}

            {/* Ball */}
            <div
              className="absolute rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{
                width: "4%", aspectRatio: "1",
                left: `${ball.x}%`, top: `${ball.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Goal flash */}
            {goalFlash && (
              <div className={`absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none
                ${goalFlash === "user" ? "bg-green-500/30" : "bg-red-500/25"}`}>
                <div className="bg-black/60 rounded-2xl px-4 py-2">
                  <span className="text-3xl font-black text-white drop-shadow-lg animate-bounce block text-center">
                    {goalFlash === "user" ? "⚽ GOAL!" : "CPU GOAL"}
                  </span>
                  <div className="text-center text-white/60 text-xs mt-1 font-bold">
                    {feed[0]?.scoreUser ?? 0} – {feed[0]?.scoreCpu ?? 0}
                  </div>
                </div>
              </div>
            )}

            {/* Scoreboard */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-black/55 backdrop-blur-sm">
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[7px] font-bold">{userLabel[0]}</div>
                  <span className="text-white text-xs font-bold">{feed[0]?.scoreUser ?? 0}</span>
                </div>
                <div className="text-white/60 text-[9px] font-mono">{currentMinute}&apos;</div>
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs font-bold">{feed[0]?.scoreCpu ?? 0}</span>
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] font-bold">{cpuLabel[0]}</div>
                </div>
              </div>
              {/* Momentum bar */}
              <div className="px-2 pb-1.5 flex items-center gap-1">
                <span className="text-blue-400/60 text-[7px] font-bold shrink-0">YOU</span>
                <div className="flex-1 h-1 rounded-full overflow-hidden bg-red-900/60">
                  <div
                    className="h-full bg-blue-500/80 transition-all duration-1000 rounded-full"
                    style={{ width: `${displayMomentum}%` }}
                  />
                </div>
                <span className="text-red-400/60 text-[7px] font-bold shrink-0">CPU</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div className="h-full bg-white/40 transition-all duration-100" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Commentary + stats */}
      <div className="flex-1 flex flex-col gap-1.5 sm:gap-2 min-h-0 overflow-hidden">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-zinc-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Commentary</span>
          <span className="ml-auto text-zinc-500 text-[10px] sm:text-xs font-mono">{currentMinute}&apos;</span>
        </div>

        {/* Scrollable feed — flex-1 so it fills remaining height between header and stats */}
        <div className="flex flex-col gap-1 sm:gap-1.5 overflow-y-auto flex-1 min-h-0 pr-0.5">
          {feed.length === 0 && <div className="text-zinc-600 text-xs italic">Waiting for kick off…</div>}
          {feed.map((ev, i) => (
            <div
              key={`${ev.minute}-${i}`}
              className={`flex items-start gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg
                ${i === 0 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-900/50"}
                ${ev.type === "goal" && ev.team === "user" ? "!border-blue-500/50 !bg-blue-900/20" : ""}
                ${ev.type === "goal" && ev.team === "cpu"  ? "!border-red-500/50  !bg-red-900/20"  : ""}
                ${ev.type === "yellowcard" ? "!border-yellow-700/30 !bg-yellow-900/10" : ""}
              `}
            >
              <span className="shrink-0 text-sm leading-none mt-0.5">{EVENT_ICON[ev.type] ?? "●"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 text-[10px] font-mono mr-1">{ev.minute}&apos;</span>
                <span className={`text-[11px] sm:text-xs leading-snug ${ev.type === "goal" ? "font-semibold text-white" : "text-zinc-300"}`}>
                  {ev.description}
                </span>
              </div>
              {(ev.type === "goal" || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-[10px] font-bold text-white/70">{ev.scoreUser}–{ev.scoreCpu}</span>
              )}
            </div>
          ))}
        </div>

        {/* Live match stats */}
        <div className="rounded-lg sm:rounded-xl bg-zinc-900/60 border border-zinc-800 px-2 sm:px-3 py-1.5 sm:py-2 shrink-0">
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Shots</div>
              <div className="text-[10px] sm:text-xs font-bold">
                <span className="text-blue-400">{liveStats.userShots}</span>
                <span className="text-zinc-600 mx-0.5">–</span>
                <span className="text-red-400">{liveStats.cpuShots}</span>
              </div>
            </div>
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Saves</div>
              <div className="text-[10px] sm:text-xs font-bold">
                <span className="text-blue-400">{liveStats.userSaves}</span>
                <span className="text-zinc-600 mx-0.5">–</span>
                <span className="text-red-400">{liveStats.cpuSaves}</span>
              </div>
            </div>
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Poss</div>
              <div className="text-[10px] sm:text-xs font-bold">
                <span className="text-blue-400">{userPossPct}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rarity legend — hidden on mobile to save space */}
        <div className="hidden sm:flex flex-wrap gap-2 shrink-0">
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
