import { Platform } from "react-native";
import type { PrayerTimesResult } from "@/lib/api/types";

/**
 * إشعار الأذان (Task 10) — جدولة إشعار محلي فوقت كل صلاة بصوت أذان حقيقي.
 *
 * ⚠️ Expo Go guard (إصلاح كراش الإقلاع):
 * من SDK 53 صعودًا، **استيراد expo-notifications نفسه يرمي خطأ** داخل Expo Go
 * على أندرويد (وحدة الإشعارات أزيلت من Expo Go). لذلك:
 *   1. لا يوجد import ساكن هنا — الوحدة تُحمَّل كسولًا داخل try/catch
 *      (lazy require) فقط عندما نحتاجها فعلاً.
 *   2. isExpoGo() تكتشف بيئة Expo Go عبر Constants 1 و 2 (كما توصي Expo)،
 *      وكل الدوال العامة تعود بأمان إن كنا داخل Expo Go.
 *   3. بذلك لا يسقط تحميل settings.tsx أو _layout.tsx — وهو ما كان يسبب
 *      "missing the required default export" و"Cannot read property
 *      'ErrorBoundary' of undefined" معًا.
 *
 * في development build حقيقي (npx eas build --profile development) كل شيء
 * يعمل: القناة المخصصة "adhan" بأولوية MAX + صوت الأذان res/raw.
 *
 * صوت الأذان:
 *  - Android: android/app/src/main/res/raw/adhan_short.mp3 (بعد prebuild).
 *  - iOS: assets/sounds/adhan_short.wav داخل بندل التطبيق.
 */

export const ADHAN_CHANNEL_ID = "adhan";

type NotificationsModule = typeof import("expo-notifications");

let cachedModule: NotificationsModule | null | undefined;

/** كشف بيئة Expo Go (الطريقة الرسمية الموثقة من Expo). */
export function isExpoGo(): boolean {
  try {
    // require هنا مقصود: تجنب أي استيراد ساكن لexpo-constants في مسار التقييم.
    const Constants = require("expo-constants") as {
      executionEnvironment?: number;
      ExecutionEnvironment?: { Bare?: number; StoreClient?: number };
    };
    const env = Constants?.executionEnvironment;
    const Bare = Constants?.ExecutionEnvironment?.Bare;
    if (env === undefined || Bare === undefined) return false;
    return env !== Bare;
  } catch {
    return false;
  }
}

/**
 * تحميل expo-notifications بأمان — يعيد null داخل Expo Go أو عند فشل الوحدة
 * (النداءات الخطأ يظهر مرة واحدة كتحذير مكتوم وليس كراش تطبيق).
 */
function getNotifications(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (isExpoGo()) {
    cachedModule = null;
    return null;
  }
  try {
    cachedModule = require("expo-notifications") as NotificationsModule;
  } catch {
    // وحدة غير متاحة (Expo Go / بناء بلا إشعارات) — تعطيل هادئ للميزة.
    cachedModule = null;
  }
  return cachedModule;
}

const PRAYER_ROWS = [
  { key: "Fajr", nameAr: "الفجر", body: "الصلاة خير من النوم" },
  { key: "Dhuhr", nameAr: "الظهر", body: "حي على الصلاة" },
  { key: "Asr", nameAr: "العصر", body: "حي على الصلاة" },
  { key: "Maghrib", nameAr: "المغرب", body: "حي على الصلاة" },
  { key: "Isha", nameAr: "العشاء", body: "حي على الصلاة" },
] as const;

export function configureNotificationHandler(): void {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // غير مدعوم في هذه البيئة — تجاهل.
  }
}

/** إنشاء قناة "adhan" بأولوية MAX وصوت الأذان (أندرويد فقط). */
export async function ensureAdhanChannel(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS !== "android") return Boolean(Notifications);
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
  const Notifications = getNotifications();
  if (!Notifications) {
    return {
      scheduled: 0,
      reason: "الإشعارات تتطلب development build — غير مدعومة في Expo Go",
    };
  }
  const channelOk = await ensureAdhanChannel();
  if (!channelOk && Platform.OS === "android") {
    return { scheduled: 0, reason: "تعذر إنشاء قناة الإشعارات على هذا الجهاز" };
  }

  try {
    // إلغاء القديم ثم جدولة الجديد.
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      if (notification.content.data?.kind === "adhan") {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // إن فشل الإلغاء نكمل — الجدولة الجديدة تبقى أفضل من لا شيء.
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
        trigger:
          Platform.OS === "android"
            ? {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                channelId: ADHAN_CHANNEL_ID,
                hour: clock.hour,
                minute: clock.minute,
              }
            : {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: clock.hour,
                minute: clock.minute,
              },
      });
      scheduled += 1;
    } catch {
      // تجاهل الفردية — نكمل جدولة بقية الصلوات.
    }
  }
  return {
    scheduled,
    reason: scheduled === 0 ? "لا صلوات متبقية اليوم أو الإشعارات غير مدعومة" : undefined,
  };
}

/** إلغاء كل إشعارات الأذان (لما يطفئ المستخدم التنبيهات من الإعدادات). */
export async function cancelAdhanNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      if (notification.content.data?.kind === "adhan") {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // بيئة بلا دعم — تجاهل.
  }
}

/**
 * "تجربة صوت الأذان" من الإعدادات — إشعار فوري بعد ثانيتين بنفس القناة
 * والصوت، ليتأكد المستخدم أن الصوت يعمل دون انتظار وقت صلاة.
 */
export async function playAdhanTestNotification(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
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
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: Platform.OS === "android" ? ADHAN_CHANNEL_ID : undefined,
        seconds: 2,
      },
    });
    return true;
  } catch {
    return false;
  }
}
