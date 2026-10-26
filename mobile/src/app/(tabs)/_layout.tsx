import { View } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { WorldChooser } from "@/components/WorldChooser";
import { useChannel } from "@/lib/channel";
import { FEATURES } from "@/lib/config";
import { colors } from "@/lib/theme";

export default function TabsLayout() {
  const { chosen } = useChannel();
  // Until the user has entered a world, the two worlds stand in for the tabs.
  if (chosen === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!chosen) return <WorldChooser />;

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
