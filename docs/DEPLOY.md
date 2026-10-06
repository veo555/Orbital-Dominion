# Releasing Orbital Dominion — website, installable web app, and app stores

One source tree, three build outputs (`python3 build.py`):

| Output | What it is | Use it for |
|---|---|---|
| `dist/orbital_dominion_v3.html` | **one self-contained file** (≈ 0.6 MB): game, styles, icons (as `data:` URIs). Zero network requests. | double-click to play; upload to itch.io / a blog / a file host; email it; a "Download" button on your site |
| `dist/pwa/` | `index.html`, `manifest.webmanifest`, `sw.js` (offline-first, versioned), `icons/`, `_headers` | host on any HTTPS site → installable on Android/desktop (Add to Home Screen on iPhone), plays offline |
| `dist/store/index.html` | the game with all payment code configured off | the web directory for Capacitor/Cordova store wrappers (`npm run www` copies it to `www/`) |

## 1. Share it as a downloadable HTML file

Upload `dist/orbital_dominion_v3.html` anywhere. It runs from `file://` and from any web host, on desktop and on phones (open the file in the phone's browser).
Notes: a file opened from disk cannot register a service worker, so it is not installable and has no offline *cache* (it does not need one: it is the cache).
Browsers also give `file://` pages an opaque origin, so settings stored in `localStorage` may not persist between sessions in some browsers — hosting it (below) fixes that.

## 2. Host the installable web app (PWA)

Deploy the **contents of `dist/pwa/`** to any static HTTPS host. All paths are relative, so it also works under a sub-path (`https://you.github.io/orbital/`).

| Host | How | Headers |
|---|---|---|
| **Cloudflare Pages** | create a project, build command `python3 build.py pwa`, output `dist/pwa` (or upload the folder) | `_headers` is honoured: nosniff, CSP, `Permissions-Policy`, no-cache for `sw.js`/`index.html`/manifest |
| **Netlify** | same; `_headers` is honoured | as above |
| **GitHub Pages** | `.github/workflows/pages.yml` deploys `dist/pwa` on push to `main` (Settings → Pages → Source: GitHub Actions) | **`_headers` is ignored** — the game works, you just lack the CSP/nosniff headers |
| any other | upload the folder | add the headers from `dist/pwa/_headers` if the host supports them; **`sw.js` must be served with `Cache-Control: no-cache`** or updates are delayed |

What the PWA gives players: *Install app* (Android/desktop Chrome/Edge prompt; iPhone: the game shows Share → Add to Home Screen instructions), full-screen standalone window, landscape lock on Android,
offline play after the first visit, and a "A new version is ready — tap to update" banner (an update never replaces code under a running match).
Verified by `tests/e2e/e2e_pwa.py` in Chromium: manifest, Chrome's installability verdict, service worker activation, **offline reload and offline match**, the update flow, no off-origin requests.

**Social previews:** the page declares `og:title`/`og:description`; for a rich link card add absolute URLs for `og:image` (`icons/og-image.png`, 1200 × 630) once you know your domain.

## 3. Native apps (Google Play / Apple App Store) with Capacitor

The game is the same web code in a native WebView (Capacitor). Read `docs/STORE_RELEASE_ROADMAP.md` first — it lists the accounts, review rules and the device-spike gate.
Short version of the toolchain (unverified here: the authoring sandbox had no access to the Capacitor packages, Android Studio or Xcode):

```bash
npm run www                         # build the store variant and copy it to www/
npm i @capacitor/core @capacitor/app @capacitor/haptics @capacitor/status-bar @capacitor/screen-orientation
npm i -D @capacitor/cli @capacitor/android @capacitor/ios
# edit capacitor.config.json: appId is PERMANENT once published (com.example.orbitaldominion is a placeholder)
npx cap add android && npx cap add ios && npx cap sync
npx cap open android                # Android Studio: targetSdk per Google's current requirement, lock landscape, build an .aab
npx cap open ios                    # Xcode (macOS only): signing, deployment target, archive
```

`75_platform.js` already listens for Capacitor's `appStateChange` (auto-pause) and `backButton` (Android back = pause menu); the game needs no code change to run in the wrapper.
Payments are hidden in this variant (see `docs/MONETIZATION.md` §4).

## 4. Release checklist

- [ ] `bash tests/run_all.sh` is green on the release commit (about 5 minutes).
- [ ] `python3 build.py` and commit `dist/` (CI checks that the committed build matches the sources).
- [ ] Re-generate icons only if the logo changed: `npm run icons`.
- [ ] Play it on **real** devices: at least one Android phone, one iPhone, one desktop browser each of Chrome/Safari/Firefox. This is the biggest gap in the automated evidence (see `docs/KNOWN_LIMITATIONS_AND_TEST_RESULTS.md`).
- [ ] Decide the final name/domain; update `GAME_URL`/`ALLOWED_ORIGINS` if payments are on; publish a privacy policy (the game collects nothing and makes no requests unless payments are enabled).
- [ ] Optional payments: follow `docs/MONETIZATION.md` §5 in test mode first.
