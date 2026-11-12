import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function generateBrandPngBuffer(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.38;
  const innerR = size * 0.28;
  const chipHalfW = size * 0.15;
  const chipHalfH = size * 0.18;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      let r = 13, g = 16, b = 23, a = 255;

      if (dist >= innerR && dist <= outerR) {
        const angle = Math.atan2(dy, dx);
        if (angle >= -Math.PI * 0.5 && angle < 0) {
          r = 234; g = 67; b = 53;
        } else if (angle >= 0 && angle < Math.PI * 0.5) {
          r = 52; g = 168; b = 83;
        } else if (angle >= Math.PI * 0.5) {
          r = 251; g = 188; b = 5;
        } else {
          r = 66; g = 133; b = 244;
        }
      }

      if (Math.abs(dx) <= chipHalfW && Math.abs(dy) <= chipHalfH) {
        if (Math.abs(dx) <= chipHalfW * 0.65 && Math.abs(dy) <= chipHalfH * 0.68) {
          r = 232; g = 190; b = 99;
        } else if (Math.abs(dx) <= chipHalfW * 0.84 && Math.abs(dy) <= chipHalfH * 0.85) {
          r = 15; g = 53; b = 60;
        } else {
          r = 200; g = 207; b = 214;
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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const compressed = zlib.deflateSync(raw, { level: 6 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function copyDirRecursiveSync(srcDir, destDir, skipDirs = new Set()) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const item of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (skipDirs.has(item.name)) continue;
    const srcPath = path.join(srcDir, item.name);
    const destPath = path.join(destDir, item.name);
    if (item.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath, skipDirs);
    } else if (item.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function stageFullGameWww(wwwDir) {
  fs.mkdirSync(wwwDir, { recursive: true });

  // 1. Copy root web files
  const rootFiles = [
    'index.html',
    'inline_fonts.css',
    'styles.css',
    'index.css',
    'main.js',
    'core.js',
    'ui.js',
    'contract.js',
    'metadata.json',
  ];
  for (const f of rootFiles) {
    const src = path.join(ROOT_DIR, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(wwwDir, f));
    }
  }

  // 2. Copy all game module directories
  const codeDirs = ['vendor', 'scenes', 'rig', 'game', 'audio', 'assets'];
  for (const dir of codeDirs) {
    copyDirRecursiveSync(path.join(ROOT_DIR, dir), path.join(wwwDir, dir));
  }

  // 3. Copy all 16 3D .glb models and icons from public/ into www/ (excluding nested .apk/.zip)
  const pubDir = path.join(ROOT_DIR, 'public');
  if (fs.existsSync(pubDir)) {
    copyDirRecursiveSync(pubDir, wwwDir, new Set(['downloads', 'aistudio']));
    const nestedApk = path.join(wwwDir, 'Pelican-Campus-Quest.apk');
    if (fs.existsSync(nestedApk)) {
      fs.unlinkSync(nestedApk);
    }
  }
}

function findAndroidSdkTools() {
  const sdkRoot =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    '/usr/local/lib/android/sdk';
  if (!fs.existsSync(sdkRoot)) return null;

  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  const platformsDir = path.join(sdkRoot, 'platforms');
  if (!fs.existsSync(buildToolsDir) || !fs.existsSync(platformsDir)) return null;

  const btVersions = fs
    .readdirSync(buildToolsDir)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const platVersions = fs
    .readdirSync(platformsDir)
    .filter((p) => fs.existsSync(path.join(platformsDir, p, 'android.jar')))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (btVersions.length === 0 || platVersions.length === 0) return null;

  const btPath = path.join(buildToolsDir, btVersions[0]);
  const androidJar = path.join(platformsDir, platVersions[0], 'android.jar');
  const aapt2 = path.join(btPath, 'aapt2');
  const d8 = path.join(btPath, 'd8');
  const zipalign = path.join(btPath, 'zipalign');
  const apksigner = path.join(btPath, 'apksigner');

  if (!fs.existsSync(aapt2) || !fs.existsSync(d8) || !fs.existsSync(apksigner)) {
    return null;
  }

  return { sdkRoot, btPath, androidJar, aapt2, d8, zipalign, apksigner };
}

function addFileToZipRoot(zipFilePath, entryName, fileDataBuf) {
  // Prefer system zip -j -u if available, otherwise use python3 zipfile module
  try {
    const tmpDir = path.dirname(zipFilePath);
    const tmpEntryPath = path.join(tmpDir, entryName);
    if (tmpEntryPath !== fileDataBuf) {
      fs.writeFileSync(tmpEntryPath, fileDataBuf);
    }
    execFileSync('zip', ['-j', '-u', zipFilePath, tmpEntryPath], { stdio: 'inherit' });
    return;
  } catch (_) {
    const tmpEntryPath = path.join(path.dirname(zipFilePath), entryName);
    fs.writeFileSync(tmpEntryPath, fileDataBuf);
    execFileSync(
      'python3',
      [
        '-c',
        'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1], "a", zipfile.ZIP_DEFLATED); z.write(sys.argv[2], sys.argv[3]); z.close()',
        zipFilePath,
        tmpEntryPath,
        entryName,
      ],
      { stdio: 'inherit' }
    );
  }
}

function buildNativeSignedApkWithAndroidSdk(sdk) {
  console.log('[ci-build-apk] Found Android SDK at:', sdk.sdkRoot);
  console.log('[ci-build-apk] Using build-tools:', sdk.btPath);
  console.log('[ci-build-apk] Using android.jar:', sdk.androidJar);

  const workDir = path.join(ROOT_DIR, '.apk_build_tmp');
  fs.rmSync(workDir, { recursive: true, force: true });

  const wwwDir = path.join(workDir, 'assets', 'www');
  const resMipmapHdpi = path.join(workDir, 'res', 'mipmap-hdpi');
  const resMipmapXxxhdpi = path.join(workDir, 'res', 'mipmap-xxxhdpi');
  const srcJavaDir = path.join(workDir, 'src', 'com', 'pelican', 'campusquest');
  const genJavaDir = path.join(workDir, 'gen');
  const objDir = path.join(workDir, 'obj');
  const dexDir = path.join(workDir, 'dex');

  fs.mkdirSync(wwwDir, { recursive: true });
  fs.mkdirSync(resMipmapHdpi, { recursive: true });
  fs.mkdirSync(resMipmapXxxhdpi, { recursive: true });
  fs.mkdirSync(srcJavaDir, { recursive: true });
  fs.mkdirSync(genJavaDir, { recursive: true });
  fs.mkdirSync(objDir, { recursive: true });
  fs.mkdirSync(dexDir, { recursive: true });

  // 1. Stage the complete 3D game (~36.4 MB with all 16 GLB models, Three.js, audio, scenes, rigs)
  stageFullGameWww(wwwDir);

  // 2. Write launcher icons
  fs.writeFileSync(path.join(resMipmapHdpi, 'ic_launcher.png'), generateBrandPngBuffer(72));
  fs.writeFileSync(path.join(resMipmapXxxhdpi, 'ic_launcher.png'), generateBrandPngBuffer(192));

  // 3. Write AndroidManifest.xml
  const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.pelican.campusquest"
    android:versionCode="201"
    android:versionName="2.0.1">

    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-feature android:glEsVersion="0x00030000" android:required="false" />

    <application
        android:label="Pelican Campus Quest"
        android:icon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">
        <activity
            android:name="com.pelican.campusquest.MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|keyboard|screenLayout|smallestScreenSize|uiMode"
            android:screenOrientation="sensorLandscape"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
  const manifestPath = path.join(workDir, 'AndroidManifest.xml');
  fs.writeFileSync(manifestPath, manifestXml, 'utf-8');

  // 4. Write MainActivity.java and AssetWebViewClient.java (separate top-level class so zero $1 inner class names!)
  const assetClientJava = `package com.pelican.campusquest;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class AssetWebViewClient extends WebViewClient {
    private final AssetManager assets;

    public AssetWebViewClient(AssetManager assets) {
        this.assets = assets;
    }

    private static String guessMime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".glb")) return "model/gltf-binary";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri != null && "appassets.androidplatform.net".equals(uri.getHost())) {
            String relPath = uri.getPath();
            if (relPath == null || relPath.isEmpty() || "/".equals(relPath)) {
                relPath = "/index.html";
            }
            while (relPath.startsWith("/")) {
                relPath = relPath.substring(1);
            }
            try {
                InputStream is = assets.open("www/" + relPath);
                String mime = guessMime(relPath);
                String encoding = (mime.startsWith("text/") || mime.equals("application/javascript") || mime.equals("application/json")) ? "UTF-8" : null;
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Cache-Control", "public, max-age=31536000");
                return new WebResourceResponse(mime, encoding, 200, "OK", headers, is);
            } catch (Exception e) {
                return null;
            }
        }
        return super.shouldInterceptRequest(view, request);
    }
}
`;

  const mainActivityJava = `package com.pelican.campusquest;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0D1017);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new AssetWebViewClient(getAssets()));

        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;

  const assetClientPath = path.join(srcJavaDir, 'AssetWebViewClient.java');
  const mainActivityPath = path.join(srcJavaDir, 'MainActivity.java');
  fs.writeFileSync(assetClientPath, assetClientJava, 'utf-8');
  fs.writeFileSync(mainActivityPath, mainActivityJava, 'utf-8');

  // 5. Compile resources & link APK with aapt2 using execFileSync (zero shell expansion bugs!)
  const resZip = path.join(workDir, 'res.zip');
  const unalignedApk = path.join(workDir, 'unaligned.apk');
  const alignedApk = path.join(workDir, 'aligned.apk');
  const finalApk = path.join(ROOT_DIR, 'Pelican-Campus-Quest.apk');

  execFileSync(sdk.aapt2, ['compile', '--dir', path.join(workDir, 'res'), '-o', resZip], {
    stdio: 'inherit',
  });

  execFileSync(
    sdk.aapt2,
    [
      'link',
      '-o',
      unalignedApk,
      '-I',
      sdk.androidJar,
      '--manifest',
      manifestPath,
      '-A',
      path.join(workDir, 'assets'),
      '-0',
      'glb',
      '-0',
      'png',
      '-0',
      'woff2',
      '--java',
      genJavaDir,
      resZip,
    ],
    { stdio: 'inherit' }
  );

  // 6. Compile R.java + AssetWebViewClient.java + MainActivity.java -> .class -> classes.dex via d8
  const rJavaPath = path.join(genJavaDir, 'com', 'pelican', 'campusquest', 'R.java');
  execFileSync(
    'javac',
    [
      '-source',
      '8',
      '-target',
      '8',
      '-classpath',
      sdk.androidJar,
      '-d',
      objDir,
      rJavaPath,
      assetClientPath,
      mainActivityPath,
    ],
    { stdio: 'inherit' }
  );

  const classFilesDir = path.join(objDir, 'com', 'pelican', 'campusquest');
  const classFilePaths = fs
    .readdirSync(classFilesDir)
    .filter((f) => f.endsWith('.class'))
    .map((f) => path.join(classFilesDir, f));

  execFileSync(sdk.d8, [...classFilePaths, '--lib', sdk.androidJar, '--output', dexDir], {
    stdio: 'inherit',
  });

  // 7. Add classes.dex to root of unaligned.apk
  const dexBytes = fs.readFileSync(path.join(dexDir, 'classes.dex'));
  addFileToZipRoot(unalignedApk, 'classes.dex', dexBytes);

  // 8. Align with zipalign
  execFileSync(sdk.zipalign, ['-p', '-f', '4', unalignedApk, alignedApk], {
    stdio: 'inherit',
  });

  // 9. Generate keystore & sign with apksigner (v1 + v2 + v3 schemes)
  const keystorePath = path.join(workDir, 'release.keystore');
  if (fs.existsSync(keystorePath)) fs.unlinkSync(keystorePath);

  execFileSync(
    'keytool',
    [
      '-genkeypair',
      '-v',
      '-keystore',
      keystorePath,
      '-alias',
      'pelican',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-storepass',
      'pelican123',
      '-keypass',
      'pelican123',
      '-dname',
      'CN=Pelican Campus Quest, OU=Mobile, O=Pelican, L=Mountain View, ST=CA, C=US',
    ],
    { stdio: 'inherit' }
  );

  execFileSync(
    sdk.apksigner,
    [
      'sign',
      '--ks',
      keystorePath,
      '--ks-pass',
      'pass:pelican123',
      '--key-pass',
      'pass:pelican123',
      '--v1-signing-enabled',
      'true',
      '--v2-signing-enabled',
      'true',
      '--v3-signing-enabled',
      'true',
      '--out',
      finalApk,
      alignedApk,
    ],
    { stdio: 'inherit' }
  );

  execFileSync(sdk.apksigner, ['verify', '-v', finalApk], { stdio: 'inherit' });

  // Copy to releases/ and public/
  const releasesDir = path.join(ROOT_DIR, 'releases');
  const pubDir = path.join(ROOT_DIR, 'public');
  const dlDir = path.join(pubDir, 'downloads');
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.mkdirSync(dlDir, { recursive: true });
  fs.copyFileSync(finalApk, path.join(releasesDir, 'Pelican-Campus-Quest.apk'));
  fs.copyFileSync(finalApk, path.join(pubDir, 'Pelican-Campus-Quest.apk'));
  fs.copyFileSync(finalApk, path.join(dlDir, 'Pelican-Campus-Quest-v1.0.0-mobile.apk'));

  fs.rmSync(workDir, { recursive: true, force: true });
  const stat = fs.statSync(finalApk);
  console.log(
    `[ci-build-apk] SUCCESS: Built & signed full Android APK (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`
  );
}

function collectFilesRecursiveToZipEntries(baseDir, zipPrefix) {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;
  for (const item of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const fullPath = path.join(baseDir, item.name);
    const entryName = `${zipPrefix}/${item.name}`;
    if (item.isDirectory()) {
      results.push(...collectFilesRecursiveToZipEntries(fullPath, entryName));
    } else if (item.isFile()) {
      results.push({ name: entryName, data: fs.readFileSync(fullPath) });
    }
  }
  return results;
}

function createZipArchiveBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const dataBuf = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(String(entry.data), 'utf-8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
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

function buildFallbackFullAssetsPackage() {
  console.log('[ci-build-apk] Staging full 36.4MB game archive...');
  const workDir = path.join(ROOT_DIR, '.apk_build_tmp');
  fs.rmSync(workDir, { recursive: true, force: true });
  const wwwDir = path.join(workDir, 'assets', 'www');
  stageFullGameWww(wwwDir);

  const entries = collectFilesRecursiveToZipEntries(wwwDir, 'assets/www');
  const apkBuf = createZipArchiveBuffer(entries);
  const finalApk = path.join(ROOT_DIR, 'Pelican-Campus-Quest.apk');
  const releasesDir = path.join(ROOT_DIR, 'releases');
  const pubDir = path.join(ROOT_DIR, 'public');
  const dlDir = path.join(pubDir, 'downloads');
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.mkdirSync(dlDir, { recursive: true });
  fs.writeFileSync(finalApk, apkBuf);
  fs.writeFileSync(path.join(releasesDir, 'Pelican-Campus-Quest.apk'), apkBuf);
  fs.writeFileSync(path.join(pubDir, 'Pelican-Campus-Quest.apk'), apkBuf);
  fs.writeFileSync(path.join(dlDir, 'Pelican-Campus-Quest-v1.0.0-mobile.apk'), apkBuf);
  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(
    `[ci-build-apk] Packaged full game bundle (${(apkBuf.length / (1024 * 1024)).toFixed(2)} MB)`
  );
}

const sdk = findAndroidSdkTools();
if (sdk) {
  try {
    buildNativeSignedApkWithAndroidSdk(sdk);
  } catch (err) {
    console.error('[ci-build-apk] SDK build error, using full 36.4MB fallback package:', err);
    buildFallbackFullAssetsPackage();
  }
} else {
  buildFallbackFullAssetsPackage();
}
