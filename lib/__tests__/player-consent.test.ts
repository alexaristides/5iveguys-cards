import { describe, expect, it } from "vitest";
import {
  CONSENT_STATEMENTS, CONSENT_VERSION, clubEmail, formatSortCode, parseConsent, sameName, validIban,
} from "../player-consent";

const allTicked = Object.fromEntries(CONSENT_STATEMENTS.map(({ key }) => [key, true]));
const form = (over: Record<string, unknown> = {}) => ({
  channelSlug: "5iveguysfc",
  teamName: "5ive Guys",
  playerName: "Milo",
  fullName: "Milo  Test",
  over18: true,
  email: " Milo@Example.com ",
  phone: "07700 900123",
  address: "1 Test Street, London, E1 1AA",
  accountHolder: "Milo Test",
  bankCountry: "uk",
  sortCode: "12-34-56",
  accountNumber: "12345678",
  consents: allTicked,
  signature: "milo test",
  ...over,
});
const record = { reference: "ABCD1234", signedAt: new Date("2026-11-20T12:00:00Z"), ip: "1.2.3.4", userAgent: "Safari" };

describe("parseConsent", () => {
  it("accepts a complete form and tidies it", () => {
    const r = parseConsent(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fullName).toBe("Milo Test");
    expect(r.value.email).toBe("milo@example.com");
    expect(r.value.sortCode).toBe("12-34-56");
    expect(r.value.accountNumber).toBe("12345678");
    expect(r.value.guardianName).toBeUndefined();
  });

  it("needs every box ticked", () => {
    const r = parseConsent(form({ consents: { ...allTicked, tax: false } }));
    expect(r).toEqual({ ok: false, error: "Tick every box to give your permission." });
  });

  it("ignores consents that aren't true booleans", () => {
    expect(parseConsent(form({ consents: { ...allTicked, image: "yes" } })).ok).toBe(false);
  });

  it("checks UK bank details", () => {
    expect(parseConsent(form({ sortCode: "12345" })).ok).toBe(false);
    expect(parseConsent(form({ accountNumber: "1234567" })).ok).toBe(false);
  });

  it("checks an IBAN abroad", () => {
    const abroad = { bankCountry: "abroad", sortCode: "", accountNumber: "", bic: "DEUTDEFF" };
    const ok = parseConsent(form({ ...abroad, iban: "de89 3704 0044 0532 0130 00" }));
    expect(ok.ok && ok.value.iban).toBe("DE89 3704 0044 0532 0130 00");
    expect(parseConsent(form({ ...abroad, iban: "DE89370400440532013001" })).ok).toBe(false);
  });

  it("must be signed with the signer's own name", () => {
    expect(parseConsent(form({ signature: "Someone Else" })).ok).toBe(false);
    expect(parseConsent(form({ signature: "MILO TEST." })).ok).toBe(true);
  });

  it("has a parent or guardian sign for under-18s", () => {
    expect(parseConsent(form({ over18: false })).ok).toBe(false);
    const r = parseConsent(form({ over18: false, guardianName: "Pat Test", guardianRelationship: "Mum", signature: "Pat Test" }));
    expect(r.ok && r.value.guardianName).toBe("Pat Test");
    expect(parseConsent(form({ over18: false, guardianName: "Pat Test", signature: "Milo Test" })).ok).toBe(false);
  });

  it("wants a full name, an email, a phone and an address", () => {
    expect(parseConsent(form({ fullName: "Milo", signature: "Milo" })).ok).toBe(false);
    expect(parseConsent(form({ email: "milo" })).ok).toBe(false);
    expect(parseConsent(form({ phone: "123" })).ok).toBe(false);
    expect(parseConsent(form({ address: "" })).ok).toBe(false);
    expect(parseConsent(null).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("formats sort codes as they're typed", () => {
    expect(formatSortCode("1")).toBe("1");
    expect(formatSortCode("123")).toBe("12-3");
    expect(formatSortCode("12-34-567")).toBe("12-34-56");
  });

  it("validates IBANs with the mod-97 check", () => {
    expect(validIban("GB82WEST12345698765432")).toBe(true);
    expect(validIban("GB82WEST12345698765433")).toBe(false);
  });

  it("compares names loosely", () => {
    expect(sameName("Jo O'Neil", "jo oneil")).toBe(true);
    expect(sameName("", "")).toBe(false);
  });
});

describe("emails", () => {
  const r = parseConsent(form());
  if (!r.ok) throw new Error(r.error);

  it("gives the club everything, bank details included", () => {
    const e = clubEmail(r.value, record);
    expect(e.subject).toBe("Player consent signed: Milo (5ive Guys), Milo Test");
    expect(e.text).toContain("Sort code: 12-34-56");
    expect(e.text).toContain("Account number: 12345678");
    expect(e.text).toContain("IP address: 1.2.3.4");
    expect(e.text).toContain(CONSENT_VERSION);
    for (const { text } of CONSENT_STATEMENTS) expect(e.text).toContain(`✔ ${text}`);
  });

  it("escapes what the player typed", () => {
    const x = parseConsent(form({ address: "<script>alert(1)</script> Road" }));
    if (!x.ok) throw new Error(x.error);
    expect(clubEmail(x.value, record).html).toContain("&lt;script&gt;");
  });
});
