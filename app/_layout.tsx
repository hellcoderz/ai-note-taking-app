import { Stack } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { LogBox } from "react-native";
import { TTSProvider } from "../contexts/TTSContext";
import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";

initExecutorch({ resourceFetcher: ExpoResourceFetcher });
LogBox.ignoreLogs([
  "This function will call a synchronous interrupt on the instance of LLMModule from React Native ExecuTorch",
  "Passing response callback is deprecated and will be removed in 0.6.0",
  "Looks like you have configured linking in multiple places"
]);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <TTSProvider>
          <Stack>
            <Stack.Screen name="index" options={{ title: "Notes" }} />
            <Stack.Screen name="note/[id]" options={{ title: "Note Editor" }} />
            <Stack.Screen name="ai-assistant" options={{ title: "AI Assistant", presentation: "modal" }} />
            <Stack.Screen name="logs" options={{ title: "Logs", presentation: "modal" }} />
          </Stack>
        </TTSProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
