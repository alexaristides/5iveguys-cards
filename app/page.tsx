"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  rewardTags: string | null;
  _count: { userStats: number };
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.ok ? r.json() : { channels: [] })
      .then((data) => { setChannels(data.channels ?? []); setLoading(false); });
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-purple-900/15 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">F</span>
            </div>
            <span className="text-white font-semibold text-sm">Fan Rewards</span>
          </div>
          <div>
            {status === "authenticated" ? (
              <div className="flex items-center gap-2">
                {session.user?.image && (
                  <div className="relative w-7 h-7 rounded-full overflow-hidden">
                    <Image src={session.user.image} alt={session.user.name ?? "User"} fill className="object-cover" />
                  </div>
                )}
                <span className="text-zinc-400 text-sm hidden sm:block">{session.user?.name?.split(" ")[0]}</span>
              </div>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-zinc-100 transition-all"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Fan Rewards
          </h1>
          <p className="text-zinc-400 text-lg max-w-lg mx-auto">
            Earn points by engaging with your favourite YouTube channels and unlock exclusive rewards.
          </p>
        </div>

        {/* Channel grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <div className="text-center py-20 text-zinc-600">
            <p className="text-xl mb-2">No channels yet</p>
            <p className="text-sm">An admin needs to add a channel first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/${channel.slug}`}
                className="group relative rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-hidden hover:border-purple-700/60 transition-all duration-200 hover:shadow-lg hover:shadow-purple-900/20"
              >
                {/* Thumbnail */}
                <div className="h-36 relative bg-zinc-800">
                  {channel.thumbnailUrl ? (
                    <Image src={channel.thumbnailUrl} alt={channel.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-purple-700 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">{channel.name[0]}</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent" />
                </div>

                {/* Info */}
                <div className="p-5">
                  <h2 className="text-white font-bold text-lg group-hover:text-purple-300 transition-colors">
                    {channel.name}
                  </h2>
                  {channel.description && (
                    <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{channel.description}</p>
                  )}
                  {channel.rewardTags && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {channel.rewardTags.split(",").map((tag) => (
                        <span key={tag} className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-[11px]">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                      <span>👥</span>
                      <span>{channel._count.userStats.toLocaleString()} fans</span>
                    </div>
                    <div className="ml-auto">
                      <span className="px-3 py-1.5 rounded-full bg-purple-900/40 border border-purple-700/40 text-purple-300 text-xs font-medium group-hover:bg-purple-800/50 transition-all">
                        Enter →
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-20 text-center space-y-3">
          <div>
            <Link href="/artist" className="text-zinc-500 text-sm hover:text-purple-400 transition-colors font-medium">
              🎨 Card artwork by Merle
            </Link>
          </div>
          <p className="text-zinc-700 text-xs">
            By signing in you agree to our{" "}
            <a href="/terms" className="underline hover:text-zinc-500">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" className="underline hover:text-zinc-500">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
