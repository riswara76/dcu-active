# DCU Active — Android APK

## Approach A (UAT): Trusted Web Activity — this folder

The APK opens the DCU Active web app full-screen (Chrome engine, no address bar). App content is **not** bundled:
every web deploy reaches testers immediately, no reinstall needed.

| Item | Value |
|---|---|
| Package id | `id.dcu.active.uat` (kept separate from the final app) |
| App name / launcher label | DCU Active (UAT) / DCU UAT |
| Opens | `https://dcu-active-staging.dcu-active.workers.dev/` (`TWA_URL` to change) |
| Verification | `public/.well-known/assetlinks.json` in the web app lists the package and the SHA-256 of the signing key. Without it the app still works but shows a small address bar (Custom Tab fallback). |
| Signing key | `signing/dcu-active-uat.keystore` + `signing/keystore.properties` — on the build PC only, **never committed**. Losing them means testers must uninstall and reinstall a newly signed APK. |
| Tools | JDK 17 (`%LOCALAPPDATA%\Programs\Temurin`), Android SDK (`%LOCALAPPDATA%\Android\Sdk`) |

Build steps:

```bash
npm install
npm run generate     # writes twa-manifest.json and ./project from the live web manifest
npm run build        # Gradle release build, then zipalign + apksigner → dcu-active-uat.apk
```

Install on a phone: send `dcu-active-uat.apk` (e.g. Google Drive), open it, allow "Install unknown apps".

## Approach B (after UAT): Capacitor — planned

Web assets are bundled inside the APK; updates require a new APK version. Planned steps:

1. Add Capacitor to the web app (`@capacitor/core`, `@capacitor/android`), `appId` **`id.dcu.active`**, `webDir: dist`.
2. Production build with the production Supabase URL/key; `npx cap sync android`.
3. Auth redirects: add the app scheme to Supabase redirect URLs; keep the email-code flow (works without deep links).
4. New **production** signing key held by DCU/Danamon IT (or Play App Signing); remove this UAT key and the UAT entry from `assetlinks.json`.
5. Remove the staging-only test login (`VITE_TEST_LOGIN_DOMAIN`) from the production build.
6. Distribute through Google Play (DCU developer account) or Danamon MDM.
