"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Navbar from "@/components/Navbar";

interface AccountData {
  name: string | null;
  email: string | null;
  image: string | null;
  hasYoutubeScope: boolean;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [userPoints, setUserPoints] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const fetchData = useCallback(async () => {
    const [accountRes, userRes] = await Promise.all([
      fetch("/api/account"),
      fetch("/api/user"),
    ]);
    if (accountRes.ok) setAccount(await accountRes.json());
    if (userRes.ok) setUserPoints((await userRes.json()).points);
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  if (status === "loading" || !account) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar user={session!.user} points={userPoints} />

      <main className="max-w-xl mx-auto px-4 pt-24 pb-24">
        <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>

        {/* Account */}
        <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 mb-4">
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 shrink-0">
              {account.image ? (
                <Image src={account.image} alt={account.name ?? "User"} fill className="rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{account.name?.[0] ?? "?"}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{account.name ?? "—"}</p>
              <p className="text-zinc-500 text-sm truncate">{account.email ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* YouTube permissions */}
        <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6 mb-4">
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">YouTube Permissions</h2>

          <div className="flex items-start gap-3 mb-5">
            <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${account.hasYoutubeScope ? "bg-green-500/20" : "bg-red-500/20"}`}>
              {account.hasYoutubeScope ? (
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-medium ${account.hasYoutubeScope ? "text-green-400" : "text-red-400"}`}>
                {account.hasYoutubeScope ? "YouTube access granted" : "YouTube access not granted"}
              </p>
              <p className="text-zinc-500 text-xs mt-0.5">
                {account.hasYoutubeScope
                  ? "Your likes and subscription can be synced to earn points."
                  : "Without YouTube access, syncing won't detect your likes or subscription."}
              </p>
            </div>
          </div>

          <button
            onClick={() => signIn("google", { callbackUrl: "/settings" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-purple-900/40 border border-purple-700/50 text-purple-300 text-sm font-medium hover:bg-purple-900/60 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" fill="#4285F4"/>
              <path d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z" fill="#34A853"/>
              <path d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z" fill="#FBBC05"/>
              <path d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" fill="#EA4335"/>
            </svg>
            Reconnect Google &amp; grant YouTube access
          </button>

          {!account.hasYoutubeScope && (
            <p className="text-zinc-600 text-xs mt-3 text-center">
              On the next screen, make sure to allow the YouTube permission when prompted.
            </p>
          )}
        </section>

        {/* Danger zone */}
        <section className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-6">
          <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">Account</h2>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-800/60 border border-zinc-700 text-red-400 text-sm font-medium hover:bg-zinc-800 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </section>
      </main>
    </div>
  );
}
