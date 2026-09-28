import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import type { IslamicBook } from "@/lib/books/types";

type Props = {
  book: IslamicBook;
  onPress: () => void;
};

function sourceLabel(source: IslamicBook["source"]): string {
  return source === "turath" ? "تراث" : "إسلام هاوس";
}

export default function BookCard({ book, onPress }: Props) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`فتح ${book.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
        {book.coverUrl ? (
          <Feather name="image" size={20} color={colors.primary} />
        ) : (
          <Feather name="book-open" size={20} color={colors.primary} />
        )}
      </View>

      <View style={styles.content}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            { color: colors.foreground },
          ]}>
          {book.title}
        </Text>

        {book.author ? (
          <View style={styles.row}>
            <Feather name="user" size={13} color={colors.mutedForeground} />
            <Text
              numberOfLines={1}
              style={[styles.author, { color: colors.mutedForeground }]}>
              {book.author}
            </Text>
          </View>
        ) : null}

        {book.description ? (
          <Text
            numberOfLines={2}
            style={[styles.description, { color: colors.mutedForeground }]}>
            {book.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  book.source === "turath"
                    ? colors.accent
                    : colors.secondary,
              },
            ]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {sourceLabel(book.source)}
            </Text>
          </View>

          <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  iconBox: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  content: {
    alignItems: "flex-end",
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.body,
    fontWeight: "700",
    lineHeight: 23,
    textAlign: "right",
    width: "100%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 5,
    marginTop: 5,
    width: "100%",
  },
  author: {
    flex: 1,
    fontSize: typography.caption,
    textAlign: "right",
  },
  description: {
    fontSize: typography.caption,
    lineHeight: 18,
    marginTop: 5,
    textAlign: "right",
    width: "100%",
  },
  footer: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 9,
    width: "100%",
  },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: typography.caption,
    fontWeight: "700",
  },
});