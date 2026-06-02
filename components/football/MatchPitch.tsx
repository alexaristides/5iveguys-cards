"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignedPlayer, MatchEvent, Rarity } from "@/lib/football";
import type { MatchFrame } from "@/lib/match-engine";
import { sampleTimeline } from "@/lib/match-playback";

const DEFAULT_HALF_SEC = 22;

const RARITY_RING: Record<Rarity, string> = {
  common: "ring-zinc-400", rare: "ring-blue-400", epic: "ring-purple-400", legendary: "ring-amber-400",
};
const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗", kickoff: "🏁",
  halftime: "⏸", fulltime: "🔔", possession: "●", freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
};

type Phase = "playing1" | "halftime-wait" | "playing2" | "done";

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  firstHalfFrames: MatchFrame[];
  secondHalfFrames: MatchFrame[] | null;
  halfDurationSec?: number;
  userLabel?: string;
  cpuLabel?: string;
  /** Increment to fast-forward the current half to its end. */
  skipSignal?: number;
  /** Called when the first half finishes playing. Parent shows the halftime UI + computes the 2nd half. */
  onHalftime: () => void;
  /** Called when the second half finishes playing. */
  onComplete: () => void;
}

interface CardInfo { id: string; name: string; imageUrl: string; rarity: Rarity; team: "user" | "cpu"; position: string; }

export default function MatchPitch({
  userLineup, cpuLineup, firstHalfFrames, secondHalfFrames,
  halfDurationSec = DEFAULT_HALF_SEC, userLabel = "YOU", cpuLabel = "CPU",
  skipSignal = 0, onHalftime, onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("playing1");
  const [ball, setBall] = useState({ x: 50, y: 50 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [possessorId, setPossessorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [minute, setMinute] = useState(0);
  const [progress, setProgress] = useState(0);
  const [goalFlash, setGoalFlash] = useState<"user" | "cpu" | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stats, setStats] = useState({ userShots: 0, cpuShots: 0, userPoss: 0, cpuPoss: 0 });

  const cardById = useMemo(() => {
    const m = new Map<string, CardInfo>();
    for (const p of userLineup) m.set(p.card.id, { id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "user", position: p.position });
    for (const p of cpuLineup) m.set(p.card.id, { id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "cpu", position: p.position });
    return m;
  }, [userLineup, cpuLineup]);

  const startRef = useRef<number | null>(null);
  const firedRef = useRef(-1);
  const skipRef = useRef(0);
  const lastSkipRef = useRef(0);
  useEffect(() => { skipRef.current = skipSignal; }, [skipSignal]);

  function applyEvent(ev: MatchEvent) {
    setFeed((prev) => [ev, ...prev].slice(0, 12));
    setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
    setStats((s) => {
      const next = { ...s };
      if (["goal", "save", "miss", "nearpost"].includes(ev.type)) { if (ev.team === "user") next.userShots++; else next.cpuShots++; }
      if (ev.type === "possession" || ev.type === "counter") { if (ev.team === "user") next.userPoss++; else next.cpuPoss++; }
      return next;
    });
    if (ev.type === "goal") {
      setGoalFlash(ev.team);
      setSpotlightId(ev.scorerCardId ?? null);
      setTimeout(() => { setGoalFlash(null); setSpotlightId(null); }, 1600);
    }
  }

  // Drive playback for the active half.
  useEffect(() => {
    if (phase !== "playing1" && phase !== "playing2") return;
    const frames = phase === "playing1" ? firstHalfFrames : (secondHalfFrames ?? []);
    if (frames.length === 0) return;
    startRef.current = null;
    firedRef.current = -1;
    const raf = { id: 0 };

    function frame(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      if (skipRef.current !== lastSkipRef.current) {
        lastSkipRef.current = skipRef.current;
        startRef.current = ts - halfDurationSec * 1000 - 100; // force elapsed >= duration → fast-forward
      }
      const elapsed = (ts - startRef.current) / 1000;
      const s = sampleTimeline(frames, elapsed, halfDurationSec);
      setBall(s.ball);
      setPositions(Object.fromEntries(s.players.map((p) => [p.id, { x: p.x, y: p.y }])));
      setProgress(phase === "playing1" ? s.progress * 0.5 : 0.5 + s.progress * 0.5);

      for (let i = firedRef.current + 1; i <= s.frameIndex && i < frames.length; i++) {
        const ev = frames[i].event;
        if (ev) { applyEvent(ev); setMinute(ev.minute); setPossessorId(frames[i].possessorId); }
      }
      firedRef.current = Math.max(firedRef.current, s.frameIndex);

      if (elapsed < halfDurationSec) {
        raf.id = requestAnimationFrame(frame);
      } else {
        if (phase === "playing1") { setPhase("halftime-wait"); onHalftime(); }
        else { setPhase("done"); onComplete(); }
      }
    }
    raf.id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, firstHalfFrames, secondHalfFrames, halfDurationSec]);

  // Resume into the second half once the parent supplies its frames.
  useEffect(() => {
    if (phase === "halftime-wait" && secondHalfFrames && secondHalfFrames.length > 0) {
      setPhase("playing2");
    }
  }, [phase, secondHalfFrames]);

  const totalPoss = stats.userPoss + stats.cpuPoss;
  const userPossPct = totalPoss > 0 ? Math.round((stats.userPoss / totalPoss) * 100) : 50;

  function renderToken(id: string, pos: { x: number; y: number }) {
    const info = cardById.get(id);
    if (!info) return null;
    const isPossessor = possessorId === id;
    const isSpotlight = spotlightId === id;
    return (
      <div key={id} className={`absolute ${isSpotlight ? "z-30" : "z-10"}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)", transition: "top 0.12s linear, left 0.12s linear" }}>
        {isPossessor && <div className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-pulse scale-125 z-10" />}
        {isSpotlight && <div className="absolute inset-0 rounded-full ring-4 ring-yellow-400 animate-pulse scale-150 z-10" />}
        <div className={`relative rounded-full ring-2 overflow-hidden shadow-lg ${RARITY_RING[info.rarity]} ${isSpotlight ? "w-12 h-12" : "w-10 h-10 sm:w-8 sm:h-8"}`}
          title={`${info.name} (${info.position})`}>
          <Image src={info.imageUrl} alt={info.name} fill className="object-cover object-center" sizes="40px" />
          <div className={`absolute inset-0 pointer-events-none ${info.team === "user" ? "bg-blue-500/20" : "bg-red-500/25"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-3xl mx-auto">
      <div className="relative w-full sm:w-52 lg:w-64 xl:w-72 shrink-0">
        <div className="relative w-full overflow-hidden rounded-xl pt-[120%] sm:pt-[150%]"
          style={{ background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}>
          <div className="absolute inset-0">
            <div className="absolute inset-[4%] border border-white/25 rounded-sm" />
            <div className="absolute left-[4%] right-[4%] border-t border-white/25" style={{ top: "50%" }} />
            <div className="absolute rounded-full border border-white/25" style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }} />
            <div className="absolute border border-white/20 border-t-0" style={{ width: "46%", left: "27%", top: "4%", height: "15%" }} />
            <div className="absolute border border-white/20 border-b-0" style={{ width: "46%", left: "27%", bottom: "4%", height: "15%" }} />
            <div className="absolute top-[4.5%] left-1/2 -translate-x-1/2 text-red-300/70 text-[8px] font-bold uppercase tracking-widest">{cpuLabel}</div>
            <div className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 text-blue-300/70 text-[8px] font-bold uppercase tracking-widest">{userLabel}</div>

            {Object.entries(positions).map(([id, pos]) => renderToken(id, pos))}

            <div className="absolute rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{ width: "4%", aspectRatio: "1", left: `${ball.x}%`, top: `${ball.y}%`, transform: "translate(-50%, -50%)", transition: "top 0.12s linear, left 0.12s linear" }} />

            {goalFlash && (
              <div className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none ${goalFlash === "user" ? "bg-green-500/30" : "bg-red-500/25"}`}>
                <div className="bg-black/60 rounded-2xl px-4 py-2 text-center">
                  <span className="text-3xl font-black text-white drop-shadow-lg animate-bounce block">{goalFlash === "user" ? "⚽ GOAL!" : `${cpuLabel} GOAL`}</span>
                  <div className="text-white/60 text-xs mt-1 font-bold">{score.user} – {score.cpu}</div>
                </div>
              </div>
            )}

            <div className="absolute top-0 left-0 right-0 z-20 bg-black/55 backdrop-blur-sm">
              <div className="flex items-center justify-between px-3 py-1.5">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[7px] font-bold">{userLabel[0]}</div>
                  <span className="text-white text-xs font-bold">{score.user}</span>
                </div>
                <div className="text-white/60 text-[9px] font-mono">{minute}&apos;</div>
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs font-bold">{score.cpu}</span>
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white text-[7px] font-bold">{cpuLabel[0]}</div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div className="h-full bg-white/40 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-zinc-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Commentary</span>
          <span className="ml-auto text-zinc-500 text-[10px] sm:text-xs font-mono">{minute}&apos;</span>
        </div>
        <div className="flex flex-col gap-1 sm:gap-1.5 overflow-y-auto max-h-28 sm:max-h-none sm:flex-1 pr-0.5">
          {feed.length === 0 && <div className="text-zinc-600 text-xs italic">Waiting for kick off…</div>}
          {feed.map((ev, i) => (
            <div key={`${ev.minute}-${i}`} className={`flex items-start gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg ${i === 0 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-900/50"} ${ev.type === "goal" && ev.team === "user" ? "!border-blue-500/50 !bg-blue-900/20" : ""} ${ev.type === "goal" && ev.team === "cpu" ? "!border-red-500/50 !bg-red-900/20" : ""}`}>
              <span className="shrink-0 text-sm leading-none mt-0.5">{EVENT_ICON[ev.type] ?? "●"}</span>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 text-[10px] font-mono mr-1">{ev.minute}&apos;</span>
                <span className={`text-[11px] sm:text-xs leading-snug ${ev.type === "goal" ? "font-semibold text-white" : "text-zinc-300"}`}>{ev.description}</span>
              </div>
              {(ev.type === "goal" || ev.type === "halftime" || ev.type === "fulltime") && (
                <span className="shrink-0 text-[10px] font-bold text-white/70">{ev.scoreUser}–{ev.scoreCpu}</span>
              )}
            </div>
          ))}
        </div>
        <div className="rounded-lg sm:rounded-xl bg-zinc-900/60 border border-zinc-800 px-2 sm:px-3 py-1.5 sm:py-2 shrink-0">
          <div className="grid grid-cols-2 gap-1 text-center">
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Shots</div>
              <div className="text-[10px] sm:text-xs font-bold"><span className="text-blue-400">{stats.userShots}</span><span className="text-zinc-600 mx-0.5">–</span><span className="text-red-400">{stats.cpuShots}</span></div>
            </div>
            <div>
              <div className="text-[8px] sm:text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Poss</div>
              <div className="text-[10px] sm:text-xs font-bold"><span className="text-blue-400">{userPossPct}%</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
