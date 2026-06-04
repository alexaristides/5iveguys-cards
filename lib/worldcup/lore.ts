// Story-mode narration for World Cup: Oscar (Manager of the Year) mentors
// Ramin, the aspiring gaffer leading 5ive Guys FC to glory.

export const PROTAGONIST = "Ramin";
export const CLUB_NAME = "5ive Guys FC";

export const NARRATOR = {
  name: "Oscar",
  title: "Manager of the Year",
  imageUrl: "/cards/white/Oscar-MOTY.jpg", // legendary Moment card
};

export type LoreEvent =
  | "intro"
  | "groupDraw"
  | "win" | "draw" | "loss"
  | "qualified" | "groupOut"
  | "koWin" | "koOut"
  | "reachedFinal" | "champion" | "runnerUp";

export type LoreTone = "normal" | "triumph" | "defeat";

const QUOTES: Record<LoreEvent, string[]> = {
  intro: [
    `So. You're Ramin. Aspiring gaffer, big dreams, knees still working. I'm Oscar — best manager 5ive Guys FC ever had, not that anyone asked. Pick your XI, son. Let's see if you've got the bottle to take this lot to the world.`,
    `They told me a kid named Ramin wanted to manage 5ive Guys at a World Cup. I laughed. Then I remembered I started exactly the same way. Choose your team. I'll be watching every kick.`,
    `Listen close, Ramin. Trophies aren't won on the pitch — they're won in the team sheet, the night before, when nobody's watching. Set your side. Make me proud.`,
  ],
  groupDraw: [
    `Right, the draw's done. Three group games to prove you belong. No such thing as an easy group at a World Cup — only managers who find out the hard way.`,
    `That's your group, Ramin. Don't look at the badges, look at the spaces between them. That's where games are won.`,
    `Group stage. This is where pretenders get found out and gaffers get made. Three games. Make them count.`,
  ],
  win: [
    `A win's a win, Ramin. Pretty football butters no parsnips — the points do. Onto the next.`,
    `Job done. I've seen prettier, I've seen uglier. The table only remembers the result. Good lad.`,
    `That's three points in the bag. Don't get giddy. The group remembers your last game, not your last celebration.`,
  ],
  draw: [
    `A point's a point. Boring? Maybe. Useful? Every single time. Stack enough of them and they call it 'pragmatic'.`,
    `Honours even. Sometimes the bravest thing a manager does is not lose. Take the point, learn the lessons.`,
    `A draw. Not a defeat, not a party. Tighten up at the back and we'll talk about winning next time.`,
  ],
  loss: [
    `Chin up, son. I lost plenty — they just stopped printing those. The table doesn't lie, but it doesn't tell the whole story either. Go again.`,
    `That one stings. Good. If it didn't, you'd be in the wrong job. Use it. Don't carry it.`,
    `Defeat. Every great gaffer has a chapter they'd rewrite. Yours isn't finished yet, Ramin.`,
  ],
  qualified: [
    `Out of the group! See — I knew there was a manager hiding in you. But qualifying's the starter, not the main. Now the real football begins.`,
    `Through to the knockouts. Savour it for one night, then forget it. From here, every game is the last one if you lose.`,
    `You're in the bracket, Ramin. 5ive Guys FC, on the world stage, in the knockouts. Don't you dare waste it.`,
  ],
  groupOut: [
    `Group stage exit. It's a cruel word, 'eliminated'. But I've built champions out of men who heard it first. Go again — the story's not done.`,
    `Out at the groups. Sit with it tonight. Tomorrow, we plan. Every dynasty I built started with a year exactly this painful.`,
    `Not this time, son. The World Cup keeps its door shut to most. Next tournament, you knock harder.`,
  ],
  koWin: [
    `Knockout football — win or fly home — and you're still here. That's not luck, Ramin. That's bottle.`,
    `Survived and advanced. The crowd remembers the goals; I remember the nerve it took. Onwards.`,
    `Through to the next round. Each one gets heavier now. Good. Heavy is where legends are forged.`,
  ],
  koOut: [
    `So close you could taste the metal. Knockouts are merciless — that's what makes them sacred. Learn it, don't let it haunt you.`,
    `Out on the big stage. It'll keep you up tonight. Let it. Then come back hungrier than the lot of them.`,
    `One game from more, and it slipped. I've stood exactly where you're standing, Ramin. You come back from this. You will.`,
  ],
  reachedFinal: [
    `The FINAL. Ramin... do you know how few managers ever say that word about their own team? One game. One. Leave nothing out there.`,
    `5ive Guys FC in a World Cup final. I'd have given a knee for this. Tomorrow you don't manage a match — you manage history.`,
    `The last game. Everything you've learned, every lesson I've nagged into you — it all comes down to ninety minutes. Go and take it.`,
  ],
  champion: [
    `WORLD. CHAMPIONS. Ramin — I've waited a lifetime to hand this on, and you've gone and done it with 5ive Guys FC. Kings of the world. Couldn't have done it better myself... well. Maybe.`,
    `You did it, son. The trophy's ours. They'll talk about Oscar and Ramin in the same breath now — and I couldn't be prouder of the order they say it in.`,
    `Champions of the world. I taught you the team sheet; you taught the world a lesson. The 5ive Guys are immortal now. Enjoy it. You've earned every second.`,
  ],
  runnerUp: [
    `Runners-up at a World Cup. Don't you dare call that failure — most managers never sniff a final. But I know you wanted the gold. So did I. Next time, we finish the job.`,
    `One step from everything. Silver at a World Cup is a career for most men, Ramin. For you, it's a promise. Come back and turn it gold.`,
    `So near. A final's a final, and you got there — but I can see it in your eyes, you wanted more. Good. Hold onto that.`,
  ],
};

export function toneFor(event: LoreEvent): LoreTone {
  if (event === "champion" || event === "qualified" || event === "reachedFinal") return "triumph";
  if (event === "loss" || event === "groupOut" || event === "koOut") return "defeat";
  return "normal";
}

export function pickQuote(event: LoreEvent): string {
  const pool = QUOTES[event] ?? QUOTES.win;
  return pool[Math.floor(Math.random() * pool.length)];
}
