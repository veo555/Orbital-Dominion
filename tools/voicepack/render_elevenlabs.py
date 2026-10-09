#!/usr/bin/env python3
"""tools/voicepack/render_elevenlabs.py - OFFLINE/OPTIONAL step 2 of the voice-pack pipeline.  Run it yourself, on your own machine, with your own ElevenLabs key.
Nothing in the game or in the test-suite ever calls ElevenLabs; the only network code in the repository is in THIS file and runs only when you start it without --dry-run.

  python3 tools/voicepack/render_elevenlabs.py --dry-run                      # offline: shows what would be sent, the characters/credits, cache hits (no key needed)
  ELEVENLABS_API_KEY=... python3 tools/voicepack/render_elevenlabs.py --month 1 --budget 9500
  options: --lines lines.json --voices voices.json --voice-ids voice_ids.json --out voicepack_work/raw --plan plan.json
           --month N (lines the plan puts in month N) | --max-priority N | --tier-max T | --only id,id | --limit N
           --budget CHARS (refuse to send more than this many NOT-yet-cached characters; default 10000)   --cpc credits per character (default 1)
           --min-interval SECONDS between requests (default 1.5)   --model eleven_multilingual_v2   --format mp3_44100_128   --api-base https://api.elevenlabs.io

Key handling: the key is read from the environment variable ELEVENLABS_API_KEY only; it is never written to a file, never printed (error text is scrubbed), never put in a URL.
Safety: the key is only ever sent to api.elevenlabs.io (or to a loopback address, which the tests use with a fake server). Anything else is refused.
Cache + resume: each result is stored as <sha256(voice_id, model, text, settings, format)>.mp3 plus an index.json (id -> hash/file); a re-run skips what exists, so you can stop and
continue next month. Changing the text, the voice, the settings or the model changes the hash and re-renders only that line.
Licence: the ElevenLabs FREE plan does not include a commercial licence. Audio rendered on it must not be shipped in a store release; check the current terms of the plan you use
(and attribution requirements) BEFORE you distribute anything. See tools/voicepack/README.md."""
import argparse, hashlib, json, os, sys, time, urllib.request, urllib.error, urllib.parse, pathlib, ipaddress

HERE = pathlib.Path(__file__).resolve().parent
ALLOWED_HOSTS = {'api.elevenlabs.io'}


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def cache_hash(voice_id, model, text, settings, fmt):
    blob = json.dumps({'voice_id': voice_id, 'model_id': model, 'text': text, 'settings': settings, 'format': fmt}, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def host_ok(base):
    u = urllib.parse.urlparse(base)
    h = (u.hostname or '').lower()
    if u.scheme == 'https' and h in ALLOWED_HOSTS:
        return True
    if u.scheme in ('http', 'https') and h:
        try:
            return ipaddress.ip_address(h).is_loopback
        except ValueError:
            return h == 'localhost'
    return False


def scrub(s, key):
    s = str(s)
    return s.replace(key, '***') if key else s


def select(args, lines, plan):
    out = []
    month_ids = None
    if args.month:
        m = [x for x in plan.get('months', []) if x['month'] == args.month]
        if not m:
            sys.exit('plan has no month %d' % args.month)
        # a plan stores first/last only; recompute membership from the per-line "month" field
        month_ids = {l['id'] for l in lines if l.get('month') == args.month}
    only = set(x for x in args.only.split(',') if x) if args.only else None
    for l in lines:
        if l.get('synthOnly') and not args.include_synth_only:
            continue
        if l.get('priority', 0) <= 0:
            continue
        if args.max_priority and l['priority'] > args.max_priority:
            continue
        if args.tier_max and l['tier'] > args.tier_max:
            continue
        if month_ids is not None and l['id'] not in month_ids:
            continue
        if only and l['id'] not in only:
            continue
        out.append(l)
    out.sort(key=lambda l: l['priority'])
    return out[:args.limit] if args.limit else out


def synth(base, key, voice_id, model, text, settings, fmt, timeout=60):
    url = '%s/v1/text-to-speech/%s?output_format=%s' % (base.rstrip('/'), urllib.parse.quote(voice_id, safe=''), urllib.parse.quote(fmt, safe=''))
    body = json.dumps({'text': text, 'model_id': model, 'voice_settings': settings}).encode('utf-8')
    req = urllib.request.Request(url, data=body, method='POST', headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--lines', default=str(HERE / 'lines.json'))
    ap.add_argument('--voices', default=str(HERE / 'voices.json'))
    ap.add_argument('--voice-ids', default=str(HERE / 'voice_ids.json'))
    ap.add_argument('--plan', default=str(HERE / 'plan.json'))
    ap.add_argument('--out', default='voicepack_work/raw')
    ap.add_argument('--month', type=int, default=0)
    ap.add_argument('--max-priority', type=int, default=0)
    ap.add_argument('--tier-max', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--budget', type=int, default=10000)
    ap.add_argument('--cpc', type=float, default=1.0)
    ap.add_argument('--min-interval', type=float, default=1.5)
    ap.add_argument('--model', default='')
    ap.add_argument('--format', default='mp3_44100_128')
    ap.add_argument('--api-base', default='https://api.elevenlabs.io')
    ap.add_argument('--include-synth-only', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--max-retries', type=int, default=4)
    args = ap.parse_args(argv)

    lines = load(args.lines)['lines']
    voices = load(args.voices)
    plan = load(args.plan) if args.month and os.path.exists(args.plan) else {}
    ids = load(args.voice_ids) if os.path.exists(args.voice_ids) else {}
    model = args.model or voices.get('model_id', 'eleven_multilingual_v2')
    out = pathlib.Path(args.out)
    index_p = out / 'index.json'
    index = load(index_p) if index_p.exists() else {}
    sel = select(args, lines, plan)

    todo, cached, missing = [], 0, set()
    for l in sel:
        ch = voices['characters'].get(l['speaker'])
        vid = ids.get(l['speaker'])
        if not ch or not vid:
            if not args.dry_run:
                missing.add(l['speaker'])
            vid = vid or '<voice_id:%s>' % l['speaker']
        settings = (ch or {}).get('elevenlabs', {}).get('settings', {})
        h = cache_hash(vid, model, l['text'], settings, args.format)
        f = out / (h[:32] + '.mp3')
        if f.exists() and f.stat().st_size > 0:
            cached += 1
            index[l['id']] = {'hash': h, 'file': f.name, 'speaker': l['speaker'], 'key': l['key']}
            continue
        todo.append((l, vid, settings, h, f))
    chars = sum(len(t[0]['text']) for t in todo)
    print('selected %d lines: %d cached, %d to render = %d characters (~%d credits at %.2f credit/char), budget %d characters'
          % (len(sel), cached, len(todo), chars, round(chars * args.cpc), args.cpc, args.budget))
    if args.dry_run:
        for l, vid, st, h, f in todo[:40]:
            print('  would send  p%-4d %-10s %4d chars  %s  hash %s' % (l['priority'], l['speaker'], len(l['text']), l['id'], h[:12]))
        if len(todo) > 40:
            print('  ... %d more' % (len(todo) - 40))
        unmapped = sorted({t[0]['speaker'] for t in todo if t[1].startswith('<voice_id:')})
        if unmapped:
            print('  note: no voice_id yet for: %s (create the voices in your account, then fill voice_ids.json)' % ', '.join(unmapped))
        print('DRY RUN: no key read, no network, nothing written.')
        return 0

    if missing:
        sys.exit('no voice_id (voice_ids.json) or no voices.json entry for: %s' % ', '.join(sorted(missing)))
    if chars > args.budget:
        sys.exit('refusing: %d characters to send exceeds --budget %d (lower the selection with --month/--max-priority/--limit or raise --budget on purpose)' % (chars, args.budget))
    if not host_ok(args.api_base):
        sys.exit('refusing to send the key to %r (only https://api.elevenlabs.io or a loopback address)' % args.api_base)
    key = os.environ.get('ELEVENLABS_API_KEY', '')
    if not key:
        sys.exit('ELEVENLABS_API_KEY is not set (nothing was sent)')
    out.mkdir(parents=True, exist_ok=True)
    done = 0
    last = 0.0
    for l, vid, st, h, f in todo:
        wait = last + args.min_interval - time.time()
        if wait > 0:
            time.sleep(wait)
        for attempt in range(args.max_retries + 1):
            last = time.time()
            try:
                data = synth(args.api_base, key, vid, model, l['text'], st, args.format)
                break
            except urllib.error.HTTPError as e:
                body = scrub(e.read()[:300].decode('utf-8', 'replace'), key)
                if e.code in (401, 403):
                    json.dump(index, open(index_p, 'w'), indent=1)
                    sys.exit('HTTP %d: key rejected or plan has no API access (%s). Stopped; %d rendered so far are cached.' % (e.code, body, done))
                if e.code == 429 or e.code >= 500:
                    ra = e.headers.get('Retry-After')
                    if 'quota' in body.lower():
                        json.dump(index, open(index_p, 'w'), indent=1)
                        sys.exit('quota exhausted (%s). Stopped; %d rendered so far are cached - resume later.' % (body, done))
                    d = float(ra) if ra and ra.replace('.', '', 1).isdigit() else min(60, 2 ** (attempt + 1))
                    print('  HTTP %d, retry in %.0fs' % (e.code, d))
                    time.sleep(d)
                    continue
                json.dump(index, open(index_p, 'w'), indent=1)
                sys.exit('HTTP %d for %s: %s' % (e.code, l['id'], body))
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                d = min(60, 2 ** (attempt + 1))
                print('  network error (%s), retry in %.0fs' % (scrub(e, key), d))
                time.sleep(d)
        else:
            json.dump(index, open(index_p, 'w'), indent=1)
            sys.exit('giving up on %s after %d attempts; progress is cached' % (l['id'], args.max_retries + 1))
        tmp = f.with_suffix('.part')
        tmp.write_bytes(data)
        os.replace(tmp, f)
        index[l['id']] = {'hash': h, 'file': f.name, 'speaker': l['speaker'], 'key': l['key']}
        json.dump(index, open(index_p, 'w'), indent=1)
        done += 1
        print('  rendered %-34s %5d bytes  (%d/%d)' % (l['id'][:34], len(data), done, len(todo)))
    print('done: %d rendered, %d cached. Next: python3 tools/voicepack/pack.py --raw %s' % (done, cached, out))
    return 0


if __name__ == '__main__':
    sys.exit(main())
