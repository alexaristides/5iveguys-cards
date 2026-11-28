"use client";

import { useState } from "react";
import Image from "next/image";
import { card } from "@/components/AppShell";
import { quoteOfTheDay } from "@/lib/oscar-quotes";

/**
 * Oscar's quote of the day on My Team, as in the app (mobile/src/components/fantasy/OscarQuote.tsx), like
 * the old Fantasy 5ive home page. Click for another. `imageUrl` is Oscar's card.
 */
export function OscarQuote({ imageUrl }: { imageUrl: string | null }) {
  const [offset, setOffset] = useState(0);
  const [now] = useState(() => Date.now());
  return (
    <button
      type="button"
      onClick={() => setOffset((o) => o + 1)}
      className={`${card} w-full p-4 flex items-start gap-3.5 text-left hover:shadow-[0_6px_18px_rgba(46,16,101,0.12)] active:opacity-80 transition`}
    >
      <span className="relative block w-12 shrink-0 aspect-[785/1085] overflow-hidden rounded-lg bg-lilac-2">
        {imageUrl && <Image src={imageUrl} alt="" fill sizes="48px" className="object-cover" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-ink-3 text-[11px] font-black tracking-[0.8px]">💬 OSCAR&apos;S QUOTE OF THE DAY</span>
        <span className="block mt-1.5 text-ink text-base leading-snug font-semibold italic">“{quoteOfTheDay(now, offset)}”</span>
        <span className="block mt-2 text-violet-600 text-sm font-extrabold">— Oscar <span className="text-ink-3 font-semibold">· tap for another</span></span>
      </span>
    </button>
  );
}
