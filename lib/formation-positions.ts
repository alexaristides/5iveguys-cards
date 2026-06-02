import type { AssignedPlayer, Formation } from "./football";

export type PosMap = { GK: number[][]; DEF: number[][]; MID: number[][]; ATT: number[][] };

export const USER_POSITIONS: Record<Formation, PosMap> = {
  "2-2-2": { GK: [[50,90]], DEF: [[28,76],[72,76]], MID: [[28,62],[72,62]], ATT: [[35,47],[65,47]] },
  "3-2-1": { GK: [[50,90]], DEF: [[18,76],[50,76],[82,76]], MID: [[32,62],[68,62]], ATT: [[50,47]] },
  "1-3-2": { GK: [[50,90]], DEF: [[50,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[33,47],[67,47]] },
  "2-3-1": { GK: [[50,90]], DEF: [[30,76],[70,76]], MID: [[18,62],[50,62],[82,62]], ATT: [[50,47]] },
};

function mirrorY(map: PosMap): PosMap {
  const m = (y: number) => 100 - y;
  return {
    GK:  map.GK.map(([x, y])  => [x, m(y)]),
    DEF: map.DEF.map(([x, y]) => [x, m(y)]),
    MID: map.MID.map(([x, y]) => [x, m(y)]),
    ATT: map.ATT.map(([x, y]) => [x, m(y)]),
  };
}

export const CPU_POSITIONS: Record<Formation, PosMap> = Object.fromEntries(
  (Object.entries(USER_POSITIONS) as [Formation, PosMap][]).map(([f, p]) => [f, mirrorY(p)])
) as Record<Formation, PosMap>;

export function getHomeCoord(
  player: AssignedPlayer,
  formation: Formation,
  team: "user" | "cpu",
): [number, number] {
  const map = team === "user" ? USER_POSITIONS[formation] : CPU_POSITIONS[formation];
  const coords = map[player.position];
  return (coords[player.posIndex] ?? coords[0]) as [number, number];
}
