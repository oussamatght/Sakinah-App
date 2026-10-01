import React from "react";

import { Platform, StyleSheet, useColorScheme, View } from "react-native";

import { useColors } from "@/hooks/useColors";

import { Feather } from "@expo/vector-icons";

import { BlurView } from "expo-blur";

import { isLiquidGlassAvailable } from "expo-glass-effect";

import { Tabs } from "expo-router";

import { NativeTabs } from "expo-router/unstable-native-tabs";

import { SymbolView } from "expo-symbols";

// IMPORTANT:
// iOS 26 uses NativeTabs for native tabs with Liquid Glass support.
// NativeTabs intentionally does NOT use custom design tokens.
// Classic Tabs is used on older iOS, Android and web.
//
// Tab set:
// home / quran / prayer / tasbih / hadith / books

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
        />
        <NativeTabs.Trigger.Label>الرئيسية</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="quran">
        <NativeTabs.Trigger.Icon
          sf={{ default: "book.closed", selected: "book.closed.fill" }}
        />
        <NativeTabs.Trigger.Label>القرآن</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="prayer">
        <NativeTabs.Trigger.Icon
          sf={{ default: "clock", selected: "clock.fill" }}
        />
        <NativeTabs.Trigger.Label>الصلاة</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasbih">
        <NativeTabs.Trigger.Icon
          sf={{ default: "circle.circle", selected: "circle.circle.fill" }}
        />
        <NativeTabs.Trigger.Label>التسبيح</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="hadith">
        <NativeTabs.Trigger.Icon
          sf={{ default: "text.quote", selected: "text.quote" }}
        />
        <NativeTabs.Trigger.Label>الأحاديث</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dhikr">
        <NativeTabs.Trigger.Icon
          sf={{ default: "sparkles", selected: "sparkles" }}
        />
        <NativeTabs.Trigger.Label>الأذكار</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/* NEW: Islamic Books */}
      <NativeTabs.Trigger name="books">
        <NativeTabs.Trigger.Icon
          sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
        />
        <NativeTabs.Trigger.Label>الكتب</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="quran"
        options={{
          title: "القرآن",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="book.closed" tintColor={color} size={22} />
            ) : (
              <Feather name="book-open" size={21} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="prayer"
        options={{
          title: "الصلاة",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clock" tintColor={color} size={22} />
            ) : (
              <Feather name="clock" size={21} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="tasbih"
        options={{
          title: "التسبيح",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="circle.circle" tintColor={color} size={22} />
            ) : (
              <Feather name="target" size={21} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="hadith"
        options={{
          title: "الأحاديث",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="text.quote" tintColor={color} size={22} />
            ) : (
              <Feather name="message-circle" size={21} color={color} />
            ),
        }}
      />

      <Tabs.Screen
        name="dhikr"
        options={{
          title: "الأذكار",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="sparkles" tintColor={color} size={22} />
            ) : (
              <Feather name="sun" size={21} color={color} />
            ),
        }}
      />

      {/* NEW: Islamic Books */}
      <Tabs.Screen
        name="books"
        options={{
          title: "الكتب",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="books.vertical" tintColor={color} size={22} />
            ) : (
              <Feather name="book" size={21} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  let nativeTabsAvailable = false;

  if (Platform.OS === "ios") {
    try {
      nativeTabsAvailable = isLiquidGlassAvailable();
    } catch (error) {
      if (__DEV__) {
        console.error("Native liquid glass tabs are unavailable:", error);
      }
    }
  }

  if (nativeTabsAvailable) {
    return <NativeTabLayout />;
  }

  return <ClassicTabLayout />;
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/RouteErrorBoundary";
