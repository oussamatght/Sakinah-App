import React, { useEffect } from 'react';
import { I18nManager, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary as AppErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { initThemePreference } from '@/hooks/useTheme';
import { configureNotificationHandler } from '@/lib/notifications/adhan';
import { getSettings, getPrayerTimesCache } from '@/lib/storage';
import { scheduleAdhanNotifications } from '@/lib/notifications/adhan';

// Prevent the splash screen from auto-hiding before asset loading is complete.
void SplashScreen.preventAutoHideAsync();

I18nManager.allowRTL(true);
if (Platform.OS !== 'web') {
  I18nManager.forceRTL(true);
}

// Serverless data layer: providers are called directly from the device.
// The async-storage persister keeps the whole query cache on disk — combined
// with the Infinity staleTime on Quran text this gives real offline reading
// of every surah the user has opened at least once.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 10 * 60 * 1000,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: {
    setItem: (key, value) => AsyncStorage.setItem(key, value),
    getItem: (key) => AsyncStorage.getItem(key),
    removeItem: (key) => AsyncStorage.removeItem(key),
  },
  throttleTime: 2_000,
});

/**
 * استثناء نصوص المصحف من التخزين المؤقت الدائم.
 *
 * نصوص السور والتفسير والأجزاء ضخمة (آلاف الآيات)، وحفظها في AsyncStorage
 * كان يتجاوز حد التخزين فيظهر عند كل إقلاع:
 *   "Encountered an error attempting to restore client cache from persisted
 *    location. As a precaution, the persisted cache will be discarded."
 * فيُهمَل الكاش بالكامل ويصبح التطبيق بلا أي بيانات محفوظة — أي أن "العمل
 * بدون إنترنت" يتعطّل. ونصوص المصحف محفوظة أصلًا في SQLite (quranDb)، وهي
 * المسار الصحيح للقراءة بدون إنترنت، فلا نكررها هنا. القوائم والروابط
 * الصغيرة (فهرس السور، روابط الصوت، الكتب، الأحاديث، المواقيت) تُحفظ كما هي.
 */
const NON_PERSISTED_QURAN_SEGMENTS = new Set(['surah', 'tafsir', 'juz']);

function shouldPersistQuery(query: {
  queryKey: readonly unknown[];
  state: { status: string };
}): boolean {
  if (query.state.status !== 'success') return false;
  const [namespace, segment] = query.queryKey;
  if (namespace === 'quran' && typeof segment === 'string' && NON_PERSISTED_QURAN_SEGMENTS.has(segment)) {
    return false;
  }
  return true;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'رجوع', headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="quran-reader" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="juz-reader" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="quran-download" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="hadith-browser" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="hadith-detail" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="adhkar" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="dhikr-practice" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="book-details" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="book-reader" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="wird-settings" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="prayer" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="qibla" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="favorites" options={{ animation: 'slide_from_left' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    void initThemePreference();
  }, []);

  // Task 10: adhan scheduling — rescheduled on EVERY app open because prayer
  // times shift daily. Only when the settings switch is on. Fails silently
  // under Expo Go (see lib/notifications/adhan.ts).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    configureNotificationHandler();
    void (async () => {
      try {
        const appSettings = await getSettings();
        if (!appSettings.prayerNotifications) return;
        const cached = await getPrayerTimesCache();
        if (cached) {
          await scheduleAdhanNotifications({
            date: cached.date,
            hijriDate: cached.hijriDate,
            timezone: '—',
            location: cached.location,
            timings: cached.timings,
          });
        }
      } catch {
        // Notifications are best-effort; never block startup.
      }
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 1000 * 60 * 60 * 24 * 30,
            buster: 'sakinah-cache-v2',
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
        >
          <GestureHandlerRootView>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </PersistQueryClientProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '@/components/RouteErrorBoundary';
