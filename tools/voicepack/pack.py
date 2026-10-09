#!/usr/bin/env python3
"""tools/voicepack/pack.py - OFFLINE step 3 of the voice-pack pipeline: raw recordings -> a small, normalised voice pack the game can load.

  python3 tools/voicepack/pack.py --raw voicepack_work/raw --out voicepack_work/voicepack --plan-licence free [--codec opus|aac|vorbis|mp3|wav] [--zip]

Reads  <raw>/index.json  (id -> {file, key, speaker}; written by render_elevenlabs.py, or by any other source of recordings: the loader does not care who made the audio)
       <raw>/<file>      mp3/wav/ogg/anything ffmpeg decodes
Does   mono, trims leading/trailing silence (-48 dB), two-pass EBU R128 loudness normalisation to --lufs (default -20 LUFS integrated, true peak <= -2 dBTP; the in-game
       'voice' bus then lands near the same level as the synthesized voices), 10 ms fade-in / 20 ms fade-out (no clicks), encodes small mono audio
       (default Opus in Ogg, 24 kbit/s: ~3 KB per second of speech).
Writes <out>/manifest.json   {format:1, codec, license:{...}, lines:{ id: {file,duration,sha256,bytes,speaker,key} }}
       <out>/audio/*.ogg|m4a|mp3|wav
       <out>/README.md       the licence situation, verbatim from this script (edit it to match YOUR plan)
       <out>/voicepack.zip   with --zip (STORE method: audio is already compressed; the in-game reader handles stored entries)
`sha256` is the SHA-256 of the packed file's bytes; the game recomputes it and REJECTS any file that does not match (tests/e2e/e2e_audio_voicepack.py corrupts one byte to prove it).
`key` = <speaker>|<fnv1a32(normalised text)>: how the game finds a recording by what is spoken (see extract_lines.js; the hash is computed from lines.json when --lines is given).
Codec note: Ogg Opus plays in Chromium/Firefox/Android WebView; Safari/iOS support for Ogg Opus is recent and version-dependent, so for an iOS build use --codec aac (m4a).
Licence: see the README this script writes. The repository must not contain generated audio; --out inside the git work tree's src/dist/docs/tests/tools is refused."""
import argparse, hashlib, json, os, re, subprocess, sys, pathlib, shutil, tempfile, zipfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CODECS = {
    'opus': ('libopus', '.ogg', ['-b:a', '24k', '-application', 'voip', '-vbr', 'on']),
    'vorbis': ('libvorbis', '.ogg', ['-q:a', '1']),
    'aac': ('aac', '.m4a', ['-b:a', '40k']),
    'mp3': ('libmp3lame', '.mp3', ['-b:a', '48k']),
    'wav': ('pcm_s16le', '.wav', []),
}
LICENCE_TEXT = {
    'free': """FREE-PLAN AUDIO - NOT FOR COMMERCIAL USE.
These recordings were declared as made on the ElevenLabs free plan. As far as the plan terms were known when this tool was written, the free plan does not grant a commercial licence
and may require attribution. Do NOT ship this pack in a store release (Google Play / App Store), do not sell it and do not commit it to the game repository. Use it for private
play-testing only, and re-check the current ElevenLabs terms before doing anything else with it.""",
    'paid': """PAID-PLAN AUDIO - YOU must verify the terms.
These recordings were declared as made on a paid plan. Whether that plan includes commercial use for this kind of product (a game sold in app stores), whether attribution is required
and whether voices from the voice library are covered is decided by the CURRENT ElevenLabs terms and your plan, not by this tool. Verify before you ship.""",
    'own': """OWN RECORDINGS / OTHER SOURCE - licence is whatever you hold for these files. Keep the proof with the pack.""",
    'unknown': """LICENCE NOT DECLARED. Treat this pack as private play-test material until you have verified the terms of the service that produced the audio.""",
}


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def fnv32(s):
    h = 0x811C9DC5
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return '%08x' % h


def norm(t):
    return re.sub(r'\s+', ' ', t or '').strip()


def probe_duration(p):
    r = sh(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(p)])
    return float(r.stdout.strip())


TRIM = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02:detection=peak'


def process(src, dst, codec, lufs, tp, tmpdir):
    enc, ext, extra = CODECS[codec]
    t1 = pathlib.Path(tmpdir) / 'a.wav'
    sh(['ffmpeg', '-y', '-v', 'error', '-i', str(src), '-ac', '1', '-ar', '48000', '-af', ','.join([TRIM, 'areverse', TRIM, 'areverse']), str(t1)])
    # pass 1: measure
    m = subprocess.run(['ffmpeg', '-v', 'info', '-i', str(t1), '-af', 'loudnorm=I=%g:TP=%g:LRA=11:print_format=json' % (lufs, tp), '-f', 'null', '-'], capture_output=True, text=True)
    j = re.search(r'\{[^{}]*"input_i"[^{}]*\}', m.stderr, re.S)
    if not j:
        raise RuntimeError('loudnorm measurement failed for %s' % src)
    st = json.loads(j.group(0))
    dur = probe_duration(t1)
    ln = 'loudnorm=I=%g:TP=%g:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true' % (
        lufs, tp, st['input_i'], st['input_tp'], st['input_lra'], st['input_thresh'], st['target_offset'])
    fades = 'afade=t=in:d=0.01,afade=t=out:st=%.3f:d=0.02' % max(0.0, dur - 0.02)
    sh(['ffmpeg', '-y', '-v', 'error', '-i', str(t1), '-af', ','.join([ln, 'aresample=48000', fades]), '-ac', '1', '-c:a', enc] + extra + [str(dst)])
    return st


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 16), b''):
            h.update(b)
    return h.hexdigest()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--raw', default='voicepack_work/raw')
    ap.add_argument('--out', default='voicepack_work/voicepack')
    ap.add_argument('--lines', default=str(HERE / 'lines.json'), help='lines.json (adds alias ids that share a recording)')
    ap.add_argument('--codec', default='opus', choices=sorted(CODECS))
    ap.add_argument('--lufs', type=float, default=-20.0)
    ap.add_argument('--tp', type=float, default=-2.0)
    ap.add_argument('--plan-licence', default='unknown', choices=sorted(LICENCE_TEXT), help='which plan made the audio (decides the README text and manifest flag)')
    ap.add_argument('--zip', action='store_true')
    ap.add_argument('--allow-in-repo', action='store_true')
    ap.add_argument('--name', default='Orbital Dominion voice pack')
    args = ap.parse_args(argv)

    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            sys.exit('%s not found on PATH' % tool)
    raw = pathlib.Path(args.raw)
    out = pathlib.Path(args.out).resolve()
    try:
        rel = out.relative_to(ROOT)
        if rel.parts and rel.parts[0] in ('src', 'dist', 'docs', 'tests', 'tools', 'baseline', 'server') and not args.allow_in_repo:
            sys.exit('refusing to write generated audio inside the repository (%s). Use a path outside it or voicepack_work/ (git-ignored).' % rel)
    except ValueError:
        pass
    index = json.load(open(raw / 'index.json', encoding='utf-8'))
    lines = {}
    if os.path.exists(args.lines):
        for l in json.load(open(args.lines, encoding='utf-8'))['lines']:
            lines[l['id']] = l
    alias = {}
    for l in lines.values():
        for a in l.get('alias', []):
            alias[a] = l['id']
    (out / 'audio').mkdir(parents=True, exist_ok=True)
    enc, ext, extra = CODECS[args.codec]
    man = {'format': 1, 'name': args.name, 'codec': args.codec, 'mime': {'.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'}[ext],
           'lufs': args.lufs, 'license': {'plan': args.plan_licence, 'commercial_use_verified': False,
                                           'statement': LICENCE_TEXT[args.plan_licence].split('\n')[0], 'readme': 'README.md'}, 'lines': {}}
    total = 0.0
    done = {}
    for id_, e in sorted(index.items()):
        src = raw / e['file']
        if not src.exists():
            print('skip %s: %s missing' % (id_, e['file']))
            continue
        name = '%s%s' % (e['hash'][:16], ext) if e.get('hash') else '%s%s' % (hashlib.sha256(id_.encode()).hexdigest()[:16], ext)
        dst = out / 'audio' / name
        if name not in done:
            with tempfile.TemporaryDirectory() as td:
                process(src, dst, args.codec, args.lufs, args.tp, td)
            done[name] = (probe_duration(dst), sha256(dst), dst.stat().st_size)
        dur, digest, size = done[name]
        key = e.get('key') or ''
        if id_ in lines:
            key = lines[id_]['key']
        ent = {'file': 'audio/' + name, 'duration': round(dur, 3), 'sha256': digest, 'bytes': size, 'speaker': e.get('speaker', ''), 'key': key}
        man['lines'][id_] = ent
        for a in [k for k, v in alias.items() if v == id_]:
            man['lines'][a] = dict(ent)
    total = sum(v[0] for v in done.values())
    man['stats'] = {'recordings': len(done), 'ids': len(man['lines']), 'seconds': round(total, 1), 'bytes': sum(v[2] for v in done.values())}
    (out / 'manifest.json').write_text(json.dumps(man, indent=1, sort_keys=True) + '\n', encoding='utf-8')
    readme = '# %s\n\n%s\n\nGenerated by tools/voicepack/pack.py. The game loads it from Settings > Audio > "Load voice pack..." (select manifest.json together with the audio files, or the .zip).\n' % (args.name, LICENCE_TEXT[args.plan_licence])
    (out / 'README.md').write_text(readme, encoding='utf-8')
    if args.zip:
        zp = out / 'voicepack.zip'
        with zipfile.ZipFile(zp, 'w', zipfile.ZIP_STORED) as z:
            z.write(out / 'manifest.json', 'manifest.json')
            z.write(out / 'README.md', 'README.md')
            for v in man['lines'].values():
                if v['file'] not in z.namelist():
                    z.write(out / v['file'], v['file'])
    print('packed %d recordings (%d ids), %.1f s, %.1f KB -> %s' % (len(done), len(man['lines']), total, man['stats']['bytes'] / 1024, out))
    print('LICENCE: ' + LICENCE_TEXT[args.plan_licence].split('\n')[0])
    return 0


if __name__ == '__main__':
    sys.exit(main())
