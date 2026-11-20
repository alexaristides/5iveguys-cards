import { describe, expect, it } from "vitest";
import {
  PRINT_PACKS, bundleCoupon, deliveryPromise, formatPounds, isFirstEdition, itemsFromMeta, itemsToMeta, nextBundle, parseCart,
  priceFor, toMake,
} from "../print-shop";

describe("prices", () => {
  it("charges £9.99 a pack and £25 for every 3", () => {
    expect(priceFor(1).totalPence).toBe(999);
    expect(priceFor(2).totalPence).toBe(1998);
    expect(priceFor(3)).toEqual({ packs: 3, bundles: 1, subtotalPence: 2997, discountPence: 497, totalPence: 2500 });
    expect(priceFor(4).totalPence).toBe(3499);
    expect(priceFor(6).totalPence).toBe(5000);
    expect(priceFor(0).totalPence).toBe(0);
  });

  it("nudges towards the next 3", () => {
    expect(nextBundle(0)).toBeNull();
    expect(nextBundle(3)).toBeNull();
    expect(nextBundle(1)).toEqual({ more: 2, changePence: 1501 });
    expect(nextBundle(2)).toEqual({ more: 1, changePence: 502 });
    expect(nextBundle(4)).toEqual({ more: 2, changePence: 1501 });
  });

  it("formats pounds", () => {
    expect(formatPounds(2500)).toBe("£25");
    expect(formatPounds(999)).toBe("£9.99");
    expect(formatPounds(299)).toBe("£2.99");
  });

  it("names a coupon per number of bundles", () => {
    expect(bundleCoupon(1)).toEqual({ id: "PACKS-3FOR2500-AT999-X1", amountOffPence: 497, name: "3 packs for £25" });
    expect(bundleCoupon(2).amountOffPence).toBe(994);
    expect(bundleCoupon(2).name).toBe("3 packs for £25 (×2)");
  });
});

describe("baskets", () => {
  it("accepts packs on sale, merged and in shop order", () => {
    const r = parseCart({ zone: "uk", items: [{ packId: "Milo", qty: 2 }, { packId: "Squad", qty: 1 }, { packId: "Milo", qty: 1 }] });
    expect(r).toEqual({ ok: true, zone: "uk", items: [{ packId: "Squad", qty: 1 }, { packId: "Milo", qty: 3 }] });
  });

  it("refuses unknown packs, bad quantities, no zone and huge orders", () => {
    expect(parseCart({ zone: "uk", items: [{ packId: "Callum", qty: 1 }] }).ok).toBe(false);
    expect(parseCart({ zone: "uk", items: [{ packId: "Milo", qty: 0 }] }).ok).toBe(false);
    expect(parseCart({ zone: "uk", items: [{ packId: "Milo", qty: 1.5 }] }).ok).toBe(false);
    expect(parseCart({ zone: "mars", items: [{ packId: "Milo", qty: 1 }] }).ok).toBe(false);
    expect(parseCart({ zone: "uk", items: [] }).ok).toBe(false);
    expect(parseCart({ zone: "uk", items: [{ packId: "Milo", qty: 21 }] }).ok).toBe(false);
    const many = PRINT_PACKS.slice(0, 3).map((p) => ({ packId: p.id, qty: 14 }));
    expect(parseCart({ zone: "world", items: many }).ok).toBe(false);
  });

  it("round-trips through Stripe metadata, dropping anything unknown", () => {
    const items = [{ packId: "Squad", qty: 2 }, { packId: "SweetChilli", qty: 1 }];
    expect(itemsToMeta(items)).toBe("Squad:2,SweetChilli:1");
    expect(itemsFromMeta("Squad:2,SweetChilli:1,Nobody:3,Milo:x")).toEqual(items);
    expect(itemsFromMeta(undefined)).toEqual([]);
  });

  it("every pack has a picture name and the squad pack comes first", () => {
    expect(PRINT_PACKS[0].id).toBe("Squad");
    expect(PRINT_PACKS.filter((p) => p.kind === "player")).toHaveLength(16);
    expect(new Set(PRINT_PACKS.map((p) => p.id)).size).toBe(PRINT_PACKS.length);
  });
});

describe("dates and making", () => {
  it("is 1st Edition until midnight on 14 December", () => {
    expect(isFirstEdition(new Date("2026-12-13T23:59:59Z"))).toBe(true);
    expect(isFirstEdition(new Date("2026-12-14T00:00:00Z"))).toBe(false);
    expect(deliveryPromise(new Date("2026-11-20T12:00:00Z"))).toContain("by 20 December");
    expect(deliveryPromise(new Date("2026-12-15T12:00:00Z"))).toContain("next print run");
  });

  it("adds up what to make from paid orders only", () => {
    expect(
      toMake([
        { status: "paid", items: [{ packId: "Milo", qty: 2 }, { packId: "Squad", qty: 1 }] },
        { status: "paid", items: [{ packId: "Squad", qty: 3 }] },
        { status: "posted", items: [{ packId: "Theo", qty: 5 }] },
      ]),
    ).toEqual([
      { packId: "Squad", title: "Squad pack", qty: 4 },
      { packId: "Milo", title: "Milo pack", qty: 2 },
    ]);
  });
});
