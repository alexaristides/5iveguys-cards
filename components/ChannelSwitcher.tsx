"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

interface Channel {
  id?: string;
  slug: string;
  name: string;
  thumbnailUrl?: string | null;
}

interface ChannelSwitcherProps {
  current: Channel;
  onSwitch?: () => void; // called after navigation (e.g. close sidebar)
}

function preservePath(currentSlug: string, newSlug: string, pathname: string): string {
  const prefix = `/${currentSlug}`;
  const sub = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  return `/${newSlug}${sub || ""}`;
}

export default function ChannelSwitcher({ current, onSwitch }: ChannelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Fetch channels lazily on first open
  useEffect(() => {
    if (!open || channels.length > 0) return;
    setLoading(true);
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => setChannels(data.channels ?? []))
      .finally(() => setLoading(false));
  }, [open, channels.length]);

  function navigate(slug: string) {
    setOpen(false);
    onSwitch?.();
    router.push(preservePath(current.slug, slug, pathname));
  }

  const others = channels.filter((c) => c.slug !== current.slug);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-1.5 py-1 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
        aria-label="Switch channel"
      >
        {current.thumbnailUrl ? (
          <div className="w-8 h-8 rounded-full overflow-hidden relative shrink-0">
            <Image src={current.thumbnailUrl} alt={current.name} fill className="object-cover" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{current.name[0]}</span>
          </div>
        )}
        <span className="text-gray-900 dark:text-white font-semibold text-sm tracking-tight hidden sm:block">
          {current.name}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 hidden sm:block transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-xl overflow-hidden z-50">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {others.length > 0 && (
                <div className="py-1.5">
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    Switch channel
                  </p>
                  {others.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => navigate(ch.slug)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      {ch.thumbnailUrl ? (
                        <div className="w-7 h-7 rounded-full overflow-hidden relative shrink-0">
                          <Image src={ch.thumbnailUrl} alt={ch.name} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                          <span className="text-white text-xs font-bold">{ch.name[0]}</span>
                        </div>
                      )}
                      <span className="text-gray-800 dark:text-zinc-200 text-sm font-medium truncate">
                        {ch.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Divider + All Channels */}
              <div className={`border-t border-gray-100 dark:border-zinc-800 py-1.5 ${others.length === 0 ? "pt-1.5" : ""}`}>
                <button
                  onClick={() => { setOpen(false); onSwitch?.(); router.push("/"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
                >
                  <div className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">All channels</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
