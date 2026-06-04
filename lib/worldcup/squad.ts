// Turn a national squad (WcNation) into an engine-ready AssignedPlayer[] lineup.

import {
  FORMATIONS, type AssignedPlayer, type FootballCard, type Formation, type Position,
} from "@/lib/football";
import type { Rarity, Attribute } from "@/lib/cards";
import type { WcNation, WcPlayer, WcPos } from "./types";

function rarityFromOverall(ovr: number): Rarity {
  if (ovr >= 86) return "legendary";
  if (ovr >= 80) return "epic";
  if (ovr >= 74) return "rare";
  return "common";
}

function attributeForPos(pos: WcPos): Attribute {
  if (pos === "ATT") return "Pace";
  if (pos === "MID") return "Skill";
  return "Power"; // DEF + GK
}

export function playerToCard(p: WcPlayer): FootballCard {
  return {
    id: p.id,
    name: p.name,
    rarity: rarityFromOverall(p.overall),
    attribute: attributeForPos(p.pos),
    imageUrl: p.faceUrl,
    kit: null,
    overall: p.overall,
  };
}

/**
 * Build a sensible 7-a-side lineup for `formation`: a real GK plus outfielders
 * filled position-group first (best overall), falling back to best remaining so
 * every slot is filled even for thin squads. Deterministic (no RNG).
 */
export function nationToLineup(nation: WcNation, formation: Formation): AssignedPlayer[] {
  const byPos: Record<WcPos, WcPlayer[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const p of [...nation.players].sort((a, b) => b.overall - a.overall)) byPos[p.pos].push(p);

  const used = new Set<string>();
  const take = (pos: WcPos): WcPlayer | null => {
    const fromPos = byPos[pos].find((p) => !used.has(p.id));
    const pick = fromPos
      ?? [...nation.players].sort((a, b) => b.overall - a.overall).find((p) => !used.has(p.id))
      ?? null;
    if (pick) used.add(pick.id);
    return pick;
  };

  const lineup: AssignedPlayer[] = [];
  const gk = take("GK");
  if (gk) lineup.push({ card: playerToCard(gk), position: "GK", posIndex: 0 });

  const counters: Record<Position, number> = { GK: 1, DEF: 0, MID: 0, ATT: 0 };
  for (const pos of FORMATIONS[formation].positions) {
    const player = take(pos as WcPos);
    if (!player) continue;
    lineup.push({ card: playerToCard(player), position: pos, posIndex: counters[pos]++ });
  }
  return lineup;
}
