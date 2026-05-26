export type Rarity = "common" | "rare" | "epic" | "legendary";

export type Attribute = "Pace" | "Power" | "Skill";

export const SALARY_CAP = 100;

export const CAP_COSTS: Record<Rarity, number> = {
  common:    10,
  rare:      25,
  epic:      40,
  legendary: 60,
};

export interface Card {
  id: string;
  name: string;
  player?: string;
  kit?: string;
  image: string;
  backImage?: string;
  rarity: Rarity;
  attribute: Attribute;
  description?: string;
  /**
   * Draw weight within a rarity pool.
   * Standard kit cards default to 1.0.
   * Screenshot / special cards are lower (0.35) so they're rarer
   * even when multiple non-screenshot cards share their rarity tier.
   */
  weight?: number;
}

export interface CardResult extends Card {
  isDuplicate: boolean;
  refundPoints: number;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  cost: number;
  cardCount: number;
  image: string;
  odds: { common: number; rare: number; epic: number; legendary: number };
}

const CARD_BASE = "/cards";

export const CARDS: Card[] = [
  // ── HOME KIT (common) ────────────────────────────────────────────────────
  { id: "home-adrian",      name: "Adrian",      player: "Adrian",      kit: "Home Kit", image: `${CARD_BASE}/home/Adrian_Home.jpg`,      rarity: "common", attribute: "Power" },
  { id: "home-barney",      name: "Barney",      player: "Barney",      kit: "Home Kit", image: `${CARD_BASE}/home/Barney_Home.jpg`,      rarity: "common", attribute: "Power" },
  { id: "home-gravz",       name: "Gravz",       player: "Gravz",       kit: "Home Kit", image: `${CARD_BASE}/home/Gravz_Home.jpg`,       rarity: "common", attribute: "Pace"  },
  { id: "home-jack",        name: "Jack",        player: "Jack",        kit: "Home Kit", image: `${CARD_BASE}/home/Jack_Home.jpg`,        rarity: "common", attribute: "Skill" },
  { id: "home-joad",        name: "Joad",        player: "Joad",        kit: "Home Kit", image: `${CARD_BASE}/home/Joad_Home.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "home-lats",        name: "Lats",        player: "Lats",        kit: "Home Kit", image: `${CARD_BASE}/home/Lats_Home.jpg`,        rarity: "common", attribute: "Power" },
  { id: "home-louis",       name: "Louis",       player: "Louis",       kit: "Home Kit", image: `${CARD_BASE}/home/Louis_Home.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "home-milo",        name: "Milo",        player: "Milo",        kit: "Home Kit", image: `${CARD_BASE}/home/Milo_Home.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "home-neymar",      name: "Neymar",      player: "Neymar",      kit: "Home Kit", image: `${CARD_BASE}/home/Neymar_Home.jpg`,      rarity: "common", attribute: "Skill" },
  { id: "home-oscar",       name: "Oscar",       player: "Oscar",       kit: "Home Kit", image: `${CARD_BASE}/home/Oscar_Home.jpg`,       rarity: "common", attribute: "Pace"  },
  { id: "home-raptis",      name: "Raptis",      player: "Raptis",      kit: "Home Kit", image: `${CARD_BASE}/home/Raptis_Home.jpg`,      rarity: "common", attribute: "Power" },
  { id: "home-ryan",        name: "Ryan",        player: "Ryan",        kit: "Home Kit", image: `${CARD_BASE}/home/Ryan_Home.jpg`,        rarity: "common", attribute: "Power" },
  { id: "home-stan",        name: "Stan",        player: "Stan",        kit: "Home Kit", image: `${CARD_BASE}/home/Stan_Home.jpg`,        rarity: "common", attribute: "Skill" },
  { id: "home-sweetchilli", name: "SweetChilli", player: "SweetChilli", kit: "Home Kit", image: `${CARD_BASE}/home/SweetChilli_Home.jpg`, rarity: "common", attribute: "Pace"  },
  { id: "home-theo",        name: "Theo",        player: "Theo",        kit: "Home Kit", image: `${CARD_BASE}/home/Theo_Home.jpg`,        rarity: "common", attribute: "Skill" },
  { id: "home-uriel",       name: "Uriel",       player: "Uriel",       kit: "Home Kit", image: `${CARD_BASE}/home/Uriel_Home.jpg`,       rarity: "common", attribute: "Power" },

  // ── BLACK KIT (common) ───────────────────────────────────────────────────
  { id: "black-adrian",      name: "Adrian",      player: "Adrian",      kit: "Black Kit", image: `${CARD_BASE}/black/Adrian_Black.jpg`,      rarity: "common", attribute: "Power" },
  { id: "black-barney",      name: "Barney",      player: "Barney",      kit: "Black Kit", image: `${CARD_BASE}/black/Barney_Black.jpg`,      rarity: "common", attribute: "Power" },
  { id: "black-gravz",       name: "Gravz",       player: "Gravz",       kit: "Black Kit", image: `${CARD_BASE}/black/Gravz_Black.jpg`,       rarity: "common", attribute: "Pace"  },
  { id: "black-joad",        name: "Joad",        player: "Joad",        kit: "Black Kit", image: `${CARD_BASE}/black/Joad_Black.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "black-louis",       name: "Louis",       player: "Louis",       kit: "Black Kit", image: `${CARD_BASE}/black/Louis_Black.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "black-milo",        name: "Milo",        player: "Milo",        kit: "Black Kit", image: `${CARD_BASE}/black/Milo_Black.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "black-ramin",       name: "Ramin",       player: "Ramin",       kit: "Black Kit", image: `${CARD_BASE}/black/Ramin_Black.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "black-ryan",        name: "Ryan",        player: "Ryan",        kit: "Black Kit", image: `${CARD_BASE}/black/Ryan_Black.jpg`,        rarity: "common", attribute: "Power" },
  { id: "black-stan",        name: "Stan",        player: "Stan",        kit: "Black Kit", image: `${CARD_BASE}/black/Stan_Black.jpg`,        rarity: "common", attribute: "Skill" },
  { id: "black-sweetchilli", name: "SweetChilli", player: "SweetChilli", kit: "Black Kit", image: `${CARD_BASE}/black/SweetChilli_Black.jpg`, rarity: "common", attribute: "Pace"  },

  // ── CAMO KIT (common) ────────────────────────────────────────────────────
  { id: "camo-adrian",      name: "Adrian",      player: "Adrian",      kit: "Camo Kit", image: `${CARD_BASE}/camo/Adrian_Camo.jpg`,      rarity: "common", attribute: "Power" },
  { id: "camo-barney",      name: "Barney",      player: "Barney",      kit: "Camo Kit", image: `${CARD_BASE}/camo/Barney_Camo.jpg`,      rarity: "common", attribute: "Power" },
  { id: "camo-callum",      name: "Callum",      player: "Callum",      kit: "Camo Kit", image: `${CARD_BASE}/camo/Callum_Camo.jpg`,      rarity: "common", attribute: "Pace"  },
  { id: "camo-joad",        name: "Joad",        player: "Joad",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Joad_Camo.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "camo-louis",       name: "Louis",       player: "Louis",       kit: "Camo Kit", image: `${CARD_BASE}/camo/Louis_Camo.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "camo-luke",        name: "Luke",        player: "Luke",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Luke_Camo.jpg`,        rarity: "common", attribute: "Power" },
  { id: "camo-milo",        name: "Milo",        player: "Milo",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Milo_Camo.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "camo-oscar",       name: "Oscar",       player: "Oscar",       kit: "Camo Kit", image: `${CARD_BASE}/camo/Oscar_Camo.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "camo-ramin",       name: "Ramin",       player: "Ramin",       kit: "Camo Kit", image: `${CARD_BASE}/camo/Ramin_Camo.jpg`,       rarity: "common", attribute: "Skill" },
  { id: "camo-ryan",        name: "Ryan",        player: "Ryan",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Ryan_Camo.jpg`,        rarity: "common", attribute: "Power" },
  { id: "camo-stan",        name: "Stan",        player: "Stan",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Stan_Camo.jpg`,        rarity: "common", attribute: "Skill" },
  { id: "camo-sweetchilli", name: "SweetChilli", player: "SweetChilli", kit: "Camo Kit", image: `${CARD_BASE}/camo/SweetChilli_Camo.jpg`, rarity: "common", attribute: "Pace"  },
  { id: "camo-theo",        name: "Theo",        player: "Theo",        kit: "Camo Kit", image: `${CARD_BASE}/camo/Theo_Camo.jpg`,        rarity: "common", attribute: "Pace"  },
  { id: "camo-uriel",       name: "Uriel",       player: "Uriel",       kit: "Camo Kit", image: `${CARD_BASE}/camo/Uriel_Camo.jpg`,       rarity: "common", attribute: "Power" },

  // ── RARE / SPECIAL EDITIONS (weight 0.4 — rarer within their tier) ───────
  { id: "special-louis-ballon-dor", name: "Louis Ballon d'Or", player: "Louis",  kit: "Special", image: `${CARD_BASE}/special/Louis_Ballon_Dor.jpg`,                                                     rarity: "rare", attribute: "Skill", description: "The Golden Ball",      weight: 0.4 },
  { id: "special-neymar-brazil",    name: "Neymar Brazil",     player: "Neymar", kit: "Special", image: `${CARD_BASE}/special/Neymar_Brazil.jpg`, backImage: `${CARD_BASE}/special/Neymar_Brazil_Back.jpg`, rarity: "rare", attribute: "Skill", description: "International Edition", weight: 0.4 },
  { id: "special-raptis-usa",       name: "Raptis USA",        player: "Raptis", kit: "Special", image: `${CARD_BASE}/special/Raptis_USA.jpg`,    backImage: `${CARD_BASE}/special/Raptis_USA_Back.jpg`,    rarity: "rare", attribute: "Power", description: "International Edition", weight: 0.4 },

  // ── EPIC / WHITE BORDER SCREENSHOTS (weight 0.35) ────────────────────────
  { id: "epic-adrian-clamptown",    name: "Adrian Clamptown",       image: `${CARD_BASE}/white/Adrian-Clamptown.jpg`,                 rarity: "epic", attribute: "Power", description: "Clamptown Moment",  weight: 0.35 },
  { id: "epic-barney-goal",         name: "Barney Goal",            image: `${CARD_BASE}/white/Barney-Goal.jpg`,                     rarity: "epic", attribute: "Power", description: "Iconic Strike",     weight: 0.35 },
  { id: "epic-div1-trophy",         name: "Div 1 Trophy",           image: `${CARD_BASE}/white/Div1-Trophy.jpg`,                     rarity: "epic", attribute: "Skill", description: "Champions",         weight: 0.35 },
  { id: "epic-div1-trophy-h",       name: "Div 1 Trophy (Wide)",    image: `${CARD_BASE}/white/Div1-Trophy-Horizontal.jpg`,          rarity: "epic", attribute: "Skill", description: "Champions",         weight: 0.35 },
  { id: "epic-joad-trial",          name: "Joad Trial",             image: `${CARD_BASE}/white/Joad-Trial.jpg`,                     rarity: "epic", attribute: "Pace",  description: "The Trial",         weight: 0.35 },
  { id: "epic-neymar-farewell",     name: "Neymar Farewell",        image: `${CARD_BASE}/white/Neymar-Farewell.jpg`,                 rarity: "epic", attribute: "Skill", description: "Farewell Match",   weight: 0.35 },
  { id: "epic-kid-neymar-farewell", name: "Kid Neymar Farewell",    image: `${CARD_BASE}/white/Kid-Neymar-Farewell.jpg`,             rarity: "epic", attribute: "Skill", description: "Farewell Special", weight: 0.35 },
  { id: "epic-kid-neymar-fare-h",   name: "Kid Neymar Fare. (Wide)",image: `${CARD_BASE}/white/Kid-Neymar-Farewell-Horizontal.jpg`,  rarity: "epic", attribute: "Skill", description: "Farewell Special", weight: 0.35 },
  { id: "epic-lil-neymar-fare-h",   name: "Lil Neymar Fare. (Wide)",image: `${CARD_BASE}/white/Lil-Neymar-Farewell-Horizontal.jpg`, rarity: "epic", attribute: "Skill", description: "Farewell Special", weight: 0.35 },
  { id: "epic-oscar-moty",          name: "Oscar MOTY",             image: `${CARD_BASE}/white/Oscar-MOTY.jpg`,                     rarity: "epic", attribute: "Pace",  description: "Man of the Year",  weight: 0.35 },
  { id: "epic-pedro-returns",       name: "Pedro Returns",          image: `${CARD_BASE}/white/Pedro-Returns.jpg`,                  rarity: "epic", attribute: "Pace",  description: "The Return",        weight: 0.35 },
  { id: "epic-ramin-bicycle",       name: "Ramin Bicycle",          image: `${CARD_BASE}/white/Ramin-Bicycle.jpg`,                  rarity: "epic", attribute: "Skill", description: "Bicycle Kick",     weight: 0.35 },
  { id: "epic-slip-slide",          name: "Slip & Slide",           image: `${CARD_BASE}/white/Slip-Slide.jpg`,                     rarity: "epic", attribute: "Skill", description: "Classic Moment",   weight: 0.35 },
  { id: "epic-uriel-ballon",        name: "Uriel Ballon d'Or",      image: `${CARD_BASE}/white/Uriel-Ballon-2.jpg`,                 rarity: "epic", attribute: "Power", description: "Award Winner",     weight: 0.35 },

  // ── LEGENDARY / GOLD BORDER SCREENSHOTS (weight 0.25) ────────────────────
  { id: "gold-adrian-clamptown",  name: "Adrian Clamptown",       image: `${CARD_BASE}/gold/Adrian-Clamptown-Gold.jpg`,        rarity: "legendary", attribute: "Power", description: "Gold Edition", weight: 0.25 },
  { id: "gold-barney-goal",       name: "Barney Goal",            image: `${CARD_BASE}/gold/Barney-Goal-Gold.jpg`,             rarity: "legendary", attribute: "Power", description: "Gold Edition", weight: 0.25 },
  { id: "gold-div1-trophy",       name: "Div 1 Trophy",           image: `${CARD_BASE}/gold/Div1-Trophy-Gold.jpg`,             rarity: "legendary", attribute: "Skill", description: "Gold Edition", weight: 0.25 },
  { id: "gold-div1-trophy-h",     name: "Div 1 Trophy (Wide)",    image: `${CARD_BASE}/gold/Div1-Trophy-Horizontal-Gold.jpg`,  rarity: "legendary", attribute: "Pace",  description: "Gold Edition", weight: 0.25 },
  { id: "gold-joad-trial",        name: "Joad Trial",             image: `${CARD_BASE}/gold/Joad-Trial-Gold.jpg`,              rarity: "legendary", attribute: "Pace",  description: "Gold Edition", weight: 0.25 },
  { id: "gold-neymar-farewell",   name: "Neymar Farewell",        image: `${CARD_BASE}/gold/Neymar-Farewell-Gold.jpg`,         rarity: "legendary", attribute: "Skill", description: "Gold Edition", weight: 0.25 },
  { id: "gold-neymar-farewell-h", name: "Neymar Farewell (Wide)", image: `${CARD_BASE}/gold/Neymar-Farewell-Horizontal-Gold.jpg`, rarity: "legendary", attribute: "Skill", description: "Gold Edition", weight: 0.25 },
  { id: "gold-pedro-returns",     name: "Pedro Returns",          image: `${CARD_BASE}/gold/Pedro-Returns-Gold.jpg`,           rarity: "legendary", attribute: "Pace",  description: "Gold Edition", weight: 0.25 },
  { id: "gold-ramin-bicycle",     name: "Ramin Bicycle",          image: `${CARD_BASE}/gold/Ramin-Bicycle-Gold.jpg`,           rarity: "legendary", attribute: "Skill", description: "Gold Edition", weight: 0.25 },
  { id: "gold-slip-slide",        name: "Slip & Slide",           image: `${CARD_BASE}/gold/Slip-Slide-Gold.jpg`,              rarity: "legendary", attribute: "Skill", description: "Gold Edition", weight: 0.25 },
  { id: "gold-uriel-ballon",      name: "Uriel Ballon d'Or",      image: `${CARD_BASE}/gold/Uriel-Ballon-2-Gold.jpg`,          rarity: "legendary", attribute: "Power", description: "Gold Edition", weight: 0.25 },
];

export const CARDS_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// ── Weighted helpers ──────────────────────────────────────────────────────────

/** Pick a card from a pool using per-card weights (defaults to 1.0 each). */
function weightedPick<T extends { weight?: number }>(pool: T[]): T {
  const totalWeight = pool.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  let r = Math.random() * totalWeight;
  for (const card of pool) {
    r -= card.weight ?? 1;
    if (r <= 0) return card;
  }
  return pool[pool.length - 1];
}

const byRarity = (rarity: Rarity) => CARDS.filter((c) => c.rarity === rarity);

export const PACKS: Pack[] = [
  {
    id: "starter",
    name: "Starter Pack",
    description: "3 common kit cards to begin your collection",
    cost: 50,
    cardCount: 3,
    image: "/packs/starter.png",
    odds: { common: 100, rare: 0, epic: 0, legendary: 0 },
  },
  {
    id: "team",
    name: "Team Pack",
    description: "3 cards with a chance at rare specials",
    cost: 150,
    cardCount: 3,
    image: "/packs/team.png",
    odds: { common: 75, rare: 20, epic: 5, legendary: 0 },
  },
  {
    id: "legend",
    name: "Legend Pack",
    description: "5 cards — guaranteed epic or better in every pack",
    cost: 400,
    cardCount: 5,
    image: "/packs/legend.png",
    odds: { common: 50, rare: 25, epic: 20, legendary: 5 },
  },
];

export const DUPLICATE_REFUND: Record<Rarity, number> = {
  common: 10,
  rare: 35,
  epic: 100,
  legendary: 250,
};

export const POINTS_CONFIG = {
  subscribe: 500,
  earlyLike: 50,
  like: 10,
  earlyLikeWindowHours: 24,
  watchMinute: 2,
} as const;

function weightedRarity(odds: Pack["odds"]): Rarity {
  const roll = Math.random() * 100;
  if (roll < odds.legendary) return "legendary";
  if (roll < odds.legendary + odds.epic) return "epic";
  if (roll < odds.legendary + odds.epic + odds.rare) return "rare";
  return "common";
}

export function openPack(pack: Pack): Card[] {
  const results: Card[] = [];

  for (let i = 0; i < pack.cardCount; i++) {
    const rarity = weightedRarity(pack.odds);
    const pool = byRarity(rarity);
    results.push(weightedPick(pool));
  }

  // Legend pack guarantees at least one epic+
  if (pack.id === "legend") {
    const hasEpicOrBetter = results.some(
      (c) => c.rarity === "epic" || c.rarity === "legendary"
    );
    if (!hasEpicOrBetter) {
      results[results.length - 1] = weightedPick(byRarity("epic"));
    }
  }

  return results;
}

// DB card shape returned from Prisma
export interface DbCard {
  id: string;
  channelId?: string;
  legacyId?: string | null;
  name: string;
  kit: string | null;
  rarity: string;
  imageUrl: string;
  backImageUrl: string | null;
  attribute: string | null;
  description: string | null;
}

/** Infer draw weight from a DB card's kit field.
 *  Cards without a kit (screenshots) or with kit="Special" are weighted lower. */
function dbCardWeight(card: DbCard): number {
  if (!card.kit || card.kit === "Special" || card.kit === "Screenshot") return 0.35;
  return 1;
}

// Convert a DB card to the legacy Card shape used by UI components
export function dbCardToCard(dbCard: DbCard): Card {
  return {
    id: dbCard.id,
    name: dbCard.name,
    kit: dbCard.kit ?? undefined,
    image: dbCard.imageUrl,
    backImage: dbCard.backImageUrl ?? undefined,
    rarity: dbCard.rarity as Rarity,
    attribute: (dbCard.attribute ?? "Skill") as Attribute,
    description: dbCard.description ?? undefined,
  };
}

// Draw cards from a pool of DB cards (used when channelCards are loaded from DB)
export function openPackFromDb(pack: Pack, channelCards: DbCard[]): DbCard[] {
  const byRarityDb = (rarity: Rarity) => channelCards.filter((c) => c.rarity === rarity);
  const results: DbCard[] = [];

  for (let i = 0; i < pack.cardCount; i++) {
    const rarity = weightedRarity(pack.odds);
    const pool = byRarityDb(rarity);
    if (pool.length === 0) {
      const commons = byRarityDb("common");
      if (commons.length > 0) results.push(weightedPick(commons.map((c) => ({ ...c, weight: dbCardWeight(c) }))));
      continue;
    }
    results.push(weightedPick(pool.map((c) => ({ ...c, weight: dbCardWeight(c) }))));
  }

  // Legend pack guarantees at least one epic+
  if (pack.id === "legend") {
    const hasEpicOrBetter = results.some(
      (c) => c.rarity === "epic" || c.rarity === "legendary"
    );
    if (!hasEpicOrBetter) {
      const epics = byRarityDb("epic");
      if (epics.length > 0) {
        results[results.length - 1] = weightedPick(epics.map((c) => ({ ...c, weight: dbCardWeight(c) })));
      }
    }
  }

  return results;
}
