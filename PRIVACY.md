# Privacy

Orbital Dominion is a single HTML file that runs entirely in your browser.

* **No account, no analytics, no ads, no tracking, no cookies.** The build makes **zero network requests** (a browser gate asserts this on every release).
* **What is stored, and where:** settings, campaign progress and an optional saved game are kept in your browser's `localStorage` on your own device. Clearing site data deletes them. Nothing is sent anywhere.
* **Optional, off by default:** the cosmetic "Support" feature (`src/js/77_support.js`) contacts a payment provider **only after you press a button**, and only in builds where the maintainer has enabled it. The `store` variant and the native app builds contain no payment code.
* **MCP server (`mcp/`)**: runs locally over stdio on your machine and makes no network requests.
* **Hosting:** if you play via GitHub Pages or a Hugging Face Space, those hosts see ordinary web-server request logs (IP address, user agent) under their own policies; the game itself adds nothing.
* **Children:** no data is collected from anyone, including children.
* **Contact / issues:** open a GitHub issue at https://github.com/veo555/Orbital-Dominion/issues (security: see `SECURITY.md`).

This text describes the code in this repository; it is not legal advice. App stores require a hosted privacy-policy URL: use the rendered version of this file.
