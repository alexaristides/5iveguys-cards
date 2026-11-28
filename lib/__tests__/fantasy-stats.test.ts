import { describe, expect, it } from "vitest";
import { boardRows, formatStat, STAT_BOARDS, STAT_GROUPS, statBoards, type StatsPlayer } from "../fantasy-stats";

const player = (name: string, s: Partial<StatsPlayer> = {}): StatsPlayer => ({
  id: name.toLowerCase(), name, position: "MID", imageUrl: null, isActive: true,
  points: 0, appearances: 0, goals: 0, assists: 0, cleanSheets: 0, saves: 0, bonus: 0, yellowCards: 0, redCards: 0,
  motmWins: 0, selectedBy: 0, captainedBy: 0, transfersIn: 0, transfersOut: 0,
  ...s,
});
const board = (id: string) => STAT_BOARDS.find((b) => b.id === id)!;
const names = (rows: ReturnType<typeof boardRows>) => rows.map((r) => `${r.rank}.${r.player.name}`);

describe("stat boards", () => {
  it("lists the top five, most first, with tied players sharing a rank", () => {
    const players = [
      player("Ann", { goals: 3, appearances: 3 }), player("Bea", { goals: 5, appearances: 3 }), player("Cat", { goals: 3, appearances: 3 }),
      player("Dee", { goals: 1, appearances: 3 }), player("Eve", { goals: 2, appearances: 3 }), player("Fay", { goals: 1, appearances: 3 }),
    ];
    expect(names(boardRows(players, board("goals")))).toEqual(["1.Bea", "2.Ann", "2.Cat", "4.Eve", "5.Dee"]);
  });

  it("breaks ties by fewer games on a 'most' board and more games on a 'fewest' board", () => {
    const players = [player("Ann", { points: 10, appearances: 4 }), player("Bob", { points: 10, appearances: 2 })];
    expect(names(boardRows(players, board("points")))).toEqual(["1.Bob", "1.Ann"]);
    expect(names(boardRows(players, board("fewest")))).toEqual(["1.Ann", "1.Bob"]);
  });

  it("leaves out players on zero, players who've left and (for points) players who haven't played", () => {
    const players = [
      player("Ann", { goals: 2, appearances: 2, points: 9 }), player("Bob", { appearances: 1, points: -1 }),
      player("Cal", { goals: 4, isActive: false, appearances: 3 }), player("Dan"),
    ];
    expect(names(boardRows(players, board("goals")))).toEqual(["1.Ann"]);
    expect(names(boardRows(players, board("fewest")))).toEqual(["1.Bob", "2.Ann"]);
    expect(names(boardRows(players, board("points")))).toEqual(["1.Ann", "2.Bob"]);
  });

  it("hides boards nobody is on, so a new season shows none", () => {
    expect(statBoards([player("Ann"), player("Bob")])).toEqual([]);
    const picked = statBoards([player("Ann", { selectedBy: 50, transfersOut: 1 })]).map((b) => b.board.id);
    expect(picked).toEqual(["picked", "out"]);
  });

  it("shows shares as percentages and counts as numbers", () => {
    expect(formatStat(board("picked"), 42)).toBe("42%");
    expect(formatStat(board("in"), 3)).toBe("3");
  });

  it("puts every board in a section", () => {
    const groups = new Set<string>(STAT_GROUPS.map((g) => g.id));
    expect(STAT_BOARDS.every((b) => groups.has(b.group))).toBe(true);
  });
});
