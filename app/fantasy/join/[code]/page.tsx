"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { AppShell, panel, primaryButton, Spinner } from "@/components/AppShell";

/** Where invite links land: join the league once signed in (and once you've picked a team). */
export default function FantasyJoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/fantasy/leagues/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (r.ok) router.replace(`/fantasy/league/${json.league.id}`);
        else setError(json.error ?? "Couldn't join that league.");
      });
  }, [status, code, router]);

  return (
    <AppShell>
      <section className={`${panel} space-y-3 text-center`}>
        <div className="mx-auto w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center text-2xl" aria-hidden>🏆</div>
        <h1 className="text-ink text-2xl font-black">Join league <span className="text-violet-600 tracking-[0.12em]">{code.toUpperCase()}</span></h1>
        {status === "unauthenticated" ? (
          <>
            <p className="text-ink-2">Sign in to join your friend&apos;s Fantasy Div 1 league. On the 5iveG app, enter the code on the Leagues tab.</p>
            <button onClick={() => signIn("google")} className={`${primaryButton} h-[52px] px-6 text-[17px]`}>Sign in to join</button>
          </>
        ) : error ? (
          <>
            <p className="text-red-600 font-semibold">{error}</p>
            <Link href={error.includes("Pick your team") ? "/fantasy/team" : "/fantasy"} className={`${primaryButton} inline-flex items-center h-[52px] px-6 text-[17px]`}>
              {error.includes("Pick your team") ? "Pick your team" : "Go to Fantasy"}
            </Link>
          </>
        ) : <Spinner />}
      </section>
    </AppShell>
  );
}
