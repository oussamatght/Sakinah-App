import React from "react";
import { Redirect } from "expo-router";

/**
 * اسم بديل لصفحة الأذكار: /adhkar → نفس شاشة /dhikr.
 *
 * التوجيه فقط، لا نسخة ثانية: صفحة واحدة للأذكار في التطبيق، والاسمان
 * يشيران إليها. (كان المطلوب /adhkar بينما المسار الفعلي هو /dhikr،
 * فبدل إنشاء شاشتين متطابقتين — وهو ما يعني صيانة مضاعفة لاحقًا —
 * هذا يخدم المسارين بلا تكرار.)
 */
export default function AdhkarAliasScreen() {
  return <Redirect href="/dhikr" />;
}