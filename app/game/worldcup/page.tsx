"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import FormationPitchSelector from "@/components/football/FormationPitchSelector";
import MatchRunner, { type MatchRunnerResult } from "@/components/football/MatchRunner";
import { GroupTable, BracketView, NextOpponentCard, Flag } from "@/components/worldcup/WorldCupViews";
import OscarNarrator from "@/components/worldcup/OscarNarrator";
import { pickQuote, toneFor, PROTAGONIST, CLUB_NAME, type LoreEvent, type LoreTone } from "@/lib/worldcup/lore";
import {
  buildSlots, slotsToLineup, calcTeamStats,
  type AssignedPlayer, type FootballCard, type Formation, type LineupSlot,
} from "@/lib/football";
import { nextUserFixture, entrant, STAGE_LABEL, USER_ID } from "@/lib/worldcup/tournament";
import { buildOpponentLineup } from "@/lib/worldcup/client";
import type { TournamentState, SavedSlot, Fixture, Entrant } from "@/lib/worldcup/types";

interface ApiCard {
  card: { id: string; name: string; rarity: string; attribute: string | null; imageUrl: string; kit: string | null; position?: string | null } | null;
}
interface WorldCupRow { id: string; status: string; state: TournamentState }
interface Trophy { id: string; placement: string | null; championName: string; championFlag: string | null; wonByUser: boolean; difficulty: string; date: string }

type View = "loading" | "start" | "hub" | "prematch" | "match" | "done";

function slotsToSaved(slots: LineupSlot[]): SavedSlot[] {
  return slots.filter((s) => s.card).map((s) => ({ position: s.position, posIndex: s.posIndex, cardId: s.card!.id }));
}
function savedToSlots(formation: Formation, saved: SavedSlot[] | null, cards: FootballCard[]): LineupSlot[] {
  const slots = buildSlots(formation);
  if (!saved) return slots;
  const map = new Map(cards.map((c) => [c.id, c]));
  for (const s of saved) {
    const slot = slots.find((x) => x.position === s.position && x.posIndex === s.posIndex);
    if (slot) slot.card = map.get(s.cardId) ?? null;
  }
  return slots;
}

export default function WorldCupPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();

  const [view, setView] = useState<View>("loading");
  const [wc, setWc] = useState<WorldCupRow | null>(null);
  const [ownedCards, setOwnedCards] = useState<FootballCard[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Story-mode narration (Oscar mentoring Ramin).
  const [narration, setNarration] = useState<{ quote: string; tone: LoreTone } | null>(null);
  const introQuote = useMemo(() => pickQuote("intro"), []);
  const narrate = (e: LoreEvent) => setNarration({ quote: pickQuote(e), tone: toneFor(e) });

  // team-pick state (shared by start + prematch)
  const [formation, setFormation] = useState<Formation>("2-2-2");
  const [lineup, setLineup] = useState<LineupSlot[]>(() => buildSlots("2-2-2"));
  const [difficulty, setDifficulty] = useState<"easy" | "even" | "hard">("even");

  // current match context
  const [matchCtx, setMatchCtx] = useState<{
    fixture: Fixture; opponent: Entrant; userLineup: AssignedPlayer[];
    cpuLineup: AssignedPlayer[]; cpuFormation: Formation; seed: string; knockout: boolean;
  } | null>(null);

  // ── data ────────────────────────────────────────────────────────────────────
  const loadCollection = useCallback(async () => {
    const res = await fetch("/api/user/collection");
    if (!res.ok) return [] as FootballCard[];
    const data = await res.json();
    const seen = new Set<string>();
    const cards: FootballCard[] = [];
    for (const item of (data.cards ?? []) as ApiCard[]) {
      if (!item.card || seen.has(item.card.id) || item.card.position === "Moment") continue;
      seen.add(item.card.id);
      cards.push({
        id: item.card.id, name: item.card.name,
        rarity: item.card.rarity as FootballCard["rarity"],
        attribute: (item.card.attribute ?? "Skill") as FootballCard["attribute"],
        imageUrl: item.card.imageUrl, kit: item.card.kit ?? null,
      });
    }
    return cards;
  }, []);

  const loadAll = useCallback(async () => {
    const [wcRes, cards] = await Promise.all([fetch("/api/worldcup"), loadCollection()]);
    setOwnedCards(cards);
    const data = wcRes.ok ? await wcRes.json() : { worldCup: null };
    if (data.worldCup) {
      setWc(data.worldCup);
      setView(data.worldCup.state.stage === "done" ? "done" : "hub");
    } else {
      fetch("/api/worldcup/trophies").then((r) => r.ok && r.json()).then((d) => d && setTrophies(d.trophies ?? [])).catch(() => {});
      setView("start");
    }
  }, [loadCollection]);

  useEffect(() => {
    if (authStatus === "unauthenticated") router.push("/");
    if (authStatus === "authenticated") loadAll();
  }, [authStatus, loadAll, router]);

  // ── actions ───────────────────────────────────────────────────────────────────
  async function startTournament() {
    const saved = slotsToSaved(lineup);
    if (saved.length < 7) { setErr("Pick all 7 players first."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/worldcup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineup: saved, formation, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Could not start"); return; }
      setWc(data.worldCup);
      narrate("groupDraw");
      setView("hub");
    } finally { setBusy(false); }
  }

  function openPrematch() {
    if (!wc) return;
    const fx = nextUserFixture(wc.state);
    if (!fx) return;
    setFormation(wc.state.userFormation);
    setLineup(savedToSlots(wc.state.userFormation, wc.state.userLineup, ownedCards));
    setView("prematch");
  }

  function kickOff() {
    if (!wc) return;
    const fx = nextUserFixture(wc.state);
    if (!fx) return;
    const assigned = slotsToLineup(lineup);
    if (assigned.length < 7) { setErr("Fill all 7 positions."); return; }
    const opponentId = fx.homeId === USER_ID ? fx.awayId : fx.homeId;
    const opponent = entrant(wc.state, opponentId);
    const seed = `${wc.state.seed}:${fx.id}`;
    const opp = buildOpponentLineup(opponentId, seed);
    if (!opp) { setErr("Opponent unavailable."); return; }
    setErr(null);
    setMatchCtx({
      fixture: fx, opponent, userLineup: assigned,
      cpuLineup: opp.lineup, cpuFormation: opp.formation, seed, knockout: fx.stage !== "group",
    });
    setView("match");
  }

  async function onMatchFinish(result: MatchRunnerResult) {
    if (!wc || !matchCtx) return;
    setBusy(true);
    try {
      const res = await fetch("/api/worldcup/match", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldCupId: wc.id, fixtureId: matchCtx.fixture.id, result,
          lineup: slotsToSaved(lineup), formation,
        }),
      });
      const data = await res.json();
      if (res.ok && data.worldCup) {
        const st = data.worldCup.state as TournamentState;
        // Decide which line Oscar delivers based on what just happened.
        const fxStage = matchCtx.fixture.stage;
        const won = result.userWon ?? result.userScore > result.cpuScore;
        const draw = !matchCtx.knockout && result.userScore === result.cpuScore;
        let ev: LoreEvent;
        if (st.stage === "done") {
          ev = st.champion === USER_ID ? "champion" : fxStage === "final" ? "runnerUp" : "koOut";
        } else if (fxStage === "group") {
          ev = st.stage === "R32"
            ? (st.fixtures.some((f) => f.stage === "R32" && f.isUser) ? "qualified" : "groupOut")
            : won ? "win" : draw ? "draw" : "loss";
        } else {
          ev = st.stage === "final" ? "reachedFinal" : "koWin";
        }
        narrate(ev);
        setWc(data.worldCup);
        setMatchCtx(null);
        setView(st.stage === "done" ? "done" : "hub");
      }
    } finally { setBusy(false); }
  }

  async function abandon() {
    if (!confirm("Abandon this World Cup? Your progress will be lost.")) return;
    setBusy(true);
    try {
      await fetch("/api/worldcup", { method: "DELETE" });
      setWc(null); setMatchCtx(null);
      await loadAll();
    } finally { setBusy(false); }
  }

  const filled = lineup.filter((s) => s.card).length;

  // ── render ─────────────────────────────────────────────────────────────────────
  if (view === "loading" || authStatus === "loading") {
    return <Shell><div className="flex justify-center py-24"><Spinner /></div></Shell>;
  }

  if (view === "match" && matchCtx) {
    const you = wc ? entrant(wc.state, USER_ID) : null;
    return (
      <Shell wide>
        <div className="mb-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">{STAGE_LABEL[matchCtx.fixture.stage]}</div>
          <div className="text-white font-bold">{you?.name} <span className="text-zinc-600">vs</span> {matchCtx.opponent.name}</div>
        </div>
        <MatchRunner
          userLineup={matchCtx.userLineup}
          cpuLineup={matchCtx.cpuLineup}
          userFormation={formation}
          cpuFormation={matchCtx.cpuFormation}
          seed={matchCtx.seed}
          knockout={matchCtx.knockout}
          userLabel={(you?.name ?? "YOU").slice(0, 12)}
          cpuLabel={matchCtx.opponent.name.slice(0, 12)}
          onFinish={onMatchFinish}
        />
      </Shell>
    );
  }

  if (view === "start") {
    return (
      <Shell>
        <h1 className="text-2xl font-black text-white mb-1">🏆 Road to Glory</h1>
        <p className="text-zinc-500 text-sm mb-4">
          You are <span className="text-amber-300 font-semibold">{PROTAGONIST}</span>, aspiring manager of <span className="text-amber-300 font-semibold">{CLUB_NAME}</span>. Take them through the 48-team World Cup and write your name beside the greats.
        </p>
        <OscarNarrator variant="inline" quote={introQuote} tone="normal" />
        {ownedCards.length < 7 ? (
          <div className="text-center py-16 text-zinc-500">
            <div className="text-5xl mb-4">⚽</div>
            <p className="font-semibold text-zinc-300 text-lg">You need at least 7 cards</p>
            <p className="text-sm mt-2">Open some packs to build your squad!</p>
          </div>
        ) : (
          <>
            <FormationPitchSelector
              ownedCards={ownedCards}
              formation={formation}
              lineup={lineup}
              onFormationChange={setFormation}
              onLineupChange={setLineup}
            />
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="text-zinc-500 text-xs">Difficulty</span>
              {(["easy", "even", "hard"] as const).map((d) => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`text-xs px-3 py-1.5 rounded-lg border capitalize transition-all ${difficulty === d ? "bg-green-700 border-green-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                  {d}
                </button>
              ))}
            </div>
            {err && <p className="text-red-400 text-xs text-center mt-3">{err}</p>}
            <button onClick={startTournament} disabled={busy || filled < 7}
              className="w-full mt-5 py-4 rounded-2xl font-bold text-lg bg-green-700 hover:bg-green-600 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border disabled:border-zinc-800 text-white shadow-lg shadow-green-900/40 transition-all active:scale-95 flex items-center justify-center gap-2">
              {busy ? <Spinner sm /> : "🏟"} {filled < 7 ? `Fill ${7 - filled} more` : "Start World Cup"}
            </button>
          </>
        )}
        {trophies.length > 0 && <TrophyCabinet trophies={trophies} />}
      </Shell>
    );
  }

  if (view === "prematch" && wc) {
    const fx = nextUserFixture(wc.state);
    if (!fx) { setView("hub"); return null; }
    const opponentId = fx.homeId === USER_ID ? fx.awayId : fx.homeId;
    const opponent = entrant(wc.state, opponentId);
    const liveOverall = filled >= 7 ? calcTeamStats(slotsToLineup(lineup)).overall : null;
    return (
      <Shell>
        <button onClick={() => setView("hub")} className="text-zinc-500 hover:text-zinc-300 text-xs mb-3">← Back to hub</button>
        <NextOpponentCard state={wc.state} opponent={opponent} stageLabel={STAGE_LABEL[fx.stage]} />
        <p className="text-center text-zinc-500 text-xs mt-4 mb-2">Pick your team for this match{liveOverall != null ? ` · your OVR ${liveOverall}` : ""}</p>
        <FormationPitchSelector
          ownedCards={ownedCards}
          formation={formation}
          lineup={lineup}
          onFormationChange={setFormation}
          onLineupChange={setLineup}
        />
        {err && <p className="text-red-400 text-xs text-center mt-3">{err}</p>}
        <button onClick={kickOff} disabled={filled < 7}
          className="w-full mt-5 py-4 rounded-2xl font-bold text-lg bg-green-700 hover:bg-green-600 disabled:bg-zinc-900 disabled:text-zinc-600 disabled:border disabled:border-zinc-800 text-white shadow-lg shadow-green-900/40 transition-all active:scale-95 flex items-center justify-center gap-2">
          <span>⚽</span> {filled < 7 ? `Fill ${7 - filled} more` : `Kick Off vs ${opponent.name}`}
        </button>
      </Shell>
    );
  }

  if (view === "done" && wc) {
    const champ = wc.state.champion ? entrant(wc.state, wc.state.champion) : null;
    const won = wc.state.champion === USER_ID;
    return (
      <Shell>
        <div className="text-center py-8">
          <div className="text-7xl mb-4">{won ? "🏆" : "🎽"}</div>
          <h1 className="text-3xl font-black text-white mb-1">{won ? "World Champions!" : "Tournament over"}</h1>
          <p className="text-zinc-400 mb-1">Your run: <span className="text-green-400 font-bold">{wc.state.userPlacement}</span></p>
          {champ && <div className="flex items-center justify-center gap-2 text-zinc-300 mt-2">Winners: <Flag e={champ} size={20} /> <span className="font-bold">{champ.name}</span></div>}
        </div>
        <BracketView state={wc.state} />
        <button onClick={() => { setWc(null); loadAll(); }}
          className="w-full mt-6 py-3.5 rounded-2xl font-bold bg-green-700 hover:bg-green-600 text-white transition-all active:scale-95">
          New Tournament
        </button>
        <Link href="/game" className="block text-center text-zinc-500 hover:text-zinc-300 text-sm mt-3">← Back to Game</Link>
        {narration && <OscarNarrator variant="overlay" quote={narration.quote} tone={narration.tone} onDismiss={() => setNarration(null)} />}
      </Shell>
    );
  }

  // hub
  if (view === "hub" && wc) {
    const fx = nextUserFixture(wc.state);
    const opponentId = fx ? (fx.homeId === USER_ID ? fx.awayId : fx.homeId) : null;
    const opponent = opponentId ? entrant(wc.state, opponentId) : null;
    return (
      <Shell>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-black text-white">🏆 World Cup</h1>
          <button onClick={abandon} disabled={busy} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Abandon</button>
        </div>

        {fx && opponent ? (
          <>
            <NextOpponentCard state={wc.state} opponent={opponent} stageLabel={STAGE_LABEL[fx.stage]} />
            <button onClick={openPrematch} disabled={busy}
              className="w-full mt-4 py-4 rounded-2xl font-bold text-lg bg-green-700 hover:bg-green-600 text-white shadow-lg shadow-green-900/40 transition-all active:scale-95">
              {busy ? <Spinner sm /> : "▶ Play match"}
            </button>
          </>
        ) : (
          <p className="text-zinc-400 text-center py-4">No upcoming match.</p>
        )}

        {wc.state.stage === "group" && (
          <div className="mt-6">
            <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Your group</h2>
            <GroupTable state={wc.state} groupId={wc.state.userGroupId} />
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Knockout bracket</h2>
          <BracketView state={wc.state} />
        </div>

        <Link href="/game" className="block text-center text-zinc-500 hover:text-zinc-300 text-sm mt-6">← Back to Game</Link>
        {narration && <OscarNarrator variant="overlay" quote={narration.quote} tone={narration.tone} onDismiss={() => setNarration(null)} />}
      </Shell>
    );
  }

  return <Shell><div className="text-center py-24 text-zinc-500">Something went wrong. <button onClick={loadAll} className="text-green-400 underline">Reload</button></div></Shell>;
}

// ── small presentational helpers ────────────────────────────────────────────────
function Spinner({ sm }: { sm?: boolean }) {
  return <span className={`${sm ? "w-4 h-4" : "w-6 h-6"} inline-block border-2 border-green-500 border-t-transparent rounded-full animate-spin`} />;
}

function TrophyCabinet({ trophies }: { trophies: Trophy[] }) {
  return (
    <div className="mt-8">
      <h2 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Trophy Cabinet</h2>
      <div className="space-y-2">
        {trophies.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 rounded-xl border p-3 ${t.wonByUser ? "border-amber-700/50 bg-amber-900/10" : "border-zinc-800 bg-zinc-900/50"}`}>
            <span className="text-xl">{t.wonByUser ? "🏆" : "🎽"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{t.wonByUser ? "Champions" : t.placement}</div>
              <div className="text-[11px] text-zinc-500 capitalize">{t.difficulty} · winners: {t.championName}</div>
            </div>
            <span className="text-[10px] text-zinc-600">{new Date(t.date).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/game" className="text-zinc-400 hover:text-white text-sm">← Game</Link>
          <span className="text-white font-semibold text-sm">World Cup</span>
          <span className="w-12" />
        </div>
      </header>
      <div className={`mx-auto px-4 py-6 ${wide ? "max-w-3xl" : "max-w-md"}`}>{children}</div>
    </main>
  );
}
