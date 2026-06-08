// Types for the free-to-play 2026 World Cup Dream Team Draft.

/** Granular football positions used across the draft. */
export type Pos =
  | "GK"
  | "RB" | "CB" | "LB" | "RWB" | "LWB"
  | "CDM" | "CM" | "CAM" | "RM" | "LM"
  | "RW" | "LW" | "CF" | "ST";

/** Broad position bucket — used for slot eligibility and pitch layout. */
export type PosGroup = "GK" | "DEF" | "MID" | "ATT";

export interface Player {
  /** Stable id, unique within a nation (we prefix with nation id at runtime). */
  id: string;
  name: string;
  /** Primary position. */
  pos: Pos;
  /** 0-2 additional positions the player can fill. */
  alt?: Pos[];
  /** Current-form overall rating (2025/26 season), 1-99. */
  rating: number;
  /** Career-peak overall ("World Cup Peak" ratings mode). Defaults to rating when omitted. */
  peak?: number;
  /** Club, for flavour. */
  club?: string;
}

export interface Nation {
  id: string;
  name: string;
  /** Emoji flag. */
  flag: string;
  /** Group letter A-L. */
  group: string;
  /** ~20-23 players. */
  players: Player[];
}

/** Runtime player with nation context attached. */
export interface DraftPlayer extends Player {
  nationId: string;
  nationName: string;
  flag: string;
  group: string;
  /** Globally-unique id (nationId:id). */
  uid: string;
}

export type Difficulty = "easy" | "normal" | "hard";
export type DraftMode = "nation" | "position";
export type RatingsMode = "current" | "peak";

export interface FormationSlot {
  /** Slot label shown on the pitch, e.g. "CB", "ST". */
  label: Pos;
  /** Broad group for eligibility. */
  group: PosGroup;
  /** Pitch coordinates as percentages (0-100). x: left→right, y: top(=opponent goal)→bottom(=own goal). */
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  slots: FormationSlot[];
}

/** A filled slot on the pitch. */
export interface PlacedPlayer {
  slotIndex: number;
  player: DraftPlayer;
}
