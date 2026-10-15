import { afterEach, describe, expect, it, vi } from "vitest";
import { isRoomCode, relayToken, relayUser, roomChannel, roomCodeOf } from "@/lib/street-online";

describe("room codes", () => {
  it("accepts 5 characters from the look-alike-free alphabet", () => {
    expect(isRoomCode("W8ETJ")).toBe(true);
    expect(isRoomCode("FY75F")).toBe(true);
  });

  it("rejects look-alikes, lower case and the wrong length", () => {
    for (const bad of ["W8ET", "W8ETJK", "W0ETJ", "WOETJ", "W1ETJ", "WIETJ", "WLETJ", "w8etj", "", 12345]) {
      expect(isRoomCode(bad)).toBe(false);
    }
  });

  it("round-trips the presence channel name", () => {
    expect(roomChannel("W8ETJ")).toBe("presence-street-W8ETJ");
    expect(roomCodeOf("presence-street-W8ETJ")).toBe("W8ETJ");
    expect(roomCodeOf("presence-lobby-W8ETJ")).toBeNull();
    expect(roomCodeOf("presence-street-nope")).toBeNull();
  });
});

describe("relay tokens", () => {
  afterEach(() => vi.useRealTimers());

  it("gives back the user it was issued to", () => {
    expect(relayUser(relayToken("user_123"))).toBe("user_123");
  });

  it("rejects a token for someone else, a bad signature, and junk", () => {
    const t = relayToken("user_123");
    const [, exp, sig] = t.split(".");
    expect(relayUser(`user_456.${exp}.${sig}`)).toBeNull();
    expect(relayUser(`${t}x`)).toBeNull();
    expect(relayUser("nonsense")).toBeNull();
    expect(relayUser(null)).toBeNull();
  });

  it("expires", () => {
    vi.useFakeTimers();
    const t = relayToken("user_123");
    vi.advanceTimersByTime(13 * 3600_000);
    expect(relayUser(t)).toBeNull();
  });
});
