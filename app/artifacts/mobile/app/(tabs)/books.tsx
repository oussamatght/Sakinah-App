import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import BookCard from "../../components/BookCard";
import BookEmptyState from "../../components/BookEmptyState";
import BookSearchBar from "../../components/BookSearchBar";
import { useSearchIslamicBooks } from "../../hooks/useIslamicBooks";
import type { IslamicBook } from "../../types/islamicBooksTypes";

const PAGE_SIZE = 20;

export default function BooksTab() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useSearchIslamicBooks(query, 1, PAGE_SIZE);

  const books = useMemo<IslamicBook[]>(() => data?.items ?? [], [data]);

  const openBook = (book: IslamicBook) => {
    router.push({
      pathname: "/book-details",
      params: {
        id: book.id,
        source: book.source,
        rawId: String(book.rawId),
        title: book.title,
      },
    });
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={books}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookCard book={item} onPress={() => openBook(item)} />
        )}
        contentContainerStyle={[
          styles.listContent,
          books.length === 0 && styles.emptyList,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={refetch}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Ionicons name="library-outline" size={25} color="#6D4C41" />
              </View>

              <View style={styles.headerText}>
                <Text style={styles.title}>الكتب الإسلامية</Text>
                <Text style={styles.subtitle}>كتب من تراث وإسلام هاوس</Text>
              </View>
            </View>

            <BookSearchBar
              value={search}
              onChangeText={setSearch}
              onClear={() => setSearch("")}
            />

            <View style={styles.sourceRow}>
              <View style={styles.sourcePill}>
                <Text style={styles.sourceText}>تراث</Text>
              </View>

              <View style={styles.sourcePillBlue}>
                <Text style={styles.sourceText}>إسلام هاوس</Text>
              </View>

              <Text style={styles.resultText}>
                {query ? `${books.length} نتيجة` : `${books.length} كتاب`}
              </Text>
            </View>

            {isError && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={20} color="#A94442" />

                <Text style={styles.errorText}>
                  حدث خطأ أثناء تحميل الكتب.
                  {"\n"}
                  {error instanceof Error
                    ? error.message
                    : "تحقق من اتصال الإنترنت."}
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>جاري تحميل الكتب...</Text>
            </View>
          ) : (
            <BookEmptyState
              title={query ? "لم نجد نتائج" : "لا توجد كتب"}
              message={
                query
                  ? "جرّب عنوان كتاب أو اسم مؤلف مختلف."
                  : "لم يتم العثور على كتب من مصدر إسلام هاوس."
              }
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 30,
  },
  emptyList: {
    flexGrow: 1,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 16,
  },
  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: "#F1E7E1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#202124",
    textAlign: "right",
  },
  subtitle: {
    fontSize: 13,
    color: "#777",
    marginTop: 3,
    textAlign: "right",
  },
  sourceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
    marginVertical: 14,
  },
  sourcePill: {
    backgroundColor: "#F1E7E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sourcePillBlue: {
    backgroundColor: "#E7F0FA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#555",
  },
  resultText: {
    flex: 1,
    textAlign: "left",
    color: "#888",
    fontSize: 12,
  },
  errorBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDECEC",
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: "#8A3A38",
    fontSize: 12,
    lineHeight: 19,
    textAlign: "right",
  },
  loading: {
    alignItems: "center",
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 10,
    color: "#777",
    fontSize: 14,
  },
});
