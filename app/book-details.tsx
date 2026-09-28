import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  useIslamHouseAttachments,
  useIslamHouseBook,
  useTurathBook,
} from "../useIslamicBooks";
import type { IslamicBook } from "../islamicBooksTypes";

export default function BookDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    source?: string;
    rawId?: string;
    title?: string;
  }>();

  const source = params.source === "islamhouse" ? "islamhouse" : "turath";
  const rawId = String(params.rawId ?? "");

  const turathQuery = useTurathBook(
    source === "turath" && rawId ? rawId : ""
  );
  const islamHouseQuery = useIslamHouseBook(
    source === "islamhouse" && rawId ? rawId : ""
  );
  const attachmentsQuery = useIslamHouseAttachments(
    source === "islamhouse" && rawId ? rawId : ""
  );

  const book = useMemo<IslamicBook | undefined>(() => {
    if (source === "turath") return turathQuery.data;
    return islamHouseQuery.data;
  }, [source, turathQuery.data, islamHouseQuery.data]);

  const loading =
    source === "turath" ? turathQuery.isLoading : islamHouseQuery.isLoading;

  const error = source === "turath" ? turathQuery.isError : islamHouseQuery.isError;

  const openUrl = async (url?: string) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "تفاصيل الكتاب",
          headerBackTitle: "رجوع",
        }}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>جاري تحميل الكتاب...</Text>
          </View>
        ) : error || !book ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color="#999" />
            <Text style={styles.errorTitle}>تعذر تحميل الكتاب</Text>
            <Text style={styles.errorText}>
              تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى.
            </Text>
            <Pressable
              style={styles.retry}
              onPress={() =>
                source === "turath"
                  ? turathQuery.refetch()
                  : islamHouseQuery.refetch()
              }
            >
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.cover}>
              <Ionicons name="book" size={62} color="#6D4C41" />
            </View>

            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>
                {book.source === "turath" ? "تراث" : "إسلام هاوس"}
              </Text>
            </View>

            <Text style={styles.title}>{book.title}</Text>

            {!!book.author && (
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={18} color="#777" />
                <Text style={styles.infoText}>{book.author}</Text>
              </View>
            )}

            {!!book.category && (
              <View style={styles.infoRow}>
                <Ionicons name="folder-open-outline" size={18} color="#777" />
                <Text style={styles.infoText}>{book.category}</Text>
              </View>
            )}

            {!!book.description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>عن الكتاب</Text>
                <Text style={styles.description}>{book.description}</Text>
              </View>
            )}

            <View style={styles.actions}>
              {!!book.url && (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => openUrl(book.url)}
                >
                  <Ionicons name="open-outline" size={19} color="#FFF" />
                  <Text style={styles.primaryText}>فتح المصدر</Text>
                </Pressable>
              )}

              {!!book.downloadUrl && (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => openUrl(book.downloadUrl)}
                >
                  <Ionicons name="download-outline" size={19} color="#6D4C41" />
                  <Text style={styles.secondaryText}>تحميل الكتاب</Text>
                </Pressable>
              )}
            </View>

            {source === "islamhouse" && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>المرفقات</Text>
                {attachmentsQuery.isLoading ? (
                  <ActivityIndicator />
                ) : attachmentsQuery.data?.length ? (
                  attachmentsQuery.data.map((attachment) => (
                    <Pressable
                      key={attachment.id}
                      style={styles.attachment}
                      onPress={() => openUrl(attachment.url)}
                    >
                      <Ionicons
                        name="document-outline"
                        size={20}
                        color="#1565C0"
                      />
                      <Text style={styles.attachmentText} numberOfLines={2}>
                        {attachment.title || "ملف الكتاب"}
                      </Text>
                      <Ionicons
                        name="chevron-back"
                        size={18}
                        color="#999"
                      />
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.muted}>لا توجد مرفقات متاحة.</Text>
                )}
              </View>
            )}

            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backText}>العودة إلى الكتب</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 90,
    paddingHorizontal: 25,
  },
  loadingText: {
    marginTop: 12,
    color: "#777",
  },
  errorTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#333",
    marginTop: 12,
  },
  errorText: {
    color: "#777",
    textAlign: "center",
    marginTop: 7,
  },
  retry: {
    marginTop: 18,
    backgroundColor: "#6D4C41",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  retryText: {
    color: "#FFF",
    fontWeight: "700",
  },
  cover: {
    width: 125,
    height: 165,
    borderRadius: 18,
    backgroundColor: "#F1E7E1",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    marginBottom: 14,
  },
  sourceBadge: {
    alignSelf: "center",
    backgroundColor: "#EDEDED",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555",
  },
  title: {
    fontSize: 24,
    lineHeight: 33,
    fontWeight: "800",
    color: "#202124",
    textAlign: "center",
    marginTop: 12,
  },
  infoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 9,
  },
  infoText: {
    color: "#777",
    fontSize: 14,
    textAlign: "center",
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2B2B2B",
    textAlign: "right",
    marginBottom: 9,
  },
  description: {
    color: "#555",
    fontSize: 15,
    lineHeight: 27,
    textAlign: "right",
  },
  actions: {
    gap: 10,
    marginTop: 22,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#6D4C41",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#F1E7E1",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryText: {
    color: "#6D4C41",
    fontSize: 15,
    fontWeight: "800",
  },
  attachment: {
    minHeight: 55,
    borderRadius: 14,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#ECECEC",
    paddingHorizontal: 13,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attachmentText: {
    flex: 1,
    color: "#444",
    fontSize: 14,
    textAlign: "right",
  },
  muted: {
    color: "#888",
    textAlign: "right",
  },
  backButton: {
    marginTop: 25,
    alignItems: "center",
    paddingVertical: 12,
  },
  backText: {
    color: "#6D4C41",
    fontWeight: "700",
  },
});
