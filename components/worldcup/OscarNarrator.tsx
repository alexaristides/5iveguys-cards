"use client";

import Image from "next/image";
import { NARRATOR, type LoreTone } from "@/lib/worldcup/lore";

interface Props {
  quote: string;
  tone?: LoreTone;
  /** "overlay" = dismissible modal (after matches); "inline" = embedded briefing. */
  variant?: "overlay" | "inline";
  onDismiss?: () => void;
}

const TONE_RING: Record<LoreTone, string> = {
  normal: "ring-amber-400",
  triumph: "ring-amber-300",
  defeat: "ring-zinc-500",
};

function Card({ quote, tone = "normal" }: { quote: string; tone?: LoreTone }) {
  return (
    <div className="flex gap-3 items-start">
      <div className={`relative shrink-0 w-14 h-14 rounded-full overflow-hidden ring-2 ${TONE_RING[tone]} shadow-lg`}>
        <Image src={NARRATOR.imageUrl} alt={NARRATOR.name} fill className="object-cover object-top" sizes="56px" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-white font-bold text-sm">{NARRATOR.name}</span>
          <span className="text-amber-400/80 text-[10px] font-semibold uppercase tracking-wider">{NARRATOR.title}</span>
        </div>
        <p className="text-zinc-200 text-sm leading-relaxed">“{quote}”</p>
      </div>
    </div>
  );
}

export default function OscarNarrator({ quote, tone = "normal", variant = "overlay", onDismiss }: Props) {
  if (variant === "inline") {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-amber-950/40 to-zinc-900 border border-amber-800/40 p-4 mb-5">
        <Card quote={quote} tone={tone} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onDismiss}>
      <div
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl animate-[fadeIn_.2s_ease-out] ${
          tone === "triumph" ? "bg-gradient-to-br from-amber-900/60 to-zinc-900 border-amber-600/60"
          : tone === "defeat" ? "bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700"
          : "bg-gradient-to-br from-amber-950/50 to-zinc-900 border-amber-800/50"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {tone === "triumph" && <div className="text-center text-3xl mb-2">🏆</div>}
        <Card quote={quote} tone={tone} />
        <button
          onClick={onDismiss}
          className="w-full mt-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm font-bold transition-all active:scale-95"
        >
          Continue ➜
        </button>
      </div>
    </div>
  );
}
