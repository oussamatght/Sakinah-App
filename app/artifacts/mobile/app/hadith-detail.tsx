import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGetHadithDetail } from "@/lib/api";
import {
  AppHeader,
  ErrorState,
  IconButton,
  isOfflineError,
  LoadingState,
  Screen,
} from "@/components/ui";
import { FavoriteButton } from "@/components/FavoriteButton";
import { GradeBadge } from "@/components/GradeBadge";
import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";

/**
 * تفصيل الحديث — المسار الوحيد الذي تُعرض فيه الدرجة كما أعطاها المصدر:
 *   - HadeethEnc /hadeeths/one يقدم grade/attribution/explanation/reference
 *     (مُتحقق حيًا). الدرجة تُعرض حرفيًا بلا أي تحوير — GradeBadge لا يستنتج.
 *   - hadis-api-id (الكتب التسعة) لا يقدم تفصيلًا أصلًا (قوائم فقط بالحقول
 *     number/arab/id) — لذا بطاقات الكتب لا تفتح هذا التفصيل إطلاقًا: كل ما
 *     يقدمه المصدر معروض بالفعل في بطاقة القائمة.
 *   - إن لم يقدم المصدر درجة، GradeBadge (showMissing) يعرض «درجة الحديث غير
 *     متوفرة» — غياب الدرجة ليس خطأ.
 */

export default function HadithDetail() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; hadithId?: string }>();
  const hadithId = params.hadithId ?? params.id ?? null;
  const detailQuery = useGetHadithDetail(hadithId);
  const item = detailQuery.data;

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-right"
          label="العودة"
          onPress={() => router.back()}
          variant="soft"
        />
        <View style={styles.titleCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>تفصيل الحديث</Text>
        </View>
      </View>

      {detailQuery.isPending ? <LoadingState /> : null}
      {detailQuery.isError ? (
        <ErrorState
          offline={isOfflineError(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      ) : null}

      {item ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>
          {/* نص الحديث — متن الحديث الحقيقي فقط، لا يُخلط أبدًا مع الشرح */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.hadithText, { color: colors.foreground }]}>{item.text}</Text>
            <FavoriteButton
              item={{
                kind: "hadith",
                refId: item.id,
                title: item.text.slice(0, 60),
                text: item.text.slice(0, 220),
                subtitle: item.book,
              }}
            />
          </View>

          {/* الدرجة من المصدر حرفيًا — أو «درجة الحديث غير متوفرة» إن لم يقدمها */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.badgeRow}>
              <GradeBadge grade={item.grade} showMissing />
            </View>
            {item.attribution ? (
              <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                الراوي: {item.attribution}
              </Text>
            ) : null}
            {item.reference ? (
              <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
                المصدر: {item.reference}
              </Text>
            ) : null}
          </View>

          {/* الشرح من المصدر — قسم مستقل بذاته ولا يُعرض مكان متن الحديث */}
          {item.explanation ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionHead}>
                <Feather name="book-open" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>الشرح</Text>
              </View>
              <Text style={[styles.explanationText, { color: colors.foreground }]}>
                {item.explanation}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  titleCopy: { alignItems: "flex-end", flex: 1 },
  title: { fontSize: typography.h1, fontWeight: "700", textAlign: "right" },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  card: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  hadithText: {
    fontSize: typography.bodyLarge,
    lineHeight: 34,
    marginBottom: spacing.sm,
    textAlign: "right",
  },
  badgeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.sm },
  metaLine: { fontSize: typography.caption, marginTop: spacing.xs, textAlign: "right" },
  sectionHead: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: typography.body, fontWeight: "700", textAlign: "right" },
  explanationText: { fontSize: typography.body, lineHeight: 28, textAlign: "right" },
});
