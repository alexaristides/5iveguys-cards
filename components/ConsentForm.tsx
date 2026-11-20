"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AGREEMENT_PARTIES, CONSENT_STATEMENTS, GUARDIAN_STATEMENT, SIGNATURE_STATEMENT, formatSortCode, parseConsent, type ConsentKey,
} from "@/lib/player-consent";

interface World {
  slug: string;
  name: string;
}
interface Player {
  name: string;
  imageUrl: string;
}

const input =
  "w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-base sm:text-sm outline-none focus:border-purple-500 placeholder:text-zinc-600";
const label = "block text-zinc-300 text-xs font-medium mb-1.5";
const OTHER = "__other__";

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`py-2 rounded-lg text-sm font-medium transition-colors ${
            value === v ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-3 text-white font-semibold text-base">
        <span className="w-6 h-6 rounded-full bg-purple-600/20 text-purple-300 text-xs flex items-center justify-center">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ConsentForm({
  worlds,
  initialTeam,
  initialPlayer,
}: {
  worlds: World[];
  initialTeam: string | null;
  initialPlayer: string | null;
}) {
  const [squads, setSquads] = useState<Record<string, Player[]> | null>(null);
  const [team, setTeam] = useState(worlds.find((w) => w.slug.toLowerCase() === initialTeam?.toLowerCase())?.slug ?? worlds[0].slug);
  const [player, setPlayer] = useState(""); // a squad name, or OTHER
  const [otherName, setOtherName] = useState("");

  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState<"adult" | "minor">("adult");
  const [guardianName, setGuardianName] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [accountHolder, setAccountHolder] = useState("");
  const [bankCountry, setBankCountry] = useState<"uk" | "abroad">("uk");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [bankName, setBankName] = useState("");

  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>(
    () => Object.fromEntries(CONSENT_STATEMENTS.map(({ key }) => [key, false])) as Record<ConsentKey, boolean>,
  );
  const [signature, setSignature] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reference: string } | null>(null);

  // The squads, with each player's card, from the shop's public list.
  useEffect(() => {
    let live = true;
    Promise.all(
      worlds.map(async (w) => {
        const res = await fetch(`/api/shop?channelSlug=${encodeURIComponent(w.slug)}`);
        const data = res.ok ? await res.json() : { players: [] };
        const players: Player[] = (data.players ?? []).map((p: { name: string; card: { imageUrl: string } }) => ({
          name: p.name,
          imageUrl: p.card.imageUrl,
        }));
        return [w.slug, players] as const;
      }),
    )
      .then((entries) => {
        if (!live) return;
        const loaded = Object.fromEntries(entries);
        setSquads(loaded);
        // ?player= opens on that player: in ?team= when given, else the first team that has them.
        if (initialPlayer) {
          const wanted = initialPlayer.toLowerCase();
          const order = [team, ...worlds.map((w) => w.slug).filter((s) => s !== team)];
          const home = initialTeam ? [team] : order;
          for (const slug of home) {
            const match = loaded[slug]?.find((p) => p.name.toLowerCase() === wanted);
            if (match) {
              setTeam(slug);
              setPlayer(match.name);
              break;
            }
          }
        }
      })
      .catch(() => live && setSquads({}));
    return () => {
      live = false;
    };
  }, []);

  const teamName = worlds.find((w) => w.slug === team)?.name ?? "";
  const squad = squads?.[team] ?? [];
  const chosen = squad.find((p) => p.name === player);
  const playerName = player === OTHER ? otherName.trim() : player;
  const signer = age === "adult" ? fullName : guardianName;
  const today = useMemo(() => new Intl.DateTimeFormat("en-GB", { dateStyle: "long" }).format(new Date()), []);

  function pickTeam(slug: string) {
    setTeam(slug);
    setPlayer("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      channelSlug: player === OTHER ? "" : team,
      teamName,
      playerName,
      fullName,
      over18: age === "adult",
      guardianName,
      guardianRelationship,
      email,
      phone,
      address,
      accountHolder,
      bankCountry,
      sortCode,
      accountNumber,
      iban,
      bic,
      bankName,
      consents,
      signature,
      website,
    };
    const check = parseConsent(body);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setResult({ reference: data.reference });
      setState("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "sent" && result) {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 space-y-3 text-center">
        {chosen && <img src={chosen.imageUrl} alt={chosen.name} className="w-28 mx-auto rounded-lg shadow-lg shadow-purple-900/30" />}
        <p className="text-white text-xl font-bold">You&rsquo;re in, {signer.trim().split(" ")[0]}!</p>
        <p>
          Your permission and bank details are with the 5iveG team. We&rsquo;ll pay your share of every {playerName} pack
          sold into the account you gave us.
        </p>
        <p className="text-zinc-600 text-xs">Reference {result.reference}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-10" noValidate>
      <Section n={1} title="Which player are you?">
        <Toggle value={team} options={worlds.map((w) => [w.slug, w.name])} onChange={pickTeam} />
        {!squads ? (
          <p className="text-zinc-600">Loading the squad…</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {squad.map((p) => (
              <button
                key={p.name}
                type="button"
                aria-label={p.name}
                aria-pressed={player === p.name}
                onClick={() => setPlayer(p.name)}
                className={`rounded-lg p-1 text-center transition-all ${
                  player === p.name ? "bg-purple-600 ring-2 ring-purple-400" : "bg-zinc-900 hover:bg-zinc-800 opacity-80"
                }`}
              >
                <img src={p.imageUrl} alt="" loading="lazy" className="w-full aspect-[5/7] object-cover rounded-md" />
                <span className={`block mt-1 text-[11px] leading-tight truncate ${player === p.name ? "text-white" : "text-zinc-400"}`}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        )}
        {player === OTHER ? (
          <div>
            <label className={label} htmlFor="otherName">The name on your card</label>
            <input id="otherName" className={input} value={otherName} onChange={(e) => setOtherName(e.target.value)} maxLength={60} />
          </div>
        ) : (
          squads && (
            <button type="button" onClick={() => setPlayer(OTHER)} className="text-xs text-zinc-500 underline hover:text-zinc-300">
              Not on here?
            </button>
          )
        )}
      </Section>

      <Section n={2} title="Your details">
        <div>
          <label className={label} htmlFor="fullName">Your full name</label>
          <input id="fullName" className={input} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} placeholder="First and last name" />
        </div>
        <div>
          <span className={label}>How old are you?</span>
          <Toggle value={age} options={[["adult", "18 or over"], ["minor", "Under 18"]]} onChange={setAge} />
        </div>
        {age === "minor" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
            <p className="text-amber-200/90 text-xs">
              A parent or guardian needs to give permission for players under 18. Please fill the rest in together, and they
              sign at the end.
            </p>
            <div>
              <label className={label} htmlFor="guardianName">Parent or guardian&rsquo;s full name</label>
              <input id="guardianName" className={input} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className={label} htmlFor="guardianRelationship">Relationship to the player</label>
              <input id="guardianRelationship" className={input} value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)} maxLength={40} placeholder="e.g. Mum, Dad" />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={label} htmlFor="email">Email</label>
            <input id="email" type="email" className={input} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Mobile number</label>
            <input id="phone" type="tel" className={input} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="address">Home address</label>
          <textarea id="address" className={`${input} min-h-24`} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} placeholder="Including postcode" />
        </div>
      </Section>

      <Section n={3} title="Where should we pay you?">
        <p>
          Your share of every pack sold with your name on it goes into this account. We only need these details to send you
          money. We&rsquo;ll never ask for your card number, PIN or banking password.
        </p>
        <Toggle value={bankCountry} options={[["uk", "UK bank"], ["abroad", "Bank outside the UK"]]} onChange={setBankCountry} />
        <div>
          <label className={label} htmlFor="accountHolder">Name on the account</label>
          <input id="accountHolder" className={input} autoComplete="off" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} maxLength={100} />
        </div>
        {bankCountry === "uk" ? (
          <div className="grid grid-cols-[2fr_3fr] gap-4">
            <div>
              <label className={label} htmlFor="sortCode">Sort code</label>
              <input id="sortCode" className={`${input} tabular-nums`} inputMode="numeric" autoComplete="off" value={sortCode} onChange={(e) => setSortCode(formatSortCode(e.target.value))} placeholder="12-34-56" />
            </div>
            <div>
              <label className={label} htmlFor="accountNumber">Account number</label>
              <input id="accountNumber" className={`${input} tabular-nums`} inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 digits" />
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className={label} htmlFor="iban">IBAN</label>
              <input id="iban" className={`${input} uppercase tabular-nums`} autoComplete="off" value={iban} onChange={(e) => setIban(e.target.value.slice(0, 42))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={label} htmlFor="bic">SWIFT / BIC</label>
                <input id="bic" className={`${input} uppercase`} autoComplete="off" value={bic} onChange={(e) => setBic(e.target.value.slice(0, 14))} />
              </div>
              <div>
                <label className={label} htmlFor="bankName">Bank name</label>
                <input id="bankName" className={input} autoComplete="off" value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={100} />
              </div>
            </div>
          </>
        )}
      </Section>

      <Section n={4} title="Your permission">
        <p>{AGREEMENT_PARTIES} Tick each one to agree.</p>
        <div className="space-y-2">
          {CONSENT_STATEMENTS.map(({ key, text }) => (
            <label
              key={key}
              className={`flex gap-3 items-start rounded-xl border p-4 cursor-pointer transition-colors ${
                consents[key] ? "border-purple-500/60 bg-purple-500/5 text-zinc-200" : "border-zinc-800 bg-zinc-900/50"
              }`}
            >
              <input
                type="checkbox"
                checked={consents[key]}
                onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
                className="mt-0.5 w-5 h-5 shrink-0 accent-purple-600"
              />
              <span>{text}</span>
            </label>
          ))}
        </div>
      </Section>

      <Section n={5} title="Sign">
        {age === "minor" && <p className="text-amber-200/90">{GUARDIAN_STATEMENT}</p>}
        <p>{SIGNATURE_STATEMENT}</p>
        <div>
          <label className={label} htmlFor="signature">
            {age === "adult" ? "Type your full name to sign" : "Parent or guardian: type your full name to sign"}
          </label>
          <input
            id="signature"
            className={`${input} font-serif italic text-lg sm:text-lg`}
            autoComplete="off"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            maxLength={100}
            placeholder={signer.trim() || "Full name"}
          />
          <p className="text-zinc-600 text-xs mt-1.5">Dated {today}</p>
        </div>
      </Section>

      <input
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      {error && <p className="text-sm rounded-xl p-3 bg-red-900/40 text-red-300">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-base font-semibold transition-all"
      >
        {state === "sending" ? "Sending…" : "Sign and send"}
      </button>
    </form>
  );
}
