export type Tpl = (a: string, b: string) => string;

export const GOAL_GENERIC: Tpl[] = [
  (sc, as) => `${as} plays it through to ${sc}, who slots it home!`,
  (sc, as) => `${sc} latches onto a clever ball from ${as} and fires in!`,
  (sc, as) => `Brilliant finish! ${as}'s pass was perfectly weighted for ${sc}!`,
  (sc, as) => `${sc} receives from ${as} and buries it in the bottom corner!`,
  (sc, as) => `GOAL! ${sc} doesn't miss from there! ${as} gets the assist!`,
  (sc, as) => `${sc} tucks it away beautifully after a lay-off by ${as}!`,
  (sc, as) => `${as} finds ${sc} in the box and he finishes it off!`,
];

export const GOAL_PACE: Tpl[] = [
  (sc, as) => `COUNTER! ${sc} bursts through with electric pace and slots it past the keeper — ${as} started the move!`,
  (sc, as) => `${sc} leaves the defence for dead on the break! ${as} released him and he finishes clinically!`,
  (sc, as) => `Blistering pace from ${sc}! ${as} picks him out in behind and it's a goal!`,
];

export const GOAL_SKILL: Tpl[] = [
  (sc, as) => `Silky skill from ${sc} — beats his man and curls it into the corner! ${as} linked it up beautifully!`,
  (sc, as) => `Incredible dribble from ${sc}! Past one, past two, into the net! ${as} started the move!`,
  (sc, as) => `${sc} does the stepovers, creates the space, and finds the net! Great work from ${as}!`,
  (sc, as) => `${as} plays a clever through ball, ${sc} takes one touch and arrows it in!`,
];

export const GOAL_POWER: Tpl[] = [
  (sc, as) => `${sc} rises highest from ${as}'s cross and powers the header into the net!`,
  (sc, as) => `THUNDERBOLT! ${sc} hits it with sheer power from distance — ${as} can't believe it went in!`,
  (sc, as) => `${sc} muscles past the defender and smashes it home! ${as} gets the assist!`,
  (sc, as) => `${as} floats it in, ${sc} attacks the ball and buries the header!`,
];

export const SAVE_TEMPLATES: Tpl[] = [
  (gk, sh) => `Brilliant save by ${gk}! ${sh}'s shot was heading for the top corner!`,
  (gk, sh) => `${gk} dives to his right and pushes away ${sh}'s powerful effort!`,
  (gk, sh) => `What a stop from ${gk}! He denies ${sh} with an outstretched hand!`,
  (gk, sh) => `${sh} thought he'd scored but ${gk} pulls off a world-class save!`,
  (gk, sh) => `Point-blank chance for ${sh} but ${gk} stands tall — remarkable reaction!`,
];

export const MISS_TEMPLATES: Tpl[] = [
  (sh, cr) => `${sh} blazes it over the bar! ${cr} put him clean through — chance wasted!`,
  (sh, cr) => `${sh} pulls it just wide of the far post — agonising! ${cr} made the chance!`,
  (sh, cr) => `One on one after ${cr}'s pass but ${sh} can't convert!`,
  (sh, cr) => `${sh} sidefoots it the wrong side of the post. ${cr} won't be happy either!`,
];

export const NEARPOST_TEMPLATES: Tpl[] = [
  (sh, as) => `OFF THE POST! ${sh} was so close! ${as}'s cross was perfect but the woodwork intervenes!`,
  (sh, as) => `Off the bar from ${sh}! ${as} set it up beautifully — no goal!`,
];

export const TACKLE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} times the tackle perfectly and wins it cleanly from ${att}!`,
  (def, att) => `Crunching challenge from ${def} on ${att} — referee waves play on!`,
  (def, att) => `${def} reads ${att}'s run and cuts it out before it's dangerous!`,
  (def, att) => `${def} and ${att} go shoulder to shoulder — ${def} comes out on top!`,
];

export const CLEARANCE_TEMPLATES: Tpl[] = [
  (def, att) => `${def} gets there just in time to head it clear as ${att} closes in!`,
  (def, att) => `Last-ditch clearance from ${def}! ${att} was clean through!`,
  (def, att) => `${def} blocks ${att}'s effort on the line! Vital interception!`,
];

export const FREEKICK_TEMPLATES: Tpl[] = [
  (def, att) => `Free kick awarded! ${def} hauled back ${att} just outside the box — cynical foul!`,
  (def, att) => `Referee stops play! ${att} goes down under a heavy challenge from ${def}!`,
];

export const YELLOW_TEMPLATES: Tpl[] = [
  (def, att) => `Yellow card for ${def}! He pulled back ${att} — no choice for the referee!`,
  (def, att) => `${def} is booked! Reckless challenge on ${att} — lucky it wasn't red!`,
];

export const COUNTER_TEMPLATES: Tpl[] = [
  (pac, mid) => `COUNTER-ATTACK! ${pac} picks up the ball from ${mid} and flies forward at pace!`,
  (pac, mid) => `${mid} wins it back and immediately feeds ${pac} — lightning fast break!`,
  (pac, mid) => `Quick transition! ${mid} to ${pac} who's now racing towards goal with space!`,
];

export const POSSESSION_TEMPLATES: Tpl[] = [
  (m1, m2) => `${m1} plays a neat one-two with ${m2} — slick football in the middle!`,
  (m1, m2) => `${m1} switches it to ${m2} — keeping possession nicely!`,
  (m1, m2) => `Clever interplay between ${m1} and ${m2} in the middle of the park!`,
  (m1, m2) => `${m1} finds ${m2} in space — recycling possession well!`,
];

export const CORNER_TEMPLATES: Tpl[] = [
  (taker, tgt) => `Corner kick! ${taker} swings it into a crowded box looking for ${tgt}…`,
  (taker, tgt) => `${taker} stands over the corner and whips it toward ${tgt} at the near post…`,
  (taker, tgt) => `Corner to come — ${taker} delivers it deep for ${tgt}…`,
];

export const THROWIN_TEMPLATES: Tpl[] = [
  (taker, tgt) => `Throw-in taken quickly by ${taker}, finding ${tgt}.`,
  (taker, tgt) => `${taker} launches the throw down the line to ${tgt}.`,
  (taker, tgt) => `${taker} keeps it alive from the touchline, ${tgt} collects.`,
];

export const GOALKICK_TEMPLATES: Tpl[] = [
  (gk, _b) => `${gk} restarts play with the goal kick.`,
  (gk, _b) => `Goal kick. ${gk} sends it long downfield.`,
  (gk, _b) => `${gk} takes his time over the goal kick to settle things down.`,
];

export const REDCARD_TEMPLATES: Tpl[] = [
  (def, att) => `RED CARD! ${def} is sent off for a reckless lunge on ${att}!`,
  (def, att) => `${def} sees red — a dreadful challenge on ${att} leaves his team a man down!`,
];

export interface Commentary {
  pick: (pool: Tpl[], a: string, b: string) => string;
}

/** No-repeat picker bound to a seeded RNG. Mirrors the original closure in simulateMatch. */
export function createCommentary(rng: () => number): Commentary {
  const poolHistory = new Map<Tpl[], number[]>();
  function pick(pool: Tpl[], a: string, b: string): string {
    const used = poolHistory.get(pool) ?? [];
    const candidates = pool.map((_, i) => i).filter((i) => !used.includes(i));
    const from = candidates.length > 0 ? candidates : pool.map((_, i) => i);
    const idx = from[Math.floor(rng() * from.length)];
    const next = [...used, idx].slice(-(Math.max(2, Math.floor(pool.length * 0.6))));
    poolHistory.set(pool, next);
    return pool[idx](a, b);
  }
  return { pick };
}
