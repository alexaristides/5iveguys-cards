"use client";

import { useMemo, useState } from "react";
import type { PlacedPlayer } from "@/lib/draft/types";
import { getFormation } from "@/lib/draft/formations";
import SetupScreen, { type DraftConfig } from "./SetupScreen";
import DraftScreen from "./DraftScreen";
import SimScreen from "./SimScreen";

type Screen = "setup" | "draft" | "sim";

const REROLLS: Record<DraftConfig["difficulty"], number> = { easy: 3, normal: 1, hard: 0 };

export default function WorldCupDraft() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [config, setConfig] = useState<DraftConfig | null>(null);
  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [rerollsLeft, setRerollsLeft] = useState(0);

  const formation = useMemo(
    () => getFormation(config?.formationId ?? "433"),
    [config?.formationId],
  );

  const start = (cfg: DraftConfig) => {
    setConfig(cfg);
    setPlaced([]);
    setRerollsLeft(REROLLS[cfg.difficulty]);
    setScreen("draft");
  };

  const restart = () => {
    setPlaced([]);
    setConfig(null);
    setScreen("setup");
  };

  return (
    <div className="min-h-[60vh]">
      {screen === "setup" && <SetupScreen onStart={start} />}
      {screen === "draft" && config && (
        <DraftScreen
          config={config}
          formation={formation}
          placed={placed}
          setPlaced={setPlaced}
          rerollsLeft={rerollsLeft}
          setRerollsLeft={setRerollsLeft}
          onComplete={() => setScreen("sim")}
        />
      )}
      {screen === "sim" && config && (
        <SimScreen config={config} formation={formation} placed={placed} onRestart={restart} />
      )}
    </div>
  );
}
