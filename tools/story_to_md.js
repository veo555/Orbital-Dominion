#!/usr/bin/env node
/* Story data -> screenplay and campaign document (docs/story/SCRIPT.md).
     node tools/story_to_md.js                 # write docs/story/SCRIPT.md
     node tools/story_to_md.js --stdout        # print instead of writing
     node tools/story_to_md.js --out <file>    # write somewhere else
     node tools/story_to_md.js --check         # exit 1 when the document on disk is out of date
     node tools/story_to_md.js --story <file>  # render another story module, e.g. tests/fixtures/story_min.js (prints unless --out)
   The data is loaded exactly as tools/validate_story.js loads it (tests/sim/storylib.js: same files, same vocabulary).
   Deterministic: no clock, no randomness. The header carries a SHA-1 fingerprint of the source files, so a stale copy shows.
   Dialogue and radio text are printed verbatim. Action lines paraphrase the props, fx, actor and camera data: they describe
   the staging and add no story. Timecodes are film time (m:ss.t from the start of each film).
   Contract: docs/CAMPAIGN_SPEC.md, docs/CINEMATIC_SPEC.md, src/js/43_vocab.js. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DEFAULT = path.join(ROOT, 'docs', 'story', 'SCRIPT.md');
const argv = process.argv.slice(2);
const argOf = f => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : null; };

/* ---------------------------------------------------------------- load (same path as validate_story.js) */
const V = require(path.join(ROOT, 'tests', 'sim', 'storylib.js'))();
let STORY = V.STORY;
let inputs = V.files.map(f => ({ name: f, buf: fs.readFileSync(path.join(ROOT, 'src', 'js', f)) }));
let sourceLine = V.files.length + ' data files in src/js/ (00_core.js, 43_vocab.js, 44_story_*.js)';
const storyOpt = argOf('--story');
if (storyOpt) {
  const file = path.resolve(storyOpt);
  const m = require(file);
  STORY = typeof m === 'function' ? m() : m;
  inputs = [{ name: path.relative(ROOT, file), buf: fs.readFileSync(file) }];
  sourceLine = path.relative(ROOT, file) + ' (a story module; vocabulary from src/js/43_vocab.js)';
}
const FP = (() => {
  const h = crypto.createHash('sha1');
  for (const f of inputs) { h.update(f.name + '\n'); h.update(f.buf); }
  return h.digest('hex').slice(0, 12);
})();

/* ---------------------------------------------------------------- formatting helpers */
const pad2 = n => (n < 10 ? '0' : '') + n;
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const esc = s => String(s == null ? '' : s).replace(/([\\`*_[\]|<>])/g, '\\$1');
const code = s => '`' + String(s == null ? '' : s).replace(/`/g, "'") + '`';
const plain = t => String(t).replace(/\\(.)/g, '$1').replace(/[`*]/g, '');
const slug = t => plain(t).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const artFor = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const words = s => String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean).length;
const sumBy = (xs, f) => xs.reduce((t, x) => t + f(x), 0);
const listJoin = xs => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const tc = t => { const k = Math.max(0, Math.round(num(t, 0) * 10)); const m = Math.floor(k / 600), r = k - m * 600; return m + ':' + pad2(Math.floor(r / 10)) + '.' + (r % 10); };
const sec = d => (Math.round(num(d, 0) * 10) / 10) + ' s';
const mss = s => { const k = Math.round(num(s, 0)); return Math.floor(k / 60) + ':' + pad2(k % 60); };
const clock = s => mss(Math.floor(num(s, 0)));
const NUMW = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };

/* hex colour -> a plain English colour word (deterministic HSL bands) */
function colourWord(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return '';
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) { h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); if (h < 0) h += 360; }
  if (l < 0.08) return 'black';
  if (l > 0.93) return 'white';
  if (s < 0.15) return l < 0.4 ? 'charcoal' : l > 0.7 ? 'pale grey' : 'grey';
  const hue = h < 12 || h >= 345 ? 'red' : h < 30 ? 'orange' : h < 50 ? 'amber' : h < 68 ? 'yellow' : h < 165 ? 'green'
    : h < 190 ? 'teal' : h < 205 ? 'cyan' : h < 250 ? 'blue' : h < 290 ? 'violet' : 'magenta';
  if (l > 0.8) return 'pale ' + hue;
  if (l < 0.3) return 'deep ' + hue;
  return hue;
}

/* ---------------------------------------------------------------- vocabulary names */
const UDEF = V.UDEF || {}, BDEF = V.BDEF || {}, TECH = V.TECH || {}, FACTIONS = V.FACTIONS || {};
const MUSIC = V.MUSIC_CUES || {};
const LIMITS = (V.CINE_LIMITS && V.CINE_LIMITS.total) || {};
const KIND_LABEL = { intro: 'Opening film', briefing: 'Briefing', debrief: 'Debrief', interlude: 'Interlude', ending: 'Ending', credits: 'Credits', defeat: 'Defeat film' };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const CINE = STORY.cine || {};
const CH = STORY.characters || {};
const RADIO = STORY.radio || {};
const MISSIONS = STORY.missions || [];
const ACTS = STORY.acts || [];
const PLACES = (STORY.world && STORY.world.places) || [];

const plural = w => (/man$/.test(w) ? w.slice(0, -3) + 'men' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(s|x|ch|sh)$/.test(w) ? w + 'es' : w + 's');
function noun(table, id) {
  const name = esc((table[id] && table[id].name) || String(id == null ? '?' : id));
  return { s: name, p: /^hero_/.test(String(id)) ? name : plural(name) };
}
const facName = f => esc((FACTIONS[f] && FACTIONS[f].name) || cap(String(f || '')));
const facAdj = f => esc(cap(String(f || '')));
const placeName = id => { const p = PLACES.find(x => x.id === id); return p ? p.name : (id || ''); };
const PLANET_WORD = { azure: 'blue', ember: 'ember-red', verdant: 'green', ice: 'ice-white', ashen: 'ash-grey', violet: 'violet' };
const NEBULA_WORD = { blue: 'blue', red: 'red', teal: 'teal', violet: 'violet', gold: 'gold' };
const BIOME_NAME = { dust: 'dust flats', crystal: 'crystal fields', ash: 'ash plain', green: 'green meadow', ice: 'ice shelf' };
const TIME_NAME = { day: 'day', dusk: 'dusk', night: 'night', dawn: 'dawn' };
const HALL_STYLE = { meridian: 'steel', obsidian: 'black-glass', aurora: 'pale-glass', forbidden: 'sealed' };
const HALL_LIGHT = { cold: 'cold', warm: 'warm', blood: 'blood-red' };
const VIEW_HEAD = { space: 'VIEW: SPACE', planet: 'VIEW: PLANET', array: 'VIEW: THE ARRAY' };
const VIEW_SAY = { space: 'Stars move past the viewport.', planet: 'A planet turns beneath the viewport.', array: 'The Array shows in the viewport.', none: 'The viewport is dark.' };
const FEATURE_SAY = { hub: 'a Command Hub', generators: 'generators', crystals: 'crystal clusters', geyser: 'an ether geyser', wreck: 'a wrecked hull', dunes: 'dunes', cliffs: 'cliffs', towers: 'watch towers', banners: 'banners', tents: 'tents' };
const CLS_NAME = { dropship: 'dropship', frigate: 'frigate', carrier: 'carrier', shuttle: 'shuttle', wreck: 'wrecked hull' };
const EDGE_NAME = { N: 'north', E: 'east', S: 'south', W: 'west' };
const HERO_POLICY = { none: 'no hero (locked for this mission)', available: 'the hero can be trained at the Hub', start: 'the hero stands at the Hub from the start' };
const EASE_WORD = { lin: 'at a steady pace', in: 'easing in', out: 'easing out', inout: 'easing in and out' };
const MARK_SAY = { 'scar-l': 'left-cheek scar', tattoo: 'tattoo', 'glow-eye': 'glowing eye', mask: 'mask', visor: 'visor', halo: 'halo', cracks: 'cracked plating' };
/* per prop kind: [one, many, timed one, timed many] verbs */
const VERBS = {
  beacon: ['glows', 'line', 'lights up', 'light up'], banner: ['hangs', 'hang', 'appears', 'appear'], building: ['stands', 'stand', 'appears', 'appear'],
  unit: ['stands', 'stand', 'appears', 'appear'], crystal: ['glints', 'glint', 'appears', 'appear'], crowd: ['gathers', 'gather', 'gathers', 'gather'],
  holo: ['floats', 'float', 'appears', 'appear'], ship: ['hangs', 'hang', 'appears', 'appear'], station: ['turns', 'turn', 'appears', 'appear'],
  planet: ['hangs', 'hang', 'rises', 'rise'], moon: ['hangs', 'hang', 'rises', 'rise'], array: ['stands', 'stand', 'appears', 'appear']
};
const AMBIENT = new Set(['stars', 'dust', 'embers', 'rain', 'snow', 'smoke', 'heat', 'scan']);
const ONESHOT = new Set(['flare', 'pulse', 'sparks', 'explosion', 'rings', 'beam', 'lightning', 'glitch', 'shake', 'comets']);

/* ---------------------------------------------------------------- people */
const charOf = id => (id && CH[id]) || null;
const narratorKey = Object.keys(CH).find(k => CH[k] && CH[k].role === 'narrator') || null;
function spk(who) {
  if (who === 'narrator') return { key: narratorKey || 'narrator', name: 'NARRATOR', c: narratorKey ? CH[narratorKey] : null, vo: true };
  const c = charOf(who);
  return { key: who, name: esc(String((c && (c.short || c.name)) || who || '?')).toUpperCase(), c, vo: false };
}
const isStatus = c => !!(c && /rule-based/i.test(c.title || ''));
const resolveWho = who => (who === 'narrator' ? narratorKey : who);

/* ---------------------------------------------------------------- positions, colour, camera */
const hPos = x => (x < -0.02 ? 'off the left edge' : x < 0.2 ? 'far left' : x < 0.4 ? 'left of centre' : x <= 0.6 ? 'centre'
  : x < 0.8 ? 'right of centre' : x <= 1.02 ? 'far right' : 'off the right edge');
const vPos = y => (y < 0.2 ? 'high' : y < 0.4 ? 'upper' : y <= 0.6 ? 'mid-height' : y < 0.8 ? 'low' : y <= 1 ? 'near the bottom' : 'below the frame');
const where = (x, y) => {
  const h = hPos(x), v = vPos(y);
  if (h === 'centre') return v === 'mid-height' ? 'centre' : 'centre, ' + v;
  return v === 'mid-height' ? h : h + ', ' + v;
};
const posOf = arr => (Array.isArray(arr) ? where(num(arr[0], 0.5), num(arr[1], 0.5)) : 'centre');
const fxPos = f => (f.x == null && f.y == null ? 'the centre of the frame' : where(num(f.x, 0.5), num(f.y, 0.5)));
const framing = h => (h >= 0.8 ? 'close-up' : h >= 0.5 ? 'medium shot' : 'distant');
const dirOf = a => (a.face === 'l' ? 'left' : 'right');
function actorDesc(a) {
  const bits = [framing(num(a.h, 0.8))];
  if (a.expr && a.expr !== 'neutral' && a.expr !== 'talk') bits.push(a.expr);
  const mode = { silhouette: 'in silhouette', shadow: 'in shadow with glowing eyes', hologram: 'as a flickering hologram' }[a.mode];
  if (mode) bits.push(mode);
  return bits.join(', ');
}
const zoomWord = z => (z < 0.9 ? 'wide' : z < 1.3 ? 'medium' : z < 2 ? 'close' : 'tight close-up');
function cameraSay(cam) {
  if (!cam || !cam.from || !cam.to) return 'Camera: the default slow push-in over the scene.';
  const f = cam.from, t = cam.to;
  const dz = num(t.z, 1) - num(f.z, 1), dx = num(t.x, 0.5) - num(f.x, 0.5), dy = num(t.y, 0.5) - num(f.y, 0.5), dr = num(t.r, 0) - num(f.r, 0);
  const parts = [];
  if (Math.abs(dz) >= 0.03) parts.push(dz > 0 ? 'pushes in' : 'pulls back');
  if (Math.abs(dx) >= 0.03) parts.push(dx > 0 ? 'drifts right' : 'drifts left');
  if (Math.abs(dy) >= 0.03) parts.push(dy > 0 ? 'tilts down' : 'tilts up');
  if (Math.abs(dr) >= 0.02) parts.push('rolls ' + (dr > 0 ? 'clockwise' : 'anticlockwise'));
  const ease = cam.ease && EASE_WORD[cam.ease] ? ', ' + EASE_WORD[cam.ease] : '';
  if (!parts.length) return `Camera holds on a ${zoomWord(num(f.z, 1))} shot.`;
  const zoomNote = Math.abs(dz) >= 0.03 ? ` (${zoomWord(num(f.z, 1))} to ${zoomWord(num(t.z, 1))})` : '';
  return `Camera ${parts.join(', ')}${ease}${zoomNote}.`;
}
function transSay(tr) {
  if (!tr) return '';
  const bits = [];
  if (tr.in && tr.in !== 'cut') bits.push(`opens ${tr.in}${tr.len ? ' (' + sec(tr.len) + ')' : ''}`);
  if (tr.out && tr.out !== 'cut') bits.push(`closes ${tr.out}${tr.len ? ' (' + sec(tr.len) + ')' : ''}`);
  return bits.join(', ');
}

/* ---------------------------------------------------------------- conditions and actions in words */
const CMP_WORD = { '<': 'fewer than', '<=': 'at most', '==': 'exactly', '>=': 'at least', '>': 'more than', '!=': 'not' };
const TIME_WORD = { '>=': 'reaches', '>': 'passes', '<': 'is still before', '<=': 'is still at or before', '==': 'is exactly', '!=': 'is not' };
const OBJ_STATE = { active: 'is showing', done: 'is complete', failed: 'has failed' };
const who = side => (side === 'me' ? 'you' : 'the enemy');
const secsWithClock = x => (num(x, 0) >= 60 ? `${num(x, 0)} s (${clock(x)})` : `${num(x, 0)} s`);
function countSay(subj, cmp, n, sing, plur, o) {
  const have = subj === 'you' ? 'have' : 'has';
  const pre = o && o.pre ? o.pre + ' ' : '';
  const post = o && o.post ? ' ' + o.post : '';
  if (cmp === '==' && n === 0) return `${subj} ${have} ${pre}no ${plur}${post}`;
  return `${subj} ${have} ${pre}${CMP_WORD[cmp] || cmp} ${n} ${n === 1 ? sing : plur}${post}`;
}
const unitKind = t => (t === '*' ? { s: 'unit', p: 'units' } : t === 'army' ? { s: 'armed unit', p: 'armed units' }
  : t === 'worker' ? { s: 'worker', p: 'workers' } : noun(UDEF, t));
function condSay(c, ctx) {
  if (!Array.isArray(c) || typeof c[0] !== 'string') return '(no condition)';
  const op = c[0], a = c.slice(1);
  const sub = x => (Array.isArray(x) && ['all', 'any', 'not'].includes(x[0]) ? '(' + condSay(x, ctx) + ')' : condSay(x, ctx));
  switch (op) {
    case 'all': return a.length ? a.map(sub).join(' and ') : 'always';
    case 'any': return a.length ? a.map(sub).join(' or ') : 'never';
    case 'not': return 'not ' + sub(a[0]);
    case 'time': return `the mission clock ${TIME_WORD[a[0]] || a[0]} ${secsWithClock(a[1])}`;
    case 'flag': return `the flag ${code(a[0])} is set`;
    case 'after': return `${num(a[1], 0)} s after the flag ${code(a[0])} is set`;
    case 'count': {
      const subj = who(a[1]);
      if (a[0] === 'unit') { const k = unitKind(a[2]); return countSay(subj, a[3], a[4], k.s, k.p, { post: 'alive' }); }
      const b = a[2] === '*' ? { s: 'building', p: 'buildings' } : noun(BDEF, a[2]);
      return countSay(subj, a[3], a[4], b.s, b.p, { post: 'standing' });
    }
    case 'res': return a[0] === 'e' ? countSay('you', a[1], a[2], 'ether', 'ether') : countSay('you', a[1], a[2], 'crystal', 'crystals');
    case 'era': {
      const s = who(a[0]);
      if (a[1] === '>=') return `${s} ${s === 'you' ? 'have' : 'has'} reached Era ${a[2]}`;
      return `${s === 'you' ? 'your' : "the enemy's"} era is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    }
    case 'supply': return `${who(a[0]) === 'you' ? 'your' : "the enemy's"} supply used is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    case 'hero':
      if (a[0] === 'alive') return 'your hero is alive';
      if (a[0] === 'dead') return 'your hero has fallen and is not alive';
      return `your hero's level is ${CMP_WORD[a[1]] || a[1]} ${a[2]}`;
    case 'heroNear': return `your hero is within ${a[2]} tiles of (${a[0]}, ${a[1]})`;
    case 'kills': return countSay(who(a[0]), a[1], a[2], 'unit, building or creep', 'units, buildings and creeps', { pre: 'destroyed' });
    case 'lost': return countSay(who(a[0]), a[1], a[2], 'unit or building', 'units and buildings', { pre: 'lost' });
    case 'structs': return countSay(who(a[0]), a[1], a[2], 'building', 'buildings', { post: 'standing' });
    case 'hubs': { const h = noun(BDEF, 'hub'); return countSay(who(a[0]), a[1], a[2], 'working ' + h.s, 'working ' + h.p); }
    case 'camps': return countSay('you', a[0], a[1], 'creep camp', 'creep camps', { pre: 'cleared' });
    case 'unitsNear': {
      const k = unitKind(a[1]);
      return countSay(who(a[0]), a[5], a[6], k.s, k.p, { post: `within ${a[4]} tiles of (${a[2]}, ${a[3]})` });
    }
    case 'built': { const b = noun(BDEF, a[0]); return countSay('you', a[1], a[2], b.s, b.p, { pre: 'completed', post: '(in total)' }); }
    case 'trained': { const u = noun(UDEF, a[0]); return countSay('you', a[1], a[2], u.s, u.p, { pre: 'trained', post: '(in total)' }); }
    case 'researched': return `you have researched ${esc((TECH[a[0]] && TECH[a[0]].name) || a[0])}`;
    case 'mined': return a[0] === 'e' ? countSay('you', a[1], a[2], 'ether', 'ether', { pre: 'mined', post: '(in total)' })
      : countSay('you', a[1], a[2], 'crystal', 'crystals', { pre: 'mined', post: '(in total)' });
    case 'trade': return `freighter trade has earned ${CMP_WORD[a[0]] || a[0]} ${a[1]} crystals`;
    case 'obj': return `the objective ${objQuote(a[0], ctx)} ${OBJ_STATE[a[1]] || a[1]}`;
    case 'wave': return countSay('the enemy', a[0], a[1], 'attack wave', 'attack waves', { pre: 'launched' });
    default: return `[unknown condition ${esc(op)}]`;
  }
}
const objQuote = (id, ctx) => (ctx && ctx.objText && ctx.objText[id] ? '“' + esc(ctx.objText[id]) + '”' : code(id));
const AIMOD = {
  waveMult: v => `wave size ×${v}`, intervalMult: v => `wave interval ×${v}`, firstWave: v => `first wave at ${v} s`,
  hero: v => `hero ${v ? 'on' : 'off'}`, air: v => `air units ${v ? 'on' : 'off'}`
};
function actSay(a, ctx) {
  if (!Array.isArray(a) || typeof a[0] !== 'string') return '(no action)';
  const op = a[0], b = a.slice(1);
  switch (op) {
    case 'radio': return `play radio line ${code(b[0])}`;
    case 'cine': return `play the film ${code(b[0])} (the game waits for it)`;
    case 'obj': return (b[1] === 'show' ? 'show ' : b[1] === 'done' ? 'complete ' : 'fail ') + objQuote(b[0], ctx);
    case 'flag': return `${b[1] ? 'set' : 'clear'} the flag ${code(b[0])}`;
    case 'spawn': {
      const side = b[0], u = noun(UDEF, b[1]), n = num(b[2], 1), w = b[3], opts = b[4] || {};
      const count = n === 1 ? `1 ${u.s}` : `${n} ${u.p}`;
      const sideW = side === 'me' ? 'your' : 'enemy';
      const place = w === 'base' ? `at the ${side === 'me' ? 'your' : 'enemy'} Command Hub`
        : Array.isArray(w) ? `near tile (${w[0]}, ${w[1]})`
          : /^edge:/.test(String(w)) ? `along the ${EDGE_NAME[String(w).slice(5)] || '?'} edge` : esc(w);
      const ord = { attack: ', ordered to attack', hold: ', holding position' }[opts.order] || '';
      return `spawn ${sideW} ${count} ${place}${ord}`;
    }
    case 'give': return `grant ${b[1]} ${b[0] === 'e' ? 'ether' : 'crystals'}`;
    case 'take': return `take ${b[1]} ${b[0] === 'e' ? 'ether' : 'crystals'}`;
    case 'reveal': return `reveal the ground around (${b[0]}, ${b[1]}), radius ${b[2]} tiles${b[3] ? ', for ' + b[3] + ' s' : ''}`;
    case 'ping': return `mark (${b[0]}, ${b[1]}) on the map as ${esc(b[2])}`;
    case 'aimod': return 'retune the enemy: ' + Object.entries(b[0] || {}).map(([k, v]) => (AIMOD[k] ? AIMOD[k](v) : `${k} ${v}`)).join(', ');
    case 'strike': return `${b[6] === 'me' ? 'your' : 'an enemy'} orbital strike on (${b[0]}, ${b[1]}), radius ${b[2]} tiles, ${b[3]} damage after ${b[4]} s${b[5] ? ' (warning sound: ' + esc(b[5]) + ')' : ''}`;
    case 'mood': return `change the music to ${esc(b[0])}`;
    case 'win': return 'end the mission in victory';
    case 'lose': return `end the mission in defeat (${esc(b[0])})`;
    case 'unlock': case 'lock': {
      const w = b[0] === 'building' ? noun(BDEF, b[1]).s : b[0] === 'unit' ? noun(UDEF, b[1]).s : `Era ${b[1]}`;
      return `${op} ${w}`;
    }
    case 'herolevel': return `raise your hero to level ${b[0]}`;
    case 'heal': return `heal ${b[0] === 'me' ? 'your' : 'enemy'} units and buildings within ${b[3]} tiles of (${b[1]}, ${b[2]})`;
    default: return `[unknown action ${esc(op)}]`;
  }
}
function repeatSay(t) {
  const every = num(t.every, 0);
  const once = t.once !== undefined ? !!t.once : !every;
  if (once) return 'once';
  if (every) return `at most every ${every} s while its condition holds`;
  return 'every time its condition holds';
}

/* ---------------------------------------------------------------- scene settings (background, props, fx) */
function bgSay(bg) {
  switch (bg.k) {
    case 'space': return bg.nebula && bg.nebula !== 'none' ? `Stars surround a ${NEBULA_WORD[bg.nebula] || esc(bg.nebula)} nebula.` : 'Stars, and nothing else.';
    case 'planet': return `A ${PLANET_WORD[bg.planet] || 'distant'} planet fills the view${bg.rings ? ', ringed' : ''}${bg.moons ? (bg.moons === 1 ? ', with a moon' : `, with ${bg.moons} moons`) : ''}.`;
    case 'orbit': return `A ${PLANET_WORD[bg.planet] || 'distant'} world fills the lower frame, its ${esc(bg.limb || 'bottom')} limb lit${bg.station ? ', and an orbital station turns above it' : ''}${bg.ships ? `; ${bg.ships === 1 ? 'one ship hangs' : bg.ships + ' ships hang'} in the dark` : ''}.`;
    case 'surface': {
      const f = (bg.features || []).map(x => FEATURE_SAY[x] || esc(x));
      return cap(`${BIOME_NAME[bg.biome] || 'open ground'}.`) + (f.length ? ` ${cap(listJoin(f))} ${f.length === 1 ? 'is' : 'are'} in view.` : '');
    }
    case 'base': return { calm: 'Its lights are steady.', siege: 'Its walls take fire, and smoke climbs past them.', ruined: 'Half its walls are gone; the lights that remain flicker.', celebration: 'Banners and bunting hang from its gates.' }[bg.state] || '';
    case 'bridge': return `The bridge is ${bg.alert ? 'on alert, lit red' : 'quiet, its consoles steady'}. ${VIEW_SAY[bg.view] || ''}`.trim();
    case 'hall': return `A ${HALL_STYLE[bg.style] || 'great'} hall, lit ${HALL_LIGHT[bg.light] || 'dimly'}.`;
    case 'battlefield': {
      const it = num(bg.intensity, 0.5), sides = bg.sides || [];
      return `${facAdj(sides[0])} and ${facAdj(sides[1])} forces fight over ${BIOME_NAME[bg.biome] || 'open ground'}; the fighting is ${it < 0.3 ? 'light' : it < 0.6 ? 'steady' : 'heavy'}.`;
    }
    case 'ruins': return `Ruins stand on ${BIOME_NAME[bg.biome] || 'open ground'}.`;
    case 'array': return { dormant: 'The Array sits dark.', charging: 'Energy gathers in the Array.', firing: 'The Array fires.', broken: 'The Array is broken and dark.' }[bg.state] || 'The Array is in view.';
    case 'void': return `Empty dark${colourWord(bg.tint) ? ', tinted ' + colourWord(bg.tint) : ''}${num(bg.glow, 0) > 0.3 ? ', with a faint glow' : ''}.`;
    case 'map': {
      const c = {};
      for (const m of bg.marks || []) c[m.k] = (c[m.k] || 0) + 1;
      const parts = Object.keys(c).map(k => `${c[k]} ${esc(k)}`);
      return `A tactical display${parts.length ? ', marked ' + listJoin(parts) : ''}.`;
    }
    default: return '';
  }
}
function sceneHead(bg, place) {
  const T = TIME_NAME[bg.time] ? ' — ' + TIME_NAME[bg.time].toUpperCase() : '';
  const P = place ? esc(place).toUpperCase() : '';
  const B = BIOME_NAME[bg.biome] ? ' — ' + BIOME_NAME[bg.biome].toUpperCase() : '';
  switch (bg.k) {
    case 'space': return 'EXT. DEEP SPACE' + (bg.nebula && bg.nebula !== 'none' ? ' — ' + (NEBULA_WORD[bg.nebula] || esc(bg.nebula)).toUpperCase() + ' NEBULA' : '');
    case 'planet': return 'EXT. ORBIT — ' + (PLANET_WORD[bg.planet] || 'DISTANT').toUpperCase() + ' WORLD' + (bg.rings ? ', RINGED' : '');
    case 'orbit': return 'EXT. ORBIT — ' + (PLANET_WORD[bg.planet] || 'DISTANT').toUpperCase() + ' WORLD';
    case 'surface': return 'EXT. ' + (P || (BIOME_NAME[bg.biome] || 'GROUND').toUpperCase()) + (P ? B : '') + T;
    case 'base': return `EXT. ${facAdj(bg.faction).toUpperCase()} BASE${bg.state === 'siege' ? ', UNDER SIEGE' : bg.state === 'ruined' ? ', RUINED' : bg.state === 'celebration' ? ', CELEBRATING' : ''}${T}`;
    case 'bridge': return `INT. ${facAdj(bg.faction).toUpperCase()} BRIDGE — ${bg.alert ? 'ALERT' : 'STANDING WATCH'}${VIEW_HEAD[bg.view] ? ' — ' + VIEW_HEAD[bg.view] : ''}`;
    case 'hall': return `INT. ${(HALL_STYLE[bg.style] || 'GREAT').toUpperCase()} HALL — ${(HALL_LIGHT[bg.light] || 'DIM').toUpperCase()} LIGHT`;
    case 'battlefield': return 'EXT. BATTLEFIELD' + (P ? ' — ' + P : '') + B + T;
    case 'ruins': return 'EXT. RUINS' + (P ? ' — ' + P : '') + B + T;
    case 'array': return 'EXT. THE ARRAY — ' + esc(String(bg.state || 'idle')).toUpperCase();
    case 'void': return 'THE VOID' + (colourWord(bg.tint) ? ' — ' + colourWord(bg.tint).toUpperCase() + ' DARK' : '');
    case 'map': return 'INT. TACTICAL DISPLAY' + (bg.faction ? ' — ' + facAdj(bg.faction).toUpperCase() + ' VIEW' : '');
    default: return 'EXT. ' + esc(String(bg.k || 'UNKNOWN')).toUpperCase();
  }
}
const propKey = p => [p.k, p.faction, p.type, p.cls, p.shape, p.planet, p.col].map(x => (x == null ? '' : x)).join('|');
function propNoun(p) {
  const col = colourWord(p.col), fa = p.faction && !/^hero_/.test(p.type || '') ? facAdj(p.faction) + ' ' : '';
  const withFa = w => ({ s: fa + w.s, p: fa + w.p });
  switch (p.k) {
    case 'ship': { const w = esc(CLS_NAME[p.cls] || p.cls || 'ship'); return withFa({ s: w, p: plural(w) }); }
    case 'unit': return withFa(noun(UDEF, p.type));
    case 'building': return withFa(noun(BDEF, p.type));
    case 'beacon': return { s: (col ? col + ' ' : '') + 'beacon', p: (col ? col + ' ' : '') + 'beacons' };
    case 'banner': return withFa({ s: 'banner', p: 'banners' });
    case 'crowd': return withFa({ s: 'crowd', p: 'crowds' });
    case 'crystal': return { s: (col ? col + ' ' : '') + 'crystal cluster', p: (col ? col + ' ' : '') + 'crystal clusters' };
    case 'holo': { const sh = esc(p.shape || 'sigil'); return { s: 'holographic ' + sh, p: 'holographic ' + plural(sh) }; }
    case 'station': return { s: 'orbital station', p: 'orbital stations' };
    case 'planet': return { s: (PLANET_WORD[p.planet] || 'distant') + ' planet', p: (PLANET_WORD[p.planet] || 'distant') + ' planets' };
    case 'moon': return { s: 'moon', p: 'moons' };
    case 'array': return { s: 'Array', p: 'Arrays' };
    default: { const w = esc(p.k || 'object'); return { s: w, p: plural(w) }; }
  }
}
const isMoving = p => Array.isArray(p.from) && Array.isArray(p.to);
const pt0 = p => num(p.t0, 0);
function spread(items, timed) {
  const pts = items.map(p => (Array.isArray(p.at) ? p.at : [0.5, 0.5]));
  if (timed) return `from ${posOf(pts[0])} to ${posOf(pts[pts.length - 1])}`;
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), avgy = ys.reduce((a, b) => a + b, 0) / ys.length;
  if (maxx - minx < 0.12) return `in a cluster at ${posOf([(minx + maxx) / 2, avgy])}`;
  if (Math.min(...ys) > 0.75 && maxx - minx > 0.25) return `along the bottom edge, from ${hPos(minx)} to ${hPos(maxx)}`;
  const L = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), R = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  return `from ${posOf(L)} to ${posOf(R)}`;
}
function staticSentence(items, timed) {
  const n0 = items[0], nn = propNoun(n0), v = VERBS[n0.k] || ['is', 'are', 'appears', 'appear'];
  if (items.length === 1) return cap(artFor(nn.s)) + ' ' + (timed ? v[2] : v[0]) + ' at ' + posOf(n0.at) + '.';
  const cnt = NUMW[items.length] || String(items.length);
  if (timed) return `${cap(cnt)} ${nn.p} ${v[3]} in turn, ${spread(items, true)}.`;
  return `${cap(cnt)} ${nn.p} ${v[1]} ${spread(items, false)}.`;
}
function groupStatics(list) {
  const map = new Map();
  for (const p of list) { const k = propKey(p); if (!map.has(k)) map.set(k, []); map.get(k).push(p); }
  return [...map.values()]
    .map(items => { items.sort((a, b) => pt0(a) - pt0(b)); return { t0: pt0(items[0]), items }; })
    .sort((a, b) => a.t0 - b.t0);
}
function movingSay(p, t0, t1) {
  const subj = cap(artFor(propNoun(p).s));
  const dx = p.to[0] - p.from[0], dy = p.to[1] - p.from[1];
  let verb;
  if (Math.hypot(dx, dy) < 0.03) verb = 'holds position';
  else if (Math.abs(dx) >= Math.abs(dy)) verb = 'crosses';
  else verb = dy > 0 ? 'descends' : 'climbs';
  const dur = t1 - t0;
  const ease = p.ease && EASE_WORD[p.ease] ? ', ' + EASE_WORD[p.ease] : '';
  return `${subj} ${verb} from ${posOf(p.from)} to ${posOf(p.to)}${dur > 0.5 ? ' over ' + sec(dur) : ''}${ease}.`;
}
function ambientSay(f) {
  const c = colourWord(f.col) ? colourWord(f.col) + ' ' : '';
  const s = { stars: 'stars fill the frame.', dust: 'dust drifts through the light.', embers: 'embers rise through the air.', rain: 'rain falls.',
    snow: 'snow falls.', smoke: 'smoke drifts across the scene.', heat: 'heat haze shimmers over the ground.', scan: 'scan lines run across the picture.' }[f.k];
  return cap(c + (s || f.k + ' effect.'));
}
function ambientBegin(f) {
  const c = colourWord(f.col) ? colourWord(f.col) + ' ' : '';
  const s = { stars: 'the stars come out', dust: 'dust starts to drift', embers: 'embers start to rise', rain: 'rain starts to fall', snow: 'snow starts to fall',
    smoke: 'smoke starts to drift', heat: 'heat haze starts to shimmer', scan: 'scan lines start to run' }[f.k];
  return cap(c + (s || f.k + ' starts') + '.');
}
function fxSay(f) {
  const c = colourWord(f.col) ? colourWord(f.col) + ' ' : '';
  const at = 'at ' + fxPos(f);
  switch (f.k) {
    case 'flare': return cap(`${c}flare blooms ${at}.`);
    case 'pulse': return cap(`${c}pulse radiates ${at}.`);
    case 'sparks': return cap(`sparks spit ${at}.`);
    case 'explosion': return cap(`an explosion blooms ${at}.`);
    case 'rings': return cap(`${c}rings ripple out ${at}.`);
    case 'beam': return f.to ? cap(`${c}beam runs from ${fxPos(f)} to ${posOf(f.to)}.`) : cap(`${c}beam fires ${at}.`);
    case 'comets': return f.to ? cap(`comets streak from ${fxPos(f)} to ${posOf(f.to)}.`) : cap(`comets streak ${at}.`);
    case 'lightning': return 'Lightning forks across the sky.';
    case 'glitch': return 'The picture glitches.';
    case 'shake': return 'The camera shakes.';
    default: return cap(`${esc(f.k)} effect ${at}.`);
  }
}
function actorTag(a) {
  return `${spk(a.char).name} (${actorDesc(a)}) is at ${posOf(a.at)}, facing ${dirOf(a)}.`;
}
/* the timed beats of one scene, in scene time: actors, moving or timed props, fx, sound, title, dialogue */
function sceneBeats(s, dur) {
  const B = [];
  const add = (t, text, kind) => B.push({ t: num(t, 0), i: B.length, text, kind: kind || 'action' });
  for (const a of s.actors || []) {
    const sp = spk(a.char), t0 = num(a.t0, 0), t1 = num(a.t1, dur);
    if (t0 > 0.05) add(t0, `${sp.name} enters at ${posOf(a.at)}, ${actorDesc(a)}, facing ${dirOf(a)}.`);
    if (a.move && Array.isArray(a.move.to)) {
      const mt = num(a.move.t0, t0);
      const span = num(a.move.t1, NaN);
      const over = isFinite(span) && span > mt ? ' over ' + sec(span - mt) : '';
      const ease = a.move.ease && EASE_WORD[a.move.ease] ? ', ' + EASE_WORD[a.move.ease] : '';
      add(mt, `${sp.name} moves to ${posOf(a.move.to)}${over}${ease}.`);
    }
    if (t1 < dur - 0.05) add(t1, `${sp.name} leaves the frame.`);
  }
  const timed = [];
  for (const p of s.props || []) {
    const t0 = pt0(p), t1 = num(p.t1, dur);
    if (isMoving(p)) add(t0, movingSay(p, t0, t1));
    else if (t0 > 0.05) timed.push(p);
  }
  for (const g of groupStatics(timed)) add(g.t0, staticSentence(g.items, true));
  for (const f of s.fx || []) {
    const t0 = num(f.t0, 0);
    if (f.k === 'vignette') continue;
    if (AMBIENT.has(f.k)) { if (t0 > 0.05) add(t0, ambientBegin(f)); }
    else if (ONESHOT.has(f.k)) add(t0, fxSay(f));
    else add(t0, cap(esc(f.k)) + ' begins.');
  }
  for (const x of s.sfx || []) add(x.t, `*Sound: ${esc(x.name)}.*`, 'sfx');
  if (s.title && s.title.text) add(s.title.t0, `**Title card:** ${esc(s.title.text)}${s.title.sub ? ' — ' + esc(s.title.sub) : ''}.`, 'title');
  (s.lines || []).forEach((ln, li) => B.push({ t: num(ln.t, 0), i: 100000 + li, line: ln, kind: 'line' }));
  B.sort((a, b) => (a.t - b.t) || (a.i - b.i));
  return B;
}
function lineCue(ln, present) {
  const st = ln.style || 'normal', sp = spk(ln.who), bits = [];
  if (st === 'narration' || sp.vo) bits.push('V.O.');
  else if (st === 'radio') bits.push('over radio');
  else if (st === 'thought') bits.push('thinking');
  else if (st === 'whisper') bits.push('whispering');
  else if (st === 'shout') bits.push('shouting');
  else if (!present.has(ln.who)) bits.push('O.S.');
  if (st !== 'narration' && ln.expr && ln.expr !== 'neutral' && ln.expr !== 'talk') bits.push(ln.expr);
  if (isStatus(sp.c) && st === 'normal') bits.push('status line');
  return `**${sp.name}**` + (bits.length ? ' *(' + bits.join(', ') + ')*' : '');
}
/* one scene: heading, meta, establishing paragraphs, timed beats (film time) */
function sceneDoc(s, idx, start, place) {
  const dur = num(s.dur, 0), end = start + dur, out = [];
  out.push(`**${idx + 1}. ${sceneHead(s.bg || {}, place)}**`);
  const meta = [code(s.id), `${tc(start)}–${tc(end)} (${sec(dur)})`];
  if (s.music) meta.push('music: ' + esc(s.music.cue) + (s.music.section != null ? ' from section ' + s.music.section : ''));
  const tr = transSay(s.trans);
  if (tr) meta.push(tr);
  out.push('*' + meta.join(' · ') + '*');
  const present = new Set((s.actors || []).map(a => a.char));
  const opening = [bgSay(s.bg || {})];
  const statics0 = (s.props || []).filter(p => !isMoving(p) && pt0(p) <= 0.05);
  for (const g of groupStatics(statics0)) opening.push(staticSentence(g.items, false));
  for (const f of s.fx || []) if (AMBIENT.has(f.k) && num(f.t0, 0) <= 0.05) opening.push(ambientSay(f));
  const establishing = opening.filter(Boolean).join(' ');
  if (establishing) out.push(establishing);
  const onCam = (s.actors || []).filter(a => num(a.t0, 0) <= 0.05).map(actorTag);
  if (onCam.length) out.push(onCam.join(' '));
  out.push('*' + cameraSay(s.cam) + '*');
  for (const b of sceneBeats(s, dur)) {
    if (b.kind === 'line') {
      out.push('`' + tc(start + b.t) + '` ' + lineCue(b.line, present));
      out.push(esc(b.line.text));
    } else out.push('`' + tc(start + b.t) + '` ' + b.text);
  }
  return out;
}
function musicWord(cue) {
  const m = MUSIC[cue];
  return esc(cue) + (m ? ` (${m.loop ? 'loops' : 'plays once'}, nominal ${m.len} s)` : ' (not in MUSIC_CUES)');
}
function filmStats(id) {
  const c = CINE[id], sc = Array.isArray(c.scenes) ? c.scenes : [];
  return {
    runtime: sumBy(sc, s => num(s.dur, 0)), scenes: sc.length,
    lines: sumBy(sc, s => (s.lines || []).length), words: sumBy(sc, s => sumBy(s.lines || [], l => words(l.text)))
  };
}
/* a whole film as paragraphs; `level` is the heading depth, `flow` says when it plays */
function filmDoc(id, level, flow, place) {
  const c = CINE[id], out = [], st = filmStats(id), lim = LIMITS[c.kind];
  out.push('#'.repeat(level) + ' ' + `${KIND_LABEL[c.kind] || esc(c.kind)} — "${esc(c.title)}" ${code(id)}`);
  if (flow) out.push(esc(flow));
  out.push('*' + [tc(st.runtime) + ' runtime', st.scenes + ' scenes', st.lines + ' lines, ' + st.words + ' words',
    'music: ' + musicWord(c.music), lim ? 'kind limit ' + lim[0] + '–' + lim[1] + ' s' : null].filter(Boolean).join(' · ') + '*');
  if (c.kind === 'intro') out.push('*FADE IN.*');
  let t = 0;
  (Array.isArray(c.scenes) ? c.scenes : []).forEach((s, i) => {
    out.push(...sceneDoc(s, i, t, place));
    t += num(s.dur, 0);
  });
  if (c.kind === 'ending' || c.kind === 'credits') out.push('*FADE OUT.*');
  if (c.kind === 'credits') out.push('**THE END**');
  return out;
}

/* ---------------------------------------------------------------- film placement in the campaign flow */
const HEADS = [];
const H = (level, text) => { HEADS.push({ level, text }); return '#'.repeat(level) + ' ' + text; };
const filmIds = Object.keys(CINE);
const kindOf = id => (CINE[id] ? CINE[id].kind : null);
const docOrder = [], placed = {};
const addFilm = (id, slot, mission) => { if (!id || !CINE[id] || placed[id]) return; placed[id] = { slot, mission }; docOrder.push(id); };
filmIds.filter(id => kindOf(id) === 'intro').forEach(id => addFilm(id, 'opening', null));
for (const m of MISSIONS) {
  addFilm(m.briefing, 'briefing', m);
  addFilm(m.debrief, 'debrief', m);
  if (m.after && kindOf(m.after) !== 'ending') addFilm(m.after, 'after', m);
  addFilm(m.defeat, 'defeat', m);
}
filmIds.filter(id => kindOf(id) === 'ending').forEach(id => addFilm(id, 'ending', null));
filmIds.filter(id => kindOf(id) === 'credits').forEach(id => addFilm(id, 'credits', null));
const unplaced = filmIds.filter(id => !placed[id]);
function flowNote(id) {
  const p = placed[id];
  if (!p) return 'Not reached by the campaign flow.';
  switch (p.slot) {
    case 'opening': return 'Played before Mission 1 when a new campaign starts.';
    case 'briefing': return `Played before Mission ${p.mission.n}.`;
    case 'debrief': return `Played after victory in Mission ${p.mission.n}.`;
    case 'after': return `Played after the debrief of Mission ${p.mission.n}.`;
    case 'defeat': return `Played when Mission ${p.mission.n} is lost.`;
    case 'ending': return 'Played after the final debrief.';
    case 'credits': return 'Played after the ending.';
    default: return '';
  }
}

/* ---------------------------------------------------------------- appearances (cast table and statistics) */
const appear = {};
const ap = id => (appear[id] = appear[id] || { first: null, scenes: 0, lines: 0, words: 0, radio: 0, radioWords: 0 });
for (const id of docOrder.concat(unplaced)) {
  for (const s of CINE[id].scenes || []) {
    for (const a of s.actors || []) { const x = ap(a.char); x.scenes++; if (!x.first) x.first = id; }
    for (const ln of s.lines || []) {
      const k = resolveWho(ln.who);
      if (!k) continue;
      const x = ap(k); x.lines++; x.words += words(ln.text); if (!x.first) x.first = id;
    }
  }
}
for (const id of Object.keys(RADIO)) {
  const r = RADIO[id], k = resolveWho(r.who);
  if (!k) continue;
  const x = ap(k); x.radio++; x.radioWords += words(r.text);
}

/* ---------------------------------------------------------------- the cast */
function voiceSay(v) {
  v = v || {};
  const p = num(v.pitch, 1), r = num(v.rate, 1);
  const pw = p < 0.85 ? 'low' : p < 1.15 ? 'mid-range' : 'high';
  const rw = r < 0.95 ? 'slow' : r < 1.1 ? 'measured' : 'quick';
  return `${cap(pw)}, ${rw} voice with a ${esc(v.timbre || 'neutral')} timbre. Speech blips: pitch ${p}, rate ${r}, formant ${num(v.formant, 0.5)}. Text-to-speech: pitch ${num(v.ttsPitch, 1)}, rate ${num(v.ttsRate, 1)}.`;
}
function lookSay(c) {
  const l = c.look || {}, bits = [];
  if (l.armor) bits.push(`${colourWord(l.armor.col) || 'grey'} ${esc(l.armor.style)} armor${colourWord(l.armor.trim) ? ' with ' + colourWord(l.armor.trim) + ' trim' : ''}`);
  if (l.hair) bits.push(l.hair.style === 'bald' ? 'bald' : `${esc(l.hair.style)} hair${colourWord(l.hair.color) ? ' (' + colourWord(l.hair.color) + ')' : ''}`);
  if (l.build) bits.push(`${esc(l.build)} build`);
  if (l.age) bits.push(esc(l.age));
  const marks = (l.mark || []).filter(m => m !== 'none').map(m => MARK_SAY[m] || esc(m));
  if (marks.length) bits.push(listJoin(marks));
  if (l.emblem && l.emblem !== 'none') bits.push(`${esc(l.emblem)} emblem`);
  const s = bits.join('; ');
  return s ? cap(s) + '.' : 'Not specified.';
}
function screenSay(id) {
  const x = ap(id);
  if (!x.first) return x.radio ? `never on screen; ${x.radio} radio ${x.radio === 1 ? 'line' : 'lines'}` : 'never on screen and not on the radio';
  return `first in ${esc(CINE[x.first].title)} ${code(x.first)}; ${x.scenes} scenes, ${x.lines} film lines (${x.words} words), ${x.radio} radio lines`;
}
function personEntry(id) {
  const c = CH[id], out = [];
  out.push(H(4, `${esc(c.name)} — ${esc(c.short)}`));
  const fac = c.faction === 'none' ? 'no faction' : c.faction === 'neutral' ? 'unaligned' : facName(c.faction);
  out.push(`*${esc(c.title)}*`);
  out.push([`${esc(c.role)}${c.hero ? ' (plays ' + code(c.hero) + ')' : ''}`, fac, esc(c.side) + ' side', 'leitmotif ' + code(c.motif)].join(' · '));
  out.push(esc(c.bio));
  out.push([
    `- **Wants:** ${esc(c.want)}`,
    `- **Flaw:** ${esc(c.flaw)}`,
    `- **Arc:** ${esc(c.arc)}`,
    `- **Voice:** ${voiceSay(c.voice)}`,
    `- **Look:** ${lookSay(c)}`,
    `- **Signature line:** “${esc(c.quote)}”`,
    `- **On screen:** ${screenSay(id)}.`
  ].join('\n'));
  return out;
}
function castParas() {
  const out = [], ids = Object.keys(CH);
  const groups = [['good', 'Allies and heroes (side: good)'], ['gray', 'Gray (side: gray)'], ['evil', 'Antagonists (side: evil)']];
  for (const [side, label] of groups) {
    const g = ids.filter(id => CH[id].side === side);
    if (!g.length) continue;
    out.push(H(3, label));
    for (const id of g) out.push(...personEntry(id));
  }
  const rest = ids.filter(id => !['good', 'gray', 'evil'].includes(CH[id].side));
  if (rest.length) { out.push(H(3, 'Other')); for (const id of rest) out.push(...personEntry(id)); }
  return out;
}

/* ---------------------------------------------------------------- missions */
function unitList(list) {
  return (list || []).length ? (list || []).map(u => `${u.n} ${u.n === 1 ? noun(UDEF, u.type).s : noun(UDEF, u.type).p}`).join(', ') : 'no units';
}
function bldList(list) {
  return (list || []).length ? (list || []).map(b => `${noun(BDEF, b.type).s} at (${b.tx}, ${b.ty})`).join(', ') : 'no buildings';
}
function settingRows(m, ctx) {
  const s = m.setup || {}, st = s.start || {}, rs = s.restrict || {}, fo = s.foe || {}, fst = fo.start || {}, mods = fo.mods || {};
  const rows = [];
  rows.push(['Place', `${esc(ctx.place || m.place || '?')}; map seed ${s.seed} (${V.MW} × ${V.MH} tiles)`]);
  rows.push(['Sides', `You: ${facName(s.faction)}, ${esc(s.diff || 'normal')} difficulty. Enemy: ${facName(s.enemy)}.`]);
  rows.push(['You start with', `${num(st.c, 0)} crystals, ${num(st.e, 0)} ether, Era ${num(st.era, 1)}; ${unitList(st.units)}; ${bldList(st.buildings)}; ${HERO_POLICY[st.hero] || 'hero: ' + esc(st.hero)}${st.supplyBonus ? '; supply bonus ' + st.supplyBonus : ''}`]);
  const locked = [...(rs.buildings || []).map(b => noun(BDEF, b).p), ...(rs.units || []).map(u => noun(UDEF, u).p)];
  if (rs.maxEra) locked.push(`Era ${rs.maxEra + 1} and later`);
  rows.push(['Locked at the start', locked.length ? listJoin(locked) : 'nothing']);
  const modTxt = Object.entries(mods).map(([k, v]) => ({
    waveMult: `wave size ×${v}`, intervalMult: `wave interval ×${v}`, firstWave: `first wave at ${v} s`, hero: `hero ${v ? 'on' : 'off'}`, air: `air units ${v ? 'on' : 'off'}`
  }[k] || `${esc(k)} ${v}`));
  const enemyStart = (fst.c != null || fst.e != null || (fst.units || []).length || (fst.buildings || []).length)
    ? `; starts with ${num(fst.c, 0)} crystals, ${num(fst.e, 0)} ether, Era ${num(fst.era, 1)}, ${unitList(fst.units)}` : '';
  rows.push(['Enemy AI', `${fo.ai === false ? 'off (fully scripted)' : 'on'}${enemyStart}${modTxt.length ? '; tuning: ' + listJoin(modTxt) : ''}`]);
  rows.push(['Daylight and swarm', `daylight ${esc(s.daylight || 'cycle')}; swarm layer (rule-based Overseer) ${esc(s.swarm)}`]);
  rows.push(['Default victory rule', m.noDefaultWin ? 'off; the mission sets its own victory' : 'on: destroy every enemy building']);
  rows.push(['Default defeat rule', m.noDefaultLose ? 'off' : 'on: every building of yours lost, or no Command Hub and no army left']);
  const par = num(m.stars && m.stars.par, 0);
  rows.push(['Stars', `1 for victory; 2 with every bonus objective complete; 3 for victory within ${par} s (${clock(par)})`]);
  return rows;
}
function table(head, rows) {
  const lines = ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|'];
  for (const r of rows) lines.push('| ' + r.map(c => String(c).replace(/\n/g, ' ')).join(' | ') + ' |');
  return lines.join('\n');
}
function objectiveBullet(o, ctx) {
  const kind = { primary: 'Primary', bonus: 'Bonus', hidden: 'Hidden' }[o.kind] || esc(o.kind);
  const shown = o.kind === 'hidden' ? 'hidden until it is complete' : o.when ? 'shown once ' + condSay(o.when, ctx) : 'shown from the start';
  const done = o.done ? 'complete when ' + condSay(o.done, ctx) : 'no completion condition';
  const fail = o.fail ? ` Fails when ${condSay(o.fail, ctx)}.` : '';
  return `- **${kind}:** ${esc(o.text)} *(${shown})*. ${cap(done)}.${fail}`;
}
function radioQual(r) {
  const bits = ['over radio'];
  if (r.style === 'whisper') bits.push('whispering');
  if (r.style === 'shout') bits.push('shouting');
  if (isStatus(spk(r.who).c)) bits.push('status line');
  return bits.join(', ');
}
function triggerBlock(m, ctx) {
  const items = [];
  (m.triggers || []).forEach((t, i) => {
    const delay = num(t.delay, 0) > 0 ? `, ${t.delay} s after its condition holds` : '';
    const opt = t.optional ? ' (marked optional)' : '';
    let head = `${i + 1}. ${code(t.id)} — ${repeatSay(t)}${delay}${opt}, when ${condSay(t.when, ctx)}.`;
    const sub = [];
    for (const a of t.do || []) {
      if (a[0] !== 'radio') continue;
      const r = RADIO[a[1]];
      sub.push(r ? `   - Radio ${code(a[1])}: **${spk(r.who).name}** *(${radioQual(r)}, ${sec(r.dur)})* — “${esc(r.text)}”`
        : `   - Radio ${code(a[1])}: *(missing line)*`);
    }
    const others = (t.do || []).filter(a => a[0] !== 'radio').map(a => actSay(a, ctx));
    if (others.length) sub.push(`   - Also: ${others.join('; ')}.`);
    items.push(head + (sub.length ? '\n' + sub.join('\n') : ''));
  });
  return items.join('\n');
}
function missionParas(m) {
  const out = [], pl = placeName(m.place), ctx = { place: pl, objText: {} };
  for (const o of m.objectives || []) ctx.objText[o.id] = o.text;
  out.push(H(3, `Mission ${m.n} — ${esc(m.title)}`));
  out.push(`*${esc(m.subtitle)}*`);
  out.push(esc(m.synopsis));
  if (m.n === 1) out.push('*A new campaign plays the opening film first (see Opening).*');
  if (m.briefing && CINE[m.briefing]) out.push(...filmDoc(m.briefing, 4, flowNote(m.briefing), pl));
  out.push(H(4, 'The mission'));
  out.push(table(['Setting', 'Detail'], settingRows(m, ctx)));
  out.push('**Objectives**\n' + ((m.objectives || []).map(o => objectiveBullet(o, ctx)).join('\n') || '- none'));
  out.push('**Triggers, radio and events, in trigger order**\n' + (triggerBlock(m, ctx) || '- none'));
  const endB = [];
  endB.push(`- **Victory when** ${m.win ? condSay(m.win, ctx) : 'no victory condition'}.`);
  endB.push(`- **Defeat when** ${m.lose ? condSay(m.lose, ctx) : 'no defeat condition'}.`);
  if ((m.objectives || []).some(o => o.kind === 'primary' && o.fail)) endB.push('- A primary objective that fails also ends the mission in defeat.');
  out.push('**Ending the mission**\n' + endB.join('\n'));
  if ((m.hints || []).length) out.push('**Hints on the briefing card**\n' + m.hints.map(h => '- ' + esc(h)).join('\n'));
  if (m.debrief && CINE[m.debrief]) out.push(...filmDoc(m.debrief, 4, flowNote(m.debrief), pl));
  if (m.after && CINE[m.after] && kindOf(m.after) !== 'ending') out.push(...filmDoc(m.after, 4, flowNote(m.after), pl));
  else if (m.after) out.push(`*Afterwards: the ending (see The ending).*`);
  else out.push('*No film follows this mission.*');
  if (m.defeat && CINE[m.defeat]) {
    if (placed[m.defeat] && placed[m.defeat].mission === m) out.push(...filmDoc(m.defeat, 4, flowNote(m.defeat), pl));
    else out.push(`*If the mission is lost, the defeat film ${code(m.defeat)} plays (shown under Mission ${placed[m.defeat] && placed[m.defeat].mission ? placed[m.defeat].mission.n : '?'}).*`);
  } else out.push('*If the mission is lost, the generic retry screen appears (no film).*');
  return out;
}

/* ---------------------------------------------------------------- statistics and data notes */
function computeStats() {
  const S = { films: 0, runtime: 0, scenes: 0, filmLines: 0, filmWords: 0, filmChars: 0, radioLines: 0, radioWords: 0, radioChars: 0,
    longest: null, shortest: null, byKind: {} };
  for (const id of filmIds) {
    const c = CINE[id], st = filmStats(id);
    S.films++; S.runtime += st.runtime; S.scenes += st.scenes;
    const k = S.byKind[c.kind] = S.byKind[c.kind] || { films: 0, runtime: 0 };
    k.films++; k.runtime += st.runtime;
    for (const s of c.scenes || []) {
      const d = num(s.dur, 0);
      if (!S.longest || d > S.longest.d) S.longest = { d, id: s.id, film: id };
      if (!S.shortest || d < S.shortest.d) S.shortest = { d, id: s.id, film: id };
      for (const ln of s.lines || []) { S.filmLines++; S.filmWords += words(ln.text); S.filmChars += String(ln.text || '').length; }
    }
  }
  for (const id of Object.keys(RADIO)) { const r = RADIO[id]; S.radioLines++; S.radioWords += words(r.text); S.radioChars += String(r.text || '').length; }
  S.words = S.filmWords + S.radioWords;
  S.chars = S.filmChars + S.radioChars;
  S.lines = S.filmLines + S.radioLines;
  S.objectives = { primary: 0, bonus: 0, hidden: 0 };
  S.triggers = 0; S.actionOps = {}; S.radioUsed = {};
  for (const m of MISSIONS) {
    for (const o of m.objectives || []) S.objectives[o.kind] = (S.objectives[o.kind] || 0) + 1;
    for (const t of m.triggers || []) {
      S.triggers++;
      for (const a of t.do || []) {
        S.actionOps[a[0]] = (S.actionOps[a[0]] || 0) + 1;
        if (a[0] === 'radio') S.radioUsed[a[1]] = (S.radioUsed[a[1]] || 0) + 1;
      }
    }
  }
  S.objTotal = S.objectives.primary + S.objectives.bonus + S.objectives.hidden;
  const sides = { good: 0, gray: 0, evil: 0, other: 0 };
  for (const id of Object.keys(CH)) sides[['good', 'gray', 'evil'].includes(CH[id].side) ? CH[id].side : 'other']++;
  S.sides = sides;
  return S;
}
function dataNotes(S) {
  const out = [];
  const optional = [];
  for (const m of MISSIONS) for (const t of m.triggers || []) if (t.optional) optional.push(t.id);
  const runtimeSrc = fs.readFileSync(path.join(ROOT, 'src', 'js', '45_campaign.js'), 'utf8');
  const reads = /\.optional\b/.test(runtimeSrc);
  const unusedRadio = Object.keys(RADIO).filter(id => !S.radioUsed[id]);
  const reusedRadio = Object.keys(S.radioUsed).filter(id => S.radioUsed[id] > 1);
  const offFlow = unplaced;
  const absent = Object.keys(CH).filter(id => CH[id].role !== 'narrator' && !ap(id).first && !ap(id).radio);
  const overLimit = filmIds.filter(id => { const lim = LIMITS[kindOf(id)], rt = filmStats(id).runtime; return lim && (rt < lim[0] || rt > lim[1]); });
  const list = xs => (xs.length ? xs.map(x => code(x)).join(', ') : 'none');
  out.push(`- **Triggers marked \`optional\`:** ${optional.length ? list(optional) : 'none'}. ${reads ? 'The campaign runtime reads this flag.' : 'The campaign runtime (src/js/45_campaign.js) does not read this flag yet, so it changes nothing in play.'}`);
  out.push(`- **Radio lines no trigger plays:** ${list(unusedRadio)}.`);
  out.push(`- **Radio lines played by more than one trigger (each play repeats the line):** ${list(reusedRadio)}.`);
  out.push(`- **Films outside their kind's runtime limit:** ${list(overLimit)}.`);
  out.push(`- **Films not reached by the campaign flow:** ${list(offFlow)}.`);
  out.push(`- **Characters never on screen or on the radio:** ${list(absent)}.`);
  return out;
}

/* ---------------------------------------------------------------- assemble the document */
const body = [];
const S = computeStats();

body.push(H(2, 'Dramatis personae'));
body.push('Each entry gives the character brief as recorded in the story data, with the voice and look notes for casting and the first place the character appears on screen.');
body.push(...castParas());

body.push(H(2, 'Opening'));
for (const id of docOrder.filter(x => placed[x] && placed[x].slot === 'opening')) body.push(...filmDoc(id, 3, flowNote(id), null));

ACTS.forEach((a, i) => {
  body.push(H(2, `Act ${ROMAN[i] || i + 1} — ${esc(a.title)}`));
  body.push(esc(a.summary));
  for (const id of a.missions || []) {
    const m = MISSIONS.find(x => x.id === id);
    body.push(m ? missionParas(m).join('\n\n') : `*Mission ${code(id)} is missing from the data.*`);
  }
});

body.push(H(2, 'The ending'));
const endIds = docOrder.filter(x => placed[x] && placed[x].slot === 'ending');
if (!endIds.length) body.push('*No ending film is defined.*');
for (const id of endIds) body.push(...filmDoc(id, 3, flowNote(id), null));

body.push(H(2, 'Credits'));
const creditIds = docOrder.filter(x => placed[x] && placed[x].slot === 'credits');
if (!creditIds.length) body.push('*No credits film is defined.*');
for (const id of creditIds) body.push(...filmDoc(id, 3, flowNote(id), null));

/* appendices: reference material only, after the credits */
body.push(H(2, 'Appendix A — Cinematic index'));
body.push('Every film in the order it appears above, with its runtime checked against the limit for its kind (`CINE_LIMITS.total` in src/js/43_vocab.js).');
{
  const rows = [];
  for (const id of docOrder.concat(unplaced)) {
    const c = CINE[id], st = filmStats(id), lim = LIMITS[c.kind];
    const ok = !lim || (st.runtime >= lim[0] && st.runtime <= lim[1]);
    rows.push([`${esc(c.title)} ${code(id)}`, KIND_LABEL[c.kind] || esc(c.kind), tc(st.runtime), st.scenes, st.lines, st.words,
      lim ? `${lim[0]}–${lim[1]} s` : '—', ok ? 'yes' : 'NO']);
  }
  body.push(table(['Film', 'Kind', 'Runtime', 'Scenes', 'Lines', 'Words', 'Kind limit', 'Within limit'], rows));
}

body.push(H(2, 'Appendix B — Statistics'));
{
  const tot = S.runtime;
  const rows = [
    ['Films (cinematics)', `${S.films}`],
    ['Total film runtime', `${mss(tot)} (${sec(tot)}); ${S.scenes} scenes, mean ${sec(tot / Math.max(1, S.scenes))}, longest ${sec(S.longest ? S.longest.d : 0)} (${code(S.longest ? S.longest.id : '')}), shortest ${sec(S.shortest ? S.shortest.d : 0)} (${code(S.shortest ? S.shortest.id : '')})`],
    ['Dialogue lines in films', `${S.filmLines}`],
    ['Radio lines (in-mission)', `${S.radioLines}`],
    ['Spoken lines, all', `${S.lines}`],
    ['Words spoken (films and radio)', `${S.words} (films ${S.filmWords}, radio ${S.radioWords}); counted as tools/validate_story.js --stats counts them`],
    ['Characters of dialogue (letters, spaces, punctuation)', `${S.chars} (films ${S.filmChars}, radio ${S.radioChars})`],
    ['Cast', `${Object.keys(CH).length} characters: ${S.sides.good} good, ${S.sides.gray} gray, ${S.sides.evil} evil${S.sides.other ? ', ' + S.sides.other + ' other' : ''}`],
    ['Missions and acts', `${MISSIONS.length} missions in ${ACTS.length} acts`],
    ['Objectives', `${S.objTotal}: ${S.objectives.primary} primary, ${S.objectives.bonus} bonus, ${S.objectives.hidden} hidden`],
    ['Triggers', `${S.triggers}, with actions: ${Object.entries(S.actionOps).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`]
  ];
  body.push(table(['Measure', 'Value'], rows));
  body.push('**Runtime by kind**');
  const kr = Object.keys(S.byKind).sort().map(k => {
    const lim = LIMITS[k];
    return [KIND_LABEL[k] || k, S.byKind[k].films, tc(S.byKind[k].runtime), lim ? `${lim[0]}–${lim[1]} s` : '—'];
  });
  body.push(table(['Kind', 'Films', 'Total runtime', 'Limit per film'], kr));
}

body.push(H(2, 'Appendix C — Data notes'));
body.push('Checks run on the data at generation time. None of them changes the script; each names something a designer may want to look at.');
body.push(dataNotes(S).join('\n'));

const TITLE = [];
TITLE.push(`# ${esc(STORY.meta && STORY.meta.title)}`);
TITLE.push(`*${esc(STORY.meta && STORY.meta.tagline)}*`);
TITLE.push(`> ${esc(STORY.meta && STORY.meta.logline)}`);
TITLE.push(`**Campaign script:** the screenplay of every film, the mission book with its radio log, and the statistics. Version ${num(STORY.meta && STORY.meta.version, 1)}, rated ${esc(STORY.meta && STORY.meta.rating)}.`);
TITLE.push(`Generated by ${code('tools/story_to_md.js')} from ${sourceLine} (fingerprint ${code(FP)}). Do not edit this file by hand: change the story source and run ${code('node tools/story_to_md.js')}.`);
const glance = [
  `- **Runtime:** ${mss(S.runtime)} of film (${sec(S.runtime)}) across ${S.films} films and ${S.scenes} scenes.`,
  `- **Spoken lines:** ${S.lines} (${S.filmLines} in films, ${S.radioLines} on the radio) and ${S.words} words.`,
  `- **Missions:** ${MISSIONS.length} in ${ACTS.length} acts, with ${S.objTotal} objectives and ${S.triggers} triggers.`,
  `- **Cast:** ${Object.keys(CH).length} characters: ${S.sides.good} good, ${S.sides.gray} gray, ${S.sides.evil} evil.`
];
const gRows = [];
ACTS.forEach((a, ai) => (a.missions || []).forEach(id => {
  const m = MISSIONS.find(x => x.id === id);
  if (!m) return;
  const rtOf = fid => (fid && CINE[fid] ? mss(filmStats(fid).runtime) : '—');
  const after = !m.after ? '—' : kindOf(m.after) === 'ending' ? 'the ending' : `${code(m.after)} ${rtOf(m.after)}`;
  gRows.push([ROMAN[ai] || ai + 1, m.n, esc(m.title), esc(placeName(m.place)), `${facAdj(m.setup.faction)} vs ${facAdj(m.setup.enemy)}`,
    rtOf(m.briefing), rtOf(m.debrief), after]);
}));
const glanceTable = table(['Act', 'No.', 'Mission', 'Place', 'You vs. enemy', 'Briefing', 'Debrief', 'Afterwards'], gRows);

const bodyText = body.join('\n\n');
const tocLines = HEADS.filter(h => h.level === 2 || h.level === 3)
  .map(h => (h.level === 3 ? '  - ' : '- ') + '[' + plain(h.text) + '](#' + slug(h.text) + ')');
const head = [
  TITLE.join('\n\n'),
  '## At a glance\n\n' + glance.join('\n') + '\n\n' + glanceTable,
  '**Contents**\n\n' + tocLines.join('\n'),
  '**How to read the script.** Each film is printed as a screenplay: scene headings, establishing paragraphs, then the timed beats. ' +
    'Timecodes are film time from the start of each film, so a beat at `0:08.2` happens eight seconds and two tenths into that film. ' +
    'Dialogue is printed exactly as the data has it. Action lines are plain-English readings of the props, effects and camera moves; they describe the staging only.'
].join('\n\n');
let DOC = head + '\n\n' + bodyText + '\n';
DOC = DOC.replace(/\n{3,}/g, '\n\n');

/* ---------------------------------------------------------------- output */
const outOpt = argOf('--out');
const target = outOpt ? path.resolve(outOpt) : OUT_DEFAULT;
if (argv.includes('--check')) {
  let disk = null;
  try { disk = fs.readFileSync(target, 'utf8'); } catch (e) { disk = null; }
  if (disk === DOC) { console.log('up to date: ' + path.relative(ROOT, target)); process.exit(0); }
  console.error('out of date: ' + path.relative(ROOT, target) + ' (run node tools/story_to_md.js)');
  process.exit(1);
}
if (argv.includes('--stdout') || (storyOpt && !outOpt)) {
  process.stdout.write(DOC);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, DOC);
  console.log('wrote ' + path.relative(ROOT, target) + ' (' + DOC.split('\n').length + ' lines, ' + Buffer.byteLength(DOC) + ' bytes, fingerprint ' + FP + ')');
}
