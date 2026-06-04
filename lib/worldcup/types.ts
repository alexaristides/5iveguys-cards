// Shared World Cup types (national squads + tournament state).

import type { Formation } from "@/lib/football";

export type WcPos = "GK" | "DEF" | "MID" | "ATT";

export interface WcPlayer {
  id: string;
  name: string;
  overall: number;
  pos: WcPos;
  faceUrl: string;
}

export interface WcNation {
  id: string;
  name: string;
  flagUrl: string;
  squadOverall: number;
  players: WcPlayer[];
}

// ── Tournament state (persisted as WorldCup.state JSON) ────────────────────────

/** A competitor: either a real nation or the human player's card team. */
export interface Entrant {
  id: string;          // nation id, or "you"
  name: string;
  flagUrl: string | null;
  overall: number;
  isUser: boolean;
  pot: number;         // 1..4
}

export type Stage = "group" | "R32" | "R16" | "QF" | "SF" | "final" | "done";

export interface Fixture {
  id: string;
  stage: Stage;
  round: number;        // group matchday (1-3) or knockout order index
  homeId: string;
  awayId: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homePens?: number | null;   // knockout shootout
  awayPens?: number | null;
  winnerId?: string | null;   // resolved winner (knockouts)
  played: boolean;
  isUser: boolean;            // involves the human player
}

export interface Group {
  id: string;          // "A".."L"
  entrantIds: string[]; // 4 entrants
}

export interface StandingRow {
  entrantId: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; gd: number; pts: number;
  groupId: string;
}

export interface TournamentState {
  seed: string;
  difficulty: "easy" | "even" | "hard";
  entrants: Entrant[];
  groups: Group[];
  fixtures: Fixture[];
  stage: Stage;
  /** entrant id of the human's team */
  userId: string;
  userGroupId: string;
  /** snapshot of the user's chosen lineup for the *next* match (editable each game) */
  userLineup: SavedSlot[] | null;
  userFormation: Formation;
  champion: string | null;
  userPlacement: string | null; // e.g. "Champions", "Round of 16", "Group stage"
}

/** Compact lineup persisted between matches: which owned card sits in each slot. */
export interface SavedSlot {
  position: "GK" | "DEF" | "MID" | "ATT";
  posIndex: number;
  cardId: string;
}
