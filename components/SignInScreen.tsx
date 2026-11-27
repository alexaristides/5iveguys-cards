"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { AppMenu } from "@/components/AppMenu";
import { STEPS } from "@/components/fantasy/steps";

/**
 * Sign in with Google for name and email only, like the app (`/api/mobile/auth/web-start?basic=1`).
 * include_granted_scopes keeps any YouTube access someone already gave (Extras uses it for points).
 */
export function signInBasic(callbackUrl: string) {
  return signIn("google", { callbackUrl }, { scope: "openid email profile", include_granted_scopes: "true" });
}

/** The app's sign-in screen (mobile/src/app/sign-in.tsx): the badge, the four steps and Continue with Google. */
export function SignInScreen({ callbackUrl = "/fantasy" }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="relative min-h-[100dvh] bg-lilac text-ink [color-scheme:light]">
      <div className="absolute inset-x-0 top-0 h-[50dvh] bg-gradient-to-b from-violet-100 to-lilac" aria-hidden />
      <div className="absolute right-4 top-[calc(12px+env(safe-area-inset-top))] z-10">
        <AppMenu />
      </div>

      <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col justify-between gap-8 px-6 pt-[calc(28px+env(safe-area-inset-top))] pb-[calc(20px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-2.5 pt-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/5iveg-app-icon.png" alt="" className="mb-1.5 w-[108px] h-[108px] rounded-[26px] shadow-[0_3px_10px_rgba(46,16,101,0.3)]" />
          <h1 className="text-[34px] leading-tight font-black">5iveG Fantasy</h1>
          <p className="text-ink-2 text-[17px] leading-[23px] font-medium">Fantasy football for the 5ive Guys&apos; real Division 1 season.</p>
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
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              signInBasic(callbackUrl);
            }}
            className="w-full h-[54px] rounded-2xl bg-white border-[1.5px] border-lilac-line text-ink text-lg font-bold hover:bg-violet-50 disabled:opacity-70 transition-colors"
          >
            {busy ? (
              <span className="inline-block w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin align-middle" />
            ) : (
              <>
                <span className="text-[#4285F4] font-black">G</span>&nbsp;&nbsp;Continue with Google
              </>
            )}
          </button>
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
