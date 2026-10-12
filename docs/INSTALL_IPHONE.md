# Install Orbital Dominion on an iPhone (web app, no App Store)

You need: an iPhone with iOS 16 or newer, Safari (the built-in browser), and the HTTPS link to the published game (for this repository:
`https://veo555.github.io/claude/` once GitHub Pages is switched on; see "Publishing" below).

## Install (about 1 minute)
1. On the iPhone open **Safari** and go to the link. (Use Safari itself: other browsers on iOS can add home-screen apps too since iOS 16.4, but Safari is the reference.)
2. Wait until the menu has loaded once, with a network connection. This downloads the game for offline use.
3. Tap the **Share** button (square with an arrow, bottom centre in portrait, top right in landscape).
4. Scroll the share sheet and tap **Add to Home Screen**.
5. Leave the name "Orbital" (or change it) and tap **Add**.
6. Open the **Orbital** icon on the home screen. It starts full-screen without Safari's bars and works offline from now on.

## Playing
* **Turn the phone to landscape** for the best layout (portrait works too, with a compact layout).
* **Sound starts after your first tap** (iOS blocks audio until then). The ring/silent switch affects web audio on some iOS versions: if you hear nothing, flip it and check the volume.
* Controls: drag to pan, tap to select or command, **double-tap** a unit to select all of its type on screen, **hold and drag** for a selection box, **pinch** to zoom, tap the minimap to jump, **long-press** a button for its help text. The game auto-pauses when you leave it and **Continue** on the main menu resumes the saved match.
* If the phone gets warm or the game stutters: Settings > Quality > Battery.

## Updating
The game checks for a new version whenever you open it online; a banner offers the update. If the icon seems stuck on an old version: delete it, open the link in Safari again and re-add it (your saved progress lives in the browser storage of the home-screen app and is lost when you delete the icon).

## Known limits (honest list)
* This has been tested in desktop Chromium emulating iPhone screen sizes and touch, **never on a real iPhone**. Real-device audio, performance and Safari quirks are unverified.
* iOS can purge a web app's storage after weeks of non-use (saves, settings).
* Private Browsing tabs cannot install web apps.

## Publishing (done once by the repository owner)
GitHub Pages is not switched on yet. `.github/workflows/pages.yml` deploys `dist/pwa` as soon as Pages is enabled:
1. Repository **Settings > Pages > Build and deployment > Source: GitHub Actions**. (Pages from a **private** repository needs a paid GitHub plan; on a free plan make the repository public, or use the alternative below.)
2. **Actions** tab > "Deploy to GitHub Pages" > **Run workflow** (it also runs on every push that changes `dist/pwa`).
3. The address is shown in the run summary: `https://<user>.github.io/<repository>/`.

Alternative with no GitHub Pages: drag the folder `dist/pwa` (or the zip `orbital_dominion_pwa.zip` unpacked) onto Netlify Drop (app.netlify.com/drop) or upload it to Cloudflare Pages. Those hosts also apply the security headers in `dist/pwa/_headers`; GitHub Pages ignores them.
Verified here: the build served from a sub-path (`/claude/`) registers its service worker with that scope, loads the manifest, starts a match, and reloads offline with no errors.
