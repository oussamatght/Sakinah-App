# Sakinah — User & App Tester Guide

This guide is for people testing the app. It explains what each part of the interface does, how to try the main actions, what should happen, and which limitations are already known. The app’s interface is primarily in Arabic; important Arabic labels are included so you can match the guide to the screen.

## Quick start for testers

- If you were given an installed test build, open **Sakinah** and follow the steps below. No coding or account is required.
- If the developer asked you to launch it from this repository, open a terminal in `app/artifacts/mobile`, run `pnpm dev`, and follow the Expo instructions shown in that terminal to open the app on a device, emulator, or web browser.
- Use a real phone for location, compass, haptics, and notification testing. Web can test most browsing screens, but it does not have a device compass and does not support Qur’an offline downloads.
- The app is Arabic-first and laid out right-to-left. The bottom navigation contains **Home** (`الرئيسية`), **Qur’an** (`القرآن`), **Prayer** (`الصلاة`), **Tasbih** (`التسبيح`), **Hadith** (`الأحاديث`), **Dhikr** (`الأذكار`), and **Books** (`الكتب`). On small devices, swipe the tab bar if every tab is not visible at once.
- Allow internet access for first-time loading of Qur’an, hadith, books, adhkar, and prayer times. Location and notification permissions are requested only when the related feature needs them.

## Recommended test pass

1. Open the app and confirm the Home screen loads without an error.
2. Visit each bottom tab once. Wait for loading to finish and note any screen that remains blank or shows an error.
3. Try one primary action in each feature below, then use the on-screen back arrow (`العودة`) or device Back to return.
4. Save a favorite, change a preference, and record a counter/reading position. Leave and reopen the relevant screen to check persistence.
5. Test permission-denied and offline paths only after recording your normal online results. Restore permissions/network after those checks.

## Home screen — `الرئيسية`

1. Confirm the greeting (`السلام عليكم`), title (`يوم مبارك`), and subtitle (`رفيقك اليومي للقرآن والذكر`) appear.
2. Tap the heart button (`المفضلة`) to open Favorites; use `العودة` to return. Tap the sliders button (`الإعدادات`) to open Settings.
3. Tap the prayer card (`مواقيت الصلاة` / `افتح مواقيت اليوم`) to open the full prayer-times screen. This card is a link; it is not itself a live countdown.
4. Swipe the horizontal `الوصول السريع` shortcuts and try the available actions:
   - `تحميل القرآن` opens Qur’an download options.
   - `الكتب` opens the Books tab.
   - `مواقيت الصلاة` opens the Prayer tab.
   - `الأحاديث` opens the Hadith tab.
   - `المصحف` opens the Qur’an tab.
   - `القبلة` opens the Qibla screen.
   - `الأذكار الصباحية والمسائية` opens the general Dhikr tab.
5. Tap `فتح المصحف` or the `أكمل وردك` card. It should open the last saved Qur’an position; on first use it opens Al-Fatihah (`الفاتحة`). Read/scroll, return Home, and reopen to check that the position is remembered.
6. Tap `ذكر اليوم` to open the selected daily dhikr’s practice screen. The selected item should stay the same during the local day.
7. Tap `كل ما حفظته يبقى قريبًا منك` to open Favorites.

**Known Home issue:** The `الورد القرآني` quick action currently points to a route that is not present (`quran-verses`). Tapping it may show the not-found screen. Record it as a route issue; use the Qur’an tab or the Home `فتح المصحف` action for Qur’an reading.

## Qur’an tab — `القرآن`

1. Open `القرآن`. Confirm the title `القرآن الكريم`, search box (`ابحث عن سورة أو آية...`), and the three selectors `السور` (Surahs), `الأجزاء` (Juz), and `الصفحات` (Pages).
2. Under `السور`, type part of a surah name. The list should filter. Tap a surah and confirm the reader opens at its beginning.
3. Under `الأجزاء`, choose a juz. Confirm the juz reader shows the juz’s surah ranges and verses. Tap a surah range to open that surah.
4. Under `الصفحات`, tap a page tile. Confirm the reader opens at that page.
5. Search for a phrase of at least two characters. Verse-text matches are searched from Qur’an text already downloaded to the device. If no local Qur’an text is available, the app explains that you must download content first; this is expected.
6. Tap the header’s `الإعدادات` button to open Settings.

**Known behavior:** In the Juz reader, a surah-range row displays its starting and ending ayah, but currently opens the surah without jumping to the displayed starting ayah.

## Qur’an reader

1. Open a surah from the Qur’an tab or Home. Confirm the Arabic text, surah name, verse/page markers, and continuous vertical scrolling appear.
2. Use `A−` and `A+` (accessible labels `تصغير خط المصحف` and `تكبير خط المصحف`) to change the Qur’an font size. Return to the reader after changing the size in Settings and confirm the preference is shared.
3. Use the reader’s ayah/page search controls (`بحث عن آية…` / `بحث عن صفحة…`). Enter a valid number, choose ayah or page, and select `انتقال`. Confirm it scrolls to the requested position; invalid/out-of-range input should show validation feedback.
4. Tap an ayah to start/toggle its recitation audio. Long-press an ayah to open its detail panel. Where available, try `تشغيل الآية`, `مشاركة`, the favorite control, and tafsir; use `إغلاق` to close the panel.
5. Try the playback modes `الآية` (single ayah), `متتابع` (sequential ayahs), and `السورة` (whole-surah audio). Test `تشغيل` and `إيقاف التلاوة`. Sequential ayah playback should stop at the end of the current surah rather than continue into the next surah.
6. Where shown on native builds, use `حفظ السورة` to save the current surah or `تنزيل المصحف كاملًا` to open download options.
7. Leave the reader and return. Reopen the same surah from Home to check that the reading position is restored.

**Offline expectations:** Whole-surah audio works offline only if that audio was downloaded for the selected reciter. Per-ayah audio needs internet. Downloaded Qur’an text is stored on supported native builds. Tafsir availability depends on whether it has been downloaded/cached. See the download caveat under “Known behaviors and limitations.”

## Qur’an download — `القرآن بدون إنترنت`

1. Choose `القرآن كاملًا` (whole Qur’an) or `سورة واحدة` (one surah).
2. For one surah, tap `اختر سورة…`, choose a surah, and confirm the chosen name is shown.
3. Toggle the optional tafsir and reciter-audio options as desired. Start with `بدء التنزيل` or `حفظ السورة` (the label depends on the selected scope).
4. Confirm a progress bar and phase/count are shown while downloading. When complete, confirm the saved ayah/audio/tafsir counts appear.
5. If practical, interrupt a download and retry. Already stored pieces should be reused rather than needlessly downloaded again.

**Platform note:** Offline download is available on the mobile app, not web. On web, the app reports `التنزيل بدون إنترنت متاح على تطبيق الهاتف فقط`.

**Known behavior to verify:** A single-surah download saves its text, but the reader’s local-first path is gated by the full-Qur’an downloaded flag. After a single-surah download, test a cold offline restart and record whether that surah opens without network; it may still try to fetch online.

## Prayer tab — `الصلاة`

1. Open the Prayer tab. When prompted, grant foreground location permission.
2. Confirm today’s Gregorian/Hijri date, the next prayer card, and rows for Fajr (`الفجر`), Sunrise (`الشروق`), Dhuhr (`الظهر`), Asr (`العصر`), Maghrib (`المغرب`), and Isha (`العشاء`). The next prayer should be visually highlighted.
3. If the app is offline after a successful previous fetch, check whether saved timings appear with a notice that the cached times may be stale. Tap retry when back online.
4. Deny location or disable location services, then reopen the feature. The app should show location guidance; enable permission in the device settings and reopen the screen to try again.

The Home prayer card opens a separate full-screen `/prayer` page; the quick shortcut and bottom tab open the Prayer tab. Their layouts differ. The tab shows a cached-data warning when applicable; the full-screen page may not show the same warning.

## Qibla — `اتجاه القبلة`

1. From Home, tap `القبلة`. Grant location permission when requested.
2. On a phone, rotate the device and check that the compass dial responds and the indicated direction changes smoothly. Follow the calibration guidance if shown (`حرّك الهاتف على شكل رقم ٨ للمعايرة`).
3. Point the Kaaba marker toward the indicated direction. Check that the UI reports alignment when close and shows a left/right degree difference when not aligned.
4. Deny location and reopen to check the permission-help state. If heading data is unavailable, verify the screen explains that it is showing a north-based bearing instead.
5. On web, expect a calculated absolute bearing; a live compass cannot be tested without a device heading sensor.

## Hadith tab — `الأحاديث`

1. Open the Hadith tab. Switch between `الكتب` (Books) and `المواضيع` (Topics). Confirm each list loads.
2. Under Books, choose a hadith collection. Check that the collection title and list appear. If `الفهرس` (Index) is available, open it, choose a chapter, and confirm that chapter’s hadiths are shown.
3. Under Topics, choose a topic and confirm a list of hadiths loads.
4. In a selected book, try the search mode `بالنص` (by text) and submit a phrase; then try `بالرقم` (by number) with a valid and an invalid number. Number search is within the selected book. Text search generally requires at least two characters.
5. Use `السابق` / `التالي` to change pages. Check that Previous is disabled on the first page and Next is disabled when there are no more results.
6. Tap a hadith card to open its detail where enabled. Check its text, source/reference, available grade, and explanation if provided. Tap the heart to save or unsave it.
7. Trigger an error/offline state if appropriate. Use the displayed retry control for list/detail failures. Hadith search failures may appear as inline feedback; resubmit the search to retry.

There is also a standalone Hadith browser route, used from some navigation paths. Test it separately: the tab and standalone browser are separate implementations and may not have identical controls or offline behavior.

## Books tab — `الكتب`

1. Open Books. Wait for the list to load. Try searching for a title or author; results should update after a short pause.
2. When browsing without a search, try the category chips and `الكل`. A category may have no results from its source; that should show an empty-state message rather than crash.
3. Tap `بحث متقدم`. Try the available search types—free text, book title, author, and category—and each source choice: all sources, Turath (`تراث`), Islam House (`إسلام هاوس`), and IslamicApp (`إسلاميك`). Submit the search and inspect the result notice if shown.
4. Use `مسح الفلاتر المتقدمة` to clear advanced filters. Use `السابق` / `التالي` to browse result pages.
5. Open a result. Check the title, source, author, and action shown on the card. Depending on the book and provider, the action can be in-app reading, a PDF/download, or details only.

## Book details and book reader

1. On the details page, verify the selected book’s title, author/source information, and available description/biography.
2. Try the chapter index (`الفهرس`) and any `عرض … عنوانًا آخر` control to reveal more chapters. Tap a chapter and verify that the reader opens at the appropriate page when reading is supported.
3. If available, try `تحميل ملف الكتاب` or `فتح المصدر`. These may open a PDF or external link rather than the in-app reader.
4. In the reader, test `السابق` / `التالي` and the index open/close controls. Confirm the displayed content and page/chapter indicator change together.
5. If reading is unsupported or content is unavailable, confirm the app explains the limitation rather than claiming the book can be read. Retry only transient errors; some “not available” responses cannot be fixed by retrying.

Book lists/indexes may be cached, but full book page/text responses are not persisted for offline reading. Do not expect all book text to remain available after an offline cold restart.

## Dhikr tab — `الأذكار`

1. Open Dhikr. Search with `ابحث في الأذكار...`; try a matching word and an unmatched word.
2. Filter by `الكل`, `أذكار الصباح`, `أذكار المساء`, and `أذكار عامة`. Toggle `مفضّلتي` to show only favorited adhkar.
3. If prompted to choose a daily goal, select one of the offered counts (3, 5, 10, or 15). Confirm the daily-goal card appears with progress and `متابعة الورد`.
4. Tap a dhikr card to open its practice screen. Tap the card heart to favorite/unfavorite it.
5. When a goal is active, tap `متابعة الورد` and confirm it opens the next unfinished dhikr. `تغيير الورد` clears the goal so a different one can be selected.
6. If adhkar cannot load, check the error message and use `إعادة المحاولة`.

## Dhikr practice

1. Confirm the Arabic text, category/source, and repetition target shown on the practice screen.
2. Tap the main counter once and confirm the count increases by one. For a target of 20 or more, test `زيادة ١٠`. Progress must not exceed the source’s required count.
3. Confirm completion feedback appears at the target. Try `إعادة` to reset this dhikr’s count and the heart button to toggle its favorite state.
4. Try `السابق` and `التالي`. At the first/last dhikr, the unavailable direction should not navigate past the list.
5. Scroll to inspect source-provided virtue, hadith text, word explanations, and source details when present.
6. Return to the list and reopen the same dhikr. Confirm today’s progress is retained. Daily progress is based on the local date.
7. If opened with a missing/invalid item, use `العودة إلى الأذكار` to recover to the list.

## Tasbih tab — `التسبيح`

1. Select a dhikr from the quick choices (for example `سبحان الله`, `الحمد لله`, or `الله أكبر`). Confirm the selected dhikr is highlighted and the count resets to zero.
2. Choose a target (33, 100, 250, 500, or 1000). Tap the selected target again to switch to `عداد حر` (free counter).
3. Tap the large circle. Confirm the count increases and, on mobile, a haptic response may be felt. With a target selected, check the progress bar and target text.
4. Tap `تصفير` to reset the current count. Count again and tap `حفظ`; confirm the saved session appears in history and the live counter resets.
5. Toggle `عرض الإجماليات` / `عرض آخر الجلسات` to inspect totals and recent saved sessions.
6. Tap `حذف السجل` and check that saved history/totals disappear.

**Current UI limitation:** The screen offers preset dhikr choices only; there is no text field for a custom phrase. Deleting history currently has no confirmation dialog, so testers should note that it clears the saved history immediately.

## Favorites — `المفضلة`

1. Save one ayah, one hadith, and one dhikr using the heart controls on their respective screens.
2. Open Favorites from Home. Check `الكل`, `الآيات`, `الأحاديث`, and `الأذكار` filters.
3. Tap each favorite to test its destination. Ayahs should open the Qur’an reader at the saved ayah. Dhikr should open its practice screen. Hadith currently opens the general Hadith browser, not the exact saved hadith.
4. Use the trash icon to remove an item. Confirm it disappears, and reopen Favorites to verify it stays removed.

## Settings — `الإعدادات`

1. Under `المظهر`, choose `فاتح` (Light), `داكن` (Dark), and `تلقائي` (System). Confirm the interface changes and that the selected option remains after leaving/reopening Settings.
2. Under `القراءة`, change `حجم خط المصحف`. Open the reader and confirm the Qur’an text reflects the preference.
3. Under `القارئ الافتراضي`, choose another reciter. Confirm the new selection is shown and is used for later audio/download actions.
4. Under `الصوت والإشعارات`, toggle `تنبيهات الصلاة`. On a supported native development build, grant notification permission and try `تجربة صوت الأذان`. Turn the switch off and confirm notifications are cancelled.
5. Tap the daily-wird target button to open `الورد اليومي`.

Settings note: notification testing requires a compatible native development build; Expo Go may show that notifications are unsupported. The app says user settings and progress are stored on the device.

## Daily Qur’an wird — `الورد اليومي`

1. Choose `صفحات يوميًا` and select 1, 2, 4, 6, or 10 pages; or choose `ختمة كاملة` and select a duration of 30, 60, 90, 180, or 365 days.
2. Tap `حفظ الورد`. Confirm the goal, estimated pages per day, progress percentage, and remaining pages appear.
3. Tap `صفحة` and `5 صفحات`. Confirm the completed and remaining page counts update. Check the streak/total-day line after the goal is met.
4. Leave and reopen the screen to confirm the goal and logged progress persist.

**Important:** These page buttons are manual progress logging. Reading in the Qur’an reader does not automatically add pages to this goal. This daily page goal is separate from the adhkar goal on the Dhikr screen.

## Location, network, and saved data

- **Location:** Prayer times and Qibla need foreground location permission. Test both allow and deny cases. If denied, enable permission in the device’s system settings and reopen the screen; the app does not provide an in-screen permission grant flow.
- **Network:** First-time Qur’an catalogs, hadith lists, books, adhkar, and prayer-time requests need internet. Some results are cached; an error/empty state while offline may be expected if that content was never loaded.
- **Offline Qur’an:** Native app only. Downloaded Qur’an text/audio is the main offline content. Per-ayah audio still requires network. Test a full app restart with airplane mode enabled to check true offline behavior.
- **Book text:** Book indexes/lists may be cached; full page text is not guaranteed offline.
- **Saved on this device:** Settings, favorites, reading position, tasbih history, and Qur’an/dhikr daily progress are locally stored. Data is not described by the app as syncing to an account.
- **Daily progress:** Dhikr progress uses the device’s local day. Test day rollover only if that is part of the test plan; changing the device date can affect daily progress.

## What to include when reporting a bug

For each issue, include:

1. Device model and OS (or browser and version), plus whether this was Expo Go or a development/release build.
2. App version/build if known, network state, and whether location/notification permissions were granted.
3. The screen and exact UI control (include the Arabic label if possible).
4. Numbered steps to reproduce, what you expected, and what actually happened.
5. A screenshot or screen recording when safe and useful. Avoid sharing personal location details or other private information.

## Known behaviors and limitations to distinguish from new bugs

- `الورد القرآني` on Home currently points to a missing `quran-verses` route.
- Home’s prayer card opens the full-screen prayer page; the Prayer tab shortcut opens the Prayer tab. They have different layouts and may show different offline-cache messaging.
- The full prayer screen links its calculation-settings wording to general Settings, but Settings currently has no prayer calculation-method controls.
- The Home shortcut called `الأذكار الصباحية والمسائية` opens the general Dhikr list; `/adhkar` is an alias to `/dhikr`, not a separate morning/evening-only screen.
- Juz range rows display a start/end ayah but currently open the surah without jumping to the start ayah.
- Single-surah offline download may not be picked up by the reader after a cold offline restart; verify and report actual results.
- Hadith favorites open the general Hadith browser rather than the exact favorite.
- Tasbih has preset dhikr only, and deleting its history has no confirmation.

---

## Developer reference: codebase overview

The following reference is for contributors who need to modify or troubleshoot the app. Testers can use the guide above without reading this section.

### 1. What this app is

Sakinah is an Arabic-first mobile app built with **Expo**, **React Native**, and **TypeScript**. It can also run on the web, but some features—such as device compass sensors and offline Qur’an downloads—are mobile-only.

The easiest way to understand the project is as four connected layers:

1. **Screens** in `app/` render the interface and handle user actions.
2. **Hooks** in `hooks/` provide reusable state and data-loading behavior to screens.
3. **Libraries** in `lib/` handle network requests, local storage, offline data, books, and notifications.
4. **Components and constants** provide reusable UI and shared design values.

A common flow is: a screen calls a hook, the hook calls an API or storage function, and the screen renders the returned data.

### 2. Running and checking the app

Run these commands from this `mobile` directory, after dependencies have been installed for the workspace:

- `pnpm dev` — start the Expo development server.
- `pnpm typecheck` — run TypeScript without emitting files.
- `pnpm build` — create the production static build.
- `pnpm serve` — serve the production build (run after building).

The package entry point is `expo-router/entry`, so Expo Router discovers the app routes from the `app/` folder.

### 3. App startup and navigation

#### Startup

- `app/index.tsx` redirects the root route into the tab navigator.
- `app/_layout.tsx` is the root layout. It sets up navigation, React Query and persistent cache, safe-area and keyboard providers, gesture handling, fonts, RTL behavior, theme initialization, and best-effort prayer notifications.
- `app/(tabs)/_layout.tsx` defines the bottom tab bar. Newer iOS can use native tabs; Android, web, and older iOS use the classic tabs.

The `(tabs)` directory is an Expo Router **route group**. It organizes routes but does not appear as a visible URL segment.

#### Main tabs

| File                    | Purpose                                                                   |
| ----------------------- | ------------------------------------------------------------------------- |
| `app/(tabs)/index.tsx`  | Home screen: quick actions, prayer card, resume reading, and daily dhikr. |
| `app/(tabs)/quran.tsx`  | Qur’an browsing.                                                          |
| `app/(tabs)/prayer.tsx` | Prayer-time tab.                                                          |
| `app/(tabs)/tasbih.tsx` | Tasbih counter.                                                           |
| `app/(tabs)/hadith.tsx` | Hadith tab.                                                               |
| `app/(tabs)/dhikr.tsx`  | Dhikr tab.                                                                |
| `app/(tabs)/books.tsx`  | Islamic books library.                                                    |

#### Other routes

| File                     | Purpose                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `app/quran-reader.tsx`   | Continuous surah reader, with audio, tafsir, saved position, and reading preferences.        |
| `app/juz-reader.tsx`     | Displays one juz and its surah ranges.                                                       |
| `app/quran-download.tsx` | Downloads the full Qur’an or one surah for offline use on supported mobile devices.          |
| `app/hadith-browser.tsx` | Browse hadith books or topics, search, and open hadith details.                              |
| `app/hadith-detail.tsx`  | Shows a hadith, its available grade/source information, and any explanation.                 |
| `app/adhkar.tsx`         | Route alias that redirects to `/dhikr`.                                                      |
| `app/dhikr-practice.tsx` | Practice one dhikr, count repetitions, and track daily completion.                           |
| `app/prayer.tsx`         | Prayer times based on the device location.                                                   |
| `app/qibla.tsx`          | Qibla direction; uses a heading sensor on mobile and can show the calculated bearing on web. |
| `app/book-details.tsx`   | Book metadata, author details, chapters, and reading availability.                           |
| `app/book-reader.tsx`    | Reads book content where the selected provider supports it.                                  |
| `app/favorites.tsx`      | Saved ayahs, hadiths, and adhkar.                                                            |
| `app/settings.tsx`       | Theme, Qur’an reading preferences, reciter, and prayer notifications.                        |
| `app/wird-settings.tsx`  | Daily Qur’an reading goal and progress.                                                      |
| `app/+not-found.tsx`     | Fallback for an unknown route.                                                               |

### 4. Shared UI and styling

#### Components

`components/` contains reusable pieces used by multiple screens:

- `ui.tsx` — common screen wrappers, buttons, section titles, cards, loading/error/empty states, and other UI primitives.
- `BookCard.tsx`, `DhikrCard.tsx` — book and dhikr cards.
- `BookSearchSheet.tsx` — book-search interface.
- `FavoriteButton.tsx` — save/remove a supported item from favorites.
- `GradeBadge.tsx` — hadith-grade display.
- `SearchPlanNotice.tsx` — search status/notice UI.
- `KeyboardAwareScrollViewCompat.tsx` — keyboard-friendly scrolling.
- `ErrorBoundary.tsx`, `RouteErrorBoundary.tsx`, and `ErrorFallback.tsx` — contain and display unexpected rendering errors.

#### Design constants

- `constants/colors.ts` defines semantic light and dark theme colors.
- `constants/tokens.ts` defines spacing, corner radii, font sizes, and motion durations.
- `hooks/useColors.ts` gives components the colors for the active theme.
- `hooks/useTheme.ts` stores and publishes the theme preference.

Prefer using these shared values rather than introducing one-off colors or spacing. The UI is Arabic-first and uses right-to-left layout on native platforms. Inter is used for general UI text, and the Qur’an reader also loads the Amiri Quran font.

### 5. Hooks and shared app state

Hooks are reusable React functions that let screens read or update data without duplicating the underlying logic.

- `hooks/useAppState.ts` exposes shared settings, favorites, and reading-goal state.
- `hooks/useAdhkar.ts` loads adhkar and manages daily progress/practice data.
- `hooks/useIslamicBooks.ts` loads books, authors, chapters, and pages.
- `hooks/useResumeReading.ts` retrieves the saved Qur’an reading position.
- `hooks/useColors.ts` and `hooks/useTheme.ts` provide the current theme.

For example, the home screen uses `useResumeReading()` to open the last saved Qur’an position. Screens usually own temporary UI state (such as which modal is open), while hooks and `lib/storage/` handle reusable or persistent state.

### 6. Data and API layer

#### Remote data

`lib/api/` contains request functions, data types, and React Query hooks for Qur’an, hadiths, adhkar, and prayer times.

- `lib/api/quran.ts` — Qur’an chapters, surahs, audio, tafsir, juz, and related helpers.
- `lib/api/hadith.ts` — hadith books, categories, lists, details, and search.
- `lib/api/adhkar.ts` — adhkar data access.
- `lib/api/prayer.ts` — prayer-time requests.
- `lib/api/queries.ts` — shared query helpers and local calculations/search logic.
- `lib/api/types.ts` — TypeScript data shapes and API errors.
- `lib/api/http.ts` — common HTTP request behavior.
- `lib/api/hadithGradeEnrichment.ts` — hadith-grade enrichment where the available source data supports it.
- `lib/api/index.ts` — re-exports public functions/hooks so screens can import them from one place.

React Query handles request caching and loading/error state. In `app/_layout.tsx`, successful eligible queries are persisted to AsyncStorage. Large Qur’an passages, tafsir, juz data, and book page/text responses are excluded from that persistent query cache to avoid filling it with large payloads.

### 7. Local storage and offline content

#### Small app data

`lib/storage/` stores user preferences and progress using AsyncStorage:

- `client.ts` — shared JSON read/write helpers and storage-key names.
- `settings.ts` — appearance and reader preferences.
- `favorites.ts` — saved ayahs, hadiths, and adhkar.
- `readingPosition.ts` — last Qur’an reading position.
- `wird.ts` — daily Qur’an goals and progress.
- `adhkar.ts` — daily adhkar progress and goals.
- `tasbih.ts` — tasbih history/state.
- `prayerCache.ts` — cached prayer-time data.
- `index.ts` — exports the storage API.

#### Qur’an offline database

`lib/offline/` has platform-specific implementations:

- `quranDb.native.ts` uses SQLite for downloaded Qur’an content and related media.
- `quranDb.ts` is the web stub. It reports offline downloading as unsupported on web.
- `hadithDb.native.ts` and `hadithDb.ts` provide platform-specific hadith database behavior.

Offline availability is therefore feature- and platform-dependent. Small preferences/progress are saved locally on device; large Qur’an content uses the native SQLite path rather than the persistent React Query cache.

### 8. Books architecture

`lib/books/` provides a common interface over three sources: **Turath**, **Islam House**, and **IslamicApp**.

- `providers.ts` defines the shared provider contract and common search helpers.
- `turathProvider.ts`, `islamHouseProvider.ts`, and `islamicAppProvider.ts` implement each source.
- `types.ts` defines book, author, chapter, page, capability, and search-result types.
- `index.ts` exposes the providers and a unified API to the app.

The book screens select a provider from route parameters and check its capabilities. As a result, some books can be read in-app while others may only expose details or an external link. The provider layer also helps prevent one source’s failure from breaking results from other sources.

### 9. Device integrations and notifications

- `lib/notifications/adhan.ts` contains adhan notification configuration, scheduling, cancellation, and testing helpers.
- The root layout and settings screen schedule notifications on supported native builds when enabled and prayer-time data is available. Notification failures are best-effort and should not prevent the app from starting.
- `app/prayer.tsx` and `app/qibla.tsx` request location permission.
- The Qibla screen uses the device heading sensor on native platforms; web has no device magnetometer.
- `app.json` includes the Expo location plugin and the Arabic location-permission message.

Expo Go may not support all notification features; the settings screen explains when a development build is required.

### 10. Assets, scripts, and configuration

#### Assets

- `assets/images/` — app icons and images.
- `assets/sounds/` — sound files.
- `assets/hadith-index/` — generated hadith index data used to navigate books and sections.

#### Scripts

`scripts/` contains development and verification tools, including:

- `build.js` — production static-build orchestration.
- `build-hadith-index.ts` — builds the local hadith index.
- `smoke-api.ts` — exercises API fetchers and normalizers.
- `test-*.ts` and `test-*.cjs` — focused checks for features such as Qur’an data, hadith flows and grades, adhkar progress, prayer logic, tasbih, and wird progress.
- `probe-*.cjs`, `rt-*.cjs`, and related harnesses — runtime probes/diagnostics used while investigating source behavior.
- `make-adaptive-icon.js` — icon-generation helper.

#### Configuration and serving

- `app.json` — Expo app identity, platform settings, plugins, and permissions.
- `package.json` — dependencies and package scripts.
- `tsconfig.json` — strict TypeScript configuration and the `@/` import alias.
- `metro.config.js` — Expo Metro bundler configuration.
- `server/serve.js` — lightweight Node.js server for the production static build; `server/templates/` contains its landing-page template.
- `types/` — project-specific TypeScript types (currently empty in the checked-in folder structure).

### 11. Suggested reading order when changing code

1. Read `app/_layout.tsx` to understand app startup and global providers.
2. Read `app/(tabs)/_layout.tsx` to understand the tab navigator.
3. Choose the screen you want to change, for example `app/book-details.tsx`.
4. Follow its imports into `components/` and `hooks/`.
5. Follow the hook into `lib/api/`, `lib/books/`, or `lib/storage/` to find the data logic.
6. Check the related focused test in `scripts/` if one exists.
7. Run `pnpm typecheck` from this directory after making changes.

### 12. Current route note

The home screen currently contains a quick-action link to `/(tabs)/quran-verses`, but the tab directory contains `quran.tsx` and no `quran-verses.tsx`. That link may be outdated; verify the intended destination before relying on it.

### 13. Scope

This guide covers `app/artifacts/mobile`. The wider workspace also contains separate API-server, database, and other project folders that are outside this mobile app guide.
