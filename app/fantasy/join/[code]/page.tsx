"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FantasyShell, panel, Spinner } from "@/components/fantasy/FantasyShell";

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
    <FantasyShell>
      <section className={`${panel} space-y-3 text-center`}>
        <h1 className="text-white text-2xl font-black">Join league {code.toUpperCase()}</h1>
        {status === "unauthenticated" ? (
          <>
            <p className="text-zinc-400">Sign in to join your friend&apos;s Fantasy Div 1 league. On the 5iveG app, enter the code on the Fantasy tab.</p>
            <button onClick={() => signIn("google")} className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold">Sign in to join</button>
          </>
        ) : error ? (
          <>
            <p className="text-red-400">{error}</p>
            <Link href={error.includes("Pick your team") ? "/fantasy/team" : "/fantasy"} className="inline-block px-5 py-3 rounded-xl bg-purple-600 text-white font-bold">
              {error.includes("Pick your team") ? "Pick your team" : "Go to Fantasy"}
            </Link>
          </>
        ) : <Spinner />}
      </section>
    </FantasyShell>
  );
}
