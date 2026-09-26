# 🌙 Sakinah (سكينة)

<p align="center">
  <strong>Your daily companion for Quran, remembrance, and prayer times</strong>
</p>

<p align="center">
  A complete, Arabic-first Islamic mobile app — free, open, and built with no commercial intent whatsoever.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/React_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white" alt="React Query" />
</p>

---

## 📖 About

**Sakinah** is an Islamic mobile app that brings together the Holy Quran, Prophetic hadiths, adhkar and tasbih, and accurate prayer times, in one calm, simple experience — fully in Arabic, right-to-left (RTL) from the ground up.

This project is built as an act of **Sadaqah Jariyah** (ongoing charity): work intended purely for the sake of Allah, meant to benefit Muslims in reading the Quran, keeping up with remembrance, and knowing their prayer times — free of charge, free of ads, and free of any data collection.

> *"When a person dies, their deeds come to an end except for three: ongoing charity, beneficial knowledge, or a righteous child who prays for them."*

---

## ✨ Key Features

### 📗 Holy Quran
- Complete Mushaf text — all 114 surahs
- Browse by surah or by juz (the 30 parts)
- Tafsir (interpretation) available on tap for any verse
- Audio recitation (Mishary Alafasy by default, with reciter selection)
- Adjustable Quran text size for comfortable reading
- **Bookmark any verse to favorites** with one tap
- **Automatic reading position** — the app remembers where you left off and shows a "Continue Reading" card on the home screen
- **Fully offline reading** — download the entire Mushaf (~2 MB) once and read anywhere without an internet connection

### 🕌 Prayer Times
- Accurate calculation of the five daily prayers based on your location
- Hijri date shown alongside the Gregorian date
- Countdown to the next prayer
- **Real adhan notification** — a genuine call-to-prayer sound plays when each prayer time begins, not a silent system alert
- **Offline fallback** — the last known prayer times are cached and shown with a clear notice when there's no connection

### 🧭 Qibla Direction
- Live compass based on device location and magnetic heading sensor
- Smooth, real-time direction update wherever you are

### 📿 Tasbih (Dhikr Counter)
- Simple tap-to-count dhikr counter
- Type in any dhikr phrase you want to repeat
- Counter and history saved locally on your device
- Light haptic feedback on every tap

### 🗣️ Hadith Collection
- Browse the nine canonical hadith books (Sahih al-Bukhari, Sahih Muslim, Sunan Abi Dawud, Tirmidhi, Nasa'i, Ibn Majah, Musnad Ahmad, Muwatta Malik, Sunan al-Darimi)
- Thematic categories (aqeedah, fiqh, seerah, manners, and more)
- **Color-coded grade badge** for every hadith: green for Sahih, yellow for Hasan, red for Da'if
- Save any hadith to favorites
- Previously browsed hadiths are cached for offline reading

### ⭐ Favorites
- One place to collect everything you've saved: verses and hadiths
- Quick access to revisit what matters to you

### 🎯 Daily Wird (Reading Goal)
- Set a daily reading target (pages or juz)
- Automatic progress tracking
- Encourages consistency by keeping your streak in view

### ⚙️ Settings
- Theme control (light, dark, or automatic)
- Adjustable Quran text size
- Default reciter selection
- Toggle prayer time and adhan notifications
- All data stays on your device — nothing is sent to any external server

---

## 🌐 Offline-First

Sakinah keeps working even when your connection doesn't:

| Content | Offline behavior |
|---|---|
| Holy Quran | Fully available after a one-time download |
| Hadiths | Everything previously browsed + all favorites remain accessible |
| Prayer Times | Last known times are shown with a clear offline notice |
| Adhkar & Tasbih | Work fully with no connection required at all |

---

## 🛠️ Tech Stack

<p align="left">
  <img src="https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/Expo_Router-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Router" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>
<p align="left">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/AsyncStorage-6E4C13?style=flat-square&logo=react&logoColor=white" alt="AsyncStorage" />
  <img src="https://img.shields.io/badge/TanStack_Query-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="React Query" />
</p>
<p align="left">
  <img src="https://img.shields.io/badge/Expo_Notifications-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Notifications" />
  <img src="https://img.shields.io/badge/Expo_Location-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Location" />
  <img src="https://img.shields.io/badge/EAS_Build-000020?style=flat-square&logo=expo&logoColor=white" alt="EAS Build" />
</p>

| Layer | Technology |
|---|---|
| Mobile app | Expo (React Native) + expo-router |
| Language | TypeScript |
| Local storage | SQLite + AsyncStorage |
| Data fetching / caching | TanStack Query (React Query) |
| Notifications | expo-notifications |
| Location & compass | expo-location + expo-sensors |
| Build & distribution | EAS Build |

---

## 📚 Content Sources

The app relies on trusted, open Islamic content sources:

- **Quran text & tafsir**: alquran.cloud
- **Audio recitation**: quran.com
- **Hadith collections**: hadeethenc.com and the canonical nine-book databases
- **Prayer times**: aladhan.com (calculation method: Muslim World League)

All sources are public and open. The app does not collect or share any personal user data with any party.

---

## 🚀 Running Locally

```bash
# 1) Install dependencies
cd app/artifacts/mobile
npm install

# 2) Start the dev server
npx expo start

# 3) Open the app
# Scan the QR code with Expo Go, or run it on an Android/iOS emulator
```

> Note: some features (like real adhan sound notifications) require a full development build via EAS and won't work completely inside the standard Expo Go app.

### Building an installable version (APK / Development Build)

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

---

## 🔒 Privacy

- No sign-up or user accounts
- All your data (favorites, wird progress, settings) is stored locally on your device only
- No personal data is collected, sold, or shared with any third party
- Location is used only to calculate prayer times and Qibla direction — it is never stored or transmitted to any server

---

## 🤲 Project Intention

This project is offered for free and without expectation of return, in the hope that it benefits everyone who reads from it or listens to it, and that Allah places it in the scale of good deeds for everyone who contributed to it, shared it, or pointed someone toward it.

Anyone who contributed an idea, code, a prayer, or simply shared this app with someone who could benefit from it — may their reward be with Allah.

> *"Whoever guides someone to goodness will have a reward like the one who did it."*

We ask Allah to accept this work purely for His sake, and to benefit through it everyone who reads a verse, keeps a remembrance, or establishes a prayer on time.

---

## 📄 License

This project is open source and available for everyone to use, modify, and distribute, on the condition that it remains free for the end user.

---

<p align="center">
  May Allah make this a source of lasting benefit, and an ongoing charity after all other deeds have ceased 🤲
</p>
