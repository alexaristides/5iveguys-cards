"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import FootballGame from "@/components/football/FootballGame";

// ── Lobby list types ──────────────────────────────────────────────────────────

interface LobbyItem {
  id: string;
  createdAt: string;
  creator: { id: string; name: string | null; image: string | null };
}

// ── PvP tab ────────────────────────────────────────────────────────────────────

function PvPTab() {
  const router = useRouter();
  const [lobbies, setLobbies] = useState<LobbyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLobby, setNewLobby] = useState<{ lobbyId: string; inviteUrl: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLobbies = useCallback(async () => {
    try {
      const res = await fetch("/api/lobbies");
      if (res.ok) {
        const data = await res.json();
        setLobbies(data.lobbies ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLobbies();
    pollRef.current = setInterval(fetchLobbies, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLobbies]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/lobbies", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setNewLobby({ lobbyId: data.lobbyId, inviteUrl: data.inviteUrl });
      // After showing invite, redirect to lobby page
      setTimeout(() => router.push(`/lobby/${data.lobbyId}`), 5000);
    } finally {
      setCreating(false);
    }
  }

  function copyInvite(url: string) {
    navigator.clipboard?.writeText(url).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    });
  }

  function timeAgo(iso: string) {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  }

  // Show lobby invite card if freshly created
  if (newLobby) {
    return (
      <div className="max-w-sm mx-auto text-center">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 mb-4">
          <h3 className="text-white font-bold text-lg mb-1">Lobby created!</h3>
          <p className="text-zinc-500 text-sm mb-5">Share this with your opponent. Redirecting to lobby…</p>
          <div className="flex justify-center mb-4">
            <QRCodeSVG value={newLobby.inviteUrl} size={140} bgColor="transparent" fgColor="#ffffff" />
          </div>
          <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5">
            <span className="text-zinc-400 text-xs flex-1 truncate">{newLobby.inviteUrl}</span>
            <button
              onClick={() => copyInvite(newLobby.inviteUrl)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                inviteCopied ? "bg-green-700 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
              }`}
            >
              {inviteCopied ? "✓" : "Copy"}
            </button>
          </div>
        </div>
        <button
          onClick={() => router.push(`/lobby/${newLobby.lobbyId}`)}
          className="w-full py-3 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold transition-all"
        >
          Go to Lobby →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-white font-bold text-base">PvP Matches</h3>
          <p className="text-zinc-500 text-xs mt-0.5">Challenge another player live — pick your squad, watch the match together</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-green-900/30"
        >
          {creating && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          Create Lobby
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lobbies.length === 0 ? (
        <div className="text-center py-10 rounded-2xl bg-zinc-900/60 border border-zinc-800">
          <p className="text-3xl mb-2">🏟</p>
          <p className="text-zinc-500 text-sm">No open lobbies right now</p>
          <p className="text-zinc-600 text-xs mt-1">Create one and share the link!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lobbies.map((lobby) => (
            <div key={lobby.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-zinc-800 shrink-0">
                {lobby.creator.image ? (
                  <Image src={lobby.creator.image} alt={lobby.creator.name ?? ""} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                    {(lobby.creator.name ?? "?")[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{lobby.creator.name ?? "Anonymous"}</p>
                <p className="text-zinc-500 text-xs">{timeAgo(lobby.createdAt)}</p>
              </div>
              <button
                onClick={() => router.push(`/lobby/${lobby.id}`)}
                className="px-4 py-2 rounded-xl bg-green-900/60 border border-green-700/60 text-green-300 text-xs font-bold hover:bg-green-800/60 transition-all shrink-0"
              >
                Join ⚔️
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={fetchLobbies} className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
        Refresh
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function GamePageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"sp" | "pvp">(() =>
    searchParams.get("tab") === "pvp" ? "pvp" : "sp"
  );
  const [spPhase, setSpPhase] = useState<"setup" | "playing" | "result">("setup");
  const hideNav = spPhase === "playing";          // immersive while the match plays
  const hideTabs = spPhase !== "setup";            // tabs/title irrelevant during play + result

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (status === "unauthenticated") return null;

  const user = session?.user;

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      {!hideNav && (
        <header className="relative border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
              <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">5</span>
              </div>
              <span className="text-white font-semibold text-sm hidden sm:block">5iveG</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
                ← Dashboard
              </Link>
              {user?.image && (
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-zinc-700">
                  <Image src={user.image} alt={user.name ?? "User"} fill className="object-cover" />
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <div className={`relative max-w-5xl mx-auto px-4 sm:px-6 ${spPhase === "playing" ? "pt-3 pb-8" : "py-8"}`}>
        {/* SP / PvP toggle */}
        {!hideTabs && (
          <div className="flex gap-1 mb-8 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 w-fit">
            <button
              onClick={() => setTab("sp")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === "sp" ? "bg-green-700 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              ⚽ Single Player
            </button>
            <button
              onClick={() => setTab("pvp")}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === "pvp" ? "bg-green-700 text-white shadow" : "text-zinc-400 hover:text-white"
              }`}
            >
              ⚔️ PvP
            </button>
          </div>
        )}

        {tab === "sp" && (
          <div>
            {!hideTabs && (
              <>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-white">Single Player</h2>
                  <p className="text-zinc-500 text-sm mt-1">Pick your best squad and play a 7v7 match vs CPU</p>
                </div>
                <Link
                  href="/game/worldcup"
                  className="group mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 p-4 shadow-lg shadow-amber-900/30 transition-all active:scale-[0.99]"
                >
                  <span className="text-3xl shrink-0">🏆</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold leading-tight">World Cup — Road to Glory</div>
                    <div className="text-amber-100/80 text-xs mt-0.5">Take 5ive Guys FC through the 48-team World Cup</div>
                  </div>
                  <span className="text-white/80 text-xl shrink-0 group-hover:translate-x-0.5 transition-transform">›</span>
                </Link>
              </>
            )}
            <FootballGame onPhaseChange={setSpPhase} />
          </div>
        )}

        {tab === "pvp" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">PvP Matches</h2>
              <p className="text-zinc-500 text-sm mt-1">1v1 live matches — both players watch the same simulation unfold</p>
            </div>
            <PvPTab />
          </div>
        )}
      </div>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <GamePageInner />
    </Suspense>
  );
}
