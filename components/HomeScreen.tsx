"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SignInScreen } from "@/components/SignInScreen";
import { Tour, useTourSeen } from "@/components/Tour";

/**
 * The home page is the app's first launch: the intro (once per browser), then the sign-in screen.
 * Signed in, it's My Team.
 */
export function HomeScreen() {
  const { status } = useSession();
  const router = useRouter();
  const [tourSeen, markTourSeen] = useTourSeen();

  useEffect(() => {
    if (status === "authenticated") router.replace("/fantasy");
  }, [status, router]);

  if (status !== "unauthenticated" || tourSeen === null) {
    return (
      <div className="min-h-[100dvh] bg-lilac flex items-center justify-center [color-scheme:light]">
        <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!tourSeen) return <Tour onDone={markTourSeen} />;
  return <SignInScreen callbackUrl="/fantasy" />;
}
