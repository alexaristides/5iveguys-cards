"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssignedPlayer, MatchEvent, Rarity } from "@/lib/football";
import type { MatchFrame } from "@/lib/match-engine";
import { sampleTimeline } from "@/lib/match-playback";

const FPS = 6.5; // motion frames per second — sets the constant speed of play; pauses add real time

const EVENT_ICON: Record<string, string> = {
  goal: "⚽", save: "🧤", miss: "💨", tackle: "💪", clearance: "↗", kickoff: "🏁",
  halftime: "⏸", fulltime: "🔔", possession: "●", freekick: "🎯", yellowcard: "🟨", nearpost: "🔔", counter: "⚡",
  corner: "🚩", throwin: "🙌", goalkick: "🥅", redcard: "🟥",
};

function statusFor(ev: MatchEvent): { label: string; team: "user" | "cpu" } {
  switch (ev.type) {
    case "goal": case "save": case "miss": case "nearpost": case "corner": case "freekick":
      return { team: ev.team, label: "attacking" };
    case "tackle": case "clearance":
      return { team: ev.team, label: "wins it back" };
    case "redcard": return { team: ev.team, label: "red card!" };
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
    default:
      return null;
  }
}

type Phase = "playing1" | "halftime-wait" | "playing2" | "done";

interface Props {
  userLineup: AssignedPlayer[];
  cpuLineup: AssignedPlayer[];
  firstHalfFrames: MatchFrame[];
  secondHalfFrames: MatchFrame[] | null;
  userLabel?: string;
  cpuLabel?: string;
  /** Called when the first half finishes playing. Parent shows the halftime UI + computes the 2nd half. */
  onHalftime: () => void;
  /** Called when the second half finishes playing. */
  onComplete: () => void;
}

interface CardInfo { id: string; name: string; imageUrl: string; rarity: Rarity; team: "user" | "cpu"; position: string; }

export default function MatchPitch({
  userLineup, cpuLineup, firstHalfFrames, secondHalfFrames,
  userLabel = "YOU", cpuLabel = "CPU",
  onHalftime, onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>("playing1");
  const [possessorId, setPossessorId] = useState<string | null>(null);
  const [feed, setFeed] = useState<MatchEvent[]>([]);
  const [score, setScore] = useState({ user: 0, cpu: 0 });
  const [minute, setMinute] = useState(0);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stats, setStats] = useState({ userShots: 0, cpuShots: 0, userPoss: 0, cpuPoss: 0 });
  const [status, setStatus] = useState<{ label: string; team: "user" | "cpu" } | null>(null);

  const cardList = useMemo(() => {
    const arr: CardInfo[] = [];
    for (const p of userLineup) arr.push({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "user", position: p.position });
    for (const p of cpuLineup) arr.push({ id: p.card.id, name: p.card.name, imageUrl: p.card.imageUrl, rarity: p.card.rarity, team: "cpu", position: p.position });
    return arr;
  }, [userLineup, cpuLineup]);

  // Animation is driven by direct DOM mutation (no per-frame React re-render).
  const tokenEls = useRef(new Map<string, HTMLDivElement | null>());
  const ballEl = useRef<HTMLDivElement | null>(null);
  const progressEl = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<Record<string, { x: number; y: number }>>({});
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
      if (ev.type === "possession" || ev.type === "counter") { if (ev.team === "user") next.userPoss++; else next.cpuPoss++; }
      return next;
    });
    const p = popupFor(ev, cpuLabel);
    if (p) { setPopup(p); setTimeout(() => setPopup(null), p.durationMs); }
    if (ev.type === "goal") {
      setSpotlightId(ev.scorerCardId ?? null);
      setTimeout(() => setSpotlightId(null), 1600);
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

  // Drive playback for the active half.
  useEffect(() => {
    if (phase !== "playing1" && phase !== "playing2") return;
    const frames = phase === "playing1" ? firstHalfFrames : (secondHalfFrames ?? []);
    if (frames.length === 0) return;
    const durationSec = frames.length / FPS; // constant speed; more frames (pauses) = more real time
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
      const base = phase === "playing1" ? 0 : 0.5;
      if (progressEl.current) progressEl.current.style.width = `${(base + s.progress * 0.5) * 100}%`;

      for (let i = firedRef.current + 1; i <= s.frameIndex && i < frames.length; i++) {
        const ev = frames[i].event;
        if (ev) { applyEvent(ev); setMinute(ev.minute); setPossessorId(frames[i].possessorId); }
      }
      firedRef.current = Math.max(firedRef.current, s.frameIndex);

      if (pRef.current < 1) {
        raf.id = requestAnimationFrame(frame);
      } else if (phase === "playing1") {
        setPhase("halftime-wait"); onHalftime();
      } else {
        setPhase("done"); onComplete();
      }
    }
    raf.id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, firstHalfFrames, secondHalfFrames]);

  // Resume into the second half once the parent supplies its frames.
  useEffect(() => {
    if (phase === "halftime-wait" && secondHalfFrames && secondHalfFrames.length > 0) {
      setPhase("playing2");
    }
  }, [phase, secondHalfFrames]);

  const totalPoss = stats.userPoss + stats.cpuPoss;
  const userPossPct = totalPoss > 0 ? Math.round((stats.userPoss / totalPoss) * 100) : 50;

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-3xl mx-auto">
      <div className="relative w-full sm:w-52 lg:w-64 xl:w-72 shrink-0">
        <div className="relative w-full overflow-hidden rounded-xl pt-[120%] sm:pt-[150%]"
          style={{ background: "linear-gradient(180deg, #1a5c28 0%, #206b30 30%, #1e6b2e 50%, #206b30 70%, #1a5c28 100%)" }}>
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
              const init = posRef.current[info.id] ?? { x: 50, y: 50 };
              return (
                <div
                  key={info.id}
                  ref={(el) => { tokenEls.current.set(info.id, el); }}
                  className={`absolute ${isSpotlight ? "z-30" : "z-10"}`}
                  style={{ left: `${init.x}%`, top: `${init.y}%`, transform: "translate(-50%, -50%)", willChange: "left, top" }}
                >
                  {isPossessor && <div className="absolute inset-0 rounded-full ring-2 ring-white/60 animate-pulse scale-125 z-10" />}
                  {isSpotlight && <div className="absolute inset-0 rounded-full ring-4 ring-yellow-400 animate-pulse scale-150 z-10" />}
                  <div className={`relative rounded-full ring-[3px] overflow-hidden shadow-lg ${info.team === "user" ? "ring-blue-400" : "ring-red-500"} ${isSpotlight ? "w-12 h-12" : "w-10 h-10 sm:w-8 sm:h-8"}`}
                    title={`${info.name} (${info.position})`}>
                    <Image src={info.imageUrl} alt={info.name} fill className="object-cover object-center" sizes="40px" />
                    <div className={`absolute inset-0 pointer-events-none ${info.team === "user" ? "bg-blue-500/35" : "bg-red-600/40"}`} />
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
              <div ref={progressEl} className="h-full bg-white/40" style={{ width: "0%" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 sm:gap-2">
        <div className="flex items-center gap-2 shrink-0 rounded-lg bg-zinc-900/70 border border-zinc-800 px-2.5 py-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${status?.team === "cpu" ? "bg-red-400" : "bg-blue-400"}`} />
          <span className={`text-xs font-bold ${status?.team === "cpu" ? "text-red-300" : "text-blue-300"}`}>
            {status ? (status.team === "user" ? userLabel : cpuLabel) : userLabel}
          </span>
          <span className="text-zinc-400 text-xs">{status?.label ?? "kick off"}</span>
        </div>
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
