// Generates the Android project (Trusted Web Activity) that opens the DCU Active web app — UAT approach A.
// The app content is NOT bundled: every web deploy reaches the APK immediately. After UAT the plan is approach B
// (Capacitor, web assets bundled in the APK) under the final package id `id.dcu.active`.
//
// Usage: npm run generate            (reads the web manifest from TWA_URL, default = staging)
import Color from 'color'; // Bubblewrap's own colour type (dependency of @bubblewrap/core)
import { ConsoleLog, TwaGenerator, TwaManifest } from '@bubblewrap/core';

const SITE = process.env.TWA_URL ?? 'https://dcu-active-staging.dcu-active.workers.dev';

const manifest = await TwaManifest.fromWebManifest(`${SITE}/manifest.webmanifest`);
manifest.packageId = 'id.dcu.active.uat';   // UAT build; the final app (approach B) uses id.dcu.active
manifest.name = 'DCU Active (UAT)';
manifest.launcherName = 'DCU UAT';           // label under the home-screen icon
manifest.appVersionCode = 1;
manifest.appVersionName = '1.0.0-uat';
manifest.fallbackType = 'customtabs';         // if Digital Asset Links fail, open in a Custom Tab (never a WebView)
manifest.enableNotifications = false;
manifest.navigationColor = new Color('#FFFFFF');         // Android navigation bar matches the white app background
manifest.navigationDividerColor = new Color('#D1D5DB');
manifest.themeColorDark = new Color('#1F2937');
manifest.signingKey = { path: './signing/dcu-active-uat.keystore', alias: 'dcu-active-uat' };

await manifest.saveToFile('./twa-manifest.json');
await new TwaGenerator().createTwaProject('./project', manifest, new ConsoleLog('twa'));
console.log(`Generated ./project for ${manifest.packageId} → ${SITE}${manifest.startUrl}`);
