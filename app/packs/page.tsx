"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import PackOpening from "@/components/PackOpening";
import { PACKS, CardResult } from "@/lib/cards";

export default function PacksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [points, setPoints] = useState(0);
  const [selectedPack, setSelectedPack] = useState(PACKS[0].id);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchPoints = useCallback(async () => {
    const res = await fetch("/api/user");
    if (res.ok) {
      const data = await res.json();
      setPoints(data.points);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchPoints();
  }, [status, fetchPoints]);

  async function handleOpenPack(packId: string): Promise<{ cards: CardResult[]; remainingPoints: number; totalRefund: number; duplicateCount: number } | null> {
    const res = await fetch("/api/packs/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId }),
    });
    if (!res.ok) return null;
    return res.json();
  }

  const activePack = PACKS.find((p) => p.id === selectedPack)!;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-purple-900/20 blur-3xl" />
      </div>

      <Navbar user={session!.user} points={points} />

      <main className="relative max-w-4xl mx-auto px-6 pt-24 pb-20">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Open Packs</h1>
          <p className="text-zinc-500">Spend your points to reveal new cards</p>
        </div>

        {/* Pack selector */}
        <div className="flex justify-center gap-3 mb-12">
          {PACKS.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedPack(pack.id)}
              className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all border
                ${selectedPack === pack.id
                  ? "bg-purple-900/60 border-purple-600 text-white"
                  : "bg-zinc-900/60 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white"
                }`}
            >
              {pack.name}
            </button>
          ))}
        </div>

        {/* Pack description */}
        <p className="text-center text-zinc-500 text-sm mb-8">{activePack.description}</p>

        {/* Pack opening */}
        <div className="flex justify-center">
          <PackOpening
            pack={activePack}
            userPoints={points}
            onOpen={handleOpenPack}
            onPointsUpdate={setPoints}
          />
        </div>
      </main>
    </div>
  );
}
