import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
};

export default function BookSearchBar({
  value,
  onChangeText,
  onClear,
  placeholder = "ابحث عن كتاب أو مؤلف...",
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="search-outline" size={21} color="#777" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        style={styles.input}
        textAlign="right"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={onClear} hitSlop={10}>
          <Ionicons name="close-circle" size={20} color="#999" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F6F6F6",
    borderRadius: 15,
    paddingHorizontal: 14,
    gap: 9,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  input: {
    flex: 1,
    color: "#222",
    fontSize: 15,
    paddingVertical: 0,
  },
});
