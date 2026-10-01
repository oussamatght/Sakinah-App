import React from "react";
import { Redirect } from "expo-router";

/**
 * اسم بديل: /adhkar → /dhikr. توجيه فقط لا نسخة ثانية (المطلوب /adhkar بينما
 * المسار الفعلي /dhikr) حتى لا تُصان شاشتان متطابقتان.
 */
export default function AdhkarAliasScreen() {
  return <Redirect href="/dhikr" />;
}