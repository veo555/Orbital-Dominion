# Orbital Dominion — payment backend (Cloudflare Worker)

Optional. Only needed for **Checkout API mode** (server-verified payments, refunds revoke perks). The simpler **Payment Links mode** needs no server.
Full explanation, security model and setup checklist: [`docs/MONETIZATION.md`](../../docs/MONETIZATION.md).

```
POST /checkout     {"tier":"coffee"}            -> {"ok":true,"url":"https://checkout.stripe.com/..."}
GET  /verify?session_id=cs_...                  -> {"ok":true,"tier":"coffee","token":"<signed>"}   (402 unpaid, 410 revoked)
POST /entitlement  {"token":"<signed>"}         -> {"ok":true,"valid":true,"tier":"coffee"}
POST /webhook      (Stripe -> us, signed)       -> {"received":true}
```

```bash
cd server/stripe-worker
npm test                                  # 9 unit tests, Node >= 20, no dependencies, Stripe mocked
npx wrangler secret put STRIPE_SECRET_KEY        # restricted key: Checkout Sessions (write/read)
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_... of the webhook endpoint
npx wrangler secret put ENTITLEMENT_SECRET       # openssl rand -base64 48
npx wrangler deploy
```

Edit `wrangler.toml` first (`GAME_URL`, `ALLOWED_ORIGINS`, `TIERS`, optional KV namespace). Prices live in `TIERS` on the server — the page can only name a tier.
