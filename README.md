# 🌙 Sakinah — سكينة

<p align="center">
  <strong>Your daily companion for Quran, remembrance, and prayer</strong>
</p>

<p align="center">
  An Arabic-first Islamic mobile app for Quran, Hadith, Adhkar, Tasbih, Qibla, and prayer times.
</p>

<p align="center">
  <strong>Free · Open Source · No Ads · No Accounts · Privacy First</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white" alt="TanStack Query" />
</p>

---

## 📖 About

**Sakinah (سكينة)** is a free, Arabic-first Islamic mobile application designed to bring essential daily worship tools into one calm and simple experience.

The app focuses on:

* 📖 Quran
* 🕌 Prayer times
* 🧭 Qibla
* 📿 Adhkar & Tasbih
* 🗣️ Hadith
* ⭐ Favorites
* 🎯 Daily Wird
* ⚙️ Personal settings

The interface is designed **RTL-first** and optimized primarily for Arabic users.

Sakinah is being developed as a **Sadaqah Jariyah (صدقة جارية)** project, with no commercial purpose, no advertisements, and no user accounts.

---

## ✨ Features

### 📖 Quran

* Complete Quran — all **114 Surahs**
* Browse by Surah
* Browse by Juz
* Verse-level Tafsir
* Mishary Alafasy recitation
* Reciter selection
* Adjustable Quran font size
* Verse favorites/bookmarks
* Automatic reading-position tracking
* "Continue Reading" on the home screen
* Offline Quran reading after downloading the required content

### 🕌 Prayer Times

* Five daily prayer times
* Location-based calculation
* Hijri date
* Gregorian date
* Next-prayer countdown
* Prayer notifications
* Adhan notification support
* Cached prayer times for offline fallback
* Clear indication when displayed times come from cached data

### 🧭 Qibla

* Live Qibla direction
* Device location
* Magnetic heading sensor
* Real-time compass updates
* Designed for use while traveling

### 📿 Adhkar & Tasbih

* Morning and evening remembrance
* Dhikr text and repetitions
* Source information where available
* Simple Tasbih counter
* Custom dhikr phrases
* Local counter history
* Haptic feedback
* Works without an internet connection

### 🗣️ Hadith

Browse a collection of major Hadith books, including:

* Sahih al-Bukhari
* Sahih Muslim
* Sunan Abi Dawud
* Jami' al-Tirmidhi
* Sunan al-Nasa'i
* Sunan Ibn Majah
* Musnad Ahmad
* Muwatta Malik
* Sunan al-Darimi

Additional features:

* Browse by book
* Browse by category/topic
* Hadith search
* Hadith source information
* Save Hadith to favorites
* Previously loaded Hadith can remain available offline

> Hadith grading is displayed only when a reliable source provides grading information. The app does not invent or infer grades.

### ⭐ Favorites

A unified place for saved content:

* Quran verses
* Hadiths
* Other supported saved items

Everything is stored locally on the device.

### 🎯 Daily Wird

Set a personal Quran reading goal and track your progress.

Possible goals include:

* Pages per day
* Juz per day
* Daily progress
* Reading streak

The goal is to encourage consistency without turning worship into a competition.

### ⚙️ Settings

* Light / Dark / System theme
* Quran font-size control
* Reciter selection
* Prayer notification settings
* Adhan settings
* Local data management
* Personal reading preferences

---

# 📱 Offline-First

Sakinah is designed to remain useful even when the internet is unavailable.

| Feature         | Offline behavior                                 |
| --------------- | ------------------------------------------------ |
| 📖 Quran        | Available offline after local data is downloaded |
| 🗣️ Hadith      | Previously loaded content remains available      |
| ⭐ Favorites     | Stored locally                                   |
| 🎯 Wird         | Stored locally                                   |
| 📿 Tasbih       | Fully offline                                    |
| 🤲 Adhkar       | Fully offline                                    |
| 🕌 Prayer Times | Uses the latest available cached times           |
| 🧭 Qibla        | Uses the device's location and sensors           |

The app does not require an account or cloud synchronization for personal data.

---

# 🏗️ Architecture

Sakinah follows a local-first architecture with a clear separation between UI, data fetching, and local persistence.

```text
┌──────────────────────────────┐
│          React Native        │
│          Expo Router         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        UI / Screens          │
│  Quran · Hadith · Prayer    │
│  Qibla · Adhkar · Settings  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│       TanStack Query         │
│    Fetching · Caching        │
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐ ┌───────────────┐
│ Remote APIs  │ │ Local Storage │
│ Quran        │ │ SQLite        │
│ Hadith       │ │ AsyncStorage  │
│ Prayer       │ │               │
└──────────────┘ └───────────────┘
```

### API Layer

External APIs are accessed through a shared HTTP layer responsible for:

* Request handling
* Timeout management
* Error normalization
* Network error detection
* In-flight request deduplication
* JSON parsing

This keeps provider-specific logic inside files such as:

```text
lib/api/
├── http.ts
├── quran.ts
├── hadith.ts
├── adhkar.ts
└── prayer.ts
```

---

# 🛠️ Tech Stack

<p align="left">
  <img src="https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/Expo_Router-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Router" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="left">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/AsyncStorage-6E4C13?style=flat-square&logo=react&logoColor=white" alt="AsyncStorage" />
  <img src="https://img.shields.io/badge/TanStack_Query-FF4154?style=flat-square&logo=reactquery&logoColor=white" alt="TanStack Query" />
</p>

<p align="left">
  <img src="https://img.shields.io/badge/Expo_Notifications-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Notifications" />
  <img src="https://img.shields.io/badge/Expo_Location-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Location" />
  <img src="https://img.shields.io/badge/Expo_Sensors-000020?style=flat-square&logo=expo&logoColor=white" alt="Expo Sensors" />
  <img src="https://img.shields.io/badge/EAS_Build-000020?style=flat-square&logo=expo&logoColor=white" alt="EAS Build" />
</p>

| Layer             | Technology          |
| ----------------- | ------------------- |
| Mobile            | React Native + Expo |
| Navigation        | Expo Router         |
| Language          | TypeScript          |
| Data fetching     | TanStack Query      |
| Local database    | SQLite              |
| Local preferences | AsyncStorage        |
| Notifications     | Expo Notifications  |
| Location          | Expo Location       |
| Sensors           | Expo Sensors        |
| Builds            | EAS Build           |

---

# 📚 Content & Data Sources

Sakinah uses external services and publicly available datasets for different parts of the application.

| Content             | Source                                          |
| ------------------- | ----------------------------------------------- |
| Quran text          | alquran.cloud                                   |
| Quran audio         | Quran.com / supported recitation providers      |
| Tafsir              | alquran.cloud                                   |
| Hadith              | HadeethEnc and other documented Hadith datasets |
| Prayer calculations | AlAdhan                                         |

Source information is preserved where available so that users can identify the origin of religious content.

> **Important:** External APIs and datasets can change, become unavailable, or contain different metadata. The application therefore avoids presenting unsupported information as fact.

---

# 🔐 Privacy

Privacy is a core design principle of Sakinah.

### No account required

There is no:

* Sign-up
* Login
* Password
* User profile

### Local-first personal data

The following information is stored locally:

* Favorites
* Reading position
* Wird progress
* Settings
* Tasbih data
* Cached content

### Location

Location may be accessed when required for:

* Prayer-time calculation
* Qibla direction

The application does not maintain a personal location profile.

---

# 🚀 Getting Started

## Requirements

Make sure you have:

* Node.js
* npm
* Expo
* Android Studio or a physical Android device for Android development

## Installation

```bash
cd app/artifacts/mobile
npm install
```

## Start the development server

```bash
npx expo start
```

Then:

* Scan the QR code with a compatible device
* Or run the application on an Android/iOS emulator

---

# 📦 Development Build

Some native features require a development build rather than standard Expo Go.

For example:

* Advanced notification behavior
* Custom notification sounds
* Certain native modules

Create a development Android build with:

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

---

# 🧪 Project Status

Sakinah is an actively developed open-source project.

Some features and data providers may still be evolving.

Current development priorities include:

* Improving Quran UX
* Improving Hadith browsing and search
* Expanding offline support
* Improving prayer notifications
* Refining Qibla accuracy and UX
* Improving Arabic localization
* Expanding the Islamic library
* Strengthening source attribution and data validation

---

# 🤲 Project Intention

Sakinah is developed with the intention of being a **Sadaqah Jariyah (صدقة جارية)**.

The project is free to use and has no commercial purpose.

The hope is that it helps Muslims:

* Read the Quran
* Remember Allah
* Learn beneficial knowledge
* Keep track of prayer times
* Build consistent habits of worship

> **"When a person dies, his deeds come to an end except for three: ongoing charity, beneficial knowledge, or a righteous child who prays for him."**
> — Sahih Muslim

We ask Allah to accept this work, make it beneficial, and reward everyone who contributes to it, improves it, shares it, or benefits from it.

---

# 📄 License

This project is open source.

The project is intended to remain **free for end users**.

See the repository license for the exact terms governing modification and redistribution.

---

<p align="center">
  <strong>🌙 Sakinah — سكينة</strong>
  <br />
  <sub>Built with the hope of becoming a source of lasting benefit.</sub>
</p>
