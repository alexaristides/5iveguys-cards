/**
 * Player consent: the form a squad player fills in (at /consent) to let 5iveG sell cards and
 * packs with their face, and to say where to pay their share. Each signed form is emailed to
 * the club (CONSENT_EMAIL_TO) by app/api/consent/route.ts.
 * Nothing is stored in the database. Pure TypeScript (no Next/Prisma imports).
 */

/** Bump when the wording below changes, so every email says which version was signed. */
export const CONSENT_VERSION = "2026-11-20 v3";

/**
 * Who the player gives permission to: the company that sells the packs and pays them. A brand
 * can't hold rights or owe money, so the company is named once and "5iveG" is shorthand after.
 */
export const COMPANY = "Genius Technologies Ltd";
export const AGREEMENT_PARTIES =
  `This agreement is between you and ${COMPANY}, trading as 5iveG ("5iveG"), which makes and sells 5iveG ` +
  "cards and packs and pays your share.";

export type ConsentKey = "image" | "share" | "withdraw" | "data" | "tax";

/** What the player agrees to, ticked one by one. The share's amount is deliberately not given. */
export const CONSENT_STATEMENTS: { key: ConsentKey; text: string }[] = [
  {
    key: "image",
    text:
      "I give 5iveG permission to use my name, face and photos of me on 5iveG trading cards and card packs " +
      "(in the 5iveG app and website, on printed cards and packs, and in 5iveG games like 5IVE STREET) and to sell them.",
  },
  {
    key: "share",
    text: "I understand I'll be paid a share of the sales of every pack with my name on it, into the bank account on this form.",
  },
  {
    key: "withdraw",
    text:
      "I know I can withdraw this permission at any time by contacting 5iveG. New packs with my face will then come off " +
      "sale within 30 days; cards that fans have already got stay in their collections.",
  },
  {
    key: "data",
    text:
      "I agree to 5iveG keeping the details on this form, including my bank details and selfie, to pay me and as a record of this " +
      "agreement. They're used for nothing else.",
  },
  { key: "tax", text: "I'm responsible for any tax on the money I'm paid." },
];

/** Shown above the signature, and part of the signed record. */
export const SIGNATURE_STATEMENT = "By typing my name below I'm signing this form, and the details on it are correct.";
export const GUARDIAN_STATEMENT =
  "I'm the parent or guardian of the player named on this form, and I give these permissions on their behalf.";

/**
 * The selfie that shows it's really the player: taken on the phone, shrunk to a JPEG there
 * (components/ConsentForm.tsx) and sent as a data URL, then attached to the club's email.
 */
export const SELFIE_MAX_SIDE = 1024;
const SELFIE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const SELFIE_MAX_CHARS = 3_000_000; // ~2.2 MB of JPEG, well inside a request
/** A card picture on this site, shown beside the selfie in the email. */
const CARD_IMAGE = /^\/cards\/[A-Za-z0-9_\-/]+\.(jpe?g|png|webp)$/;

export interface ConsentInput {
  channelSlug: string;
  teamName: string;
  playerName: string; // the name on their card
  otherTeamName?: string; // set when they play for both teams
  cardImage?: string; // e.g. /cards/home/Milo_Home.jpg
  selfie: string; // data:image/jpeg;base64,…
  fullName: string; // legal name
  over18: boolean;
  guardianName?: string;
  guardianRelationship?: string;
  email: string;
  phone: string;
  address: string;
  accountHolder: string;
  bankCountry: "uk" | "abroad";
  sortCode?: string; // uk: 6 digits
  accountNumber?: string; // uk: 8 digits
  iban?: string; // abroad
  bic?: string; // abroad
  bankName?: string; // abroad
  consents: Record<ConsentKey, boolean>;
  signature: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const digits = (v: unknown) => (typeof v === "string" ? v.replace(/[\s-]/g, "") : "");
/** Names compare without case, spaces or punctuation, so "jo smith" signs for "Jo Smith". */
export const sameName = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return n(a).length > 0 && n(a) === n(b);
};

/** "12-34-56" from "123456". */
export const formatSortCode = (s: string) => s.replace(/\D/g, "").slice(0, 6).replace(/(\d{2})(?=\d)/g, "$1-");

/** An IBAN's mod-97 check (ISO 13616), on the IBAN without spaces. */
export function validIban(iban: string): boolean {
  const s = iban.toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

/**
 * Checks and tidies what the form sent. Returns the clean input, or the first problem in words
 * the player can act on.
 */
export function parseConsent(body: unknown): { ok: true; value: ConsentInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fail = (error: string) => ({ ok: false as const, error });

  const playerName = str(b.playerName, 60);
  const channelSlug = str(b.channelSlug, 40);
  const teamName = str(b.teamName, 60);
  if (!playerName) return fail("Pick which player you are.");
  const otherTeamName = str(b.otherTeamName, 60);
  const cardImage = typeof b.cardImage === "string" && CARD_IMAGE.test(b.cardImage) ? b.cardImage : "";

  const fullName = str(b.fullName, 100);
  if (fullName.length < 3 || !fullName.includes(" ")) return fail("Enter your full name (first and last).");

  const over18 = b.over18 === true;
  const guardianName = over18 ? "" : str(b.guardianName, 100);
  const guardianRelationship = over18 ? "" : str(b.guardianRelationship, 40);
  if (!over18 && (guardianName.length < 3 || !guardianName.includes(" "))) {
    return fail("A parent or guardian needs to fill this in for players under 18: enter their full name.");
  }

  const email = str(b.email, 200).toLowerCase();
  if (!EMAIL.test(email)) return fail("Enter a valid email address.");
  const phone = str(b.phone, 30);
  if (phone.replace(/\D/g, "").length < 7) return fail("Enter your mobile number.");
  const address = typeof b.address === "string" ? b.address.trim().slice(0, 400) : "";
  if (address.length < 8) return fail("Enter your home address, with postcode.");

  const selfie = typeof b.selfie === "string" ? b.selfie : "";
  if (!selfie) return fail("Take a selfie so we know it's really you.");
  if (selfie.length > SELFIE_MAX_CHARS || !SELFIE.test(selfie)) return fail("That selfie didn't come through. Please take it again.");

  const accountHolder = str(b.accountHolder, 100);
  if (accountHolder.length < 3) return fail("Enter the name on the bank account.");
  const bankCountry = b.bankCountry === "abroad" ? "abroad" : "uk";
  const bank: Pick<ConsentInput, "sortCode" | "accountNumber" | "iban" | "bic" | "bankName"> = {};
  if (bankCountry === "uk") {
    const sortCode = digits(b.sortCode);
    const accountNumber = digits(b.accountNumber);
    if (!/^\d{6}$/.test(sortCode)) return fail("A sort code has 6 digits, like 12-34-56.");
    if (!/^\d{8}$/.test(accountNumber)) return fail("A UK account number has 8 digits. If yours has 7, put a 0 in front.");
    bank.sortCode = formatSortCode(sortCode);
    bank.accountNumber = accountNumber;
  } else {
    const iban = digits(b.iban).toUpperCase();
    const bic = digits(b.bic).toUpperCase();
    if (!validIban(iban)) return fail("That IBAN doesn't look right. Check it against your bank app.");
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return fail("A SWIFT/BIC code has 8 or 11 letters and numbers.");
    bank.iban = iban.replace(/(.{4})(?=.)/g, "$1 ");
    bank.bic = bic;
    bank.bankName = str(b.bankName, 100);
  }

  const sent = (b.consents && typeof b.consents === "object" ? b.consents : {}) as Record<string, unknown>;
  const consents = Object.fromEntries(CONSENT_STATEMENTS.map(({ key }) => [key, sent[key] === true])) as Record<ConsentKey, boolean>;
  if (!CONSENT_STATEMENTS.every(({ key }) => consents[key])) return fail("Tick every box to give your permission.");

  const signature = str(b.signature, 100);
  const signer = over18 ? fullName : guardianName;
  if (!sameName(signature, signer)) {
    return fail(over18 ? "To sign, type your full name exactly as above." : "To sign, the parent or guardian types their full name.");
  }

  return {
    ok: true,
    value: {
      channelSlug, teamName, playerName,
      ...(otherTeamName ? { otherTeamName } : {}),
      ...(cardImage ? { cardImage } : {}),
      selfie, fullName, over18,
      ...(over18 ? {} : { guardianName, guardianRelationship }),
      email, phone, address, accountHolder, bankCountry, ...bank, consents, signature,
    },
  };
}

export interface ConsentRecord {
  reference: string;
  siteUrl: string; // for the card picture in the email
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const londonTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "long", timeZone: "Europe/London" }).format(d);

type Row = [label: string, value: string];
interface Email {
  subject: string;
  html: string;
  text: string;
}

function render(
  title: string,
  intro: string,
  sections: [heading: string, rows: Row[]][],
  footer: string,
  pictures = "",
): Omit<Email, "subject"> {
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;color:#18181b">` +
    `<h2 style="margin:0 0 6px">${esc(title)}</h2><p style="margin:0 0 18px;color:#52525b">${esc(intro)}</p>` +
    pictures +
    sections
      .map(
        ([heading, rows]) =>
          `<h3 style="margin:22px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed">${esc(heading)}</h3>` +
          `<table style="border-collapse:collapse;width:100%;font-size:14px">` +
          rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:6px 12px 6px 0;color:#71717a;vertical-align:top;width:${label ? "34%" : "0"}">${esc(label)}</td>` +
                `<td style="padding:6px 0;vertical-align:top;white-space:pre-wrap">${esc(value)}</td></tr>`,
            )
            .join("") +
          `</table>`,
      )
      .join("") +
    `<p style="margin:26px 0 0;font-size:12px;color:#a1a1aa">${esc(footer)}</p></div>`;
  const text = [
    title,
    intro,
    ...sections.map(([heading, rows]) => `\n${heading.toUpperCase()}\n` + rows.map(([l, v]) => (l ? `${l}: ${v}` : v)).join("\n")),
    `\n${footer}`,
  ].join("\n");
  return { html, text };
}

function sections(c: ConsentInput, r: ConsentRecord, bankRows: Row[]): [string, Row[]][] {
  return [
    ["Player", [
      ["Card", `${c.playerName}${c.teamName ? ` (${c.teamName})` : ""}`],
      ...(c.otherTeamName ? ([["Also plays for", c.otherTeamName]] as Row[]) : []),
      ["Full name", c.fullName],
      ["Selfie", "Attached"],
      ["Age", c.over18 ? "18 or over" : "Under 18"],
      ...(c.over18 ? [] : ([
        ["Parent/guardian", c.guardianName ?? ""],
        ["Relationship", c.guardianRelationship || "Not given"],
      ] as Row[])),
    ]],
    ["Contact", [["Email", c.email], ["Mobile", c.phone], ["Address", c.address]]],
    ["Bank account for their share", bankRows],
    ["Permission given", [
      ["", AGREEMENT_PARTIES],
      ...CONSENT_STATEMENTS.map(({ key, text }): Row => ["", `${c.consents[key] ? "✔" : "✘"} ${text}`]),
      ...(c.over18 ? [] : ([["", `✔ ${GUARDIAN_STATEMENT}`]] as Row[])),
    ]],
    ["Signed", [
      ["", SIGNATURE_STATEMENT],
      ["Signature", c.signature],
      ["Signed by", c.over18 ? "The player" : "Parent/guardian"],
      ["Date", londonTime(r.signedAt)],
      ["Reference", r.reference],
      ["Form version", CONSENT_VERSION],
    ]],
  ];
}

/** The selfie's content ID: the route attaches it inline under this name. */
export const SELFIE_CID = "selfie";

/** The signed form in full, bank details included, for the club's inbox. */
export function clubEmail(c: ConsentInput, r: ConsentRecord): Email {
  const bank: Row[] =
    c.bankCountry === "uk"
      ? [["Name on account", c.accountHolder], ["Sort code", c.sortCode ?? ""], ["Account number", c.accountNumber ?? ""]]
      : [["Name on account", c.accountHolder], ["IBAN", c.iban ?? ""], ["SWIFT/BIC", c.bic ?? ""], ["Bank", c.bankName || "Not given"]];
  const all = sections(c, r, bank);
  all.push(["Record", [["IP address", r.ip ?? "Unknown"], ["Device", r.userAgent ?? "Unknown"]]]);
  // Selfie beside their card, to check it's them. The selfie is the inline attachment SELFIE_CID.
  const picture = (src: string, caption: string) =>
    `<td style="padding:0 12px 0 0;vertical-align:top;text-align:center;font-size:12px;color:#71717a">` +
    `<img src="${esc(src)}" alt="${esc(caption)}" width="160" style="display:block;width:160px;border-radius:8px;margin-bottom:4px">` +
    `${esc(caption)}</td>`;
  const pictures =
    `<table style="border-collapse:collapse;margin:0 0 8px"><tr>` +
    picture(`cid:${SELFIE_CID}`, "Selfie") +
    (c.cardImage ? picture(new URL(c.cardImage, r.siteUrl).toString(), "Their card") : "") +
    `</tr></table>`;
  return {
    subject: `Player consent signed: ${c.playerName}${c.teamName ? ` (${c.teamName})` : ""}, ${c.fullName}`,
    ...render(
      `${c.playerName} has signed the player consent`,
      `${c.fullName} gave ${COMPANY} (5iveG) permission to sell cards and packs with their face, and sent their bank details. Reply to this email to reach them.`,
      all,
      `Sent from the 5iveG player consent form. Ref ${r.reference}.`,
      pictures,
    ),
  };
}
