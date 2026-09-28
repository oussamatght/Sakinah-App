import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title?: string;
  message?: string;
};

export default function BookEmptyState({
  title = "لا توجد كتب",
  message = "جرّب كلمة بحث أخرى.",
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Ionicons name="book-outline" size={34} color="#888" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  icon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F3F3F3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  message: {
    fontSize: 14,
    color: "#888",
    marginTop: 6,
    textAlign: "center",
  },
});
