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
  // --- HOME KIT (common) ---
  { id: "home-adrian",      name: "Adrian",      player: "Adrian",      kit: "Home Kit", image: `${CARD_BASE}/home/Adrian_Home.jpg`,      rarity: "common",    attribute: "Power" },
  { id: "home-barney",      name: "Barney",      player: "Barney",      kit: "Home Kit", image: `${CARD_BASE}/home/Barney_Home.jpg`,      rarity: "common",    attribute: "Power" },
  { id: "home-gravz",       name: "Gravz",       player: "Gravz",       kit: "Home Kit", image: `${CARD_BASE}/home/Gravz_Home.jpg`,       rarity: "common",    attribute: "Pace"  },
  { id: "home-jack",        name: "Jack",        player: "Jack",        kit: "Home Kit", image: `${CARD_BASE}/home/Jack_Home.jpg`,        rarity: "common",    attribute: "Skill" },
  { id: "home-joad",        name: "Joad",        player: "Joad",        kit: "Home Kit", image: `${CARD_BASE}/home/Joad_Home.jpg`,        rarity: "common",    attribute: "Pace"  },
  { id: "home-lats",        name: "Lats",        player: "Lats",        kit: "Home Kit", image: `${CARD_BASE}/home/Lats_Home.jpg`,        rarity: "common",    attribute: "Power" },
  { id: "home-louis",       name: "Louis",       player: "Louis",       kit: "Home Kit", image: `${CARD_BASE}/home/Louis_Home.jpg`,       rarity: "common",    attribute: "Skill" },
  { id: "home-milo",        name: "Milo",        player: "Milo",        kit: "Home Kit", image: `${CARD_BASE}/home/Milo_Home.jpg`,        rarity: "common",    attribute: "Pace"  },
  { id: "home-neymar",      name: "Neymar",      player: "Neymar",      kit: "Home Kit", image: `${CARD_BASE}/home/Neymar_Home.jpg`,      rarity: "common",    attribute: "Skill" },
  { id: "home-oscar",       name: "Oscar",       player: "Oscar",       kit: "Home Kit", image: `${CARD_BASE}/home/Oscar_Home.jpg`,       rarity: "common",    attribute: "Pace"  },
  { id: "home-raptis",      name: "Raptis",      player: "Raptis",      kit: "Home Kit", image: `${CARD_BASE}/home/Raptis_Home.jpg`,      rarity: "common",    attribute: "Power" },
  { id: "home-ryan",        name: "Ryan",        player: "Ryan",        kit: "Home Kit", image: `${CARD_BASE}/home/Ryan_Home.jpg`,        rarity: "common",    attribute: "Power" },
  { id: "home-stan",        name: "Stan",        player: "Stan",        kit: "Home Kit", image: `${CARD_BASE}/home/Stan_Home.jpg`,        rarity: "common",    attribute: "Skill" },
  { id: "home-sweetchilli", name: "SweetChilli", player: "SweetChilli", kit: "Home Kit", image: `${CARD_BASE}/home/SweetChilli_Home.jpg`, rarity: "common",    attribute: "Pace"  },
  { id: "home-theo",        name: "Theo",        player: "Theo",        kit: "Home Kit", image: `${CARD_BASE}/home/Theo_Home.jpg`,        rarity: "common",    attribute: "Skill" },
  { id: "home-uriel",       name: "Uriel",       player: "Uriel",       kit: "Home Kit", image: `${CARD_BASE}/home/Uriel_Home.jpg`,       rarity: "common",    attribute: "Power" },

  // --- BLACK KIT (common) ---
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

  // --- CAMO KIT (common) ---
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

  // --- RARE / SPECIAL ---
  { id: "special-louis-ballon-dor", name: "Louis Ballon d'Or", player: "Louis",  kit: "Special", image: `${CARD_BASE}/special/Louis_Ballon_Dor.jpg`, rarity: "rare", attribute: "Skill", description: "The Golden Ball" },
  { id: "special-neymar-brazil",    name: "Neymar Brazil",     player: "Neymar", kit: "Special", image: `${CARD_BASE}/special/Neymar_Brazil.jpg`, backImage: `${CARD_BASE}/special/Neymar_Brazil_Back.jpg`, rarity: "rare", attribute: "Skill", description: "International Edition" },
  { id: "special-raptis-usa",       name: "Raptis USA",        player: "Raptis", kit: "Special", image: `${CARD_BASE}/special/Raptis_USA.jpg`,    backImage: `${CARD_BASE}/special/Raptis_USA_Back.jpg`,    rarity: "rare", attribute: "Power", description: "International Edition" },

  // --- EPIC / WHITE BORDER ---
  { id: "epic-adrian-clamptown", name: "Adrian Clamptown",    image: `${CARD_BASE}/white/Adrian-Clamptown.jpg`,          rarity: "epic", attribute: "Power", description: "Clamptown Moment" },
  { id: "epic-barney-goal",      name: "Barney Goal",         image: `${CARD_BASE}/white/Barney-Goal.jpg`,               rarity: "epic", attribute: "Power", description: "Iconic Strike" },
  { id: "epic-div1-trophy",      name: "Div 1 Trophy",        image: `${CARD_BASE}/white/Div1-Trophy.jpg`,               rarity: "epic", attribute: "Skill", description: "Champions" },
  { id: "epic-div1-trophy-h",    name: "Div 1 Trophy (Wide)", image: `${CARD_BASE}/white/Div1-Trophy-Horizontal.jpg`,    rarity: "epic", attribute: "Skill", description: "Champions" },
  { id: "epic-joad-trial",       name: "Joad Trial",          image: `${CARD_BASE}/white/Joad-Trial.jpg`,                rarity: "epic", attribute: "Pace",  description: "The Trial" },
  { id: "epic-neymar-farewell",  name: "Neymar Farewell",     image: `${CARD_BASE}/white/Neymar-Farewell.jpg`,           rarity: "epic", attribute: "Skill", description: "Farewell Match" },
  { id: "epic-oscar-moty",       name: "Oscar MOTY",          image: `${CARD_BASE}/white/Oscar-MOTY.jpg`,                rarity: "epic", attribute: "Pace",  description: "Man of the Year" },
  { id: "epic-pedro-returns",    name: "Pedro Returns",       image: `${CARD_BASE}/white/Pedro-Returns.jpg`,             rarity: "epic", attribute: "Pace",  description: "The Return" },
  { id: "epic-ramin-bicycle",    name: "Ramin Bicycle",       image: `${CARD_BASE}/white/Ramin-Bicycle.jpg`,             rarity: "epic", attribute: "Skill", description: "Bicycle Kick" },
  { id: "epic-slip-slide",       name: "Slip & Slide",        image: `${CARD_BASE}/white/Slip-Slide.jpg`,                rarity: "epic", attribute: "Skill", description: "Classic Moment" },
  { id: "epic-uriel-ballon",     name: "Uriel Ballon d'Or",   image: `${CARD_BASE}/white/Uriel-Ballon-2.jpg`,            rarity: "epic", attribute: "Power", description: "Award Winner" },

  // --- LEGENDARY / GOLD BORDER ---
  { id: "gold-adrian-clamptown", name: "Adrian Clamptown",    image: `${CARD_BASE}/gold/Adrian-Clamptown-Gold.jpg`,       rarity: "legendary", attribute: "Power", description: "Gold Edition" },
  { id: "gold-barney-goal",      name: "Barney Goal",         image: `${CARD_BASE}/gold/Barney-Goal-Gold.jpg`,            rarity: "legendary", attribute: "Power", description: "Gold Edition" },
  { id: "gold-div1-trophy",      name: "Div 1 Trophy",        image: `${CARD_BASE}/gold/Div1-Trophy-Gold.jpg`,            rarity: "legendary", attribute: "Skill", description: "Gold Edition" },
  { id: "gold-div1-trophy-h",    name: "Div 1 Trophy (Wide)", image: `${CARD_BASE}/gold/Div1-Trophy-Horizontal-Gold.jpg`, rarity: "legendary", attribute: "Pace",  description: "Gold Edition" },
  { id: "gold-joad-trial",       name: "Joad Trial",          image: `${CARD_BASE}/gold/Joad-Trial-Gold.jpg`,             rarity: "legendary", attribute: "Pace",  description: "Gold Edition" },
  { id: "gold-neymar-farewell",  name: "Neymar Farewell",     image: `${CARD_BASE}/gold/Neymar-Farewell-Gold.jpg`,        rarity: "legendary", attribute: "Pace",  description: "Gold Edition" },
  { id: "gold-pedro-returns",    name: "Pedro Returns",       image: `${CARD_BASE}/gold/Pedro-Returns-Gold.jpg`,          rarity: "legendary", attribute: "Pace",  description: "Gold Edition" },
  { id: "gold-ramin-bicycle",    name: "Ramin Bicycle",       image: `${CARD_BASE}/gold/Ramin-Bicycle-Gold.jpg`,          rarity: "legendary", attribute: "Skill", description: "Gold Edition" },
  { id: "gold-slip-slide",       name: "Slip & Slide",        image: `${CARD_BASE}/gold/Slip-Slide-Gold.jpg`,             rarity: "legendary", attribute: "Skill", description: "Gold Edition" },
  { id: "gold-uriel-ballon",     name: "Uriel Ballon d'Or",   image: `${CARD_BASE}/gold/Uriel-Ballon-2-Gold.jpg`,         rarity: "legendary", attribute: "Power", description: "Gold Edition" },
];

export const CARDS_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

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
  watchMinute: 1,
} as const;

function weightedRandom(
  odds: Pack["odds"]
): Rarity {
  const roll = Math.random() * 100;
  if (roll < odds.legendary) return "legendary";
  if (roll < odds.legendary + odds.epic) return "epic";
  if (roll < odds.legendary + odds.epic + odds.rare) return "rare";
  return "common";
}

export function openPack(pack: Pack): Card[] {
  const results: Card[] = [];

  for (let i = 0; i < pack.cardCount; i++) {
    const rarity = weightedRandom(pack.odds);
    const pool = byRarity(rarity);
    const card = pool[Math.floor(Math.random() * pool.length)];
    results.push(card);
  }

  // Legend pack guarantees at least one epic+
  if (pack.id === "legend") {
    const hasEpicOrBetter = results.some(
      (c) => c.rarity === "epic" || c.rarity === "legendary"
    );
    if (!hasEpicOrBetter) {
      const epics = byRarity("epic");
      results[results.length - 1] = epics[Math.floor(Math.random() * epics.length)];
    }
  }

  return results;
}
