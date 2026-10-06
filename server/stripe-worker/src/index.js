/* Orbital Dominion — optional payment backend (Cloudflare Worker, no dependencies).
   Why a server at all: the page is public, so it cannot hold a Stripe secret key, cannot be trusted to set a price, and cannot
   verify that a payment really happened. This Worker does exactly those three things and nothing else:
     POST /checkout     {tier}            -> creates a Stripe Checkout Session whose PRICE COMES FROM THIS SERVER (env.TIERS), returns {url}
     GET  /verify?session_id=cs_...       -> asks Stripe whether that session is paid; if so returns a signed entitlement token
     POST /entitlement  {token}           -> re-validates a token (signature + not refunded); the game calls it once per session
     POST /webhook                        -> Stripe -> us: signature-verified; remembers payments and revokes tokens on refund/dispute
   Perks are cosmetic, so the token is deliberately simple: HMAC-SHA256 over a small JSON payload. No cookies, no accounts, no PII stored.
   Secrets (wrangler secret put ...): STRIPE_SECRET_KEY (a *restricted* key), STRIPE_WEBHOOK_SECRET, ENTITLEMENT_SECRET.
   Vars (wrangler.toml): GAME_URL, ALLOWED_ORIGINS, TIERS.  Optional KV binding: KV (refund revocation). */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const hexToBytes = h => { if (!/^[0-9a-f]+$/i.test(h) || h.length % 2) throw new Error('hex'); return Uint8Array.from(h.match(/../g), x => parseInt(x, 16)); };
const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/* ---- entitlement tokens ------------------------------------------------------------------------------------------ */
export async function mintToken(secret, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return body + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
}
export async function readToken(secret, token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  let sigBytes; try { sigBytes = unb64u(sig); } catch { return null; }
  // crypto.subtle.verify compares in constant time
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, enc.encode(body)))) return null;
  try { return JSON.parse(dec.decode(unb64u(body))); } catch { return null; }
}

/* ---- Stripe webhook signature (https://docs.stripe.com/webhooks#verify-manually) ------------------------------------------ */
export async function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  let t = null; const v1 = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') v1.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !v1.length) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;                    // replay protection
  const key = await hmacKey(secret), signed = enc.encode(t + '.' + rawBody);
  for (const sig of v1) {
    let bytes; try { bytes = hexToBytes(sig); } catch { continue; }
    if (await crypto.subtle.verify('HMAC', key, bytes, signed)) return true;        // several v1 values can be present during key rotation
  }
  return false;
}

/* ---- helpers ------------------------------------------------------------------------------------------------------------------- */
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{8,200}$/;
function tiersOf(env) { try { const t = JSON.parse(env.TIERS || '[]'); return Array.isArray(t) ? t : []; } catch { return []; } }
const stripeHeaders = env => ({ Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY });

async function webhook(request, env) {
  const raw = await request.text();
  if (raw.length > 256 * 1024) return new Response('too large', { status: 413 });
  if (!(await verifyStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) return new Response('bad signature', { status: 400 });
  let ev; try { ev = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const o = (ev.data && ev.data.object) || {};
  if (env.KV) {
    if (ev.type === 'checkout.session.completed' && o.payment_intent && o.id) {
      await env.KV.put('pi:' + o.payment_intent, o.id, { expirationTtl: 60 * 60 * 24 * 400 });
    } else if ((ev.type === 'charge.refunded' || ev.type === 'charge.dispute.created') && o.payment_intent) {
      const sid = await env.KV.get('pi:' + o.payment_intent);
      if (sid) await env.KV.put('rev:' + sid, '1');
    }
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/* ---- the request handler (exported so the tests can call it with a mocked fetch) ----------------------------------------------- */
export async function handle(request, env, fetchFn = fetch) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (url.pathname === '/webhook' && request.method === 'POST') return webhook(request, env);    // server to server: no CORS

  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const corsOk = !!origin && allowed.includes(origin);
  const cors = corsOk ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } : { Vary: 'Origin' };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
  if (request.method === 'OPTIONS') return new Response(null, { status: corsOk ? 204 : 403, headers: cors });
  if (origin && !corsOk) return json({ ok: false, error: 'origin not allowed' }, 403);

  const tiers = tiersOf(env);
  try {
    if (url.pathname === '/checkout' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const tier = tiers.find(t => t.id === body.tier);                                          // the client may only NAME a tier
      if (!tier) return json({ ok: false, error: 'unknown tier' }, 400);
      if (!/^https:\/\//.test(env.GAME_URL || '')) return json({ ok: false, error: 'server misconfigured' }, 500);
      const form = new URLSearchParams();
      form.set('mode', 'payment');
      form.set('success_url', env.GAME_URL + (env.GAME_URL.includes('?') ? '&' : '?') + 'supporter={CHECKOUT_SESSION_ID}');
      form.set('cancel_url', env.GAME_URL);
      form.set('line_items[0][quantity]', '1');
      if (tier.price) form.set('line_items[0][price]', tier.price);
      else {
        form.set('line_items[0][price_data][currency]', tier.currency || 'usd');
        form.set('line_items[0][price_data][unit_amount]', String(tier.unit_amount));
        form.set('line_items[0][price_data][product_data][name]', 'Orbital Dominion — ' + (tier.name || tier.id));
      }
      form.set('metadata[tier]', tier.id);
      const r = await fetchFn('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { ...stripeHeaders(env), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
      const s = await r.json().catch(() => ({}));
      if (!r.ok || !s.url) return json({ ok: false, error: 'stripe error' }, 502);                // never forward Stripe's message verbatim
      return json({ ok: true, url: s.url });
    }

    if (url.pathname === '/verify' && request.method === 'GET') {
      const id = url.searchParams.get('session_id') || '';
      if (!SESSION_ID.test(id)) return json({ ok: false, error: 'bad session id' }, 400);
      const r = await fetchFn('https://api.stripe.com/v1/checkout/sessions/' + id, { headers: stripeHeaders(env) });
      if (r.status === 404) return json({ ok: false, error: 'no such session' }, 404);
      if (!r.ok) return json({ ok: false, error: 'stripe error' }, 502);
      const s = await r.json();
      if (s.payment_status !== 'paid') return json({ ok: false, error: 'not paid' }, 402);
      const tier = tiers.find(t => s.metadata && t.id === s.metadata.tier);
      if (!tier) return json({ ok: false, error: 'unknown tier' }, 422);
      if (env.KV && await env.KV.get('rev:' + id)) return json({ ok: false, error: 'revoked' }, 410);
      return json({ ok: true, tier: tier.id, token: await mintToken(env.ENTITLEMENT_SECRET, { v: 1, t: tier.id, sid: id, iat: Math.floor(Date.now() / 1000) }) });
    }

    if (url.pathname === '/entitlement' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const p = await readToken(env.ENTITLEMENT_SECRET, body.token);
      if (!p || p.v !== 1) return json({ ok: true, valid: false });
      if (env.KV && await env.KV.get('rev:' + p.sid)) return json({ ok: true, valid: false });
      return json({ ok: true, valid: true, tier: p.t });
    }
    return json({ ok: false, error: 'not found' }, 404);
  } catch (e) {
    return json({ ok: false, error: 'server error' }, 500);                                       // no stack traces, no secrets
  }
}

export default { fetch: (request, env) => handle(request, env) };
