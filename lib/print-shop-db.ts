/**
 * The printed card shop against Stripe and the database: Checkout sessions, recording paid
 * orders (from the thanks page, the Stripe webhook and a cron sync, whichever comes first) and
 * telling the club about each new order. The rules are in lib/print-shop.ts.
 *
 * Needs STRIPE_SECRET_KEY. STRIPE_WEBHOOK_SECRET is optional (the cron sync catches anything
 * the webhook would). New-order emails go through Resend to SHOP_EMAIL_TO (or CONSENT_EMAIL_TO).
 */
import Stripe from "stripe";
import { Resend } from "resend";
import { prisma } from "./db";
import {
  DELIVERY, PRINT_SHOP, SITE_URL, SUPPORT_EMAIL, UK_COUNTRIES, bundleCoupon, countPacks, deliveryPromise, formatPounds,
  isFirstEdition, itemsFromMeta, itemsToMeta, packById, packImage, priceFor, type CartItem, type Zone,
} from "./print-shop";

export class ShopError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Marks our sessions in a Stripe account that may sell other things too. */
const SHOP_TAG = "5iveg-print";

let client: Stripe | null = null;
export const shopOpen = () => !!process.env.STRIPE_SECRET_KEY;
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ShopError("The shop isn't open yet. Please try again soon.", 503);
  return (client ??= new Stripe(key));
}

type AllowedCountry = Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry;
/** Everywhere Stripe can collect an address for, except the UK (its own rate) and places Royal Mail can't reach. */
const NOT_WORLDWIDE = new Set<string>([...UK_COUNTRIES, "RU", "BY", "ZZ", "AQ", "BV", "GS", "TF", "IO"]);
const WORLD_COUNTRIES = (
  "AC AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CD CF CG CH " +
  "CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ " +
  "GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT " +
  "LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK " +
  "PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TA TC TD TF TG TH TJ TK TL " +
  "TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WF WS XK YE YT ZA ZM ZW ZZ"
)
  .split(" ")
  .filter((c) => !NOT_WORLDWIDE.has(c)) as AllowedCountry[];

/** The bundle discount as a Stripe coupon, made the first time it's needed (separately in test and live mode). */
async function couponFor(s: Stripe, bundles: number): Promise<string> {
  const c = bundleCoupon(bundles);
  try {
    return (await s.coupons.retrieve(c.id)).id;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    try {
      return (
        await s.coupons.create({ id: c.id, amount_off: c.amountOffPence, currency: PRINT_SHOP.currency, duration: "once", name: c.name })
      ).id;
    } catch (e) {
      // Two checkouts racing to make it: the other one won.
      if ((e as { code?: string }).code === "resource_already_exists") return c.id;
      throw e;
    }
  }
}

/** A Stripe Checkout page for the basket. Returns its URL. */
export async function createCheckout(opts: { items: CartItem[]; zone: Zone; origin: string; userId?: string | null }) {
  const s = stripe();
  const { items, zone, origin } = opts;
  const price = priceFor(countPacks(items));
  const delivery = DELIVERY[zone];
  const coupon = price.bundles ? await couponFor(s, price.bundles) : null;
  const now = new Date();

  const session = await s.checkout.sessions.create({
    mode: "payment",
    currency: PRINT_SHOP.currency,
    line_items: items.map((i) => {
      const pack = packById(i.packId)!;
      return {
        quantity: i.qty,
        price_data: {
          currency: PRINT_SHOP.currency,
          unit_amount: PRINT_SHOP.packPence,
          product_data: {
            name: `${pack.title}${isFirstEdition(now) ? " (1st Edition)" : ""}`,
            description: pack.blurb,
            images: [`${SITE_URL}${packImage(pack.id)}`],
          },
        },
      };
    }),
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    shipping_address_collection: { allowed_countries: zone === "uk" ? [...UK_COUNTRIES] : WORLD_COUNTRIES },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: delivery.label,
          fixed_amount: { amount: delivery.pence, currency: PRINT_SHOP.currency },
        },
      },
    ],
    custom_text: {
      shipping_address: {
        message: zone === "uk" ? "We post to UK addresses at this price." : "Posted from the UK. Import charges, if any, are paid on arrival.",
      },
      submit: {
        message: `${deliveryPromise(now)} All sales are final: no refunds (your statutory rights aren't affected). Terms: ${SITE_URL}/terms · Help: ${SUPPORT_EMAIL}`,
      },
    },
    metadata: { shop: SHOP_TAG, items: itemsToMeta(items), zone },
    // The Stripe account is the company's (Genius Technologies); buyers know the shop as 5iveG,
    // so the checkout page says 5iveG and card statements read "<company prefix>* 5IVEG".
    branding_settings: { display_name: "5iveG", button_color: "#9333ea" },
    payment_intent_data: {
      metadata: { shop: SHOP_TAG, items: itemsToMeta(items), zone },
      description: "5iveG card packs",
      statement_descriptor_suffix: "5IVEG",
    },
    ...(opts.userId ? { client_reference_id: opts.userId } : {}),
    success_url: `${origin}/shop/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/shop`,
  });
  if (!session.url) throw new ShopError("Checkout couldn't start. Please try again.", 502);
  return session.url;
}

export interface OrderView {
  id: string;
  number: number;
  livemode: boolean;
  status: string;
  email: string | null;
  customerName: string | null;
  shippingName: string | null;
  address: Record<string, string | null> | null;
  country: string | null;
  zone: string;
  items: CartItem[];
  packCount: number;
  subtotalPence: number;
  discountPence: number;
  shippingPence: number;
  totalPence: number;
  firstEdition: boolean;
  note: string | null;
  paidAt: string;
  postedAt: string | null;
}

type Row = Awaited<ReturnType<typeof prisma.printOrder.findFirstOrThrow>>;
export function orderView(o: Row): OrderView {
  return {
    id: o.id, number: o.number, livemode: o.livemode, status: o.status, email: o.email, customerName: o.customerName,
    shippingName: o.shippingName, address: o.shippingAddress ? JSON.parse(o.shippingAddress) : null, country: o.country, zone: o.zone,
    items: JSON.parse(o.items) as CartItem[], packCount: o.packCount, subtotalPence: o.subtotalPence, discountPence: o.discountPence,
    shippingPence: o.shippingPence, totalPence: o.totalPence, firstEdition: o.firstEdition, note: o.note,
    paidAt: o.paidAt.toISOString(), postedAt: o.postedAt?.toISOString() ?? null,
  };
}

/**
 * Records a paid Checkout session as an order, once. Safe to call again and from several places.
 * Returns null for sessions that aren't ours or aren't paid yet.
 */
export async function recordCheckout(sessionOrId: string | Stripe.Checkout.Session): Promise<{ order: OrderView; created: boolean } | null> {
  const session = typeof sessionOrId === "string" ? await stripe().checkout.sessions.retrieve(sessionOrId) : sessionOrId;
  if (session.metadata?.shop !== SHOP_TAG || session.payment_status !== "paid") return null;

  const existing = await prisma.printOrder.findUnique({ where: { stripeSessionId: session.id } });
  if (existing) return { order: orderView(existing), created: false };

  const items = itemsFromMeta(session.metadata.items);
  const shipping = session.collected_information?.shipping_details ?? null;
  const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000);
  const zone: Zone = session.metadata.zone === "world" ? "world" : "uk";
  const data = {
    stripeSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    livemode: session.livemode,
    email: session.customer_details?.email ?? null,
    customerName: session.customer_details?.name ?? null,
    shippingName: shipping?.name ?? null,
    shippingAddress: shipping?.address ? JSON.stringify(shipping.address) : null,
    country: shipping?.address?.country ?? null,
    zone,
    items: JSON.stringify(items),
    packCount: countPacks(items),
    subtotalPence: session.amount_subtotal ?? 0,
    discountPence: session.total_details?.amount_discount ?? 0,
    shippingPence: session.total_details?.amount_shipping ?? 0,
    totalPence: session.amount_total ?? 0,
    firstEdition: isFirstEdition(paidAt),
    userId: session.client_reference_id ?? null,
    paidAt,
  };
  try {
    const order = orderView(await prisma.printOrder.create({ data }));
    await notifyNewOrder(order).catch((err: Error) => console.error("[shop] new-order email failed:", err.message));
    return { order, created: true };
  } catch (err) {
    // Recorded by another caller in the meantime (unique session id).
    const again = await prisma.printOrder.findUnique({ where: { stripeSessionId: session.id } });
    if (again) return { order: orderView(again), created: false };
    throw err;
  }
}

/** Records every paid shop session from the last `days` days that isn't in the database yet. */
export async function syncRecentOrders(days = 3) {
  const s = stripe();
  let added = 0;
  for await (const session of s.checkout.sessions.list({
    created: { gte: Math.floor(Date.now() / 1000) - days * 86400 },
    status: "complete",
    limit: 100,
  })) {
    const r = await recordCheckout(session);
    if (r?.created) added++;
  }
  return { added };
}

/** Verifies a Stripe webhook and records the order it's about. */
export async function handleWebhook(payload: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ShopError("Webhook not configured", 503);
  if (!signature) throw new ShopError("No signature", 400);
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new ShopError("Bad signature", 400);
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await recordCheckout(event.data.object.id);
  }
  return { received: true };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function addressLines(a: Record<string, string | null> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.postal_code, a.country].filter((x): x is string => !!x);
}

/** Emails the club about a new order (best effort; the order is recorded either way). */
async function notifyNewOrder(o: OrderView) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SHOP_EMAIL_TO || process.env.CONSENT_EMAIL_TO;
  if (!apiKey || !to) return;
  const packs = o.items.map((i) => `${packById(i.packId)?.title ?? i.packId} × ${i.qty}`);
  const lines = [
    `${o.packCount} pack${o.packCount === 1 ? "" : "s"}, ${formatPounds(o.totalPence)} paid (${o.zone === "uk" ? "UK" : "worldwide"} delivery)${o.firstEdition ? ", 1st Edition" : ""}`,
    "",
    ...packs,
    "",
    "Post to:",
    o.shippingName ?? o.customerName ?? "",
    ...addressLines(o.address),
    "",
    `Buyer: ${o.customerName ?? ""} <${o.email ?? ""}>`,
    `All orders: ${SITE_URL}/admin/orders`,
  ];
  await new Resend(apiKey).emails.send({
    from: process.env.SHOP_EMAIL_FROM || process.env.CONSENT_EMAIL_FROM || "5iveG shop <onboarding@resend.dev>",
    to: to.split(",").map((x) => x.trim()).filter(Boolean),
    ...(o.email ? { replyTo: o.email } : {}),
    subject: `${o.livemode ? "" : "[TEST] "}New order #${o.number}: ${o.packCount} pack${o.packCount === 1 ? "" : "s"}, ${formatPounds(o.totalPence)}`,
    text: lines.join("\n"),
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${lines
      .map((l) => (l ? esc(l) : "&nbsp;"))
      .join("<br>")}</div>`,
  });
}
