import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CHANNELS, type ChannelSlug } from "./config";

const KEY = "channel_slug";

interface ChannelState {
  slug: ChannelSlug;
  name: string;
  /** Whether the user has entered a world yet: null while the saved choice loads. */
  chosen: boolean | null;
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
  const [chosen, setChosen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        const valid = CHANNELS.some((c) => c.slug === saved);
        if (valid) setSlugState(saved as ChannelSlug);
        setChosen(valid);
      })
      .catch(() => setChosen(false));
  }, []);

  const setSlug = (next: ChannelSlug) => {
    setSlugState(next);
    setChosen(true);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  };

  const name = CHANNELS.find((c) => c.slug === slug)!.name;
  return <ChannelContext.Provider value={{ slug, name, chosen, setSlug }}>{children}</ChannelContext.Provider>;
}
