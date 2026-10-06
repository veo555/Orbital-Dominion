// node --test server/stripe-worker/test/      (Node >= 20, no dependencies)
// Stripe is mocked: these tests prove OUR logic (price is server-side, signatures verified, tokens tamper-evident, refunds revoke,
// no secret ever leaves) -- they do not talk to Stripe, so they cannot prove that a live Stripe account is configured correctly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { handle, mintToken, readToken, verifyStripeSignature } from '../src/index.js';

const SECRET_KEY = 'sk_test_SECRETKEYDONOTLEAK123456', WH = 'whsec_testsecret', ES = 'entitlement-secret-for-tests';
const ORIGIN = 'https://game.example';
const TIERS = [{ id: 'coffee', name: 'Coffee', unit_amount: 300, currency: 'usd' }, { id: 'founder', name: 'Founder', price: 'price_123' }];
const kvStore = () => { const m = new Map(); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const mkEnv = (extra = {}) => ({ STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WH, ENTITLEMENT_SECRET: ES, GAME_URL: 'https://game.example/', ALLOWED_ORIGINS: ORIGIN, TIERS: JSON.stringify(TIERS), ...extra });
const req = (path, { method = 'GET', body, origin = ORIGIN, headers = {} } = {}) =>
  new Request('https://pay.example' + path, { method, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers } });
const stripeMock = (handlers) => { const calls = []; const f = async (url, init = {}) => { calls.push({ url: String(url), init }); const h = handlers(String(url), init); return new Response(JSON.stringify(h.body), { status: h.status || 200 }); }; f.calls = calls; return f; };
const sign = (payload, secret = WH, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;   // independent of the Worker's WebCrypto

test('webhook signature: valid, tampered, wrong secret, stale, malformed, key rotation', async () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  assert.equal(await verifyStripeSignature(body, sign(body), WH), true, 'a correct signature verifies');
  assert.equal(await verifyStripeSignature(body + ' ', sign(body), WH), false, 'a tampered body is rejected');
  assert.equal(await verifyStripeSignature(body, sign(body, 'whsec_other'), WH), false, 'a wrong secret is rejected');
  const old = Math.floor(Date.now() / 1000) - 3600;
  assert.equal(await verifyStripeSignature(body, sign(body, WH, old), WH), false, 'an hour-old timestamp is rejected (replay protection)');
  assert.equal(await verifyStripeSignature(body, sign(body, WH, old), WH, 7200), true, '...unless the tolerance allows it');
  for (const bad of [null, '', 'garbage', 't=abc,v1=00', 't=1', `v1=${'0'.repeat(64)}`, `t=${Math.floor(Date.now() / 1000)},v1=zz`]) assert.equal(await verifyStripeSignature(body, bad, WH), false, `malformed header rejected: ${bad}`);
  const t = Math.floor(Date.now() / 1000), good = createHmac('sha256', WH).update(`${t}.${body}`).digest('hex');
  assert.equal(await verifyStripeSignature(body, `t=${t},v1=${'0'.repeat(64)},v1=${good}`, WH), true, 'any one of several v1 values may match (key rotation)');
});

test('entitlement tokens: round trip, tamper-evident, bound to the secret', async () => {
  const tok = await mintToken(ES, { v: 1, t: 'coffee', sid: 'cs_test_abc12345', iat: 1 });
  assert.deepEqual(await readToken(ES, tok), { v: 1, t: 'coffee', sid: 'cs_test_abc12345', iat: 1 });
  assert.equal(await readToken('another-secret', tok), null, 'a different secret cannot read it');
  const [body, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ v: 1, t: 'founder', sid: 'cs_test_abc12345', iat: 1 })).toString('base64url');
  assert.equal(await readToken(ES, forged + '.' + sig), null, 'swapping the payload invalidates the signature');
  assert.equal(await readToken(ES, body + '.' + sig.slice(0, -2) + 'AA'), null, 'a corrupted signature is rejected');
  for (const bad of [undefined, null, 42, '', 'x', 'a.b.c', '.'.repeat(5), 'a'.repeat(5000)]) assert.equal(await readToken(ES, bad), null);
});

test('/checkout: the price comes from the server, the client can only name a tier', async () => {
  const f = stripeMock(() => ({ body: { id: 'cs_test_x', url: 'https://checkout.stripe.com/c/pay/cs_test_x' } }));
  const res = await handle(req('/checkout', { method: 'POST', body: { tier: 'coffee', unit_amount: 1, amount: 1, price: 'price_evil', currency: 'jpy' } }), mkEnv(), f);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_x' });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const c = f.calls[0], form = new URLSearchParams(c.init.body);
  assert.equal(c.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(c.init.headers.Authorization, 'Bearer ' + SECRET_KEY);
  assert.equal(form.get('mode'), 'payment');
  assert.equal(form.get('line_items[0][price_data][unit_amount]'), '300', 'amount is the server value, the client\'s unit_amount was ignored');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(form.get('line_items[0][price]'), null, 'a client-supplied price id was ignored');
  assert.equal(form.get('success_url'), 'https://game.example/?supporter={CHECKOUT_SESSION_ID}');
  assert.equal(form.get('cancel_url'), 'https://game.example/');
  assert.equal(form.get('metadata[tier]'), 'coffee');
  // a tier defined with a Price id uses it
  const f2 = stripeMock(() => ({ body: { url: 'https://checkout.stripe.com/c/pay/cs_test_y' } }));
  await handle(req('/checkout', { method: 'POST', body: { tier: 'founder' } }), mkEnv(), f2);
  assert.equal(new URLSearchParams(f2.calls[0].init.body).get('line_items[0][price]'), 'price_123');
});

test('/checkout: unknown tier, bad body, Stripe failure, misconfiguration', async () => {
  const never = stripeMock(() => { throw new Error('Stripe must not be called'); });
  assert.equal((await handle(req('/checkout', { method: 'POST', body: { tier: 'nope' } }), mkEnv(), never)).status, 400);
  assert.equal((await handle(req('/checkout', { method: 'POST', body: 'not json' }), mkEnv(), never)).status, 400);
  assert.equal(never.calls.length, 0);
  const boom = stripeMock(() => ({ status: 402, body: { error: { message: 'Your card was declined sk_test_LEAK' } } }));
  const r = await handle(req('/checkout', { method: 'POST', body: { tier: 'coffee' } }), mkEnv(), boom);
  assert.equal(r.status, 502); assert.ok(!(await r.text()).includes('declined'), 'Stripe\'s error text is not forwarded');
  assert.equal((await handle(req('/checkout', { method: 'POST', body: { tier: 'coffee' } }), mkEnv({ GAME_URL: 'http://insecure.example/' }), boom)).status, 500);
});

test('CORS: only listed origins; preflight; no origin leaks to others', async () => {
  const f = stripeMock(() => ({ body: {} }));
  assert.equal((await handle(req('/entitlement', { method: 'POST', body: { token: 'x' }, origin: 'https://evil.example' }), mkEnv(), f)).status, 403);
  const pre = await handle(req('/checkout', { method: 'OPTIONS', origin: ORIGIN }), mkEnv(), f);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await handle(req('/checkout', { method: 'OPTIONS', origin: 'https://evil.example' }), mkEnv(), f)).status, 403);
  const bad = await handle(req('/entitlement', { method: 'POST', body: { token: 'x' }, origin: 'https://evil.example' }), mkEnv(), f);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('/verify: paid session -> token; unpaid / unknown / malformed are refused', async () => {
  const paid = stripeMock(u => ({ body: { id: 'cs_test_paid0001', payment_status: 'paid', metadata: { tier: 'founder' } } }));
  const ok = await (await handle(req('/verify?session_id=cs_test_paid0001'), mkEnv(), paid)).json();
  assert.equal(ok.ok, true); assert.equal(ok.tier, 'founder');
  assert.equal(paid.calls[0].url, 'https://api.stripe.com/v1/checkout/sessions/cs_test_paid0001');
  assert.equal((await readToken(ES, ok.token)).t, 'founder');
  const unpaid = stripeMock(() => ({ body: { payment_status: 'unpaid', metadata: { tier: 'coffee' } } }));
  assert.equal((await handle(req('/verify?session_id=cs_test_unpaid001'), mkEnv(), unpaid)).status, 402);
  const missing = stripeMock(() => ({ status: 404, body: { error: {} } }));
  assert.equal((await handle(req('/verify?session_id=cs_test_missing01'), mkEnv(), missing)).status, 404);
  const none = stripeMock(() => { throw new Error('must not call Stripe for a malformed id'); });
  for (const id of ['', 'cs_test_', 'pi_123', '../../etc/passwd', 'cs_test_abc/../x', 'cs_prod_abcdefgh12']) assert.equal((await handle(req('/verify?session_id=' + encodeURIComponent(id)), mkEnv(), none)).status, 400, `rejects session id ${JSON.stringify(id)}`);
  const alien = stripeMock(() => ({ body: { payment_status: 'paid', metadata: { tier: 'gold-plated' } } }));   // a paid session for something that is not one of our tiers
  assert.equal((await handle(req('/verify?session_id=cs_test_alien0001'), mkEnv(), alien)).status, 422);
});

test('/entitlement and the refund path (webhook -> KV -> revoked)', async () => {
  const KV = kvStore(), env = mkEnv({ KV });
  const token = await mintToken(ES, { v: 1, t: 'backer', sid: 'cs_test_refund01', iat: 1 });
  const check = async () => (await (await handle(req('/entitlement', { method: 'POST', body: { token } }), env)).json());
  assert.deepEqual(await check(), { ok: true, valid: true, tier: 'backer' });
  assert.deepEqual(await (await handle(req('/entitlement', { method: 'POST', body: { token: token.slice(0, -3) + 'abc' } }), env)).json(), { ok: true, valid: false });

  const post = (ev, header) => { const raw = JSON.stringify(ev); return handle(new Request('https://pay.example/webhook', { method: 'POST', body: raw, headers: { 'Stripe-Signature': header ?? sign(raw) } }), env); };
  assert.equal((await post({ id: 'e1', type: 'checkout.session.completed', data: { object: { id: 'cs_test_refund01', payment_intent: 'pi_777' } } })).status, 200);
  assert.equal(KV.m.get('pi:pi_777'), 'cs_test_refund01', 'the payment intent is remembered');
  const forged = JSON.stringify({ id: 'e2', type: 'charge.refunded', data: { object: { payment_intent: 'pi_777' } } });
  assert.equal((await handle(new Request('https://pay.example/webhook', { method: 'POST', body: forged, headers: { 'Stripe-Signature': 't=1,v1=' + '0'.repeat(64) } }), env)).status, 400, 'an unsigned "refund" cannot revoke anyone');
  assert.equal(KV.m.has('rev:cs_test_refund01'), false);
  assert.deepEqual(await check(), { ok: true, valid: true, tier: 'backer' });
  assert.equal((await post({ id: 'e3', type: 'charge.refunded', data: { object: { payment_intent: 'pi_777' } } })).status, 200);
  assert.deepEqual(await check(), { ok: true, valid: false }, 'after a signed refund event the token is revoked');
  // and the revoked session can no longer be exchanged for a new token
  const paid = stripeMock(() => ({ body: { payment_status: 'paid', metadata: { tier: 'coffee' } } }));
  assert.equal((await handle(req('/verify?session_id=cs_test_refund01'), env, paid)).status, 410);
});

test('no response ever contains a secret; unknown routes are 404', async () => {
  const env = mkEnv(); const outputs = [];
  const f = stripeMock(() => ({ body: { id: 'cs_test_zz', url: 'https://checkout.stripe.com/c/pay/cs_test_zz', payment_status: 'paid', metadata: { tier: 'coffee' } } }));
  outputs.push(await (await handle(req('/checkout', { method: 'POST', body: { tier: 'coffee' } }), env, f)).text());
  outputs.push(await (await handle(req('/verify?session_id=cs_test_zz000001'), env, f)).text());
  outputs.push(await (await handle(req('/entitlement', { method: 'POST', body: { token: 'x' } }), env)).text());
  const r404 = await handle(req('/admin'), env); outputs.push(await r404.text());
  assert.equal(r404.status, 404);
  const crash = await handle(req('/checkout', { method: 'POST', body: { tier: 'coffee' } }), env, async () => { throw new Error('network down ' + SECRET_KEY); });
  outputs.push(await crash.text()); assert.equal(crash.status, 500);
  for (const o of outputs) for (const s of [SECRET_KEY, WH, ES]) assert.ok(!o.includes(s), 'a secret leaked into a response body');
});

test('webhook body size cap', async () => {
  const big = 'x'.repeat(300 * 1024);
  const r = await handle(new Request('https://pay.example/webhook', { method: 'POST', body: big, headers: { 'Stripe-Signature': sign(big) } }), mkEnv());
  assert.equal(r.status, 413);
});
