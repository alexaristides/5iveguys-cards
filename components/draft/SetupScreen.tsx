"use client";

import { useState } from "react";
import { FORMATIONS, getFormation } from "@/lib/draft/formations";
import type { Difficulty, DraftMode, RatingsMode } from "@/lib/draft/types";
import { STATS } from "@/lib/draft/nations";
import Pitch from "./Pitch";

export interface DraftConfig {
  formationId: string;
  difficulty: Difficulty;
  draftMode: DraftMode;
  ratingsMode: RatingsMode;
}

const DIFFICULTIES: { id: Difficulty; label: string; desc: string }[] = [
  { id: "easy", label: "Easy", desc: "3 rerolls" },
  { id: "normal", label: "Normal", desc: "1 reroll" },
  { id: "hard", label: "Hard", desc: "No rerolls · ratings hidden" },
];

const DRAFT_MODES: { id: DraftMode; label: string; desc: string }[] = [
  { id: "nation", label: "Nation First", desc: "Spin a country, pick any player, choose their position" },
  { id: "position", label: "Position First", desc: "Pick a slot, then spin for a country to fill it" },
];

const RATINGS_MODES: { id: RatingsMode; label: string; desc: string }[] = [
  { id: "current", label: "Current Form", desc: "Players rated for their 2025/26 season" },
  { id: "peak", label: "World Cup Peak", desc: "Every player at their career-best rating" },
];

export default function SetupScreen({ onStart }: { onStart: (config: DraftConfig) => void }) {
  const [formationId, setFormationId] = useState("433");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [draftMode, setDraftMode] = useState<DraftMode>("nation");
  const [ratingsMode, setRatingsMode] = useState<RatingsMode>("current");

  const formation = getFormation(formationId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
          Build your <span className="text-[#FFC233]">2026 World Cup XI</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          {STATS.nations} nations · {STATS.players.toLocaleString()}+ players · choose your setup, then spin & draft.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {/* Formation */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Formation</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {FORMATIONS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormationId(f.id)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-bold transition ${
                    formationId === f.id
                      ? "border-[#FFC233] bg-[#FFC233]/15 text-[#FFC233]"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/25"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </section>

          {/* Difficulty */}
          <Choice
            title="Difficulty"
            options={DIFFICULTIES}
            value={difficulty}
            onChange={(v) => setDifficulty(v as Difficulty)}
          />

          {/* Draft mode */}
          <Choice
            title="Draft Mode"
            options={DRAFT_MODES}
            value={draftMode}
            onChange={(v) => setDraftMode(v as DraftMode)}
          />

          {/* Ratings mode */}
          <Choice
            title="Player Ratings"
            options={RATINGS_MODES}
            value={ratingsMode}
            onChange={(v) => setRatingsMode(v as RatingsMode)}
          />
        </div>

        {/* Pitch preview */}
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">Shape preview</h3>
          <Pitch formation={formation} placed={[]} className="mx-auto max-w-[260px]" />
          <p className="mt-2 text-center text-xs text-zinc-500">{formation.name}</p>
        </div>
      </div>

      <button
        onClick={() => onStart({ formationId, difficulty, draftMode, ratingsMode })}
        className="mt-8 w-full rounded-2xl bg-[#FFC233] py-4 text-lg font-extrabold text-zinc-950 shadow-lg shadow-[#FFC233]/20 transition hover:bg-[#ffce5c] active:scale-[0.99]"
      >
        Start Draft →
      </button>
    </div>
  );
}

function Choice<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { id: T; label: string; desc: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              value === o.id
                ? "border-[#FFC233] bg-[#FFC233]/10"
                : "border-white/10 bg-white/5 hover:border-white/25"
            }`}
          >
            <div className={`text-sm font-bold ${value === o.id ? "text-[#FFC233]" : "text-white"}`}>
              {o.label}
            </div>
            <div className="mt-0.5 text-[11px] leading-tight text-zinc-400">{o.desc}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
