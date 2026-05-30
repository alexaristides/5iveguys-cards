"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignedPlayer, Formation, MatchEvent, MatchSimulation, Rarity } from "@/lib/football";

const MATCH_DURATION = 30; // seconds

// Pitch positions [x%, y%] for each formation, user team (bottom)
type PositionMap = { GK: number[][]; DEF: number[][]; MID: number[][]; ATT: number[][] };

const USER_POSITIONS: Record<Formation, PositionMap> = {
  "2-2-2": {
    GK:  [[50, 90]],
    DEF: [[28, 76], [72, 76]],
    MID: [[28, 62], [72, 62]],
    ATT: [[35, 47], [65, 47]],
  },
  "3-2-1": {
    GK:  [[50, 90]],
    DEF: [[18, 76], [50, 76], [82, 76]],
    MID: [[32, 62], [68, 62]],
    ATT: [[50, 47]],
  },
  "1-3-2": {
    GK:  [[50, 90]],
    DEF: [[50, 76]],
    MID: [[18, 62], [50, 62], [82, 62]],
    ATT: [[33, 47], [67, 47]],
  },
  "2-3-1": {
    GK:  [[50, 90]],
    DEF: [[30, 76], [70, 76]],
    MID: [[18, 62], [50, 62], [82, 62]],
    ATT: [[50, 47]],
  },
};

function mirrorY(map: PositionMap): PositionMap {
  const m = (y: number) => 100 - y;
  return {
    GK:  map.GK.map(([x, y]) => [x, m(y)]),
    DEF: map.DEF.map(([x, y]) => [x, m(y)]),
    MID: map.MID.map(([x, y]) => [x, m(y)]),
    ATT: map.ATT.map(([x, y]) => [x, m(y)]),
  };
}

const CPU_POSITIONS: Record<Formation, PositionMap> = Object.fromEntries(
  (Object.entries(USER_POSITIONS) as [Formation, PositionMap][]).map(([f, p]) => [f, mirrorY(p)])
) as Record<Formation, PositionMap>;

function getCoord(
  player: AssignedPlayer,
  formation: Formation,
  team: "user" | "cpu",
): [number, number] {
  const map = team === "user" ? USER_POSITIONS[formation] : CPU_POSITIONS[formation];
  const coords = map[player.position];
  return (coords[player.posIndex] ?? coords[0]) as [number, number];
}

const RARITY_RING: Record<Rarity, string> = {
  common:    "ring-zinc-400",
  rare:      "ring-blue-400",
  epic:      "ring-purple-400",
  legendary: "ring-amber-400",
};

function getBallTarget(event: MatchEvent, tick: number): { x: number; y: number } {
  const jitter = (n: number) => n + (Math.sin(tick * 2.3 + n) * 2.5);
  switch (event.type) {
    case "kickoff":
    case "halftime":
    case "fulltime":
      return { x: 50, y: 50 };
    case "goal":
      return event.team === "user"
        ? { x: jitter(50), y: 5 }
        : { x: jitter(50), y: 95 };
    case "save":
    case "miss":
      return event.phase === "user-attack"
        ? { x: jitter(50), y: jitter(18) }
        : { x: jitter(50), y: jitter(82) };
    default:
      return event.phase === "user-attack"
        ? { x: jitter(48), y: jitter(30) }
        : event.phase === "cpu-attack"
        ? { x: jitter(48), y: jitter(70) }
        : { x: jitter(50), y: jitter(50) };
  }
}

const EVENT_ICON: Record<string, string> = {
  goal:       "⚽",
  save:       "🧤",
  miss:       "💨",
  tackle:     "💪",
  clearance:  "↗",
  kickoff:    "🏁",
  halftime:   "⏸",
  fulltime:   "🔔",
  possession: "●",
};

interface Props {
  simulation: MatchSimulation;
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  userFormation: Formation;
  cpuFormation: Formation;
  onComplete: () => void;
}

export default function FootballPitch({
  simulation,
  userLineup,
  cpuLineup,
  userFormation,
  cpuFormation,
  onComplete,
}: Props) {
  const { events } = simulation;

  const startRef = useRef<number | null>(null);
  const lastEventRef = useRef(-1);
  const tickRef = useRef(0);

  const [elapsed, setElapsed] = useState(0);
  const [ball, setBall] = useState({ x: 50, y: 50 });
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [goalFlash, setGoalFlash] = useState<"user" | "cpu" | null>(null);
  const [currentMinute, setCurrentMinute] = useState(0);
  const [playerOffsets, setPlayerOffsets] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    // Initialise per-player oscillation phases
    const offsets: Record<string, { x: number; y: number }> = {};
    [...userLineup, ...cpuLineup].forEach((p) => {
      offsets[p.card.id] = { x: Math.random() * Math.PI * 2, y: Math.random() * Math.PI * 2 };
    });
    setPlayerOffsets(offsets);
  }, [userLineup, cpuLineup]);

  useEffect(() => {
    const rafId = { current: 0 };

    function frame(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = Math.min((ts - startRef.current) / 1000, MATCH_DURATION);
      tickRef.current = elapsed;

      const matchMinute = (elapsed / MATCH_DURATION) * 90;
      setElapsed(elapsed);
      setCurrentMinute(Math.round(matchMinute));

      // Find active event
      let activeIdx = 0;
      for (let i = 0; i < events.length; i++) {
        if (events[i].minute <= matchMinute) activeIdx = i;
      }

      // Trigger new events
      if (activeIdx > lastEventRef.current) {
        lastEventRef.current = activeIdx;
        const ev = events[activeIdx];
        setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
        setFeed((prev) => [ev, ...prev].slice(0, 8));
        if (ev.type === "goal") {
          setGoalFlash(ev.team);
          setTimeout(() => setGoalFlash(null), 1800);
        }
      }

      // Update ball position
      const target = getBallTarget(events[activeIdx], elapsed);
      setBall((prev) => ({
        x: prev.x + (target.x - prev.x) * 0.08,
        y: prev.y + (target.y - prev.y) * 0.08,
      }));

      if (elapsed < MATCH_DURATION) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        onComplete();
      }
    }

    rafId.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId.current);
  }, [events, onComplete]);

  const progress = (elapsed / MATCH_DURATION) * 100;

  function PlayerToken({
    player,
    formation,
    team,
  }: {
    player: AssignedPlayer;
    formation: Formation;
    team: "user" | "cpu";
  }) {
    const [bx, by] = getCoord(player, formation, team);
    const phase = playerOffsets[player.card.id] ?? { x: 0, y: 0 };
    const ox = Math.sin(elapsed * 1.2 + phase.x) * 1.2;
    const oy = Math.sin(elapsed * 0.9 + phase.y) * 1.0;

    const activePhase = events[lastEventRef.current]?.phase;
    let extraY = 0;
    if (team === "user" && activePhase === "user-attack" && player.position === "ATT") extraY = -2;
    if (team === "cpu" && activePhase === "cpu-attack" && player.position === "ATT") extraY = 2;

    return (
      <div
        className="absolute z-10"
        style={{
          left: `${bx + ox}%`,
          top: `${by + oy + extraY}%`,
          transform: "translate(-50%, -50%)",
          transition: "top 0.6s ease-out, left 0.6s ease-out",
        }}
      >
        <div
          className={`w-5 h-5 sm:w-7 sm:h-7 rounded-full ring-2 ${RARITY_RING[player.card.rarity]}
            ${team === "user" ? "bg-blue-600" : "bg-red-600"}
            flex items-center justify-center text-[6px] sm:text-[8px] font-black text-white shadow-lg`}
          title={`${player.card.name} (${player.position})`}
        >
          {player.card.name.slice(0, 2).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full max-w-3xl mx-auto">
      {/* Pitch */}
      <div className="relative w-full lg:w-64 xl:w-72 shrink-0">
        <div
          className="relative w-full overflow-hidden rounded-xl"
          style={{ paddingTop: "150%", background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}
        >
          <div className="absolute inset-0">
            {/* Pitch stripes */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className={i % 2 === 0 ? "absolute inset-x-0 bg-black/[0.04]" : "absolute inset-x-0"}
                style={{ top: `${i * 12.5}%`, height: "12.5%" }}
              />
            ))}

            {/* Boundary */}
            <div className="absolute inset-[4%] border border-white/25 rounded-sm" />

            {/* Halfway line */}
            <div className="absolute left-[4%] right-[4%] border-t border-white/25" style={{ top: "50%" }} />

            {/* Center circle */}
            <div
              className="absolute rounded-full border border-white/25"
              style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }}
            />
            {/* Center dot */}
            <div
              className="absolute w-1.5 h-1.5 rounded-full bg-white/40"
              style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
            />

            {/* Top penalty area */}
            <div
              className="absolute border border-white/20 border-t-0"
              style={{ width: "46%", left: "27%", top: "4%", height: "15%" }}
            />
            {/* Bottom penalty area */}
            <div
              className="absolute border border-white/20 border-b-0"
              style={{ width: "46%", left: "27%", bottom: "4%", height: "15%" }}
            />

            {/* Top goal */}
            <div
              className="absolute border border-white/40 border-t-0 bg-white/5"
              style={{ width: "22%", left: "39%", top: 0, height: "4%" }}
            />
            {/* Bottom goal */}
            <div
              className="absolute border border-white/40 border-b-0 bg-white/5"
              style={{ width: "22%", left: "39%", bottom: 0, height: "4%" }}
            />

            {/* Team labels */}
            <div className="absolute top-[4.5%] left-1/2 -translate-x-1/2 text-red-300/70 text-[8px] font-bold uppercase tracking-widest">
              CPU
            </div>
            <div className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 text-blue-300/70 text-[8px] font-bold uppercase tracking-widest">
              YOU
            </div>

            {/* Players */}
            {userLineup.map((p) => (
              <PlayerToken key={p.card.id} player={p} formation={userFormation} team="user" />
            ))}
            {cpuLineup.map((p) => (
              <PlayerToken key={p.card.id} player={p} formation={cpuFormation} team="cpu" />
            ))}

            {/* Ball */}
            <div
              className="absolute w-3.5 h-3.5 rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{
                left: `${ball.x}%`,
                top: `${ball.y}%`,
                transform: "translate(-50%, -50%)",
              }}
            />

            {/* Goal flash overlay */}
            {goalFlash && (
              <div
                className={`absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none
                  ${goalFlash === "user" ? "bg-blue-500/25" : "bg-red-500/25"}`}
              >
                <span className="text-4xl font-black text-white drop-shadow-lg animate-bounce">GOAL!</span>
                <span className="text-xs text-white/80 font-bold mt-1">
                  {goalFlash === "user" ? "YOU SCORED!" : "CPU SCORED"}
                </span>
              </div>
            )}

            {/* Scoreboard overlay */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 py-1.5 bg-black/55 backdrop-blur-sm">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[7px] font-bold">Y</div>
                <span className="text-white text-xs font-bold">{score.user}</span>
              </div>
              <div className="text-white/60 text-[9px] font-mono">
                {currentMinute}&apos;
              </div>
              <div className="flex items-center gap-1">
                <span className="text-white text-xs font-bold">{score.cpu}</span>
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] font-bold">C</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div
                className="h-full bg-white/40 transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>
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
          {feed.length === 0 && (
            <div className="text-zinc-600 text-sm italic">Waiting for kick off...</div>
          )}
          {feed.map((ev, i) => (
            <div
              key={`${ev.minute}-${i}`}
              className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-all
                ${i === 0 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-900/50"}
                ${ev.type === "goal" && ev.team === "user" ? "border-blue-500/50 bg-blue-900/20" : ""}
                ${ev.type === "goal" && ev.team === "cpu" ? "border-red-500/50 bg-red-900/20" : ""}
              `}
            >
              <span className="shrink-0 text-base leading-none mt-0.5">
                {EVENT_ICON[ev.type] ?? "●"}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 text-xs font-mono mr-1.5">{ev.minute}&apos;</span>
                <span className={`text-sm ${ev.type === "goal" ? "font-semibold text-white" : "text-zinc-300"}`}>
                  {ev.description}
                </span>
              </div>
              {(ev.type === "goal" || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-xs font-bold text-white/70 ml-1">
                  {ev.scoreUser}–{ev.scoreCpu}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-auto pt-3 flex flex-wrap gap-2">
          {(["legendary", "epic", "rare", "common"] as const).map((r) => (
            <div key={r} className={`flex items-center gap-1 text-xs text-zinc-500`}>
              <div className={`w-2.5 h-2.5 rounded-full ring-1 ${RARITY_RING[r]} bg-zinc-700`} />
              {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
