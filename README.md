# 🚲 Pelican Campus Quest · Mountain View 3D Open World (Mobile APK Edition)

## 📲 Direct Download APK (Mobile)

Click either button below on your phone to **directly download the Android `.apk` file**:

### 👉 [**📥 DOWNLOAD APK DIRECTLY (GitHub Release — Pelican-Campus-Quest.apk)**](../../releases/latest/download/Pelican-Campus-Quest.apk)

### 👉 [**📥 DOWNLOAD APK DIRECTLY (Instant Repo Mirror — Pelican-Campus-Quest.apk)**](./releases/Pelican-Campus-Quest.apk?raw=true)

---

## ⚙️ GitHub Actions Automatic APK Builder

This repository includes an automated GitHub Actions workflow ([`.github/workflows/build-apk.yml`](./.github/workflows/build-apk.yml)) that:
1. Compiles the 3D WebGL game bundle (`npm run build`).
2. Wraps the game into an Android app (`com.pelican.campusquest`) using Capacitor & Gradle (`./gradlew assembleDebug`).
3. Uploads **`Pelican-Campus-Quest.apk`** both to **GitHub Releases** (`v1.0.0`) and **GitHub Actions Artifacts**.

### How to Trigger / Download from GitHub:
1. **From Releases (Recommended):** Tap **Releases** on this GitHub page (or tap the **Download APK Directly** link above) and tap **`Pelican-Campus-Quest.apk`**.
2. **From Actions:** Go to the [**Actions**](../../actions) tab → select **Build & Publish Android APK** → tap **Run workflow** (or open the latest completed run) and download **`Pelican-Campus-Quest-APK`**.
3. **Instant Repo Mirror:** Open the [`releases/`](./releases) folder in this repository and tap [`Pelican-Campus-Quest.apk`](./releases/Pelican-Campus-Quest.apk?raw=true) → **Download**.

---

## 🎮 Local Development & Manual APK Build

```bash
# 1. Install dependencies & download 3D assets
npm install

# 2. Start local development server (Port 3000)
npm run dev

# 3. Build production bundle
npm run build
```
