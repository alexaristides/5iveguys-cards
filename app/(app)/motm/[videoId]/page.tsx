"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { AppShell, BackLink, card, inputClass, panel, Spinner } from "@/components/AppShell";
import { SQUAD_CHANNEL } from "@/components/players/ratings";
import { timeAgo, videoThumb, youTubeUrl, type MotmCandidate, type MotmResults } from "@/components/players/videos";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Man of the Match for one video, as in the app: who's leading, then search the players and pick one
 * to vote. One vote each; picking someone else changes it.
 */
export default function MotmVotePage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { status } = useSession();
  const [data, setData] = useState<MotmResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [voting, setVoting] = useState<string | null>(null);

  const url = `/api/channels/${SQUAD_CHANNEL}/videos/${videoId}/motm`;
  useEffect(() => {
    if (status === "loading") return;
    fetch(url).then(async (r) => (r.ok ? setData(await r.json()) : setError((await r.json().catch(() => ({}))).error ?? "Couldn't load this video.")));
  }, [url, status]);

  async function vote(c: MotmCandidate) {
    if (status !== "authenticated") { signIn("google"); return; }
    if (voting || c.id === data?.myVote) return;
    setVoting(c.id);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: c.id }) });
    if (res.ok) {
      setData(await res.json());
      setQuery("");
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save your vote.");
    }
    setVoting(null);
  }

  const back = <BackLink href="/motm" label="MOTM" />;
  if (!data) return <AppShell>{back}{error ? <p className="text-red-600 font-semibold">{error}</p> : <Spinner />}</AppShell>;

  const { video, totalVotes, myVote, candidates } = data;
  const leader = totalVotes > 0 ? candidates[0] : null;
  const tied = !!leader && candidates[1]?.votes === leader.votes;
  const mine = candidates.find((c) => c.id === myVote) ?? null;
  // Searching looks through every squad (crossover videos have guests); otherwise the team, plus any guest who already has votes.
  const q = query.trim().toLowerCase();
  const rows = q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates.filter((c) => !c.isGuest || c.votes > 0);
  const rank = (c: MotmCandidate) => 1 + candidates.filter((o) => o.votes > c.votes).length;

  return (
    <AppShell>
      {back}
      <a href={youTubeUrl(video.videoId)} target="_blank" rel="noreferrer" aria-label="Watch on YouTube"
        className="group relative block aspect-video rounded-[20px] overflow-hidden bg-lilac-2 shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={videoThumb(video)} alt="" className="w-full h-full object-cover" />
        <span className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/55 group-hover:bg-red-600 transition-colors flex items-center justify-center">
          <span className="ml-1 w-0 h-0 border-y-[11px] border-y-transparent border-l-[18px] border-l-white" />
        </span>
      </a>
      <div className="space-y-0.5">
        <h1 className="text-ink text-xl sm:text-2xl font-black">{video.title ?? "Video"}</h1>
        <p className="text-ink-3 text-sm font-semibold">
          {timeAgo(video.publishedAt)} · <a href={youTubeUrl(video.videoId)} target="_blank" rel="noreferrer" className="text-violet-600 hover:text-violet-700 font-extrabold">Watch on YouTube</a>
        </p>
      </div>

      <section className="rounded-[20px] p-4 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 text-white shadow-hero flex items-center gap-3.5">
        {leader ? (
          <>
            <div className="relative w-14 shrink-0 aspect-[785/1085] rounded-lg overflow-hidden border-2 border-white/80">
              <Image src={leader.imageUrl} alt="" fill sizes="56px" className="object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-white/85 text-xs font-black tracking-[0.08em]">{tied ? "⭐ JOINT LEADER" : "⭐ LEADING THE VOTE"}</div>
              <div className="text-2xl font-black truncate">{leader.name}</div>
              <div className="text-white/90 text-sm font-semibold">{leader.percent}% · {plural(leader.votes, "vote")} of {totalVotes}</div>
            </div>
          </>
        ) : (
          <div>
            <div className="text-white/85 text-xs font-black tracking-[0.08em]">⭐ NO VOTES YET</div>
            <div className="text-white/95 font-semibold">Be the first to pick the Man of the Match.</div>
          </div>
        )}
      </section>

      <p className={`rounded-2xl px-4 py-3 text-sm font-extrabold ${mine ? "bg-green-100 text-green-700" : "bg-violet-100 text-violet-700"}`}>
        {mine ? `✓ You voted for ${mine.name}. Pick someone else to change it.` : status === "authenticated" ? "Search for a player, then vote." : "Sign in to vote for your Man of the Match."}
      </p>
      {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2" aria-hidden>🔍</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players"
          className={`${inputClass} w-full h-12 pl-11`} />
      </div>

      <div className="space-y-2">
        {rows.map((c) => {
          const isMine = c.id === myVote;
          const isLeader = !!leader && c.votes === leader.votes;
          return (
            <button key={c.id} onClick={() => vote(c)} aria-label={isMine ? `${c.name}, your vote` : `Vote for ${c.name}`}
              className={`${card} w-full flex items-center gap-3 p-2.5 text-left border-2 transition-colors ${isMine ? "border-green-600 bg-green-50" : "border-transparent hover:border-violet-200"}`}>
              <span className="w-6 text-center text-ink-2 font-black tabular-nums">{totalVotes && c.votes ? rank(c) : "–"}</span>
              <span className="relative w-10 shrink-0 aspect-[785/1085] rounded-md overflow-hidden bg-lilac-2">
                <Image src={c.imageUrl} alt="" fill sizes="40px" className="object-cover" />
              </span>
              <span className="flex-1 min-w-0 space-y-1">
                <span className="block text-ink font-black truncate">{c.name}</span>
                <span className="block text-ink-3 text-xs font-semibold truncate">{[c.position, c.isGuest ? c.team : null].filter(Boolean).join(" · ") || " "}</span>
                <span className="block h-1.5 rounded-full bg-lilac-2 overflow-hidden">
                  <span className={`block h-full rounded-full ${isLeader ? "bg-yellow-400" : "bg-violet-600"}`} style={{ width: `${c.percent}%` }} />
                </span>
              </span>
              <span className="w-[76px] shrink-0 flex flex-col items-end gap-1">
                {voting === c.id ? (
                  <span className="w-5 h-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                ) : isMine ? (
                  <span className="rounded-lg bg-green-600 text-white text-xs font-black px-2 py-1">✓ Voted</span>
                ) : (
                  <span className="rounded-lg bg-violet-600 text-white text-xs font-black px-3 py-1">Vote</span>
                )}
                <span className="text-ink-2 text-xs font-bold tabular-nums">{c.percent}%</span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <p className={`${panel} text-ink-3 text-center`}>No player called &quot;{query.trim()}&quot;.</p>}
      </div>
    </AppShell>
  );
}
