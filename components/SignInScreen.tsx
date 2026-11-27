"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { AppMenu } from "@/components/AppMenu";
import { inputClass, primaryButton } from "@/components/AppShell";
import { STEPS } from "@/components/fantasy/steps";

/**
 * Sign in with Google for name and email only, like the app (`/api/mobile/auth/web-start?basic=1`).
 * include_granted_scopes keeps any YouTube access someone already gave (Extras uses it for points).
 */
export function signInBasic(callbackUrl: string) {
  return signIn("google", { callbackUrl }, { scope: "openid email profile", include_granted_scopes: "true" });
}

/** The sign-in screen with every option (Apple, Google, email), coming back to `callbackUrl`. */
export function goToSignIn(callbackUrl: string) {
  window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

const ERRORS: Record<string, string> = {
  apple: "Sign in with Apple didn't work. Try again, or use another way.",
};

/** The app's sign-in screen (mobile/src/app/sign-in.tsx): the badge, the four steps and the sign-in options. */
export function SignInScreen({ callbackUrl = "/fantasy", error }: { callbackUrl?: string; error?: string }) {
  return (
    <div className="relative min-h-[100dvh] bg-lilac text-ink [color-scheme:light]">
      <div className="absolute inset-x-0 top-0 h-[50dvh] bg-gradient-to-b from-violet-100 to-lilac" aria-hidden />
      <div className="absolute right-4 top-[calc(12px+env(safe-area-inset-top))] z-10">
        <AppMenu />
      </div>

      <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col justify-between gap-8 px-6 pt-[calc(28px+env(safe-area-inset-top))] pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-2.5 pt-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/5iveguys-badge.png" alt="" className="mb-1.5 w-[108px] h-[108px] rounded-[26px] shadow-[0_3px_10px_rgba(46,16,101,0.3)]" />
          <h1 className="text-[34px] leading-tight font-black">5iveG Fantasy</h1>
          <p className="text-ink-2 text-[17px] leading-[23px] font-medium">Fantasy football for our real Division 1 season.</p>
        </div>

        <div className="rounded-[22px] bg-white p-4 space-y-3 shadow-card">
          {STEPS.map((s) => (
            <div key={s.title} className="flex items-center gap-3">
              <span className="w-[30px] shrink-0 text-center text-[22px]" aria-hidden>{s.emoji}</span>
              <p className="flex-1 text-ink-2 text-[15px] leading-5">
                <span className="text-ink font-black">{s.title}.</span> {s.body}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <SignInOptions callbackUrl={callbackUrl} error={error ? ERRORS[error] ?? null : null} />
          <p className="text-ink-3 text-[13px] text-center mt-0.5">
            Free to play. We only use your name and email.
            <br />
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline hover:text-ink-2">Terms</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-ink-2">Privacy Policy</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}

type Step = { kind: "options" } | { kind: "email" } | { kind: "code"; email: string } | { kind: "name"; email: string; code: string };

let optionsCache: { apple: boolean; email: boolean } | null = null;

/** Apple (when set up), Google and email (when set up), then the email steps: address, code, name for a new profile. */
function SignInOptions({ callbackUrl, error: initialError }: { callbackUrl: string; error: string | null }) {
  const [options, setOptions] = useState(optionsCache);
  const [step, setStep] = useState<Step>({ kind: "options" });
  const [busy, setBusy] = useState<"apple" | "google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (optionsCache) return;
    fetch("/api/sign-in/options")
      .then((r) => r.json())
      .then((o) => setOptions((optionsCache = { apple: !!o.apple, email: !!o.email })))
      .catch(() => {});
  }, []);

  // Coming back from Apple or Google with the Back button restores the page as it was: drop the spinner.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const go = (next: Step) => {
    setError(null);
    setNotice(null);
    setStep(next);
  };

  async function post(path: string, body: unknown) {
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsName?: boolean };
      return { ok: res.ok, error: data.error ?? "Something went wrong. Try again.", needsName: !!data.needsName };
    } catch {
      return { ok: false, error: "Couldn't connect. Check your internet and try again.", needsName: false };
    }
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const address = step.kind === "email" ? email.trim() : step.kind === "code" ? step.email : "";
    if (!address || busy) return;
    setBusy("email");
    setError(null);
    setNotice(null);
    const r = await post("/api/sign-in/email", { email: address });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setCode("");
    if (step.kind === "code") setNotice("We sent a new code.");
    setStep({ kind: "code", email: address });
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    if (busy || (step.kind !== "code" && step.kind !== "name")) return;
    setBusy("email");
    setError(null);
    setNotice(null);
    const r = await post("/api/sign-in/email/verify", {
      email: step.email,
      code: step.kind === "code" ? code : step.code,
      ...(step.kind === "name" ? { name } : {}),
    });
    if (r.ok) return window.location.assign(callbackUrl); // keeps the spinner up while it loads
    setBusy(null);
    if (r.needsName && step.kind === "code") return go({ kind: "name", email: step.email, code });
    setError(r.error);
  }

  const errorText = error ? (
    <p role="alert" className="text-red-600 text-[15px] font-semibold text-center">{error}</p>
  ) : notice ? (
    <p role="status" className="text-green-700 text-[15px] font-semibold text-center">{notice}</p>
  ) : null;
  const back = (to: Step, label = "Back") => (
    <button type="button" onClick={() => go(to)} className="w-full h-10 text-ink-2 text-[15px] font-bold hover:text-ink">
      {label}
    </button>
  );
  const spinner = <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />;

  if (step.kind === "email") {
    return (
      <form onSubmit={sendCode} className="space-y-3">
        <p className="text-ink-2 text-[15px] text-center">We&apos;ll email you a 6-digit code to sign in.</p>
        <input
          className={`${inputClass} w-full h-[54px] text-[17px]`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        {errorText}
        <button type="submit" disabled={!email.trim() || !!busy} className={`${primaryButton} w-full`}>
          {busy ? spinner : "Send code"}
        </button>
        {back({ kind: "options" })}
      </form>
    );
  }

  if (step.kind === "code") {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-ink-2 text-[15px] text-center">
          Enter the code we sent to <span className="text-ink font-bold break-all">{step.email}</span>.
        </p>
        <input
          className={`${inputClass} w-full h-[60px] text-center text-[28px] font-black tracking-[8px]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          enterKeyHint="go"
          placeholder="123456"
          aria-label="6-digit code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
        />
        {errorText}
        <button type="submit" disabled={code.length !== 6 || !!busy} className={`${primaryButton} w-full`}>
          {busy ? spinner : "Sign in"}
        </button>
        <div className="flex">
          <button type="button" onClick={() => sendCode()} disabled={!!busy} className="flex-1 h-10 text-violet-600 text-[15px] font-bold hover:text-violet-500 disabled:opacity-40">
            Send a new code
          </button>
          <button type="button" onClick={() => go({ kind: "email" })} className="flex-1 h-10 text-ink-2 text-[15px] font-bold hover:text-ink">
            Change email
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === "name") {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-ink-2 text-[15px] text-center">You&apos;re new here. What should we call you? Your name shows in leagues.</p>
        <input
          className={`${inputClass} w-full h-[54px] text-[17px]`}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder="Your name"
          aria-label="Your name"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        {errorText}
        <button type="submit" disabled={!name.trim() || !!busy} className={`${primaryButton} w-full`}>
          {busy ? spinner : "Start playing"}
        </button>
        {back({ kind: "email" }, "Use a different email")}
      </form>
    );
  }

  return (
    <>
      {errorText}
      {options?.apple && (
        <a
          href={`/api/sign-in/apple?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          onClick={() => setBusy("apple")}
          aria-disabled={!!busy}
          className={`w-full h-[54px] rounded-2xl bg-black text-white text-lg font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors ${busy ? "pointer-events-none opacity-70" : ""}`}
        >
          {busy === "apple" ? spinner : (
            <>
              <AppleLogo />
              Continue with Apple
            </>
          )}
        </a>
      )}
      <button
        type="button"
        disabled={!!busy}
        onClick={() => {
          setBusy("google");
          signInBasic(callbackUrl);
        }}
        className="w-full h-[54px] rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink text-lg font-bold hover:bg-violet-50 disabled:opacity-70 transition-colors"
      >
        {busy === "google" ? spinner : (
          <>
            <span className="text-[#4285F4] font-black">G</span>&nbsp;&nbsp;Continue with Google
          </>
        )}
      </button>
      {options?.email && (
        <button
          type="button"
          disabled={!!busy}
          onClick={() => go({ kind: "email" })}
          className="w-full h-[54px] rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink text-lg font-bold hover:bg-violet-50 disabled:opacity-70 transition-colors"
        >
          <span aria-hidden>✉️</span>&nbsp;&nbsp;Continue with email
        </button>
      )}
    </>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 17 20" width="17" height="20" fill="currentColor" aria-hidden className="-mt-1">
      <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM11.6 3c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
    </svg>
  );
}
