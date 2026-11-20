/**
 * Fantasy Div 1 — team editing shared by the website and the iOS app: formations, slots and
 * auto-fill for the 7 picks. Pure TypeScript; rules live in lib/fantasy.ts.
 */
import { FANTASY_RULES, pickPositions, type FantasyPosition } from "./fantasy";

export interface LineupPlayer { id: string; position: FantasyPosition; price: number; isActive: boolean; totalPoints?: number }

/** Outfield shape of the 7 (always one keeper). */
export interface Formation { DEF: number; MID: number; FWD: number }

/** Every legal 7-a-side shape: 2-4 defenders, 1-3 midfielders and 1-3 forwards. */
export const FORMATIONS: Formation[] = [
  { DEF: 3, MID: 2, FWD: 1 }, { DEF: 2, MID: 3, FWD: 1 }, { DEF: 2, MID: 2, FWD: 2 },
  { DEF: 3, MID: 1, FWD: 2 }, { DEF: 2, MID: 1, FWD: 3 }, { DEF: 4, MID: 1, FWD: 1 },
];

export const formationLabel = (f: Formation) => `${f.DEF}-${f.MID}-${f.FWD}`;
const sameFormation = (a: Formation, b: Formation) => a.DEF === b.DEF && a.MID === b.MID && a.FWD === b.FWD;

/** Positions of the 7 slots in display order: keeper, defenders, midfielders, forwards. */
export function slotPositions(f: Formation): FantasyPosition[] {
  return ["GK", ...Array<FantasyPosition>(f.DEF).fill("DEF"), ...Array<FantasyPosition>(f.MID).fill("MID"), ...Array<FantasyPosition>(f.FWD).fill("FWD")];
}

const ORDER: Record<FantasyPosition, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** A team being edited: 7 slots following the formation. */
export interface Lineup {
  formation: Formation;
  slots: (string | null)[];
}

export const EMPTY_LINEUP: Lineup = { formation: FORMATIONS[0], slots: Array(FANTASY_RULES.squadSize).fill(null) };

/**
 * Lay out a saved team, each player in the position the fan put them in (their own position for
 * teams saved before that; teams saved with 2 subs under the old rules show their first 7).
 */
export function lineupFromPicks(picks: { playerId: string; position?: FantasyPosition | null }[], players: Map<string, LineupPlayer>): Lineup {
  const seven = picks.slice(0, FANTASY_RULES.squadSize);
  const roles = pickPositions(seven, players);
  const placed = seven.map((p, i) => ({ id: p.playerId, role: roles[i] })).sort((a, b) => ORDER[a.role] - ORDER[b.role]);
  const count = (p: FantasyPosition) => placed.filter((x) => x.role === p).length;
  const formation = { DEF: count("DEF"), MID: count("MID"), FWD: count("FWD") };
  return { formation: FORMATIONS.find((f) => sameFormation(f, formation)) ?? formation, slots: placed.map((x) => x.id) };
}

/** Lay out players by their own positions. */
export const lineupFromIds = (ids: string[], players: Map<string, LineupPlayer>) =>
  lineupFromPicks(ids.map((id) => ({ playerId: id })), players);

/** The position each slot plays, in slot order (what's saved with the picks). */
export const lineupPositions = (l: Lineup) => slotPositions(l.formation);

/** The 7 picks, or null while there are empty slots. */
export function lineupIds(l: Lineup): string[] | null {
  return l.slots.every(Boolean) ? (l.slots as string[]) : null;
}

export function inLineup(l: Lineup) {
  return new Set(l.slots.filter((id): id is string => !!id));
}

/**
 * Switch formation, keeping all 7: players stay in their position where the new shape still has
 * room, and anyone left over moves to a free slot (anyone can play anywhere).
 */
export function changeFormation(l: Lineup, f: Formation, players: Map<string, LineupPlayer>): Lineup {
  if (sameFormation(l.formation, f)) return l;
  const before = slotPositions(l.formation);
  const after = slotPositions(f);
  const slots: (string | null)[] = Array(FANTASY_RULES.squadSize).fill(null);
  const left: string[] = [];
  l.slots.forEach((id, i) => {
    if (!id) return;
    const j = after.findIndex((p, k) => p === before[i] && !slots[k]);
    if (j >= 0) slots[j] = id; else left.push(id);
  });
  // Leftovers go where they'd naturally play if there's room, then anywhere.
  for (const id of [...left]) {
    const j = after.findIndex((p, k) => p === players.get(id)?.position && !slots[k]);
    if (j >= 0) { slots[j] = id; left.splice(left.indexOf(id), 1); }
  }
  for (const id of left) slots[slots.indexOf(null)] = id;
  return { formation: f, slots };
}

/** Put a player in a slot (replacing whoever was there). */
export function placePlayer(l: Lineup, index: number, id: string): Lineup {
  const slots = l.slots.map((s) => (s === id ? null : s));
  slots[index] = id;
  return { ...l, slots };
}

export function removePlayer(l: Lineup, id: string): Lineup {
  return { ...l, slots: l.slots.map((s) => (s === id ? null : s)) };
}

/**
 * Fill the empty slots: for each one take a player who naturally plays there if there's one left
 * (else anyone), the priciest who still leaves enough money to fill the rest with the cheapest
 * available. `moneyLeft` is the bank with the current picks in.
 */
export function autoComplete(lineup: Lineup, players: LineupPlayer[], moneyLeft: number): Lineup {
  let next = lineup;
  let bank = moneyLeft;
  const positions = slotPositions(lineup.formation);
  const empty = positions.map((position, index) => ({ position, index })).filter(({ index }) => !next.slots[index]);

  empty.forEach(({ position, index }, n) => {
    const taken = inLineup(next);
    const pool = players.filter((p) => p.isActive && !taken.has(p.id));
    const rest = empty.slice(n + 1);
    const cheapestRest = (exclude: string) => {
      const used = new Set([exclude]);
      return rest.reduce((sum, r) => {
        const c = pool.filter((p) => !used.has(p.id)).sort((a, b) => a.price - b.price)[0];
        if (c) used.add(c.id);
        return sum + (c?.price ?? 0);
      }, 0);
    };
    const choice = pool
      .sort((a, b) => Number(b.position === position) - Number(a.position === position)
        || b.price - a.price || (b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      .find((p) => p.price + cheapestRest(p.id) <= bank);
    if (choice) {
      next = placePlayer(next, index, choice.id);
      bank -= choice.price;
    }
  });
  return next;
}
