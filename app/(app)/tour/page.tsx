"use client";

import { useRouter } from "next/navigation";
import { Tour, useTourSeen } from "@/components/Tour";

/** "Show the intro again" from the menu, like the app's tour screen. */
export default function TourPage() {
  const router = useRouter();
  const [, markTourSeen] = useTourSeen();
  return (
    <Tour
      onDone={() => {
        markTourSeen();
        if (window.history.length > 1) router.back();
        else router.replace("/");
      }}
    />
  );
}
