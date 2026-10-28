/**
 * The words in story mode: who says what, when. Each scene is a list of lines
 * shown one at a time (see `ui.ts`). `{name}`s are filled in from the career.
 */
import { division, MANAGER, nameOf, ROYALS, type Career, type Club, type DivId, type MatchReport, type News, type Settled } from "./career";

export interface Say {
  /** Speaker: a player key ("oscar"), a club id (their captain), or a voice below. */
  who: string;
  text: string;
}

/** Voices that aren't players or captains. */
export const REX = "rex";
export const NARRATOR = "narrator";
export const GAZETTE = "gazette";

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const O = (text: string): Say => ({ who: MANAGER, text });
const N = (text: string): Say => ({ who: NARRATOR, text });

export function intro(): Say[] {
  return [
    N("Every Sunday the city's best play 3v3 in the Cage League. Four divisions. One trophy: the Golden Cage."),
    N("Five Guys FC aren't in it. Not yet."),
    O("Right. I've done the forms, I've got a ball, I've got a kit. I'm the gaffer now. Player-manager, actually."),
    O("We start at the bottom: Division 4, the car park. Five games a season, each one harder. Top two go up."),
    { who: REX, text: "Heard you've started a team, Oscar. Cute. My Royals have won the Golden Cage three years running. Stay in your car park." },
    O("Rex Hollins. Biggest wallet in the league, and doesn't he know it. One day, Rex."),
    O("First things first: I need four players. Nobody's a superstar yet. We all start from the same place."),
  ];
}

export function welcome(picks: string[]): Say[] {
  const [a, b, c, d] = picks.map(nameOf);
  return [
    O(`${a}, ${b}, ${c}, ${d}. Plus me. That's a team. Sort of.`),
    { who: picks[0], text: pick(["Gaffer. We're not losing to a kebab van. Promise.", "Car park football. Love it. Where do we get changed?", "Let's go then. Who've we got first?"]) },
    N("Goals, assists, tackles, wins and clean sheets earn XP, and every level makes a player better. Who you play is who grows."),
    N("Legs get heavy as a match goes on. Sprint less, or bring someone fresh on: tap SUBS any time. Rolling subs, as many as you like."),
  ];
}

const DIV_INTRO: Record<DivId, { first: string; rival: string }> = {
  4: {
    first: "Division 4: the car park. Chalk lines on tarmac, a goal with a hole in the net, and a man selling teas from his boot.",
    rival: "Wolves",
  },
  3: {
    first: "Division 3: the Arches. Under the railway, trains thundering overhead, and every touch echoes.",
    rival: "Kings",
  },
  2: {
    first: "Division 2: the Rooftop. Floodlights, a proper crowd, and scouts in the stands.",
    rival: "Vipers",
  },
  1: {
    first: "Division 1: the Golden Cage. The big one. Everyone in the city's watching.",
    rival: "Royals",
  },
};

export function divisionIntro(c: Career, n: Extract<News, { kind: "division" }>): Say[] {
  const d = division(n.div);
  const rival = d.clubs.find((cl) => cl.rival)!;
  const out: Say[] = [N(`Season ${n.season}. ${DIV_INTRO[n.div].first}`)];
  const last = c.history[c.history.length - 1];
  const holders = n.div === 1 && last?.div === 1 && last.pos === 1;
  if (holders) {
    out.push(O(pick(["Defending champions. Everyone wants a piece of us now. Good.", "We're the ones to beat now. Let's act like it."])));
    out.push({ who: REX, text: "Enjoy the trophy while you've got it, Oscar. The Royals want it back." });
    return out;
  }
  if (n.back) out.push(O(pick(["Same league, another go. We're better than last time. Much better.", "Round two. Nobody's laughing at us this time.", "We've been here before. This time we finish the job."])));
  else if (n.div === 4) out.push(O("Five games. The last one's the Grime Street Wolves, top of the pile down here. Let's work up to them."));
  else out.push(O(`New division, new faces. Last game of the season is ${rival.name}. Everyone says they're the ones to beat.`));
  if (n.div === 1) {
    out.push({ who: REX, text: n.back ? "Back again, Oscar? The Golden Cage looks lovely in my trophy cabinet." : "Welcome to the top table, Oscar. Enjoy the view. It won't last." });
    if (c.stolen) out.push(O(`${nameOf(c.stolen.key)}'s in the Royals' starting three. Beat them and he's coming home.`));
  } else if (n.season > 1 && !c.stealDone) {
    out.push({ who: REX, text: pick(["Still going, Oscar? Your lot are starting to look half decent. I've noticed.", "Keep it up, Oscar. I always shop for players in the lower leagues."]) });
  }
  return out;
}

/** Before kick-off. */
export function preMatch(c: Career, club: Club): Say[] {
  const out: Say[] = [];
  const round = c.round + 1;
  if (club.rival) {
    out.push(N(`Game ${round} of 5: the big one. ${club.name}.`));
    const beaten = club.id === ROYALS && c.titles > 0;
    out.push({ who: club.id === ROYALS ? REX : club.id, text: beaten ? "You got lucky once, Oscar. Lightning doesn't strike twice." : club.blurb });
  } else {
    out.push(N(`Game ${round} of 5: ${club.name}. ${club.blurb}`));
  }
  if (c.nemeses.includes(club.id)) out.push({ who: club.id, text: pick(["Back for another hiding?", "Remember last time? 'Cause we do.", "Your lot again. Easy three points."]) });
  if (club.id === ROYALS && c.stolen) out.push({ who: c.stolen.key, text: "Gaffer. No hard feelings, yeah? I've still got to try and beat you." });
  const pos = c.round > 0 ? positionLine(c) : null;
  if (pos) out.push(O(pos));
  else if (!club.rival) out.push(O(pick(["Keep it simple. Pass, move, finish.", "Win your battles and the rest takes care of itself.", "Watch your legs. Use the bench."])));
  return out;
}

function positionLine(c: Career): string | null {
  const sorted = [...c.table].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
  const pos = sorted.findIndex((r) => r.id === "you") + 1;
  const left = 5 - c.round;
  if (left === 1) return pos <= 2 ? "Last game of the season. Win it and nobody can say we didn't earn it." : "Last game. Everything on it.";
  if (pos <= 2) return pick([`We're ${ord(pos)}. ${left} to go. Don't let it slip.`, `${ord(pos)} in the table. Stay hungry.`]);
  if (pos <= 4) return `${ord(pos)}. Top two go up. ${left === 1 ? "Last game. Everything on it." : "Plenty still to play for."}`;
  return pick([`${ord(pos)}. Not where we want to be. Let's fix it.`, "Bottom end of the table. Time to turn it round."]);
}

const ord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** What a rival says when they beat you. */
const RIVAL_GLOAT: Record<string, string> = {
  wolves: "Told you. We eat burger joints.",
  kings: "Long live the Kings. Back to your car park.",
  vipers: "That's academy football, Oscar. Look it up.",
  royals: "Know your place, Oscar.",
};

/** After the final whistle. */
export function postMatch(c: Career, club: Club, rep: MatchReport, s: Settled): Say[] {
  const out: Say[] = [];
  const won = rep.mine > rep.theirs, drew = rep.mine === rep.theirs;
  const margin = rep.mine - rep.theirs;
  const star = rep.motm ? nameOf(rep.motm) : null;
  const captain: Say["who"] = club.id === ROYALS ? REX : club.id;
  if (won && club.id === ROYALS) {
    out.push({ who: REX, text: pick(["…That wasn't supposed to happen.", "Enjoy it, Oscar. It's a fluke."]) });
  } else if (s.revenge) {
    out.push(O(pick([`REVENGE. ${club.captain}'s not saying much now.`, `That's for last time, ${club.captain}.`])));
  } else if (s.derby) {
    out.push(O(pick([`${club.captain}'s not saying much now, is he?`, `That one was for everyone who said the ${club.short.toLowerCase()} were too good for us.`])));
  } else if (won && margin >= 3) {
    out.push(O(pick([`That's a statement. ${star ? `${star} was unplayable.` : "Everyone was on it."}`, "Cage closed. What a performance."])));
  } else if (won) {
    out.push(O(pick(["Three points. Get in.", `Scrappy, but we'll take it.${star ? ` ${star}, take a bow.` : ""}`, "Job done. On to the next."])));
  } else if (drew) {
    out.push(O(pick(["A point's a point. We go again.", "Honours even. Should have had that."])));
  } else {
    out.push({ who: captain, text: RIVAL_GLOAT[club.id] ?? pick(["Easy. Tell your mates.", "Thanks for the three points, lads.", "Better luck next time, gaffer."]) });
    out.push(O(pick(["Heads up. We learn from that.", margin <= -3 ? "That hurt. Back to the drawing board." : "So close. Next time."])));
  }
  if (s.newNemesis) out.push(N(`${club.name} are your NEMESIS now. Beat them next time for a REVENGE bonus.`));
  if (s.home) {
    out.push({ who: s.home, text: "Gaffer… that was something else. Is there still a shirt for me?" });
    out.push(O(`There always was. Welcome home, ${nameOf(s.home)}.`));
  }
  const ups = s.gains.filter((g) => g.levels > 0);
  if (ups.length) {
    const top = ups.sort((a, b) => b.levels - a.levels)[0];
    out.push(N(ups.length === 1 ? `${nameOf(top.key)} levelled up: ${top.from} → ${top.to}.` : `${ups.length} players levelled up. ${nameOf(top.key)} is now ${top.to}.`));
  }
  return out;
}

/** A back-page headline for the result. */
export function headline(club: Club, rep: MatchReport): string {
  const us = "FIVE GUYS", them = club.short;
  const d = rep.mine - rep.theirs;
  const score = `${rep.mine}–${rep.theirs}`;
  if (d >= 4) return `${us} RUN RIOT: ${them} THRASHED ${score}`;
  if (d >= 1) return pick([`${us} SEE OFF ${them} ${score}`, `${them} BEATEN ${score} AS ${us} ROLL ON`]);
  if (d === 0) return `ALL SQUARE: ${us} ${score} ${them}`;
  if (d <= -4) return `NIGHTMARE: ${them} HUMBLE ${us} ${rep.theirs}–${rep.mine}`;
  return `${them} EDGE ${us} ${rep.theirs}–${rep.mine}`;
}

export function seasonEnd(c: Career, n: Extract<News, { kind: "season" }>): Say[] {
  const d = division(n.div);
  switch (n.outcome) {
    case "champions": return [
      { who: GAZETTE, text: `FIVE GUYS FC ARE ${d.name.toUpperCase()} CHAMPIONS` },
      O(`Champions! ${n.div === 4 ? "Out of the car park at last." : "Top of the pile."} Next stop: ${division(n.next).name}.`),
    ];
    case "promoted": return [
      { who: GAZETTE, text: `SECOND PLACE IS ENOUGH: FIVE GUYS PROMOTED` },
      O(`${ord(n.pos)}, and that's enough. We're going up to ${division(n.next).name}!`),
    ];
    case "stayed": return [
      { who: GAZETTE, text: `FIVE GUYS FINISH ${ord(n.pos).toUpperCase()} IN ${d.name.toUpperCase()}` },
      O(`${ord(n.pos)}. Top two go up and we weren't top two. Same league next season, and we'll be better for it.`),
    ];
    case "relegated": return [
      { who: GAZETTE, text: `BOTTOM: FIVE GUYS GO DOWN` },
      O("Bottom. Down we go. Proper low point, this. We come back stronger."),
    ];
    case "runnersUp": return [
      { who: GAZETTE, text: `SO CLOSE: FIVE GUYS RUNNERS-UP` },
      O("Second. In the Golden Cage. A year ago we were playing round parked cars. Next season it's ours."),
    ];
    case "title": return []; // the finale says it
  }
}

export function stolen(key: string): Say[] {
  const name = nameOf(key);
  return [
    { who: GAZETTE, text: `BREAKING: ${name.toUpperCase()} SIGNS FOR HOLLINS ROYALS` },
    { who: REX, text: `${name} needed a real club, Oscar. A real kit. A real wage. Don't take it personally.` },
    { who: key, text: "Gaffer… I'm sorry. It was an offer I couldn't turn down." },
    O("We'll see you in the Golden Cage, Rex. And when we beat you, he's coming home."),
  ];
}

export function transferWindow(c: Career): Say[] {
  return [O(c.offers.length > 1
    ? `Word's getting round about us. ${c.offers.length} players want to sign, and I've got room for two.`
    : "One more player wants in. Let's have them.")];
}

export function signed(keys: string[]): Say[] {
  if (!keys.length) return [];
  const names = keys.map(nameOf);
  return [O(`${names.join(" and ")}: welcome to Five Guys FC. You'll start a bit behind the lads. Play well and you'll catch up.`)];
}

export function champions(c: Career): Say[] {
  const first = c.titles <= 1;
  return [
    N(first ? "From a car park in Division 4 to the Golden Cage." : `The Golden Cage. Again. That's ${c.titles}.`),
    { who: REX, text: first ? "…Fine. Well played, Oscar. Don't get used to it." : "Enjoy it while it lasts, Oscar." },
    O(first ? "Five Guys FC: champions of the Cage League. Told you, Rex." : "Champions again. Same time next year?"),
    N(first ? "THE END. Or is it? Defend the title next season." : "Defend it again next season."),
  ];
}

/** Every scene waiting in the career's news, in order. */
export function newsScenes(c: Career): Say[] {
  const out: Say[] = [];
  for (const n of c.news) {
    switch (n.kind) {
      case "welcome": out.push(...welcome(n.picks)); break;
      case "season": out.push(...seasonEnd(c, n)); break;
      case "champions": out.push(...champions(c)); break;
      case "stolen": out.push(...stolen(n.key)); break;
      case "signed": out.push(...signed(n.keys)); break;
      case "division": out.push(...divisionIntro(c, n)); break;
      case "home": break; // said after the match
    }
  }
  return out;
}
