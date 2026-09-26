import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { PrayerTimesResult } from "@/lib/api/types";

/**
 * إشعار الأذان (Task 10) — جدولة إشعار محلي فوقت كل صلاة بصوت أذان حقيقي.
 *
 * ⚠️ قيود Expo Go (مهمة — كما نبه المستخدم):
 * من SDK 53 صعودًا، expo-notifications **غير مدعوم إطلاقًا داخل Expo Go**
 * (الـ push وسمات كثيرة من المحلية). القنوات المخصصة والأصوات المخصصة تعمل
 * فقط في **development build حقيقي**:
 *   npx eas build --profile development
 * ثم تثبيت الناتج على الجهاز. في Expo Go ستفشل setNotificationChannelAsync
 * بصمت أو بخطأ — الكود هنا يتعامل مع ذلك بلطف (try/catch) دون تعطيل التطبيق.
 *
 * صوت الأذان:
 *  - Android: الملف يجب أن يكون في res/raw (أسماء صغيرة) وترتبط بالقناة —
 *    نستخدم resource `adhan_short`. أضف الملف يدويًا في
 *    android/app/src/main/res/raw/adhan_short.mp3 عند الـ prebuild
 *    (أو عبر config plugin). البديل المؤقت: نستعمل الافتراضي إن غاب الملف.
 *  - iOS: الملف داخل بندل التطبيق مع الامتداد ("adhan_short.wav").
 *  - المستخدم يستطيع رفع ملف أذان بنفسه — انظر التعليمات في التقرير.
 */

export const ADHAN_CHANNEL_ID = "adhan";

const PRAYER_ROWS = [
  { key: "Fajr", nameAr: "الفجر", body: "الصلاة خير من النوم" },
  { key: "Dhuhr", nameAr: "الظهر", body: "حي على الصلاة" },
  { key: "Asr", nameAr: "العصر", body: "حي على الصلاة" },
  { key: "Maghrib", nameAr: "المغرب", body: "حي على الصلاة" },
  { key: "Isha", nameAr: "العشاء", body: "حي على الصلاة" },
] as const;

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** إنشاء قناة "adhan" بأولوية MAX وصوت الأذان (أندرويد فقط). */
export async function ensureAdhanChannel(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    await Notifications.setNotificationChannelAsync(ADHAN_CHANNEL_ID, {
      name: "الأذان",
      importance: Notifications.AndroidImportance.MAX,
      sound: "adhan_short.mp3", // res/raw/adhan_short.mp3
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 500, 250, 500],
      enableVibrate: true,
    });
    return true;
  } catch {
    // Expo Go أو جهاز بلا دعم — لا نعطل التطبيق.
    return false;
  }
}

function parseTimeToClock(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
}

/**
 * إعادة جدولة الإشعارات الخمسة لليوم الحالي (تُستدعى عند كل فتح للتطبيق —
 * المواقيت تتغير يوميًا بضع دقائق). تحذف القديمة أولًا ثم تجدول الجديدة.
 */
export async function scheduleAdhanNotifications(
  prayerTimes: PrayerTimesResult,
): Promise<{ scheduled: number; reason?: string }> {
  const channelOk = await ensureAdhanChannel();
  if (!channelOk && Platform.OS === "android") {
    return { scheduled: 0, reason: "الإشعارات تتطلب development build (ليست مدعومة في Expo Go)" };
  }

  // إلغاء كل الإشعارات المجدولة سابقًا (نظف ثم جدول من جديد).
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const notification of pending) {
    if (notification.content.data?.kind === "adhan") {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  }

  let scheduled = 0;
  const now = new Date();
  for (const prayer of PRAYER_ROWS) {
    const clock = parseTimeToClock(prayerTimes.timings[prayer.key] ?? "");
    if (!clock) continue;
    // لا تجدول صلاة مضى وقتها اليوم.
    const when = new Date();
    when.setHours(clock.hour, clock.minute, 0, 0);
    if (when <= now) continue;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `حان وقت صلاة ${prayer.nameAr}`,
          body: prayer.body,
          sound: Platform.OS === "ios" ? "adhan_short.wav" : undefined,
          data: { kind: "adhan", prayer: prayer.key },
        },
        trigger: Platform.OS === "android"
          ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, channelId: ADHAN_CHANNEL_ID, hour: clock.hour, minute: clock.minute }
          : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: clock.hour, minute: clock.minute },
      });
      scheduled += 1;
    } catch {
      // تجاهل الفردية — نكمل جدولة بقية الصلوات.
    }
  }
  return { scheduled, reason: scheduled === 0 ? "لا صلوات متبقية اليوم أو الإشعارات غير مدعومة" : undefined };
}

/** إلغاء كل إشعارات الأذان (لما يطفئ المستخدم التنبيهات من الإعدادات). */
export async function cancelAdhanNotifications(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      if (notification.content.data?.kind === "adhan") {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // Expo Go — تجاهل.
  }
}

/**
 * "تجربة صوت الأذان" من الإعدادات — إشعار فوري بعد ثانيتين بنفس القناة
 * والصوت، ليتأكد المستخدم أن الصوت يعمل دون انتظار وقت صلاة.
 */
export async function playAdhanTestNotification(): Promise<boolean> {
  const channelOk = await ensureAdhanChannel();
  if (!channelOk && Platform.OS === "android") return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "تجربة صوت الأذان 🔊",
        body: "إذا سمعت الأذان فالإعداد يعمل بشكل صحيح.",
        sound: Platform.OS === "ios" ? "adhan_short.wav" : undefined,
        data: { kind: "adhan-test" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, channelId: Platform.OS === "android" ? ADHAN_CHANNEL_ID : undefined, seconds: 2 },
    });
    return true;
  } catch {
    return false;
  }
}
