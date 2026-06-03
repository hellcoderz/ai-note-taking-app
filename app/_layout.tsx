import { Stack } from "expo-router";
import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { LogBox } from "react-native";

LogBox.ignoreLogs([
  "This function will call a synchronous interrupt on the instance of LLMModule from React Native ExecuTorch",
  "Passing response callback is deprecated and will be removed in 0.6.0"
]);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: "Notes" }} />
          <Stack.Screen name="note/[id]" options={{ title: "Note Editor" }} />
          <Stack.Screen name="ai-assistant" options={{ title: "AI Assistant", presentation: "modal" }} />
        </Stack>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
