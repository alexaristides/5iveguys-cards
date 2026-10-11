import { NativeTabs } from "expo-router/unstable-native-tabs";
import { FEATURES } from "@/lib/config";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.accentHi} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>YouTube</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="play.rectangle.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="players">
        <NativeTabs.Trigger.Label>Players</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.3.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards" hidden={!FEATURES.packs}>
        <NativeTabs.Trigger.Label>Cards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="rectangle.stack.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="fantasy" hidden={!FEATURES.fantasy}>
        <NativeTabs.Trigger.Label>Fantasy</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="game" hidden={!FEATURES.game}>
        <NativeTabs.Trigger.Label>Game</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="soccerball" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
