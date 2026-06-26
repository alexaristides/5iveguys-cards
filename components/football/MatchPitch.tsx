"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AssignedPlayer, MatchEvent, Rarity } from "@/lib/football";
import type { MatchFrame } from "@/lib/match-engine";
import { sampleTimeline } from "@/lib/match-playback";

const FPS = 6.5; // motion frames per second — sets the constant speed of play; pauses add real time

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗", kickoff: "🏁",
  halftime: "⏸", fulltime: "🔔", possession: "●", freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
  corner: "🚩", throwin: "🙌", goalkick: "🥅", redcard: "🟥", blunder: "🤡",
};

function statusFor(ev: MatchEvent): { label: string; team: "user" | "cpu" } {
  switch (ev.type) {
    case "goal": case "save": case "miss": case "nearpost": case "corner": case "freekick":
      return { team: ev.team, label: "attacking" };
    case "tackle": case "clearance":
      return { team: ev.team, label: "wins it back" };
    case "redcard": return { team: ev.team, label: "red card!" };
    case "blunder": return { team: ev.team, label: "blunder!" };
    case "yellowcard": return { team: ev.team, label: "free kick" };
    case "goalkick": return { team: ev.team, label: "goal kick" };
    case "throwin": return { team: ev.team, label: "throw-in" };
    case "kickoff": return { team: ev.team, label: "kick off" };
    default: return { team: ev.team, label: "in possession" };
  }
}

interface Popup { team: "user" | "cpu"; icon: string; title: string; full: boolean; accent: string; durationMs: number }

function popupFor(ev: MatchEvent, cpuLabel: string): Popup | null {
  switch (ev.type) {
    case "goal":
      return { team: ev.team, icon: "⚽", title: ev.team === "user" ? "GOAL!" : `${cpuLabel} GOAL`, full: true, accent: "", durationMs: 1600 };
    case "redcard":
      return { team: ev.team, icon: "🟥", title: "Red card!", full: false, accent: "border-red-500 text-red-300", durationMs: 1700 };
    case "yellowcard":
      return { team: ev.team, icon: "🟨", title: "Yellow card", full: false, accent: "border-amber-400 text-amber-300", durationMs: 1200 };
    case "freekick":
      return { team: ev.team, icon: "🎯", title: "Free kick", full: false, accent: "border-zinc-300 text-zinc-100", durationMs: 1100 };
    case "corner":
      return { team: ev.team, icon: "🚩", title: "Corner", full: false, accent: ev.team === "user" ? "border-blue-400 text-blue-200" : "border-red-400 text-red-200", durationMs: 1000 };
    case "goalkick":
      return { team: ev.team, icon: "🥅", title: "Goal kick", full: false, accent: ev.team === "user" ? "border-blue-400 text-blue-200" : "border-red-400 text-red-200", durationMs: 900 };
    case "blunder":
      return { team: ev.team, icon: "🤡", title: "Blunder!", full: false, accent: "border-amber-300 text-amber-200", durationMs: 1500 };
    default:
      return null;
  }
}

type Phase = "playing1" | "halftime-wait" | "playing2" | "done";

export interface MatchOutcome { outcome: "win" | "loss" | "draw"; label: string }

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  firstHalfFrames: MatchFrame[];
  secondHalfFrames: MatchFrame[] | null;
  /**
   * Solo mode: play a single continuous tape over an exact duration (no halftime
   * split). Used by the World Cup draft sim for short 10s/20s match clips. When set,
   * firstHalfFrames/secondHalfFrames and onHalftime are ignored.
   */
  soloFrames?: MatchFrame[] | null;
  soloDurationSec?: number;
  userLabel?: string;
  cpuLabel?: string;
  /** Called when the first half finishes playing. Parent shows the halftime UI + computes the 2nd half. */
  onHalftime?: () => void;
  /** Called when the second half finishes playing (or the solo tape ends). */
  onComplete: () => void;
  /** When set (at full time), the header morphs to the result and the side column shows the summary. */
  result?: MatchOutcome | null;
  /** Parent-built finished-state summary (goals / MOTM / actions) shown in the side column. */
  resultPanel?: ReactNode;
}

interface CardInfo { id: string; name: string; imageUrl: string; flag?: string; rarity: Rarity; team: "user" | "cpu"; position: string; }

export default function MatchPitch({
  userLineup, cpuLineup, firstHalfFrames, secondHalfFrames,
  soloFrames = null, soloDurationSec,
  userLabel = "YOU", cpuLabel = "CPU",
  onHalftime, onComplete, result = null, resultPanel = null,
}: Props) {
  const solo = soloFrames != null;
  const [phase, setPhase] = useState<Phase>("playing1");
  const [possessorId, setPossessorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [minute, setMinute] = useState(0);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stats, setStats] = useState({ userShots: 0, cpuShots: 0, userPoss: 0, cpuPoss: 0 });
  const [status, setStatus] = useState<{ label: string; team: "user" | "cpu" } | null>(null);
  const [headerFlash, setHeaderFlash] = useState<"user" | "cpu" | null>(null);

  const cardList = useMemo(() => {
    const arr: CardInfo[] = [];
    for (const p of userLineup) arr.push({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, flag: p.card.flag, rarity: p.card.rarity, team: "user", position: p.position });
    for (const p of cpuLineup) arr.push({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, flag: p.card.flag, rarity: p.card.rarity, team: "cpu", position: p.position });
    return arr;
  }, [userLineup, cpuLineup]);

  // Kickoff positions, read from the first frame of whichever tape plays first.
  // Seeding the tokens here means they start spread across the pitch rather than
  // stacked at dead-centre before the first animation frame paints.
  const initialPos = useMemo(() => {
    const f0 = (soloFrames && soloFrames[0]) || (firstHalfFrames && firstHalfFrames[0]) || null;
    const map: Record<string, { x: number; y: number }> = {};
    if (f0) for (const p of f0.players) map[p.id] = { x: p.x, y: p.y };
    return map;
  }, [soloFrames, firstHalfFrames]);

  // Animation is driven by direct DOM mutation (no per-frame React re-render).
  const tokenEls = useRef(new Map<string, HTMLDivElement | null>());
  const ballEl = useRef<HTMLDivElement | null>(null);
  const progressEl = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<Record<string, { x: number; y: number }>>({ ...initialPos });
  const ballPosRef = useRef({ x: 50, y: 50 });

  const pRef = useRef(0);                // 0..1 progress within the current half
  const lastTsRef = useRef<number | null>(null);
  const firedRef = useRef(-1);

  function applyEvent(ev: MatchEvent) {
    setStatus(statusFor(ev));
    setFeed((prev) => [ev, ...prev].slice(0, 12));
    setScore({ user: ev.scoreUser, cpu: ev.scoreCpu });
    setStats((s) => {
      const next = { ...s };
      if (["goal", "save", "miss", "nearpost"].includes(ev.type)) { if (ev.team === "user") next.userShots++; else next.cpuShots++; }
      // Possession = building an attack OR winning the ball back (tackle/clearance is the defender gaining it).
      if (["possession", "counter", "tackle", "clearance"].includes(ev.type)) { if (ev.team === "user") next.userPoss++; else next.cpuPoss++; }
      return next;
    });
    const p = popupFor(ev, cpuLabel);
    if (p) { setPopup(p); setTimeout(() => setPopup(null), p.durationMs); }
    if (ev.type === "goal") {
      setSpotlightId(ev.scorerCardId ?? null);
      setTimeout(() => setSpotlightId(null), 1600);
      setHeaderFlash(ev.team);
      setTimeout(() => setHeaderFlash(null), 1800);
    }
  }

  function paint(players: { id: string; x: number; y: number }[], ball: { x: number; y: number }) {
    for (const p of players) {
      posRef.current[p.id] = { x: p.x, y: p.y };
      const el = tokenEls.current.get(p.id);
      if (el) { el.style.left = `${p.x}%`; el.style.top = `${p.y}%`; }
    }
    ballPosRef.current = ball;
    if (ballEl.current) { ballEl.current.style.left = `${ball.x}%`; ballEl.current.style.top = `${ball.y}%`; }
  }

  // Drive playback for the active half (or the whole solo tape).
  useEffect(() => {
    // Solo mode reuses "playing1" as its single active phase.
    if (solo ? phase !== "playing1" : (phase !== "playing1" && phase !== "playing2")) return;
    const frames = solo ? (soloFrames ?? []) : (phase === "playing1" ? firstHalfFrames : (secondHalfFrames ?? []));
    if (frames.length === 0) return;
    // Constant speed normally; solo mode plays the whole tape over an exact duration.
    const durationSec = solo ? (soloDurationSec ?? frames.length / FPS) : frames.length / FPS;
    // Solo = one continuous bar; halves each fill their own half of the bar.
    const base = solo ? 0 : phase === "playing1" ? 0 : 0.5;
    const span = solo ? 1 : 0.5;
    pRef.current = 0;
    lastTsRef.current = null;
    firedRef.current = -1;
    const raf = { id: 0 };

    function frame(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      pRef.current = Math.min(1, pRef.current + dt / (durationSec * 1000));

      const s = sampleTimeline(frames, pRef.current, 1); // duration=1 → progress = pRef
      paint(s.players, s.ball);
      if (progressEl.current) progressEl.current.style.width = `${(base + s.progress * span) * 100}%`;

      for (let i = firedRef.current + 1; i <= s.frameIndex && i < frames.length; i++) {
        const ev = frames[i].event;
        if (ev) { applyEvent(ev); setMinute(ev.minute); setPossessorId(frames[i].possessorId); }
      }
      firedRef.current = Math.max(firedRef.current, s.frameIndex);

      if (pRef.current < 1) {
        raf.id = requestAnimationFrame(frame);
      } else if (!solo && phase === "playing1") {
        setPhase("halftime-wait"); onHalftime?.();
      } else {
        setPhase("done"); onComplete();
      }
    }
    raf.id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, firstHalfFrames, secondHalfFrames, soloFrames, soloDurationSec]);

  // Resume into the second half once the parent supplies its frames (two-half mode only).
  useEffect(() => {
    if (solo) return;
    if (phase === "halftime-wait" && secondHalfFrames && secondHalfFrames.length > 0) {
      setPhase("playing2");
    }
  }, [solo, phase, secondHalfFrames]);

  const totalPoss = stats.userPoss + stats.cpuPoss;
  const userPossPct = totalPoss > 0 ? Math.round((stats.userPoss / totalPoss) * 100) : 50;
  const cpuPossPct = 100 - userPossPct;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <MatchHeader
        userLabel={userLabel} cpuLabel={cpuLabel}
        scoreUser={score.user} scoreCpu={score.cpu}
        minute={minute} userPossPct={userPossPct} cpuPossPct={cpuPossPct}
        status={status} flash={headerFlash} result={result}
      />

      <div className="mt-3 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-stretch">
        <div className="relative mx-auto sm:mx-0 shrink-0 overflow-hidden rounded-xl"
          style={{ aspectRatio: "3 / 4", height: "min(58vh, 540px)",
            background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}>
          <div className="absolute inset-0">
            {/* Team end zones: red = opponent (top), blue = you (bottom) */}
            <div className="absolute top-0 left-0 right-0 h-[18%] bg-gradient-to-b from-red-500/25 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-gradient-to-t from-blue-500/25 to-transparent pointer-events-none" />
            <div className="absolute inset-[4%] border border-white/25 rounded-sm" />
            <div className="absolute left-[4%] right-[4%] border-t border-white/25" style={{ top: "50%" }} />
            <div className="absolute rounded-full border border-white/25" style={{ width: "22%", aspectRatio: "1", left: "39%", top: "calc(50% - 11%)" }} />
            <div className="absolute border border-white/20 border-t-0" style={{ width: "46%", left: "27%", top: "4%", height: "15%" }} />
            <div className="absolute border border-white/20 border-b-0" style={{ width: "46%", left: "27%", bottom: "4%", height: "15%" }} />
            <div className="absolute top-[4.5%] left-1/2 -translate-x-1/2 z-[5] px-1.5 py-0.5 rounded bg-red-600/85 text-white text-[8px] font-bold uppercase tracking-widest shadow">{cpuLabel}</div>
            <div className="absolute bottom-[4.5%] left-1/2 -translate-x-1/2 z-[5] px-1.5 py-0.5 rounded bg-blue-600/85 text-white text-[8px] font-bold uppercase tracking-widest shadow">{userLabel}</div>

            {cardList.map((info) => {
              const isPossessor = possessorId === info.id;
              const isSpotlight = spotlightId === info.id;
              const init = posRef.current[info.id] ?? initialPos[info.id] ?? { x: 50, y: 50 };
              return (
                <div
                  key={info.id}
                  ref={(el) => { tokenEls.current.set(info.id, el); }}
                  className={`absolute ${isSpotlight ? "z-30" : "z-10"}`}
                  style={{ left: `${init.x}%`, top: `${init.y}%`, transform: "translate(-50%, -50%)", willChange: "left, top" }}
                >
                  {isPossessor && <div className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-pulse scale-125 z-10" />}
                  {isSpotlight && <div className="absolute inset-0 rounded-full ring-4 ring-yellow-400 animate-pulse scale-150 z-10" />}
                  <div className={`relative rounded-full ring-[3px] overflow-hidden shadow-lg ${info.team === "user" ? "ring-blue-400" : "ring-red-500"} ${isSpotlight ? "w-14 h-14" : "w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11"}`}
                    title={`${info.name} (${info.position})`}>
                    {info.imageUrl ? (
                      <>
                        <Image src={info.imageUrl} alt={info.name} fill className="object-cover object-center" sizes="48px" />
                        <div className={`absolute inset-0 pointer-events-none ${info.team === "user" ? "bg-blue-500/35" : "bg-red-600/40"}`} />
                      </>
                    ) : (
                      <div className={`absolute inset-0 flex items-center justify-center ${info.team === "user" ? "bg-blue-900/80" : "bg-red-900/80"} ${isSpotlight ? "text-2xl" : "text-base sm:text-lg"}`}>
                        <span className="leading-none">{info.flag ?? "⚽"}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute left-1/2 top-full -translate-x-1/2 mt-0.5 max-w-[72px] truncate rounded bg-black/55 px-1 text-center text-white text-[9px] sm:text-[10px] font-semibold leading-tight pointer-events-none">
                    {info.name}
                  </div>
                </div>
              );
            })}

            <div ref={ballEl} className="absolute rounded-full bg-white shadow-lg shadow-white/60 z-20"
              style={{ width: "4%", aspectRatio: "1", left: "50%", top: "50%", transform: "translate(-50%, -50%)", willChange: "left, top" }} />

            {popup && (popup.full ? (
              <div className={`absolute inset-0 z-30 flex items-center justify-center pointer-events-none ${popup.team === "user" ? "bg-green-500/30" : "bg-red-500/25"}`}>
                <div className="bg-black/60 rounded-2xl px-4 py-2 text-center">
                  <span className="text-3xl font-black text-white drop-shadow-lg animate-bounce block">{popup.icon} {popup.title}</span>
                  <div className="text-white/60 text-xs mt-1 font-bold">{score.user} – {score.cpu}</div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2 bg-black/75 border-2 ${popup.accent} shadow-lg`}>
                  <span className="text-xl leading-none">{popup.icon}</span>
                  <span className="text-white font-black text-sm uppercase tracking-wide">{popup.title}</span>
                </div>
              </div>
            ))}

            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
              <div ref={progressEl} className="h-full bg-white/40" style={{ width: "0%" }} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1.5 sm:gap-2 min-h-0 sm:h-[min(58vh,540px)]">
          {result ? (
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 animate-card-reveal">
              {resultPanel}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-zinc-400 text-[10px] sm:text-xs font-medium uppercase tracking-wider">Commentary</span>
                <span className="ml-auto text-zinc-500 text-[10px] sm:text-xs font-mono">{minute}&apos;</span>
              </div>
              <div className="flex flex-col gap-1 sm:gap-1.5 overflow-y-auto h-40 sm:h-auto sm:flex-1 min-h-0 pr-0.5">
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
              <div className="rounded-lg sm:rounded-xl bg-zinc-900/60 border border-zinc-800 px-2.5 sm:px-3 py-2 shrink-0 flex items-center justify-between text-[10px] sm:text-xs">
                <span className="text-zinc-500 uppercase tracking-wider">Shots</span>
                <span className="font-bold"><span className="text-blue-400">{stats.userShots}</span><span className="text-zinc-600 mx-1">–</span><span className="text-red-400">{stats.cpuShots}</span></span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchHeader({
  userLabel, cpuLabel, scoreUser, scoreCpu, minute, userPossPct, cpuPossPct, status, flash, result,
}: {
  userLabel: string; cpuLabel: string; scoreUser: number; scoreCpu: number; minute: number;
  userPossPct: number; cpuPossPct: number;
  status: { label: string; team: "user" | "cpu" } | null;
  flash: "user" | "cpu" | null;
  result: MatchOutcome | null;
}) {
  const bg = result
    ? result.outcome === "win" ? "bg-green-900/90 border-green-600"
      : result.outcome === "loss" ? "bg-red-900/90 border-red-600"
      : "bg-zinc-800/95 border-zinc-500"
    : flash === "user" ? "bg-blue-900/85 border-blue-500"
      : flash === "cpu" ? "bg-red-900/85 border-red-500"
      : "bg-zinc-900/90 border-zinc-800";
  const resultColor = result?.outcome === "win" ? "text-green-300" : result?.outcome === "loss" ? "text-red-300" : "text-zinc-200";

  return (
    <div className={`sticky top-2 z-40 rounded-xl border shadow-lg backdrop-blur transition-colors duration-500 ${bg}`}>
      <div className="px-3 sm:px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">{userLabel[0]}</span>
            <span className="text-white text-xs font-bold truncate">{userLabel}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-white text-2xl font-black tabular-nums leading-none">{scoreUser}</span>
            <span className="text-zinc-400">–</span>
            <span className="text-white text-2xl font-black tabular-nums leading-none">{scoreCpu}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
            <span className="text-white text-xs font-bold truncate text-right">{cpuLabel}</span>
            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">{cpuLabel[0]}</span>
          </div>
        </div>
        {result ? (
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Full Time</span>
            <span className="text-white/30">·</span>
            <span className={`text-sm font-black uppercase tracking-wide ${resultColor}`}>{result.label}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className="text-zinc-500 text-[10px] font-mono">{minute}&apos;</span>
            <span className={`w-1.5 h-1.5 rounded-full ${status?.team === "cpu" ? "bg-red-400" : "bg-blue-400"}`} />
            <span className={`text-[11px] font-bold ${status?.team === "cpu" ? "text-red-300" : "text-blue-300"}`}>
              {status ? (status.team === "user" ? userLabel : cpuLabel) : userLabel}
            </span>
            <span className="text-zinc-400 text-[11px]">{status?.label ?? "kick off"}</span>
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-blue-300 text-[10px] font-bold w-8 shrink-0">{userPossPct}%</span>
          <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-red-500/70">
            <div className="bg-blue-500 transition-[width] duration-500" style={{ width: `${userPossPct}%` }} />
          </div>
          <span className="text-red-300 text-[10px] font-bold w-8 text-right shrink-0">{cpuPossPct}%</span>
        </div>
      </div>
    </div>
  );
}
