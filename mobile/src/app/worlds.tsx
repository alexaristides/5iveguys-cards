import { router } from "expo-router";
import { WorldChooser } from "@/components/WorldChooser";

/** Switch worlds, opened from the world button in the header. */
export default function WorldsScreen() {
  return <WorldChooser onClose={() => router.back()} />;
}
