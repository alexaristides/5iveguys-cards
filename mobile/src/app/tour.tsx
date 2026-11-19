import { router } from "expo-router";
import { Tour } from "@/components/Tour";

/** The welcome tour again, from Settings. */
export default function TourScreen() {
  return <Tour onDone={() => router.back()} />;
}
