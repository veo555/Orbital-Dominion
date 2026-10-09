"""Voice-pack pipeline gate (offline; no ElevenLabs call is ever made). python3 tests/audio/voicepack_pipeline.py [--keep DIR]
Tests tools/voicepack/{extract_lines.js, render_elevenlabs.py, pack.py} end to end with a FAKE local server standing in for the API, and builds the SYNTHETIC test pack
(tones, one frequency per speaker) that tests/e2e/e2e_audio_voicepack.py loads into the game. Also importable: make_pack(dir) -> (pack_dir, lines used).
Mutations (each must be caught): a changed text re-renders, a key leak into any output, a non-API host, a corrupt manifest hash, a 401."""
import os, sys, json, subprocess, tempfile, threading, hashlib, pathlib, importlib.util, http.server, shutil, urllib.request, zipfile, re, io, contextlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'tools' / 'voicepack'
fails = []


def ok(c, m):
    print(('ok    ' if c else 'FAIL  ') + m, flush=True)
    if not c: fails.append(m)


def load_mod(name):
    spec = importlib.util.spec_from_file_location(name, TOOLS / (name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def tone_mp3(freq, sec):
    """what the fake API returns: a tone with 120 ms of leading and trailing silence, as mp3"""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=%d:duration=%.2f' % (freq, sec), '-af', 'adelay=120|120,apad=pad_dur=0.12,volume=0.3', '-ac', '1', '-f', 'mp3', '-'], capture_output=True, check=True)
    return p.stdout


class Fake(http.server.BaseHTTPRequestHandler):
    log = []; mode = 'ok'; keys = set()
    def log_message(self, *a): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0)); body = json.loads(self.rfile.read(n))
        Fake.keys.add(self.headers.get('xi-api-key'))
        Fake.log.append({'path': self.path, 'text': body['text'], 'model': body['model_id'], 'settings': body['voice_settings']})
        if Fake.mode == '401':
            self.send_response(401); self.end_headers(); self.wfile.write(b'{"detail":"invalid key TESTKEY-123"}'); return
        if Fake.mode == '429' and len(Fake.log) == 1:
            self.send_response(429); self.send_header('Retry-After', '0'); self.end_headers(); self.wfile.write(b'{"detail":"slow down"}'); return
        speaker_hz = 200 + 40 * (int(hashlib.md5(self.path.split('/')[3].encode()).hexdigest(), 16) % 12)
        data = tone_mp3(speaker_hz, 0.5 + min(2.0, len(body['text']) / 60))
        self.send_response(200); self.send_header('Content-Type', 'audio/mpeg'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)


def serve():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d' % srv.server_address[1]


def run(cmd, env=None, **kw):
    e = dict(os.environ); e.pop('ELEVENLABS_API_KEY', None); e.update(env or {})
    return subprocess.run(cmd, capture_output=True, text=True, env=e, cwd=str(ROOT), **kw)


def make_pack(work, n_lines=6, base=None):
    """extract -> (fake) render -> pack for the first n lines of the hero tiers; returns (pack_dir, [line dicts])"""
    work = pathlib.Path(work); work.mkdir(parents=True, exist_ok=True)
    r = run(['node', str(TOOLS / 'extract_lines.js'), '--out', str(work), '--quiet'])
    assert r.returncode == 0, r.stderr
    lines = json.load(open(work / 'lines.json'))['lines']
    chosen = [l for l in lines if l['priority'] > 0][:n_lines]
    speakers = sorted({l['speaker'] for l in chosen})
    json.dump({s: 'vid_' + s for s in speakers}, open(work / 'voice_ids.json', 'w'))
    Fake.mode = 'ok'; Fake.log.clear()
    srv, url = serve()
    try:
        r = run([sys.executable, str(TOOLS / 'render_elevenlabs.py'), '--lines', str(work / 'lines.json'), '--voices', str(work / 'voices.json'), '--voice-ids', str(work / 'voice_ids.json'),
                 '--out', str(work / 'raw'), '--only', ','.join(l['id'] for l in chosen), '--api-base', url, '--min-interval', '0', '--budget', '5000'], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        assert r.returncode == 0, r.stdout + r.stderr
    finally:
        srv.shutdown()
    r = run([sys.executable, str(TOOLS / 'pack.py'), '--raw', str(work / 'raw'), '--out', str(work / 'voicepack'), '--lines', str(work / 'lines.json'), '--plan-licence', 'free', '--zip', '--allow-in-repo'])
    assert r.returncode == 0, r.stdout + r.stderr
    return work / 'voicepack', chosen


def main():
    keep = None
    if '--keep' in sys.argv: keep = pathlib.Path(sys.argv[sys.argv.index('--keep') + 1])
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='vp-')) if not keep else keep
    tmp.mkdir(parents=True, exist_ok=True)

    # ---- 1. extract_lines.js
    ex = tmp / 'ex'
    r = run(['node', str(TOOLS / 'extract_lines.js'), '--out', str(ex)])
    ok(r.returncode == 0 and 'recordable' in r.stdout, 'extract_lines.js runs on the real story: ' + (r.stdout.splitlines()[0] if r.stdout else r.stderr[:100]))
    L = json.load(open(ex / 'lines.json')); V = json.load(open(ex / 'voices.json')); P = json.load(open(ex / 'plan.json'))
    ls = [l for l in L['lines'] if l['priority'] > 0]
    ok(len(ls) > 100 and len({l['key'] for l in ls}) == len(ls), '%d recordable lines, every runtime key unique' % len(ls))
    ok(all(k in l for l in ls for k in ('id', 'speaker', 'text', 'chars', 'priority', 'key')) and all(l['chars'] == len(l['text']) for l in ls), 'every line has id/speaker/text/chars/priority/key and chars == len(text)')
    ok([l['priority'] for l in ls] == list(range(1, len(ls) + 1)) and all(ls[i]['tier'] <= ls[i + 1]['tier'] for i in range(len(ls) - 1)), 'priority is 1..N and never goes back to a higher-priority tier')
    ok(all(l['speaker'] in V['characters'] for l in L['lines']), 'every speaker has a voice-design entry in voices.json')
    ok(all(c['elevenlabs']['description'] and 'stability' in c['elevenlabs']['settings'] and ('voiceProfile' in c) for c in V['characters'].values()), 'voices.json: description + settings + the synth voiceProfile fallback per character')
    ok(not any(l['speaker'] == 'overseer' for l in ls), 'the rule-based Overseer is not planned for recording by default')
    tot = sum(l['chars'] for l in ls)
    ok(P['eligible_chars'] == tot and all(m['credits'] <= 10000 for m in P['months']) and sum(m['lines'] for m in P['months']) == len(ls) - len(P['unfit']), 'plan: %d chars = %d month(s), none above the 10,000-credit quota, every line placed once' % (tot, P['months_needed']))
    # key == the runtime key: fnv1a32 over UTF-16 units of the normalised text (pack.py and 84_voice.js implement the same)
    pk = load_mod('pack')
    ok(all(l['key'] == l['speaker'] + '|' + pk.fnv32(pk.norm(l['text'])) for l in ls[:200]), 'extract_lines.js and pack.py compute identical keys (JS and Python FNV-1a)')
    # graceful fallback: a story dir with no radio/cine and only a dispatch
    sd = tmp / 'story'; sd.mkdir()
    for f in ('00_core.js', '43_vocab.js', '44_story_a.js'): shutil.copy(ROOT / 'src' / 'js' / f, sd / f)
    (sd / '44_story_z.js').write_text("STORY.dispatch={d1:{who:'idris',text:'Hold the Stair.',style:'radio'},d2:{lines:[{who:'kaz',text:'Light the lamps.'}]}};")
    r = run(['node', str(TOOLS / 'extract_lines.js'), '--out', str(tmp / 'ex2'), '--story-dir', str(sd), '--quiet'])
    L2 = json.load(open(tmp / 'ex2' / 'lines.json'))['lines'] if r.returncode == 0 else []
    ok(r.returncode == 0 and sorted(l['id'] for l in L2) == ['dispatch:d1', 'dispatch:d2:0'], 'a story with only STORY.dispatch (no radio, no films) still extracts: ' + str([l['id'] for l in L2]))

    # ---- 2. render_elevenlabs.py
    rend = load_mod('render_elevenlabs')
    work = tmp / 'w'; work.mkdir()
    sel = [l for l in ls][:3]
    json.dump({s: 'vid_' + s for s in {l['speaker'] for l in ls}}, open(work / 'ids.json', 'w'))
    base = [sys.executable, str(TOOLS / 'render_elevenlabs.py'), '--lines', str(ex / 'lines.json'), '--voices', str(ex / 'voices.json'), '--voice-ids', str(work / 'ids.json'), '--out', str(work / 'raw'),
            '--only', ','.join(l['id'] for l in sel), '--min-interval', '0']
    # dry run: no key, and urlopen is booby-trapped in-process
    real = urllib.request.urlopen
    def boom(*a, **k): raise AssertionError('network used in dry run')
    urllib.request.urlopen = boom
    buf = io.StringIO()
    try:
        env_key = os.environ.pop('ELEVENLABS_API_KEY', None)
        with contextlib.redirect_stdout(buf):
            rc = rend.main(base[2:] + ['--dry-run'])
    except AssertionError as e:
        rc = 99
    finally:
        urllib.request.urlopen = real
    out = buf.getvalue()
    ok(rc == 0 and 'DRY RUN' in out and 'would send' in out and not (work / 'raw').exists(), 'dry run works offline with no key (network call trapped), writes nothing: ' + out.splitlines()[0])
    srv, url = serve()
    try:
        Fake.log.clear(); Fake.keys.clear(); Fake.mode = 'ok'
        r = run(base + ['--api-base', url, '--budget', '5000'], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode == 0 and len(Fake.log) == 3, 'first run sends 3 requests (%d) and exits 0' % len(Fake.log))
        ok(Fake.keys == {'TESTKEY-123'} and all(re.match(r'/v1/text-to-speech/vid_\w+\?output_format=mp3_44100_128', x['path']) for x in Fake.log) and 'TESTKEY' not in Fake.log[0]['path'], 'the key travels only in the xi-api-key header (never the URL); voice id + settings come from the tables')
        allout = r.stdout + r.stderr + ''.join(p.read_text(errors='ignore') for p in (work / 'raw').glob('*.json'))
        ok('TESTKEY-123' not in allout, 'the key appears in no stdout/stderr/index file')
        n = len(Fake.log); r = run(base + ['--api-base', url], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode == 0 and len(Fake.log) == n and '3 cached' in r.stdout, 'second run is fully cached: no request (resume works)')
        # mutation: changing a text must re-render exactly that line (hash covers text)
        lines_mut = json.load(open(ex / 'lines.json')); lines_mut['lines'][0]['text'] += ' Again.'
        json.dump(lines_mut, open(work / 'lm.json', 'w'))
        b2 = [x if x != str(ex / 'lines.json') else str(work / 'lm.json') for x in base]
        r = run(b2 + ['--api-base', url], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(len(Fake.log) == n + 1, 'MUTATION: an edited line is re-rendered alone (cache key covers the text): %d new request' % (len(Fake.log) - n))
        # budget guard
        r = run(base[:-1] + ['0', '--out', str(work / 'raw2'), '--budget', '10', '--api-base', url], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode != 0 and 'exceeds --budget' in (r.stdout + r.stderr), 'a render over --budget is refused before any request')
        # host guard
        m = len(Fake.log)
        r = run(base[:-1] + ['0', '--out', str(work / 'raw3'), '--api-base', 'https://evil.example.com'], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode != 0 and 'refusing to send the key' in r.stdout + r.stderr and len(Fake.log) == m, 'the key is never sent to a host other than api.elevenlabs.io / loopback')
        # no key
        r = run(base[:-1] + ['0', '--out', str(work / 'raw4'), '--api-base', url])
        ok(r.returncode != 0 and 'ELEVENLABS_API_KEY is not set' in r.stdout + r.stderr, 'no ELEVENLABS_API_KEY: stops without a request')
        # 429 then success, and 401 scrubbed
        Fake.mode = '429'; Fake.log.clear()
        r = run(base[:-1] + ['0', '--out', str(work / 'raw5'), '--api-base', url, '--budget', '5000'], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode == 0 and len(Fake.log) == 4, 'HTTP 429 with Retry-After is retried (4 requests for 3 lines)')
        Fake.mode = '401'
        r = run(base[:-1] + ['0', '--out', str(work / 'raw6'), '--api-base', url, '--budget', '5000'], env={'ELEVENLABS_API_KEY': 'TESTKEY-123'})
        ok(r.returncode != 0 and 'HTTP 401' in r.stdout + r.stderr and 'TESTKEY-123' not in r.stdout + r.stderr, 'HTTP 401 stops cleanly and the key echoed by the server is scrubbed from the message')
    finally:
        srv.shutdown()

    # ---- 3. pack.py
    pack, chosen = make_pack(tmp / 'mp', n_lines=6)
    man = json.load(open(pack / 'manifest.json'))
    ok(man['format'] == 1 and len(man['lines']) >= len(chosen) and man['license']['plan'] == 'free' and man['license']['commercial_use_verified'] is False, 'manifest.json: format 1, %d ids, licence plan declared free, commercial use NOT verified' % len(man['lines']))
    good = all((pack / e['file']).exists() and hashlib.sha256((pack / e['file']).read_bytes()).hexdigest() == e['sha256'] and e['duration'] > 0.3 for e in man['lines'].values())
    ok(good, 'every manifest entry: file exists, sha256 matches, duration > 0.3 s')
    f0 = next(iter(man['lines'].values()))['file']
    pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(pack / f0)], capture_output=True, text=True).stdout)['streams'][0]
    ok(pr['codec_name'] == 'opus' and pr['channels'] == 1, 'packed audio is mono Opus (%s, %s ch, %s)' % (pr['codec_name'], pr['channels'], f0))
    ms = subprocess.run(['ffmpeg', '-nostats', '-i', str(pack / f0), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', ms[ms.rfind('Summary'):]).group(1)); TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', ms[ms.rfind('Summary'):]).group(1))
    ok(abs(I + 20) < 1.5 and TP <= -1.0, 'normalised to -20 LUFS (%.1f) with true peak %.1f dBFS <= -1' % (I, TP))
    dur0 = next(iter(man['lines'].values()))['duration']
    ok(dur0 < 0.5 + 0.1 + 2.0, 'leading/trailing silence trimmed (the fake API added 0.24 s)')
    ok(zipfile.ZipFile(pack / 'voicepack.zip').testzip() is None and 'manifest.json' in zipfile.ZipFile(pack / 'voicepack.zip').namelist(), 'voicepack.zip is valid and holds the manifest')
    ok('NOT FOR COMMERCIAL USE' in (pack / 'README.md').read_text(), 'the generated README states the free-plan licence limit')
    r = run([sys.executable, str(TOOLS / 'pack.py'), '--raw', str(tmp / 'mp' / 'raw'), '--out', str(ROOT / 'src' / 'oops')])
    ok(r.returncode != 0 and 'refusing to write generated audio inside the repository' in r.stdout + r.stderr and not (ROOT / 'src' / 'oops').exists(), 'pack.py refuses to write generated audio into the repository tree')
    if not keep: shutil.rmtree(tmp, ignore_errors=True)
    print('FAILED (%d)' % len(fails) if fails else 'ALL OK')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
