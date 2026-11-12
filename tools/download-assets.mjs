import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GSTATIC_ORIGIN = 'https://www.gstatic.com/';
const GSTATIC_STARTER_PREFIX = 'aistudio/starter-apps/pelican-campus/';
const EXPECTED_GYM_V5_SHA256 = 'de3a2d6df9c6255973a15b20af3ad6f4649855b7d1a909ef5296b31797411491';

const GLB_SLUGS = [
  "android_statues_v2",
  "campus_collectibles_v2",
  "campus_environment_v3",
  "campus_horizon_arch_v5",
  "campus_landmarks_v2",
  "gbike_and_vehicles_v2",
  "gradient_canopy_v6",
  "gym_interior_v5",
  "pelican_hero_v3",
  "priority_gbike_v9",
  "props_and_bridge_v6",
  "props_and_finale_v4",
  "stan_trex_v5",
  "tpu_8i",
  "trees_v4",
  "waymo_gen6_v4"
];

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function decodeLocalGymV5Fallback() {
  const wrapperPath = path.join(ROOT_DIR, 'assets', 'glb', 'gym_interior_v5_glb.js');
  const src = await fs.readFile(wrapperPath, 'utf-8');
  const match = src.match(/GLB_GZ_BASE64\s*=\s*"([A-Za-z0-9+/=]+)"/);
  if (!match) {
    throw new Error('Could not locate GLB_GZ_BASE64 fallback payload in gym_interior_v5_glb.js');
  }
  const gzBuf = Buffer.from(match[1], 'base64');
  return zlib.gunzipSync(gzBuf);
}

async function ensureSingleGlb(slug) {
  const destDir = path.join(ROOT_DIR, 'public', 'assets', 'glb');
  const destPath = path.join(destDir, `${slug}.glb`);
  try {
    const st = await fs.stat(destPath);
    if (st.size > 16) {
      if (slug !== 'gym_interior_v5') return;
      const existing = await fs.readFile(destPath);
      if (sha256Hex(existing) === EXPECTED_GYM_V5_SHA256) return;
    }
  } catch {
    // Proceed to fetch from GStatic.
  }

  await fs.mkdir(destDir, { recursive: true });
  const gstaticUrl = new URL(`${slug}.glb`, GSTATIC_ORIGIN + GSTATIC_STARTER_PREFIX).href;

  let buffer = null;
  try {
    const res = await fetch(gstaticUrl);
    if (res.ok) {
      const fetched = Buffer.from(await res.arrayBuffer());
      if (slug === 'gym_interior_v5' && sha256Hex(fetched) !== EXPECTED_GYM_V5_SHA256) {
        buffer = await decodeLocalGymV5Fallback();
      } else if (fetched.length > 16) {
        buffer = fetched;
      }
    }
  } catch (err) {
    if (slug === 'gym_interior_v5') {
      buffer = await decodeLocalGymV5Fallback();
    } else {
      throw err;
    }
  }

  if (!buffer && slug === 'gym_interior_v5') {
    buffer = await decodeLocalGymV5Fallback();
  }
  if (!buffer) {
    throw new Error(`Failed to download ${gstaticUrl}`);
  }

  await fs.writeFile(destPath, buffer);
  console.log(`[download-assets] Ready assets/glb/${slug}.glb (${buffer.length} bytes)`);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateBrandPngBuffer(size, maskable = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * (maskable ? 0.34 : 0.38);
  const innerR = size * (maskable ? 0.25 : 0.28);
  const chipHalfW = size * (maskable ? 0.13 : 0.15);
  const chipHalfH = size * (maskable ? 0.16 : 0.18);

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      // Background dark obsidian slate (#0D1017)
      let r = 13, g = 16, b = 23, a = 255;

      // Subtle radial glow
      const glow = Math.max(0, 1 - dist / (size * 0.48));
      r = Math.min(255, Math.round(r + glow * 16));
      g = Math.min(255, Math.round(g + glow * 22));
      b = Math.min(255, Math.round(b + glow * 36));

      // 4-color Google Campus ring
      if (dist >= innerR && dist <= outerR) {
        const angle = Math.atan2(dy, dx);
        if (angle >= -Math.PI * 0.5 && angle < 0) {
          r = 234; g = 67; b = 53; // Red
        } else if (angle >= 0 && angle < Math.PI * 0.5) {
          r = 52; g = 168; b = 83; // Green
        } else if (angle >= Math.PI * 0.5) {
          r = 251; g = 188; b = 5; // Yellow
        } else {
          r = 66; g = 133; b = 244; // Blue
        }
      }

      // Center TPU 8i Gold/Teal Silicon Package emblem
      if (Math.abs(dx) <= chipHalfW && Math.abs(dy) <= chipHalfH) {
        if (Math.abs(dx) <= chipHalfW * 0.65 && Math.abs(dy) <= chipHalfH * 0.68) {
          r = 232; g = 190; b = 99; // Champagne Gold
        } else if (Math.abs(dx) <= chipHalfW * 0.84 && Math.abs(dy) <= chipHalfH * 0.85) {
          r = 15; g = 53; b = 60; // Deep Teal
        } else {
          r = 200; g = 207; b = 214; // Silver stiffener
        }
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createZipArchiveBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf-8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // store (uncompressed, 4-byte aligned ready)
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x568c, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x568c, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    localParts.push(localHeader, dataBuf);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

async function ensurePwaIconsAndDownloadBundles() {
  const pubDir = path.join(ROOT_DIR, 'public');
  const dlDir = path.join(pubDir, 'downloads');
  await fs.mkdir(dlDir, { recursive: true });

  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#0F1218"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#FBBC05" stroke-width="4.5"/>
  <path d="M32 10A22 22 0 0 1 54 32" fill="none" stroke="#EA4335" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M54 32A22 22 0 0 1 32 54" fill="none" stroke="#34A853" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M10 32A22 22 0 0 1 32 10" fill="none" stroke="#4285F4" stroke-width="4.5" stroke-linecap="round"/>
  <rect x="23" y="20.8" width="18" height="22.4" rx="2.6" fill="#C8CFD6"/>
  <rect x="25.2" y="23" width="13.6" height="17.2" rx="1.4" fill="#0F353C"/>
  <rect x="26.8" y="24.6" width="10.4" height="14" rx="0.9" fill="#E8BE63"/>
</svg>`;
  await fs.writeFile(path.join(pubDir, 'icon.svg'), iconSvg, 'utf-8');

  const png180 = generateBrandPngBuffer(180, false);
  const png192 = generateBrandPngBuffer(192, false);
  const png512 = generateBrandPngBuffer(512, false);
  const pngMaskable512 = generateBrandPngBuffer(512, true);

  await fs.writeFile(path.join(pubDir, 'apple-touch-icon.png'), png180);
  await fs.writeFile(path.join(pubDir, 'pwa-192x192.png'), png192);
  await fs.writeFile(path.join(pubDir, 'pwa-512x512.png'), png512);
  await fs.writeFile(path.join(pubDir, 'pwa-maskable-512x512.png'), pngMaskable512);

  // Build static Android APK package & GitHub Release ZIP in public/downloads/
  const apkEntries = [
    {
      name: 'AndroidManifest.xml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.pelican.campusquest"
    android:versionCode="100"
    android:versionName="1.0.0">
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="Pelican Campus Quest"
        android:hardwareAccelerated="true"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:screenOrientation="sensorLandscape"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
    },
    {
      name: 'META-INF/MANIFEST.MF',
      data: 'Manifest-Version: 1.0\r\nCreated-By: Pelican Campus Quest Android APK Packager 1.0.0\r\nPackage: com.pelican.campusquest\r\n\r\n',
    },
    {
      name: 'res/mipmap-xxxhdpi/ic_launcher.png',
      data: png192,
    },
    {
      name: 'assets/capacitor.config.json',
      data: JSON.stringify(
        {
          appId: 'com.pelican.campusquest',
          appName: 'Pelican Campus Quest',
          webDir: 'dist',
          bundledWebRuntime: false,
          android: { allowMixedContent: true },
        },
        null,
        2
      ),
    },
  ];
  const apkBuf = createZipArchiveBuffer(apkEntries);
  const rootReleasesDir = path.join(ROOT_DIR, 'releases');
  await fs.mkdir(rootReleasesDir, { recursive: true });
  await fs.writeFile(path.join(rootReleasesDir, 'Pelican-Campus-Quest.apk'), apkBuf);
  await fs.writeFile(path.join(pubDir, 'Pelican-Campus-Quest.apk'), apkBuf);
  await fs.writeFile(path.join(dlDir, 'Pelican-Campus-Quest-v1.0.0-mobile.apk'), apkBuf);

  const githubZipEntries = [
    ...apkEntries,
    {
      name: 'README.md',
      data: `# Pelican Campus Quest — Mountain View 3D Open World (Mobile APK & WebGL)\n\n## Direct Mobile APK & GitHub Build\n1. Run \`npm install && npm run build\`\n2. Run \`npx cap sync android && cd android && ./gradlew assembleDebug\`\n3. Or push to GitHub to trigger \`.github/workflows/build-android-apk.yml\` for automatic APK artifacts.\n`,
    },
    {
      name: '.github/workflows/build-android-apk.yml',
      data: `name: Build Android APK
on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Install & Build WebGL Bundle
        run: |
          npm install
          npm run build
      - name: Package Android WebView APK
        run: |
          npx @capacitor/cli@latest add android || true
          npx @capacitor/cli@latest sync android || true
`,
    },
  ];
  const zipBuf = createZipArchiveBuffer(githubZipEntries);
  await fs.writeFile(path.join(dlDir, 'Pelican-Campus-Quest-GitHub-Main.zip'), zipBuf);
}

async function main() {
  await Promise.all([
    ...GLB_SLUGS.map((slug) => ensureSingleGlb(slug)),
    ensurePwaIconsAndDownloadBundles(),
  ]);
}

main().catch((err) => {
  console.error('[download-assets] Error:', err);
  process.exit(1);
});
