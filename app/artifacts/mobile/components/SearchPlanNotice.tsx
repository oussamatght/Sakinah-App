import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { radii, spacing, typography } from "@/constants/tokens";
import { useColors } from "@/hooks/useColors";
import type { BookSearchNotice } from "@/lib/books/types";

const SCOPE_META = {
  server: { label: "على الخادم", icon: "cloud" as const },
  client: { label: "محلي", icon: "smartphone" as const },
  unsupported: { label: "غير مدعوم", icon: "minus-circle" as const },
};

/**
 * تقرير صريح لما جرى في البحث: أي فلتر نفّذه المصدر على خادمه، وأي فلتر
 * تصفّى محليًا، وأي قيد يمنع تنفيذ طلب حقيقي. لا نخفي الفارق.
 */
export default function SearchPlanNotice({
  notices,
}: {
  notices: BookSearchNotice[] | undefined;
}) {
  const colors = useColors();
  if (!notices || notices.length === 0) return null;

  return (
    <View
      testID="search-plan"
      style={[
        styles.box,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}>
      {notices.map((notice, index) => (
        // index + المصدر: خط دفاع ثانٍ ضد تكرار المفتاح لو تكرّر المصدر
        // (الدفاع الأساسي هو mergeNotices في lib/books/index.ts).
        <View
          key={`${notice.source}-${index}`}
          style={styles.sourceBlock}>
          <Text style={[styles.sourceName, { color: colors.foreground }]}>
            {notice.sourceName}
          </Text>

          {notice.steps.map((step) => {
            const meta = SCOPE_META[step.scope];
            return (
              <View key={step.label} style={styles.step}>
                <Feather
                  name={meta.icon}
                  size={12}
                  color={
                    step.scope === "server"
                      ? colors.primary
                      : colors.mutedForeground
                  }
                />
                <Text style={[styles.stepText, { color: colors.mutedForeground }]}>
                  {step.label} — {meta.label}
                </Text>
              </View>
            );
          })}

          {notice.limits.map((limit, index) => (
            <Text
              key={`${notice.source}-limit-${index}`}
              style={[styles.limit, { color: colors.mutedForeground }]}>
              • {limit}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  sourceBlock: {
    gap: 3,
  },
  sourceName: {
    fontSize: typography.caption,
    fontWeight: "800",
  },
  step: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: 5,
  },
  stepText: {
    fontSize: typography.caption,
    lineHeight: 17,
    textAlign: "right",
  },
  limit: {
    fontSize: typography.caption,
    lineHeight: 17,
    textAlign: "right",
  },
});
