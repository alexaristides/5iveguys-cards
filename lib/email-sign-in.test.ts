import { describe, expect, it } from "vitest";
import { generateCode, hashCode, normalizeEmail, normalizeName, sendAllowed } from "./email-sign-in";
import { nameFromAppleUser } from "./apple-web";
import { safeCallbackPath } from "./web-session";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => expect(normalizeEmail("  Alex.Smith+5g@Gmail.COM ")).toBe("alex.smith+5g@gmail.com"));
  it("accepts subdomains", () => expect(normalizeEmail("a@mail.school.sch.uk")).toBe("a@mail.school.sch.uk"));
  it.each(["", "alex", "alex@", "@gmail.com", "alex@gmail", "a b@gmail.com", "alex@gmail..com", 42, null])("rejects %s", (raw) =>
    expect(normalizeEmail(raw)).toBeNull(),
  );
});

describe("normalizeName", () => {
  it("trims and single-spaces", () => expect(normalizeName("  Jamie   Lee ")).toBe("Jamie Lee"));
  it("rejects empty and too long", () => {
    expect(normalizeName("   ")).toBeNull();
    expect(normalizeName("x".repeat(41))).toBeNull();
    expect(normalizeName(undefined)).toBeNull();
  });
});

describe("codes", () => {
  it("are 6 digits", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("hash per address", () => {
    expect(hashCode("a@b.co", "123456")).toBe(hashCode("a@b.co", "123456"));
    expect(hashCode("a@b.co", "123456")).not.toBe(hashCode("c@b.co", "123456"));
    expect(hashCode("a@b.co", "123456")).not.toBe(hashCode("a@b.co", "123457"));
  });
});

describe("sendAllowed", () => {
  const t0 = Date.UTC(2026, 10, 27, 12);
  const prev = (sentAgoS: number, hourStartAgoS: number, hourSends: number) => ({
    sentAt: new Date(t0 - sentAgoS * 1000),
    hourStart: new Date(t0 - hourStartAgoS * 1000),
    hourSends,
  });

  it("allows the first code", () => expect(sendAllowed(null, t0)).toEqual({ ok: true, hourStart: new Date(t0), hourSends: 1 }));
  it("makes you wait 30 s between codes", () => expect(sendAllowed(prev(10, 10, 1), t0)).toEqual({ ok: false, retryAfterS: 20 }));
  it("counts codes within the hour", () =>
    expect(sendAllowed(prev(60, 600, 2), t0)).toEqual({ ok: true, hourStart: new Date(t0 - 600_000), hourSends: 3 }));
  it("stops at 5 an hour until the hour is up", () => expect(sendAllowed(prev(60, 3000, 5), t0)).toEqual({ ok: false, retryAfterS: 600 }));
  it("starts a new hour", () => expect(sendAllowed(prev(60, 3600, 5), t0)).toEqual({ ok: true, hourStart: new Date(t0), hourSends: 1 }));
});

describe("nameFromAppleUser", () => {
  it("joins first and last name", () =>
    expect(nameFromAppleUser(JSON.stringify({ name: { firstName: "Sam", lastName: "Ola" }, email: "x@privaterelay.appleid.com" }))).toBe("Sam Ola"));
  it("is null without a name", () => {
    expect(nameFromAppleUser(null)).toBeNull();
    expect(nameFromAppleUser("{}")).toBeNull();
    expect(nameFromAppleUser("not json")).toBeNull();
  });
});

describe("safeCallbackPath", () => {
  it("keeps same-site paths", () => expect(safeCallbackPath("/leagues?x=1")).toBe("/leagues?x=1"));
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "leagues", undefined])("falls back for %s", (raw) =>
    expect(safeCallbackPath(raw)).toBe("/fantasy"),
  );
});
