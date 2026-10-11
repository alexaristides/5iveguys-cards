import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHANNELS, type ChannelSlug } from "./config";

const KEY = "channel_slug";

interface ChannelState {
  slug: ChannelSlug;
  name: string;
  setSlug: (slug: ChannelSlug) => void;
}

const ChannelContext = createContext<ChannelState | null>(null);

export function useChannel() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error("useChannel outside ChannelProvider");
  return ctx;
}

export function ChannelProvider({ children }: { children: ReactNode }) {
  const [slug, setSlugState] = useState<ChannelSlug>(CHANNELS[0].slug);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (CHANNELS.some((c) => c.slug === saved)) setSlugState(saved as ChannelSlug);
      })
      .catch(() => {});
  }, []);

  const setSlug = (next: ChannelSlug) => {
    setSlugState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  };

  const name = CHANNELS.find((c) => c.slug === slug)!.name;
  return <ChannelContext.Provider value={{ slug, name, setSlug }}>{children}</ChannelContext.Provider>;
}
