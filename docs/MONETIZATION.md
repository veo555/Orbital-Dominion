# Optional payments (Stripe) — design, setup and limits

**Status: implemented, off by default.** Enabling it is a configuration change in `src/support.config.json` followed by `python3 build.py`.
This document supersedes the earlier "no payment code at all" decision in the handoff notes, **for the web distributions only**: the in-game
currency is still purely virtual and is never sold, and the store build contains no payment code path.

## 1. What a player sees

A **♥ Support** button on the title screen opens a dialog: a short explanation, up to three tiers (default: Coffee $3 · Backer $9 · Founder $25),
and a statement that Stripe handles the card on its own page. Paying unlocks **cosmetic extras only**: a *Supporter* badge on the title screen and three
extra interface accent themes (gold / magenta / ice, Settings → Interface theme). A test (`e2e_support.py`) proves a match produces an identical game
state with and without the supporter flag.

## 2. Two modes (pick one by what you fill in)

| | **Payment Links** (no server) | **Checkout API** (small server) |
|---|---|---|
| You set up | a Payment Link per tier in the Stripe dashboard, "After payment → redirect to your website" = `https://YOUR-GAME/?supporter=<tierId>` | the Worker in `server/stripe-worker/` |
| Config | `tiers[].paymentLink` | `checkoutEndpoint`, `verifyEndpoint`, `entitlementEndpoint` |
| Flow | button → opens the link in a new tab (`noopener`); Stripe redirects back with `?supporter=<tier>`; the game unlocks perks | button → `POST /checkout {tier}` → Stripe-hosted Checkout → back with `?supporter=<session id>` → `GET /verify` → signed token → `POST /entitlement` once per session |
| Trust model | **honour system** — anyone can type `?supporter=coffee`. Acceptable *only because* the perks are cosmetic | server-verified payment, tamper-evident token, **refunds and disputes revoke it** (Worker + KV) |
| Works from a downloaded `.html` | yes (the redirect cannot return to `file://`, so the player returns manually) | the page must be served from an origin listed in the Worker's `ALLOWED_ORIGINS` |

Both modes use only Stripe-**hosted** pages. There is **no Stripe.js**, no card field, no remote script — so the single-file build stays self-contained
and the page's PCI scope is the smallest possible (SAQ A territory; confirm with Stripe's current guidance).

## 3. Security model

* **No secret in the page.** `support.config.json` is public by design; it holds only payment-link URLs and the Worker's URLs. Stripe's secret key lives in the
  Worker (`wrangler secret put STRIPE_SECRET_KEY`) — use a **restricted** key limited to *Checkout Sessions: write/read*.
* **The server sets the price.** The client can only name a tier; amounts/price ids come from the Worker's `TIERS` variable (tested: a client-supplied amount, price id and currency are ignored).
* **Webhooks are signature-verified** (HMAC-SHA256, 5-minute tolerance, constant-time compare, key-rotation aware) and size-capped. An unsigned "refund" cannot revoke anyone (tested).
* **Tokens are HMAC-signed**, bound to `ENTITLEMENT_SECRET`, tamper-evident (tested), and carry no personal data.
* **Client hygiene:** only `https://(buy|checkout|donate).stripe.com/` URLs are ever opened or followed (tested against a hostile backend response); `?supporter=` values must
  match `cs_(test|live)_…` or a configured tier id; the parameter is removed from the address bar; HTML in config strings is escaped.
* **CORS:** the Worker answers only origins in `ALLOWED_ORIGINS`; the `Content-Security-Policy` generated into `dist/pwa/_headers` allows `connect-src` only to your own origin and the Worker.
* **Privacy:** the Worker stores no names, emails or card data (Stripe does, under its own terms). The only things it may store (KV) are `payment_intent → session id` and a revocation flag.

## 4. Store rules — why payments are hidden in app-store builds

* **Apple App Store 3.1.1:** unlocking features or content *inside an app* must use in-app purchase. A Stripe link in the iOS app would be a rejection risk.
* **Google Play:** apps distributed through Play must use Play Billing for digital goods, with limited exceptions that depend on region and policy updates.
* Therefore: `python3 build.py store` always writes `{"enabled": false}` and **omits your payment URLs from the file** (tested: the links are not present in `dist/store/index.html`),
  and at run time `Capacitor.isNativePlatform()` hides the button even if a payment-enabled build were wrapped by mistake (tested).
* Store policies change. **Re-read the current Apple and Google guidelines before shipping a store build** — this document records the constraint as understood on 6 Oct 2026, it is not legal advice.
  If you later want paid extras *in the store apps*, that is a separate feature built on StoreKit / Play Billing, not this module.

## 5. Setup checklist (Checkout API mode)

1. Stripe dashboard → create the account, verify the business; work in **test mode** first.
2. Developers → API keys → create a **restricted key** (Checkout Sessions: write; read). Keep it secret.
3. `cd server/stripe-worker && npx wrangler login`; edit `wrangler.toml`: `GAME_URL`, `ALLOWED_ORIGINS`, `TIERS`; create a KV namespace and uncomment the binding (enables refund revocation).
4. `npx wrangler secret put STRIPE_SECRET_KEY`, `… STRIPE_WEBHOOK_SECRET`, `… ENTITLEMENT_SECRET` (any long random string); `npx wrangler deploy`.
5. Stripe → Developers → Webhooks → add `https://<worker>/webhook`, events `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`; copy the signing secret into step 4.
6. `src/support.config.json`: `"enabled": true`, set the three endpoint URLs to the deployed Worker, adjust `tiers[].label/amount` to match `TIERS`; run `python3 build.py`.
7. Test with Stripe's test cards (e.g. `4242 4242 4242 4242`): pay → you return with the badge; refund in the dashboard → after the webhook, the next session start removes the perks.
8. Go live: swap to live keys/secret, re-deploy, re-test with a real small payment, refund it.
9. Publish a **privacy policy and refund/terms page**; mention Stripe as a processor. Consider Stripe Tax / VAT obligations for your jurisdiction (consult a professional).

## 6. What was and was not verified

| Verified (automated) | Not verified |
|---|---|
| `server/stripe-worker/test/worker.test.mjs` — 9 tests: signature verification (valid/tampered/wrong secret/stale/malformed/rotation), tokens, server-side pricing, CORS, `/verify` branches, refund revocation, no secret in any response, size cap; **mutation-tested** (5 injected security bugs, all caught) | any call to the real Stripe API — Stripe is mocked, so request shapes are asserted against Stripe's documented parameters, not against Stripe |
| `tests/e2e/e2e_support.py` — 28 checks of the page against a mocked backend (both modes, perks, URL hygiene, hostile redirect, store/native gating, zero stray requests) | a deployed Worker, Stripe webhook delivery, live/test-mode payments, Payment Link redirect settings |
| default build: no payment UI, `?supporter=` ignored, zero network requests | tax, refunds policy, regional restrictions, the business/legal side |
