import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import {
  useLibraryCategoryBranches,
  useLibraryCategoryChildren,
} from "@/hooks/useIslamicBooks";
import { providerSearchCapabilities } from "@/lib/books";
import type {
  BookSearchMode,
  BookSearchSource,
  IslamicBookCategory,
} from "@/lib/books/types";

export type AdvancedSearchValue = {
  mode: BookSearchMode;
  query: string;
  author: string;
  categoryId: string;
  source: BookSearchSource;
};

const MODES: { id: BookSearchMode; label: string }[] = [
  { id: "free", label: "نص حر" },
  { id: "title", label: "اسم الكتاب" },
  { id: "author", label: "المؤلف" },
  { id: "category", label: "التصنيف" },
];

const SOURCES: { id: BookSearchSource; label: string }[] = [
  { id: "all", label: "جميع المصادر" },
  { id: "turath", label: "تراث" },
  { id: "islamhouse", label: "إسلام هاوس" },
  { id: "islamicapp", label: "إسلاميك" },
];

/** وصف صريح لقدرة كل مصدر — مبني على ما تحقّق منه، لا على وعود. */
const SOURCE_TRUTH: Record<BookSearchSource, string> = {
  all: "تراث: بحث نصي + تصنيف + مؤلف بمعرّف. إسلام هاوس: تصنيف + مؤلف بمعرّف فقط (لا بحث نصي). إسلاميك: بحث دلالي + تصنيف + مؤلف، مع فصول و PDF.",
  turath: "تراث يبحث نصيًا داخل المحتوى، ويقبل التصنيف ومعرّف المؤلف على الخادم. لا يقبل فلترة بالتصنيف وحده.",
  islamhouse:
    "إسلام هاوس بلا بحث نصي إطلاقًا؛ يفلتر بالتصنيف ومعرّف المؤلف على الخادم، والنص يُصفّى محليًا.",
  islamicapp:
    "إسلاميك: بحث دلالي على الخادم (عناوين وفصول)، و11 تصنيفًا، و332 مؤلفًا، وفهرس فصول وملف PDF. بلا مفتاح API.",
};

type Props = {
  visible: boolean;
  onClose: () => void;
  value: AdvancedSearchValue;
  onChange: (value: AdvancedSearchValue) => void;
  onSubmit: () => void;
  onReset: () => void;
};

export default function BookSearchSheet({
  visible,
  onClose,
  value,
  onChange,
  onSubmit,
  onReset,
}: Props) {
  const colors = useColors();

  /**
   * التصنيف: النافذة تبقى مُركَّبة حتى وهي مغلقة، فاستدعاءات
   * useLibraryCategoryBranches كانت تجلب شجرة التصنيفات **عند فتح شاشة
   * الكتب** لا عند فتح النافذة. الآن نجلبها فقط عندما تُفتح النافذة فعلًا
   * (فتصير التصفّح العادي بلا أي طلب).
   */
  const branchesQuery = useLibraryCategoryBranches(
    "islamhouse",
    { enabled: visible },
  );
  const branches = branchesQuery.data ?? [];
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const childrenQuery = useLibraryCategoryChildren(
    "islamhouse",
    expandedBranch ?? undefined,
    { enabled: visible },
  );
  const children = childrenQuery.data ?? [];

  const selectedCategory = findCategoryPath(branches, children, value.categoryId);
  const capabilities = providerSearchCapabilities("islamhouse");
  const turathCapabilities = providerSearchCapabilities("turath");
  const islamicAppCapabilities = providerSearchCapabilities("islamicapp");

  const canFilterByCategory =
    capabilities.canFilterByCategory ||
    turathCapabilities.canFilterByCategory ||
    islamicAppCapabilities.canFilterByCategory;
  const anyTextRequested = Boolean(value.query.trim() || value.author.trim());

  const set = (patch: Partial<AdvancedSearchValue>) =>
    onChange({ ...value, ...patch });

  const pickCategory = (category: IslamicBookCategory) => {
    set({
      categoryId: value.categoryId === category.id ? "" : category.id,
      mode: value.categoryId === category.id ? value.mode : "category",
    });
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <View style={styles.head}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إغلاق البحث المتقدم"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: colors.secondary,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Feather name="x" size={18} color={colors.primary} />
            </Pressable>
            <Text style={[styles.heading, { color: colors.foreground }]}>
              البحث المتقدم
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {/* طريقة البحث */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              طريقة البحث
            </Text>
            <View style={styles.chipWrap}>
              {MODES.map((mode) => {
                const selected = value.mode === mode.id;
                return (
                  <Pressable
                    key={mode.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`طريقة البحث ${mode.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => set({ mode: mode.id })}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: colors.primary },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}>
                      {mode.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* كلمة البحث */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              كلمة البحث
            </Text>
            <TextInput
              testID="adv-query"
              accessibilityLabel="كلمة البحث"
              placeholder="مثال: العقيدة الواسطية"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={(text) => set({ query: text })}
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={value.query}
            />

            {/* المؤلف */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              المؤلف (اسم أو معرّف رقمي)
            </Text>
            <TextInput
              testID="adv-author"
              accessibilityLabel="المؤلف"
              placeholder="مثال: ابن تيمية — أو معرّفًا رقميًا للفلترة على الخادم"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={(text) => set({ author: text })}
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={value.author}
            />

            {/* التصنيف */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              التصنيف
            </Text>
            {!canFilterByCategory ? (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                لا يدعم أي مصدر الفلترة بالتصنيف.
              </Text>
            ) : null}

            {branchesQuery.isPending ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.note, { color: colors.mutedForeground }]}>
                  جاري تحميل التصنيفات…
                </Text>
              </View>
            ) : null}

            {branchesQuery.isError ? (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                تعذّر تحميل التصنيفات — يمكنك البحث النصي بدلًا منها.
              </Text>
            ) : null}

            {branches.length > 0 ? (
              <>
                <View style={styles.chipWrap}>
                  {branches.map((branch) => {
                    const selected = value.categoryId === branch.id;
                    const open = expandedBranch === branch.id;
                    return (
                      <Pressable
                        key={branch.id}
                        accessibilityRole="button"
                        accessibilityLabel={`تصنيف ${branch.title}`}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          pickCategory(branch);
                          setExpandedBranch(open ? null : branch.id);
                        }}
                        style={[
                          styles.chip,
                          selected && { backgroundColor: colors.primary },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            {
                              color: selected
                                ? colors.primaryForeground
                                : colors.mutedForeground,
                            },
                          ]}>
                          {branch.title}
                        </Text>
                        <Feather
                          name={open ? "chevron-down" : "chevron-left"}
                          size={12}
                          color={
                            selected ? colors.primaryForeground : colors.mutedForeground
                          }
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {expandedBranch && childrenQuery.isPending ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={[styles.note, { color: colors.mutedForeground }]}>
                      جاري تحميل التصنيفات الفرعية…
                    </Text>
                  </View>
                ) : null}

                {children.length > 0 ? (
                  <View style={styles.chipWrap}>
                    {children.map((child) => {
                      const selected = value.categoryId === child.id;
                      return (
                        <Pressable
                          key={child.id}
                          accessibilityRole="button"
                          accessibilityLabel={`تصنيف ${child.title}`}
                          accessibilityState={{ selected }}
                          onPress={() => pickCategory(child)}
                          style={[
                            styles.subChip,
                            selected && { backgroundColor: colors.secondary },
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              {
                                color: selected
                                  ? colors.primary
                                  : colors.mutedForeground,
                              },
                            ]}>
                            {child.title}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : null}

            {selectedCategory ? (
              <Text style={[styles.note, { color: colors.primary }]}>
                التصنيف المختار: {selectedCategory.title}
              </Text>
            ) : null}

            {/* المصدر */}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              المصدر
            </Text>
            <View style={styles.chipWrap}>
              {SOURCES.map((source) => {
                const selected = value.source === source.id;
                return (
                  <Pressable
                    key={source.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`مصدر ${source.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => set({ source: source.id })}
                    style={[
                      styles.chip,
                      selected && { backgroundColor: colors.primary },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color: selected
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}>
                      {source.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={[
                styles.truth,
                { backgroundColor: colors.secondary, borderColor: colors.border },
              ]}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={[styles.truthText, { color: colors.mutedForeground }]}>
                {SOURCE_TRUTH[value.source]}
              </Text>
            </View>

            {anyTextRequested && value.source !== "islamhouse" ? (
              <Text style={[styles.note, { color: colors.mutedForeground }]}>
                تراث لا يبحث بالعنوان أو باسم المؤلف وحدهما؛ Elasticsearch يطابق
                داخل المحتوى، فنضيّق النتيجة محليًا على العنوان/المؤلف.
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="مسح الفلاتر"
              onPress={onReset}
              style={({ pressed }) => [
                styles.resetButton,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text style={[styles.resetText, { color: colors.primary }]}>
                مسح الفلاتر
              </Text>
            </Pressable>

            <Pressable
              testID="adv-submit"
              accessibilityRole="button"
              accessibilityLabel="بحث"
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <Feather name="search" size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                بحث
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** يبني مسار «اسم» من التصنيف المختار لعرضه (فرع ← ابن). */
function findCategoryPath(
  branches: IslamicBookCategory[],
  children: IslamicBookCategory[],
  categoryId: string,
): IslamicBookCategory | undefined {
  if (!categoryId) return undefined;
  return (
    branches.find((branch) => branch.id === categoryId) ??
    children.find((child) => child.id === categoryId)
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    maxHeight: "90%",
    paddingBottom: spacing.lg,
  },
  head: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  heading: {
    flex: 1,
    fontSize: typography.h1,
    fontWeight: "700",
    textAlign: "right",
  },
  body: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  label: {
    fontSize: typography.caption,
    fontWeight: "700",
    marginTop: spacing.xs,
    textAlign: "right",
  },
  input: {
    borderRadius: radii.sm,
    borderWidth: 1,
    fontSize: typography.body,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    textAlign: "right",
  },
  chipWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row-reverse",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  subChip: {
    alignItems: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: typography.bodySmall,
    fontWeight: "700",
  },
  inlineLoading: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs,
  },
  note: {
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "right",
  },
  truth: {
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.xs,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  truthText: {
    flex: 1,
    fontSize: typography.caption,
    lineHeight: 18,
    textAlign: "right",
  },
  actions: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  submitButton: {
    alignItems: "center",
    borderRadius: radii.md,
    flex: 1,
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: 50,
  },
  submitText: {
    fontSize: typography.body,
    fontWeight: "800",
  },
  resetButton: {
    alignItems: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  resetText: {
    fontSize: typography.body,
    fontWeight: "700",
  },
});
