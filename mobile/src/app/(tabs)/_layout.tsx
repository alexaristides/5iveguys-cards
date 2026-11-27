import { NativeTabs } from "expo-router/unstable-native-tabs";
import { colors } from "@/lib/theme";

/** Three tabs: your team, your leagues, and how the game works. */
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={colors.accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>My Team</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tshirt.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="leagues">
        <NativeTabs.Trigger.Label>Leagues</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rules">
        <NativeTabs.Trigger.Label>How to play</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="questionmark.circle.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
