import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IslamicBook } from "../types/islamicBooksTypes";

type Props = {
  book: IslamicBook;
  onPress: () => void;
};

export default function BookCard({ book, onPress }: Props) {
  const isTurath = book.source === "turath";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.iconBox}>
        <Ionicons
          name="book-outline"
          size={26}
          color={isTurath ? "#6D4C41" : "#1565C0"}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>

        {!!book.author && (
          <View style={styles.row}>
            <Ionicons name="person-outline" size={14} color="#777" />
            <Text style={styles.author} numberOfLines={1}>
              {book.author}
            </Text>
          </View>
        )}

        {!!book.category && (
          <Text style={styles.category} numberOfLines={1}>
            {book.category}
          </Text>
        )}

        <View style={styles.footer}>
          <View
            style={[
              styles.badge,
              isTurath ? styles.turathBadge : styles.islamHouseBadge,
            ]}
          >
            <Text style={styles.badgeText}>
              {isTurath ? "تراث" : "إسلام هاوس"}
            </Text>
          </View>

          <Ionicons name="chevron-back" size={18} color="#999" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ECECEC",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: "#F7F4F1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#202124",
    textAlign: "right",
    lineHeight: 23,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    marginTop: 5,
  },
  author: {
    flex: 1,
    color: "#6D6D6D",
    fontSize: 13,
    textAlign: "right",
  },
  category: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  turathBadge: {
    backgroundColor: "#F1E7E1",
  },
  islamHouseBadge: {
    backgroundColor: "#E7F0FA",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
  },
});
