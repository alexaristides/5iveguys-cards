import type { Formation, Pos, PosGroup } from "./types";

/**
 * Pitch coordinates are percentages. y=0 is the opponent's goal (top of the
 * attacking half on screen), y=100 is the user's own goal (bottom). The GK
 * sits near the bottom.
 */

export const POS_GROUP: Record<Pos, PosGroup> = {
  GK: "GK",
  RB: "DEF", CB: "DEF", LB: "DEF", RWB: "DEF", LWB: "DEF",
  CDM: "MID", CM: "MID", CAM: "MID", RM: "MID", LM: "MID",
  RW: "ATT", LW: "ATT", CF: "ATT", ST: "ATT",
};

/**
 * Which player positions are eligible to fill a given slot. A slot accepts its
 * own label, plus closely-related positions in the same band. This keeps the
 * draft flexible (a player with alt positions can slot in) without letting a
 * striker play centre-back.
 */
export const SLOT_ELIGIBILITY: Record<Pos, Pos[]> = {
  GK: ["GK"],
  RB: ["RB", "RWB"],
  LB: ["LB", "LWB"],
  RWB: ["RWB", "RB", "RM"],
  LWB: ["LWB", "LB", "LM"],
  CB: ["CB"],
  CDM: ["CDM", "CM"],
  CM: ["CM", "CDM", "CAM"],
  CAM: ["CAM", "CM", "CF"],
  RM: ["RM", "RW", "RWB"],
  LM: ["LM", "LW", "LWB"],
  RW: ["RW", "RM", "CF"],
  LW: ["LW", "LM", "CF"],
  CF: ["CF", "ST", "CAM"],
  ST: ["ST", "CF"],
};

/** Does this player (with primary + alt positions) qualify for a slot? */
export function playerFitsSlot(playerPositions: Pos[], slotLabel: Pos): boolean {
  const eligible = SLOT_ELIGIBILITY[slotLabel];
  return playerPositions.some((p) => eligible.includes(p));
}

function slot(label: Pos, x: number, y: number) {
  return { label, group: POS_GROUP[label], x, y };
}

export const FORMATIONS: Formation[] = [
  {
    id: "433",
    name: "4-3-3",
    slots: [
      slot("GK", 50, 92),
      slot("LB", 16, 72), slot("CB", 38, 76), slot("CB", 62, 76), slot("RB", 84, 72),
      slot("CM", 30, 50), slot("CM", 50, 54), slot("CM", 70, 50),
      slot("LW", 20, 24), slot("ST", 50, 18), slot("RW", 80, 24),
    ],
  },
  {
    id: "442",
    name: "4-4-2",
    slots: [
      slot("GK", 50, 92),
      slot("LB", 16, 72), slot("CB", 38, 76), slot("CB", 62, 76), slot("RB", 84, 72),
      slot("LM", 16, 48), slot("CM", 38, 52), slot("CM", 62, 52), slot("RM", 84, 48),
      slot("ST", 38, 20), slot("ST", 62, 20),
    ],
  },
  {
    id: "4231",
    name: "4-2-3-1",
    slots: [
      slot("GK", 50, 92),
      slot("LB", 16, 72), slot("CB", 38, 76), slot("CB", 62, 76), slot("RB", 84, 72),
      slot("CDM", 38, 58), slot("CDM", 62, 58),
      slot("LM", 18, 36), slot("CAM", 50, 38), slot("RM", 82, 36),
      slot("ST", 50, 16),
    ],
  },
  {
    id: "352",
    name: "3-5-2",
    slots: [
      slot("GK", 50, 92),
      slot("CB", 28, 76), slot("CB", 50, 78), slot("CB", 72, 76),
      slot("LWB", 12, 52), slot("CM", 35, 54), slot("CM", 50, 58), slot("CM", 65, 54), slot("RWB", 88, 52),
      slot("ST", 38, 20), slot("ST", 62, 20),
    ],
  },
  {
    id: "532",
    name: "5-3-2",
    slots: [
      slot("GK", 50, 92),
      slot("LWB", 10, 70), slot("CB", 30, 78), slot("CB", 50, 80), slot("CB", 70, 78), slot("RWB", 90, 70),
      slot("CM", 30, 50), slot("CM", 50, 54), slot("CM", 70, 50),
      slot("ST", 38, 20), slot("ST", 62, 20),
    ],
  },
  {
    id: "343",
    name: "3-4-3",
    slots: [
      slot("GK", 50, 92),
      slot("CB", 28, 76), slot("CB", 50, 78), slot("CB", 72, 76),
      slot("LM", 14, 50), slot("CM", 38, 54), slot("CM", 62, 54), slot("RM", 86, 50),
      slot("LW", 20, 22), slot("ST", 50, 18), slot("RW", 80, 22),
    ],
  },
];

export function getFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? FORMATIONS[0];
}
