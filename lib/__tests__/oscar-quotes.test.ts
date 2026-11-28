import { describe, expect, it } from "vitest";
import { OSCAR_QUOTES, quoteOfTheDay } from "../oscar-quotes";

describe("Oscar's quote of the day", () => {
  const day = 86_400_000;
  const noon = Date.UTC(2026, 10, 28, 12);

  it("is the same all day and changes the next day", () => {
    expect(quoteOfTheDay(noon - 11 * 3_600_000)).toBe(quoteOfTheDay(noon + 11 * 3_600_000));
    expect(quoteOfTheDay(noon + day)).not.toBe(quoteOfTheDay(noon));
  });

  it("steps through every quote with the offset and wraps round", () => {
    const seen = new Set(OSCAR_QUOTES.map((_, i) => quoteOfTheDay(noon, i)));
    expect(seen.size).toBe(OSCAR_QUOTES.length);
    expect(quoteOfTheDay(noon, OSCAR_QUOTES.length)).toBe(quoteOfTheDay(noon));
  });
});
