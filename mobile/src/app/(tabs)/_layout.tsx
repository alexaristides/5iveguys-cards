import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.accentHi} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>YouTube</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="play.rectangle.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cards">
        <NativeTabs.Trigger.Label>Cards</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="rectangle.stack.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="fantasy">
        <NativeTabs.Trigger.Label>Fantasy</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="game">
        <NativeTabs.Trigger.Label>Game</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="soccerball" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
