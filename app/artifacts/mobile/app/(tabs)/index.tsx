import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  DailyVerse,
  IconButton,
  PrayerCard,
  QuickAction,
  ReadingCard,
  Screen,
  SectionTitle,
} from "@/components/ui";
import { spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import { useResumeReading } from "@/hooks/useResumeReading";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  // "أكمل وردك" — آخر موضع محفوظ، أو الفاتحة عند أول استخدام (بلا فتح فاشل)
  const resume = useResumeReading();
  const openResume = () => {
    const target = resume ?? {
      surahId: 1,
      surahName: "الفاتحة",
      ayahNumber: 1,
    };
    router.push({
      pathname: "/quran-reader",
      params: {
        surahId: String(target.surahId),
        ...(target.surahName ? { surah: target.surahName } : {}),
      },
    });
  };
  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            السلام عليكم
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            يوم مبارك
          </Text>
          <Text style={[styles.date, { color: colors.primary }]}>
            رفيقك اليومي للقرآن والذكر
          </Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            icon="heart"
            label="المفضلة"
            onPress={() => router.push("/favorites")}
            variant="soft"
          />
          <IconButton
            icon="sliders"
            label="الإعدادات"
            onPress={() => router.push("/settings")}
            variant="soft"
          />
        </View>
      </View>

      <PrayerCard onPress={() => router.push("/prayer")} />

      <SectionTitle title="الوصول السريع" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickActions}>
        <QuickAction
          icon="download"
          label="تحميل القرآن"
          onPress={() => router.push("/quran-download")}
        />
        <QuickAction
          icon="clock"
          label="مواقيت الصلاة"
          onPress={() => router.push("/(tabs)/prayer")}
        />
        <QuickAction
          icon="message-circle"
          label="الأحاديث"
          onPress={() => router.push("/(tabs)/hadith")}
        />

        <QuickAction
          icon="book-open"
          label="المصحف"
          onPress={() => router.push("/(tabs)/quran")}
        />
        <QuickAction
          icon="compass"
          label="القبلة"
          onPress={() => router.push("/qibla")}
        />
      </ScrollView>

      <SectionTitle
        title="أكمل وردك"
        action="فتح المصحف"
        onAction={openResume}
      />
      <ReadingCard onPress={openResume} />

      <SectionTitle title="من وحي اليوم" />
      <DailyVerse />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="فتح المفضلة"
        onPress={() => router.push("/favorites")}
        style={({ pressed }) => [
          styles.footerLink,
          { opacity: pressed ? 0.6 : 1 },
        ]}>
        <Feather name="bookmark" size={15} color={colors.primary} />
        <Text style={[styles.footerText, { color: colors.primary }]}>
          كل ما حفظته يبقى قريبًا منك
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "flex-start",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerActions: { flexDirection: "row-reverse", gap: 8 },
  headerCopy: { alignItems: "flex-end", flex: 1 },
  greeting: { fontSize: typography.body, fontWeight: "500" },
  title: { fontSize: typography.display, fontWeight: "700", marginTop: 2 },
  date: { fontSize: typography.bodySmall, fontWeight: "600", marginTop: 8 },
  quickActions: {
    flexDirection: "row-reverse",
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  footerLink: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row-reverse",
    gap: 6,
    marginTop: spacing.xl,
  },
  footerText: { fontSize: typography.caption, fontWeight: "600" },
});
