"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/Navbar";

interface ChannelInfo {
  id: string;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
}

export default function ChannelShell({
  children,
  channel,
}: {
  children: React.ReactNode;
  channel: ChannelInfo;
}) {
  const { data: session, status } = useSession();
  const [points, setPoints] = useState(0);

  const fetchPoints = useCallback(async () => {
    const res = await fetch(`/api/user?channelSlug=${channel.slug}`);
    if (res.ok) {
      const data = await res.json();
      setPoints(data.points ?? 0);
    }
  }, [channel.slug]);

  // Ensure UserChannelStats exists (grants 100 pts on first visit) and fetch points
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/channels/${channel.slug}/join`, { method: "POST" }).then(() => fetchPoints());
  }, [status, channel.slug, fetchPoints]);

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h2 className="text-white text-2xl font-bold mb-2">{channel.name}</h2>
          <p className="text-zinc-500 mb-6">Sign in to earn points and collect cards</p>
          <button
            onClick={() => signIn("google")}
            className="flex items-center gap-3 mx-auto px-8 py-4 rounded-2xl bg-white text-black font-semibold hover:bg-zinc-100 transition-all"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect with YouTube
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Navbar
        user={session!.user}
        points={points}
        channel={{ slug: channel.slug, name: channel.name, thumbnailUrl: channel.thumbnailUrl }}
      />
      {children}
    </>
  );
}
