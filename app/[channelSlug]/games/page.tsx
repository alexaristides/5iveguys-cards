"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import FootballGame from "@/components/football/FootballGame";

export default function GamesPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ channelSlug: string }>();
  const channelSlug = params.channelSlug;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-64 bg-green-900/10 blur-3xl pointer-events-none" />
      <main className="max-w-lg mx-auto px-4 pt-24 pb-24">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Game</h1>
          <p className="text-zinc-500 text-sm mt-1">Pick your squad and play a 7v7 match</p>
        </div>
        <FootballGame channelSlug={channelSlug} />
      </main>
    </div>
  );
}
