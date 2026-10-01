import { Platform } from "react-native";
import type { PrayerTimesResult } from "@/lib/api/types";

/**
 * إشعار الأذان (Task 10) — جدولة إشعار محلي فوقت كل صلاة بصوت أذان حقيقي.
 *
 * حارس Expo Go: من SDK 53 استيراد expo-notifications نفسه يرمي خطأ داخل Expo Go
 * على أندرويد (أُزيلت منه وحدة الإشعارات) فيسقط تحميل settings.tsx و_layout.tsx
 * بسبب "missing the required default export". لذلك لا استيراد ساكن هنا: الوحدة
 * تُحمَّل كسولًا داخل try/catch، وisExpoGo() تكشف البيئة عبر Constants فتسلم كل
 * الدوال العامة بأمان. في بناء development حقيقي يعمل كل شيء: القناة "adhan"
 * بأولوية MAX + صوت الأذان (res/raw بعد prebuild على أندرويد، sounds على iOS).
 */

export const ADHAN_CHANNEL_ID = "adhan";

type NotificationsModule = typeof import("expo-notifications");

let cachedModule: NotificationsModule | null | undefined;

/** كشف بيئة Expo Go بالطريقة الرسمية الموثقة من Expo. */
export function isExpoGo(): boolean {
  try {
    // require مقصود: تفادي أي استيراد ساكن في مسار التقييم.
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

/** تحميل expo-notifications بأمان: null داخل Expo Go أو عند فشل الوحدة
 *  (النداء الخطأ يظهر كتحذير مكتوم لا كراش تطبيق). */
function getNotifications(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  if (isExpoGo()) {
    cachedModule = null;
    return null;
  }
  try {
    cachedModule = require("expo-notifications") as NotificationsModule;
  } catch {
    // وحدة غير متاحة (بناء بلا إشعارات) — تعطيل هادئ للميزة.
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

export async function ensureAdhanChannel(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications || Platform.OS !== "android") return Boolean(Notifications);
  try {
    await Notifications.setNotificationChannelAsync(ADHAN_CHANNEL_ID, {
      name: "الأذان",
      importance: Notifications.AndroidImportance.MAX,
      sound: "adhan_short.mp3",
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

/** إعادة جدولة إشعارات اليوم عند كل فتح (المواقيت تتغيّر يوميًا)،
 *  بتحذف القديمة أولًا ثم تجدول الجديدة. */
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
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of pending) {
      if (notification.content.data?.kind === "adhan") {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch {
    // فشل الإلغاء لا يوقف الجدولة الجديدة.
  }

  let scheduled = 0;
  const now = new Date();
  for (const prayer of PRAYER_ROWS) {
    const clock = parseTimeToClock(prayerTimes.timings[prayer.key] ?? "");
    if (!clock) continue;
    // صلاة وقتها اليوم مضى ⇒ لا تُجدول.
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
      // فشل فردي لا يوقف جدولة بقية الصلوات.
    }
  }
  return {
    scheduled,
    reason: scheduled === 0 ? "لا صلوات متبقية اليوم أو الإشعارات غير مدعومة" : undefined,
  };
}

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

/** "تجربة صوت الأذان" من الإعدادات — إشعار فوري بنفس القناة والصوت
 *  ليتأكد المستخدم أن الصوت يعمل دون انتظار وقت صلاة. */
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
