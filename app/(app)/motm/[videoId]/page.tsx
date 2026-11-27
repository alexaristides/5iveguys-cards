"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell, ErrorText, Spinner } from "@/components/AppShell";
import { api, dismissKeyboard, motmPath, useMotm } from "@/components/players/queries";
import { ActivityIndicator } from "@/components/players/ui";
import { timeAgo, videoThumb, youTubeUrl, type MotmCandidate, type MotmResults } from "@/components/players/videos";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Man of the Match for one video, as in the app (mobile/src/app/motm/[videoId].tsx): who's leading,
 * then search the players and tap one to vote. One vote each; tapping someone else changes it.
 */
export default function MotmVotePage() {
  const { videoId } = useParams<{ videoId: string }>();
  const motm = useMotm(videoId);
  const [query, setQuery] = useState("");
  const [voting, setVoting] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const votingRef = useRef(false);
  const searchRef = useRef<HTMLDivElement>(null);

  /** Bring the search box to the top so the matches show above the keyboard. */
  function startSearch() {
    setSearching(true);
    setTimeout(() => searchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
  }

  async function vote(player: MotmCandidate) {
    if (votingRef.current || player.id === motm.data?.myVote) return;
    votingRef.current = true;
    setVoting(player.id);
    try {
      const res = await api<MotmResults>(motmPath(videoId), { body: { playerId: player.id } });
      motm.setData(res);
      setQuery("");
      dismissKeyboard();
    } catch (err) {
      window.alert(`Couldn't save your vote\n\n${(err as Error).message}`);
    } finally {
      votingRef.current = false;
      setVoting(null);
    }
  }

  if (!motm.data) {
    return (
      <AppShell title="Man of the Match" back="/motm">
        {motm.error ? <ErrorText>{motm.error.message}</ErrorText> : <Spinner />}
      </AppShell>
    );
  }

  const { video, totalVotes, myVote, candidates } = motm.data;
  const leader = totalVotes > 0 ? candidates[0] : null;
  const tied = !!leader && candidates[1]?.votes === leader.votes;
  const mine = candidates.find((c) => c.id === myVote) ?? null;

  // Searching looks through every squad (crossover videos have guests); otherwise the team, plus
  // any guest who already has votes.
  const q = query.trim().toLowerCase();
  const rows = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q))
    : candidates.filter((c) => !c.isGuest || c.votes > 0);
  const rank = (c: MotmCandidate) => 1 + candidates.filter((o) => o.votes > c.votes).length;
  const watch = youTubeUrl(video.videoId);

  return (
    <AppShell title="Man of the Match" back="/motm">
      <div className="leading-[1.2]">
        <a
          href={watch}
          target="_blank"
          rel="noreferrer"
          aria-label="Watch on YouTube"
          className="relative block rounded-[20px] overflow-hidden bg-lilac-2 shadow-card active:opacity-90 transition-opacity"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={videoThumb(video)} alt="" className="block w-full aspect-video object-cover" />
          <span className="absolute left-1/2 top-1/2 -ml-[34px] -mt-6 w-[68px] h-12 rounded-[14px] bg-[#FF0033] flex items-center justify-center">
            <span className="ml-1 w-0 h-0 border-y-[10px] border-y-transparent border-l-[17px] border-l-white" />
          </span>
        </a>
        <h2 className="mt-3 text-ink text-[19px] leading-6 font-black line-clamp-3">{video.title ?? "Video"}</h2>
        <p className="mt-1 text-ink-3 text-[14px] font-semibold">
          {timeAgo(video.publishedAt)} ·{" "}
          <a href={watch} target="_blank" rel="noreferrer" className="text-violet-600 font-extrabold">Watch on YouTube</a>
        </p>

        <div className="mt-4 flex items-center gap-3.5 rounded-[18px] bg-amber-100 p-3.5">
          {leader ? (
            <>
              <div className="relative w-[58px] shrink-0 aspect-[785/1085] rounded-lg overflow-hidden border-2 border-yellow-400 bg-lilac-2">
                <Image src={leader.imageUrl} alt="" fill sizes="58px" className="object-cover" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <p className="text-amber-700 text-[12px] font-black tracking-[0.8px]">{tied ? "⭐ JOINT LEADER" : "⭐ LEADING THE VOTE"}</p>
                <p className="text-ink text-[24px] font-black truncate">{leader.name}</p>
                <p className="text-ink-2 text-[14px] font-semibold">{leader.percent}% · {plural(leader.votes, "vote")} of {totalVotes}</p>
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <p className="text-amber-700 text-[12px] font-black tracking-[0.8px]">⭐ NO VOTES YET</p>
              <p className="text-ink-2 text-[14px] font-semibold">Be the first to pick the Man of the Match.</p>
            </div>
          )}
        </div>

        <div className={`mt-2.5 rounded-[14px] p-3 ${mine ? "bg-green-100" : "bg-violet-100"}`}>
          <p className={`text-[14px] leading-[19px] font-extrabold ${mine ? "text-green-600" : "text-violet-600"}`}>
            {mine ? `✓ You voted for ${mine.name}. Tap someone else to change it.` : "Search for a player, then tap them to vote."}
          </p>
        </div>

        <div
          ref={searchRef}
          className="mt-3.5 mb-2.5 h-[50px] flex items-center gap-2 rounded-2xl bg-white border-[1.5px] border-lilac-line px-3.5 scroll-mt-14 md:scroll-mt-32 focus-within:border-violet-500"
        >
          <span className="text-[16px]" aria-hidden>🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            onFocus={startSearch}
            onBlur={() => setSearching(false)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            aria-label="Search players"
            className="flex-1 min-w-0 h-full bg-transparent text-ink text-[17px] font-semibold placeholder:text-ink-3 outline-none"
          />
        </div>

        {/* While searching, leave room to scroll the box up to the top. */}
        <div className="flex flex-col gap-2" style={{ minHeight: searching ? 560 : undefined }}>
          {rows.map((c) => {
            const isMine = c.id === myVote;
            const isLeader = !!leader && c.votes === leader.votes;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => vote(c)}
                aria-label={isMine ? `${c.name}, your vote` : `Vote for ${c.name}`}
                className={`w-full flex items-center gap-2.5 rounded-2xl p-2.5 border-2 shadow-card text-left active:opacity-75 transition-opacity ${
                  isMine ? "border-green-600 bg-[#F3FDF6]" : "border-transparent bg-white"
                }`}
              >
                <span className="w-[18px] shrink-0 text-center text-ink-3 text-[14px] font-black">{totalVotes && c.votes ? rank(c) : "–"}</span>
                <span className="relative w-10 shrink-0 aspect-[785/1085] rounded-md overflow-hidden bg-lilac-2">
                  <Image src={c.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-ink text-[17px] font-black truncate">{c.name}</span>
                  <span className="text-ink-3 text-[12px] font-semibold truncate">
                    {[c.position, c.isGuest ? c.team : null].filter(Boolean).join(" · ") || " "}
                  </span>
                  <span className="h-1.5 rounded-[3px] bg-lilac-2 overflow-hidden">
                    <span
                      className={`block h-1.5 rounded-[3px] ${isLeader ? "bg-yellow-400" : "bg-violet-600"}`}
                      style={{ width: `${c.percent}%` }}
                    />
                  </span>
                </span>
                <span className="w-[84px] shrink-0 flex flex-col items-center gap-1">
                  {voting === c.id ? (
                    <ActivityIndicator className="text-violet-600" />
                  ) : isMine ? (
                    <span className="rounded-xl bg-green-600 px-2.5 py-[7px] text-white text-[13px] font-black whitespace-nowrap">✓ Voted</span>
                  ) : (
                    <span className="rounded-xl bg-violet-600 px-3.5 py-[7px] text-white text-[14px] font-black">Vote</span>
                  )}
                  <span className="text-ink-3 text-[12px] font-bold tabular-nums">{c.percent}%</span>
                </span>
              </button>
            );
          })}
          {rows.length === 0 && <p className="mt-2 text-ink-3 text-[14px] text-center">No player called &quot;{query.trim()}&quot;.</p>}
        </div>
      </div>
    </AppShell>
  );
}
