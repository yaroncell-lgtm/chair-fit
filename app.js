"use strict";
/* Morning chair workout, v5.
   Screens: who (pick a person) -> app (home / library / progress / settings) -> player -> done.
   Everything personal lives in localStorage under one key, split per profile (max 5). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dkey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const QS = new URLSearchParams(location.search);
const SPEED = Math.max(1, +QS.get("speed") || 1); /* test hook: ?speed=20 runs the clock faster */
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const NUMW = ["אפס", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע", "עשר", "אחת עשרה", "שתים עשרה", "שלוש עשרה", "ארבע עשרה", "חמש עשרה", "שש עשרה", "שבע עשרה", "שמונה עשרה", "תשע עשרה", "עשרים", "עשרים ואחת", "עשרים ושתיים", "עשרים ושלוש", "עשרים וארבע", "עשרים וחמש", "עשרים ושש", "עשרים ושבע", "עשרים ושמונה", "עשרים ותשע", "שלושים"];
const HYPE = ["יאללה, לא עוצרים!", "עוד קצת, זה הרגע שבונה שריר!", "נושמים ונותנים בראש!", "מעולה, ממשיכים ככה!", "חזק! הגוף זוכר כל חזרה!", "קצב! קצב! קצב!", "עוד קצת, אפשר יותר!", "איזה כוח!"];
const LV = { 1: { work: 40, rest: 20, name: "מתחיל" }, 2: { work: 45, rest: 15, name: "בינוני" }, 3: { work: 50, rest: 10, name: "מתקדם" } };
const EMOJIS = ["🦁", "🐯", "🦊", "🐻", "🐼", "🦅", "🐺", "🐬", "🦄", "🐙", "⚡", "🔥", "🌟", "🚀", "🏀", "⚽"];
const COLORS = ["#ff6b3d", "#3da9ff", "#b8f15a", "#ffb547", "#c77dff", "#ff4d8d", "#2ee6c5", "#f1f5f3"];

/* ===================================================================== STORE */
const KEY = "chairfit5";
const Store = {
  d: null,
  load() {
    try { this.d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { this.d = null; }
    if (!this.d || !Array.isArray(this.d.profiles)) this.d = { v: 5, profiles: [], last: null };
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { } },
  get(id) { return this.d.profiles.find(p => p.id === id) || null; },
  add(name, emoji, color) {
    const p = {
      id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), name, emoji, color, created: Date.now(),
      set: { level: 2, len: 10, day: "auto", music: true, style: "house", vol: .75, voice: true, count: true, avoid: [], weekGoal: 5 },
      fav: [], hide: [], hist: [], next: "A", easy: 0, hard: 0, seen: {}
    };
    this.d.profiles.push(p); this.save(); return p;
  },
  remove(id) { this.d.profiles = this.d.profiles.filter(p => p.id !== id); if (this.d.last === id) this.d.last = null; this.save(); }
};
let ME = null;

/* ===================================================================== AUDIO */
const AudioEng = {
  ctx: null,
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try {
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; comp.connect(c.destination);
      this.master = c.createGain(); this.master.connect(comp);
      this.duckG = c.createGain(); this.duckG.connect(this.master);
      this.filter = c.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 18000; this.filter.Q.value = 1.2; this.filter.connect(this.duckG);
      this.music = c.createGain(); this.music.gain.value = .75; this.music.connect(this.filter);
      this.sfx = c.createGain(); this.sfx.gain.value = .8; this.sfx.connect(this.master);
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  /* must run inside a click/keypress: browsers keep audio locked until the user acts */
  unlock() {
    const c = this.init(); if (!c) return;
    try { if (c.state !== "running") c.resume(); } catch (e) { }
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (e) { }
  },
  env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); },
  noiseSrc(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * .5, dur + .05); return s; }
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const Synth = {
  kick(t, v = .95) {
    const c = AudioEng.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + .13);
    AudioEng.env(g, t, v, .003, .32); o.connect(g); g.connect(AudioEng.music); o.start(t); o.stop(t + .4);
  },
  clap(t, v = .32) {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = .9;
    g.gain.setValueAtTime(0.0001, t);
    [0, .011, .022].forEach(o => { g.gain.exponentialRampToValueAtTime(v, t + o + .002); g.gain.exponentialRampToValueAtTime(v * .25, t + o + .009); });
    g.gain.exponentialRampToValueAtTime(0.0001, t + .2);
    const n = AudioEng.noiseSrc(t, .22); n.connect(f); f.connect(g); g.connect(AudioEng.music);
  },
  snare(t, v = .3) {
    this.clap(t, v * .8);
    const c = AudioEng.ctx, o = c.createOscillator(), g = c.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(200, t);
    AudioEng.env(g, t, v * .6, .002, .1); o.connect(g); g.connect(AudioEng.music); o.start(t); o.stop(t + .15);
  },
  hat(t, open, v = .1) {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = "highpass"; f.frequency.value = 7500;
    AudioEng.env(g, t, v, .002, open ? .22 : .035); const n = AudioEng.noiseSrc(t, open ? .3 : .06); n.connect(f); f.connect(g); g.connect(AudioEng.music);
  },
  shaker(t, v = .05) {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = "bandpass"; f.frequency.value = 6000; f.Q.value = 1.5;
    AudioEng.env(g, t, v, .008, .05); const n = AudioEng.noiseSrc(t, .08); n.connect(f); f.connect(g); g.connect(AudioEng.music);
  },
  conga(t, hi, v = .3) {
    const c = AudioEng.ctx, o = c.createOscillator(), g = c.createGain(); const f0 = hi ? 330 : 220;
    o.frequency.setValueAtTime(f0 * 1.25, t); o.frequency.exponentialRampToValueAtTime(f0, t + .03);
    AudioEng.env(g, t, v, .002, .16); o.connect(g); g.connect(AudioEng.music); o.start(t); o.stop(t + .22);
  },
  clave(t, v = .16) {
    const c = AudioEng.ctx, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 2400;
    AudioEng.env(g, t, v, .001, .05); o.connect(g); g.connect(AudioEng.music); o.start(t); o.stop(t + .08);
  },
  bass(t, m, dur, v = .3, type = "sawtooth") {
    const c = AudioEng.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = mtof(m); f.type = "lowpass"; f.Q.value = 4;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    AudioEng.env(g, t, v, .006, dur); o.connect(f); f.connect(g); g.connect(AudioEng.music); o.start(t); o.stop(t + dur + .05);
  },
  stab(t, notes, v = .07, dur = .22, bright = 3200, type = "sawtooth") {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = "lowpass"; f.Q.value = 2; f.frequency.setValueAtTime(bright, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
    AudioEng.env(g, t, v, .004, dur); f.connect(g); g.connect(AudioEng.music);
    notes.forEach(m => [-7, 7].forEach(dt => { const o = c.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + .05); }));
  },
  pad(t, notes, dur, v = .035) {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = "lowpass"; f.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * .3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(AudioEng.music);
    notes.forEach(m => [-9, 9].forEach(dt => { const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + .05); }));
  },
  crash(t, v = .18) {
    const c = AudioEng.ctx, f = c.createBiquadFilter(), g = c.createGain(); f.type = "highpass"; f.frequency.value = 4000;
    AudioEng.env(g, t, v, .003, 1.4); const n = AudioEng.noiseSrc(t, .95); n.loop = true; n.connect(f); f.connect(g); g.connect(AudioEng.sfx);
  }
};

const STYLES = { house: { bpm: 124, name: "האוס אנרגטי" }, aerobic: { bpm: 130, name: "אירובי שנות ה-80" }, latin: { bpm: 122, name: "זומבה לטינית" } };
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; /* Am F C G */

const Music = {
  on: true, style: "house", vol: .75, playing: false, energy: "warm", step: 0, timer: null, bpm: 124,
  spb() { return 60 / (STYLES[this.style] || STYLES.house).bpm; },
  start() {
    const c = AudioEng.init(); if (!c || !this.on) return;
    this.bpm = (STYLES[this.style] || STYLES.house).bpm; this.sd = 60 / this.bpm / 4;
    this.step = 0; this.t0 = this.nextT = c.currentTime + .06; this.playing = true;
    this.setVol(this.vol); this.setEnergy(this.energy, true);
    clearInterval(this.timer); this.timer = setInterval(() => this.sched(), 25);
  },
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; },
  setVol(v) { this.vol = v; if (AudioEng.music) AudioEng.music.gain.value = v; },
  sched() {
    const c = AudioEng.ctx; if (!c || !this.playing) return;
    if (this.nextT < c.currentTime - .5) { this.nextT = c.currentTime + .02; } /* recover after a stall */
    while (this.nextT < c.currentTime + .12) { try { this.play(this.step, this.nextT); } catch (e) { } this.nextT += this.sd; this.step++; }
  },
  /* seconds until the next beat, so counted reps land on the music */
  beatDelay() {
    if (!this.playing || !AudioEng.ctx) return 0;
    const spb = 60 / this.bpm, ph = (AudioEng.ctx.currentTime - this.t0) / spb; return (Math.ceil(ph) - ph) * spb;
  },
  setEnergy(e, now) {
    this.energy = e; const f = AudioEng.filter, c = AudioEng.ctx; if (!f || !c) return;
    const target = e === "rest" ? 650 : e === "cool" ? 2400 : e === "intro" ? 1600 : 18000;
    f.frequency.cancelScheduledValues(c.currentTime);
    if (now) f.frequency.setValueAtTime(target, c.currentTime); else f.frequency.setTargetAtTime(target, c.currentTime, e === "rest" ? .3 : .06);
  },
  duck(on) { const g = AudioEng.duckG, c = AudioEng.ctx; if (!g || !c) return; g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(on ? .32 : 1, c.currentTime, on ? .05 : .25); },
  riser(dur) {
    const c = AudioEng.ctx; if (!c || !this.on || !this.playing) return; const t = c.currentTime;
    const f = c.createBiquadFilter(), g = c.createGain(); f.type = "bandpass"; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + .08);
    const n = AudioEng.noiseSrc(t, dur + .1); n.loop = true; n.connect(f); f.connect(g); g.connect(AudioEng.sfx);
    const at = this.nextBeatAfter(t + dur - .02); if (at) Synth.crash(at);
  },
  nextBeatAfter(t) { if (!this.playing) return t; const spb = 60 / this.bpm; return this.t0 + Math.ceil((t - this.t0) / spb) * spb; },
  play(step, t) {
    const s = step % 16, bar = Math.floor(step / 16), ch = PROG[bar % 4], e = this.energy, st = this.style;
    const full = e === "work", calm = e === "cool", lite = e === "rest" || e === "intro";
    if (calm) { if (s === 0) Synth.pad(t, ch.map(m => m + 12), this.sd * 16 * .98, .045); if (s % 4 === 2) Synth.shaker(t, .035); return; }
    if (s % 4 === 0) Synth.kick(t, lite ? .7 : .95);
    if (st === "house") {
      if (full && (s === 4 || s === 12)) Synth.clap(t);
      if (s % 4 === 2) Synth.hat(t, true, full ? .1 : .07); else if (s % 2 === 1 && full) Synth.hat(t, false, .05);
      if (s % 4 === 2 || s === 15) Synth.bass(t, ch[0] - 24 + (s === 15 ? 12 : 0), this.sd * 1.6, full ? .32 : .24);
      if (full && [3, 6, 11, 14].includes(s)) Synth.stab(t, ch.map(m => m + 12), .055, .18);
      if (lite && s === 0) Synth.pad(t, ch.map(m => m + 12), this.sd * 16 * .98, .03);
    } else if (st === "aerobic") {
      if (s === 4 || s === 12) Synth.snare(t, full ? .3 : .18);
      if (s % 2 === 0) Synth.hat(t, false, .07);
      if (s % 2 === 0) Synth.bass(t, ch[0] - 24 + (s % 4 === 2 ? 12 : 0), this.sd * 1.7, full ? .3 : .22, "square");
      if (full && s % 2 === 1) Synth.stab(t, [ch[(s >> 1) % 3] + 24], .035, .1, 5000, "square");
      if (lite && s === 0) Synth.pad(t, ch.map(m => m + 12), this.sd * 16 * .98, .03);
    } else {
      if ([0, 3, 6, 10, 12].includes(s)) Synth.clave(t, full ? .14 : .08);
      if ([2, 3, 7, 10, 11, 14, 15].includes(s)) Synth.conga(t, s % 2 === 1, full ? .26 : .16);
      Synth.shaker(t, s % 2 ? .045 : .025);
      if ([3, 6, 11, 14].includes(s)) Synth.bass(t, ch[s === 6 || s === 14 ? 2 : 0] - 24, this.sd * 2, full ? .3 : .22);
      if (full && (s === 6 || s === 14)) Synth.stab(t, ch.map(m => m + 12), .06, .16, 4200);
      if (lite && s === 0) Synth.pad(t, ch.map(m => m + 12), this.sd * 16 * .98, .03);
    }
  }
};

const Sfx = {
  beep(f = 880, d = .12, v = .4, at) {
    const c = AudioEng.ctx; if (!c) return; const t = at || c.currentTime;
    try { const o = c.createOscillator(), g = c.createGain(); o.type = "sine"; o.frequency.value = f; AudioEng.env(g, t, v, .004, d); o.connect(g); g.connect(AudioEng.sfx); o.start(t); o.stop(t + d + .05); } catch (e) { }
  },
  go() { this.beep(1320, .3, .45); },
  tick() { this.beep(1800, .03, .15); },
  fanfare() { const c = AudioEng.ctx; if (!c) return; const t = c.currentTime;[72, 76, 79, 84].forEach((m, i) => this.beep(mtof(m), i === 3 ? .6 : .14, .35, t + i * .14)); }
};

/* ===================================================================== VOICE
   Browsers only allow speech that is chained to a user gesture. The first line of every session is
   therefore spoken inside the start click itself; later lines then play freely. */
const Voice = {
  on: true, count: true, v: null, hasHe: null,
  pick() {
    try {
      const vs = speechSynthesis.getVoices();
      const he = vs.filter(x => /^(he|iw)/i.test(x.lang));
      this.v = he.find(x => /google|natural|neural|carmit/i.test(x.name)) || he[0] || null;
      this.hasHe = vs.length ? !!this.v : null;
    } catch (e) { }
  },
  supported() { return "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"; },
  say(t, opt = {}) {
    if (!this.on || !t || !this.supported()) return;
    try {
      const ss = speechSynthesis;
      if (opt.flush !== false && (ss.speaking || ss.pending)) ss.cancel();
      try { ss.resume(); } catch (e) { }
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "he-IL"; if (this.v) u.voice = this.v;
      u.rate = opt.rate || 1.1; u.pitch = opt.pitch || 1.08; u.volume = 1;
      u.onstart = () => Music.duck(true);
      u.onend = u.onerror = () => { clearTimeout(this.dk); Music.duck(false); };
      clearTimeout(this.dk); this.dk = setTimeout(() => Music.duck(false), 900 + t.length * 85);
      ss.speak(u);
      Voice.log && Voice.log.push(t);
    } catch (e) { }
  },
  stop() { try { speechSynthesis.cancel(); } catch (e) { } Music.duck(false); }
};
try { if (Voice.supported()) { Voice.pick(); speechSynthesis.onvoiceschanged = () => Voice.pick(); } } catch (e) { }

/* ===================================================================== WORKOUT BUILDER */
function rng(seed) { let h = 2166136261 >>> 0; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function allowed(p, id) { const x = EX[id]; return !!x && !p.hide.includes(id) && !x.avoid.some(a => p.set.avoid.includes(a)) && x.lvl <= p.set.level; }
function todayDay(p) { return p.set.day && p.set.day !== "auto" ? p.set.day : (p.next || "A"); }

function buildPlan(p, dayKey, len) {
  const D = DAYS[dayKey], lv = LV[p.set.level] || LV[2];
  const nMain = { 10: 4, 15: 6, 20: 8 }[len] || 4, nEdge = len >= 15 ? 3 : 2;
  const R = rng(p.id + dkey() + dayKey + len + p.set.level);
  const used = new Set(), main = [];
  const okNext = (id, prev) => !prev || EX[id].prim !== EX[prev].prim;
  for (const [role] of D.main.slice(0, nMain)) {
    const prev = main[main.length - 1];
    let pool = (ROLES[role] || []).filter(id => allowed(p, id) && !used.has(id) && okNext(id, prev));
    if (!pool.length) pool = Object.keys(EX).filter(id => ["core", "cardio", "arms", "legs"].includes(EX[id].reg) && allowed(p, id) && !used.has(id) && okNext(id, prev));
    if (!pool.length) continue;
    let best = null, bw = -1;
    pool.forEach((id, i) => { const w = (p.fav.includes(id) ? 2.2 : 1) * (i === 0 ? 1.5 : 1) * (.55 + R()); if (w > bw) { bw = w; best = id; } });
    main.push(best); used.add(best);
  }
  const edge = (list, reg) => {
    const out = list.filter(id => allowed(p, id)).slice(0, nEdge);
    Object.keys(EX).filter(id => EX[id].reg === reg && allowed(p, id) && !out.includes(id)).forEach(id => { if (out.length < nEdge) out.push(id); });
    return out;
  };
  const warm = edge(D.warm, "warm"), cool = edge(D.cool, "cool");
  const r2 = main.slice();
  if (r2.length > 2 && EX[r2[0]].prim === EX[main[main.length - 1]].prim) { const t = r2[0]; r2[0] = r2[1]; r2[1] = t; }

  const items = [{ t: "intro", id: warm[0] || main[0], dur: 7 }];
  warm.forEach(id => items.push({ t: "warm", id, dur: 30 }));
  [main, r2].forEach((list, r) => list.forEach((id, i) => {
    items.push({ t: "rest", id, dur: r === 0 && i === 0 ? 15 : i === 0 ? Math.max(lv.rest, 20) : lv.rest, round: r, first: i === 0 });
    items.push({ t: "work", id, dur: lv.work, round: r, idx: i });
  }));
  cool.forEach(id => items.push({ t: "cool", id, dur: 30 }));
  return { day: dayKey, len, level: p.set.level, warm, main, cool, items, total: items.reduce((s, x) => s + x.dur, 0) };
}

/* ===================================================================== STATS & BADGES */
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
function stats(p) {
  const h = p.hist, days = [...new Set(h.map(x => x.d))].sort();
  let best = 0, run = 0, prev = null;
  days.forEach(d => { const t = new Date(d + "T12:00"); run = prev && (t - prev) / 864e5 < 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
  let cur = 0; { const set = new Set(days); const t = new Date(); if (!set.has(dkey(t))) t.setDate(t.getDate() - 1); while (set.has(dkey(t))) { cur++; t.setDate(t.getDate() - 1); } }
  const ws = weekStart().getTime(), week = h.filter(x => x.t >= ws);
  const byWeek = {}; h.forEach(x => { const k = weekStart(new Date(x.t)).getTime(); (byWeek[k] = byWeek[k] || []).push(x); });
  const goal = p.set.weekGoal || 5;
  return {
    n: h.length, min: Math.round(h.reduce((s, x) => s + x.sec, 0) / 60), reps: h.reduce((s, x) => s + (x.reps || 0), 0),
    cur, best, week: week.length, weekDays: new Set(week.map(x => x.d)).size, goal,
    pts: week.reduce((s, x) => s + 10 + Math.round(x.sec / 60), 0) + (cur >= 3 ? 5 * cur : 0),
    early: h.some(x => new Date(x.t).getHours() < 7),
    abc: Object.values(byWeek).some(w => ["A", "B", "C"].every(k => w.some(x => x.day === k))),
    goalHit: Object.values(byWeek).some(w => new Set(w.map(x => x.d)).size >= goal),
    lvl3: h.some(x => x.level === 3)
  };
}
const BADGES = [
  { id: "first", e: "🌅", n: "בוקר ראשון", d: "אימון ראשון", f: s => s.n >= 1 },
  { id: "s3", e: "🔥", n: "שלושה ברצף", d: "3 ימים רצופים", f: s => s.best >= 3 },
  { id: "s7", e: "🏅", n: "שבוע מושלם", d: "7 ימים רצופים", f: s => s.best >= 7 },
  { id: "s14", e: "🏆", n: "שבועיים ברצף", d: "14 ימים רצופים", f: s => s.best >= 14 },
  { id: "n10", e: "💪", n: "10 אימונים", d: "סך הכל", f: s => s.n >= 10 },
  { id: "n30", e: "🦾", n: "30 אימונים", d: "סך הכל", f: s => s.n >= 30 },
  { id: "n100", e: "👑", n: "100 אימונים", d: "סך הכל", f: s => s.n >= 100 },
  { id: "m100", e: "⏱️", n: "100 דקות", d: "זמן אימון מצטבר", f: s => s.min >= 100 },
  { id: "r1000", e: "🔢", n: "1,000 חזרות", d: "מצטבר", f: s => s.reps >= 1000 },
  { id: "early", e: "🐓", n: "משכים קום", d: "אימון לפני 7:00", f: s => s.early },
  { id: "abc", e: "🎯", n: "שלושת הימים", d: "A, B ו-C באותו שבוע", f: s => s.abc },
  { id: "goal", e: "✅", n: "יעד שבועי", d: "עמידה ביעד השבועי", f: s => s.goalHit },
  { id: "lvl3", e: "🚀", n: "רמה מתקדמת", d: "אימון ברמה 3", f: s => s.lvl3 }
];

/* ===================================================================== UI: helpers */
function toast(t) { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 2600); }
function show(id) { ["who", "app", "player"].forEach(x => { $("#" + x).hidden = x !== id; }); }
function avatar(p, cls = "") { return `<span class="av ${cls}" style="background:${esc(p.color)}22;border:2px solid ${esc(p.color)}">${esc(p.emoji)}</span>`; }
function thumb(id) { return POSTER(EX[id].clip); }
function imgTag(id, alt = "") { return `<img src="${thumb(id)}" alt="${esc(alt)}" loading="lazy" onerror="this.style.visibility='hidden'">`; }
function fullscreen() { try { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => { }); else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen(); } catch (e) { } }
function applyProfileAudio() { Music.on = ME.set.music; Music.style = ME.set.style; Music.setVol(ME.set.vol); Voice.on = ME.set.voice; Voice.count = ME.set.count; }

/* ===================================================================== WHO */
function renderWho() {
  show("who"); ME = null;
  const ps = Store.d.profiles;
  $("#who").innerHTML = `<h1>מי מתאמן הבוקר?</h1>
    <div class="who-grid">${ps.map(p => { const s = stats(p); return `<button class="who-card" data-p="${p.id}">${avatar(p)}<b>${esc(p.name)}</b><small>${s.cur ? "🔥 " + (s.cur === 1 ? "יום ראשון ברצף" : s.cur + " ימים ברצף") : s.n ? s.n + " אימונים" : "עוד לא התחיל"}</small></button>`; }).join("")}
    ${ps.length < 5 ? `<button class="who-card add" id="addP"><span class="av">＋</span><b>מתאמן חדש</b><small>עד 5 משתמשים</small></button>` : ""}</div>
    <button class="btn ghost sm" id="fsBtn">⛶ מסך מלא</button>`;
  $$("#who [data-p]").forEach(b => b.onclick = () => { AudioEng.unlock(); enter(b.dataset.p); });
  const add = $("#addP"); if (add) add.onclick = () => editProfile(null);
  $("#fsBtn").onclick = fullscreen;
  const lastBtn = Store.d.last && $(`#who [data-p="${Store.d.last}"]`);
  (lastBtn || $("#who .who-card")).focus({ preventScroll: true });
}

function editProfile(p) {
  let emoji = p ? p.emoji : EMOJIS[Store.d.profiles.length % EMOJIS.length], color = p ? p.color : COLORS[Store.d.profiles.length % COLORS.length];
  openModal(`<h2>${p ? "עריכת פרופיל" : "מתאמן חדש"}</h2><br>
    <div class="field"><label for="pfName">שם</label><input class="input" id="pfName" maxlength="16" value="${p ? esc(p.name) : ""}" placeholder="למשל: ירון"></div>
    <div class="field"><span class="lbl">סמל</span><div class="emoji-pick">${EMOJIS.map(e => `<button data-e="${e}" aria-pressed="${e === emoji}">${e}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">צבע</span><div class="row color-pick">${COLORS.map(c => `<button data-c="${c}" style="background:${c}" aria-pressed="${c === color}" aria-label="צבע"></button>`).join("")}</div></div>
    <div class="row"><button class="btn go" id="pfSave">שמירה</button><button class="btn ghost" data-close>ביטול</button></div>`);
  $$(".emoji-pick button").forEach(b => b.onclick = () => { emoji = b.dataset.e; $$(".emoji-pick button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  $$(".color-pick button").forEach(b => b.onclick = () => { color = b.dataset.c; $$(".color-pick button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
  $("#pfSave").onclick = () => {
    const name = $("#pfName").value.trim(); if (!name) { $("#pfName").focus(); return; }
    if (p) { p.name = name; p.emoji = emoji; p.color = color; Store.save(); closeModal(); renderView(); }
    else { const np = Store.add(name, emoji, color); closeModal(); enter(np.id); }
  };
  setTimeout(() => $("#pfName").focus(), 50);
}

function enter(id) { ME = Store.get(id); if (!ME) return renderWho(); Store.d.last = id; Store.save(); applyProfileAudio(); show("app"); go("home"); }

/* ===================================================================== APP SHELL */
let VIEW = "home";
function go(v) { VIEW = v; renderView(); window.scrollTo(0, 0); }
function renderView() {
  if (!ME) return renderWho();
  const tabs = [["home", "בית"], ["lib", "תרגילים"], ["prog", "התקדמות"], ["set", "הגדרות"]];
  $("#app").innerHTML = `<div class="wrap"><div class="top">
      <button class="me" id="meBtn" title="החלפת מתאמן">${avatar(ME)}<b>${esc(ME.name)}</b><span class="faint">⇄</span></button>
      <nav class="tabs">${tabs.map(([k, n]) => `<button data-v="${k}" aria-current="${k === VIEW}">${n}</button>`).join("")}</nav>
      <span class="grow"></span><button class="btn ghost sm" id="fsBtn2">⛶</button></div><div id="view"></div></div>`;
  $("#meBtn").onclick = renderWho; $("#fsBtn2").onclick = fullscreen;
  $$(".tabs [data-v]").forEach(b => b.onclick = () => go(b.dataset.v));
  ({ home: viewHome, lib: viewLib, prog: viewProg, set: viewSet, done: viewDone }[VIEW] || viewHome)();
}

/* ------------------------------------------------------------------ home */
function viewHome() {
  const p = ME, day = todayDay(p), D = DAYS[day], plan = buildPlan(p, day, p.set.len), s = stats(p), lv = LV[p.set.level];
  const ranks = Store.d.profiles.map(x => ({ p: x, s: stats(x) })).sort((a, b) => b.s.pts - a.s.pts);
  const sug = p.easy >= 2 && p.set.level < 3 ? "up" : p.hard >= 2 && p.set.level > 1 ? "down" : "";
  const fig = id => `<figure>${imgTag(id, EX[id].he)}<figcaption>${esc(EX[id].he)}</figcaption></figure>`;
  $("#view").innerHTML = `
  ${sug ? `<div class="card" style="margin-bottom:1rem;border-color:var(--amber)"><div class="row"><b style="flex:1">${sug === "up" ? "שני אימונים ברצף היו קלים לך. לעלות לרמה " + LV[p.set.level + 1].name + "?" : "היה קשה מדי פעמיים. לרדת לרמה " + LV[p.set.level - 1].name + "?"}</b>
    <button class="btn go sm" id="lvYes">כן</button><button class="btn sm" id="lvNo">לא עכשיו</button></div></div>` : ""}
  <div class="grid2">
    <section class="card today" style="border-top:.35rem solid ${D.color}">
      <div class="kicker" style="color:${D.color}">${D.emoji} האימון של היום · יום ${day}</div>
      <h2>${esc(D.name)}</h2>
      <p class="muted">כ-${Math.round(plan.total / 60)} דקות · רמה ${lv.name} (${lv.work} שניות עבודה, ${lv.rest} מנוחה) · ${plan.main.length} תרגילים × 2 סיבובים</p>
      <div class="strip">${plan.main.map(fig).join("")}</div>
      <p class="faint" style="font-size:.85rem">חימום: ${plan.warm.map(id => EX[id].he).join(", ")} · שחרור: ${plan.cool.map(id => EX[id].he).join(", ")}</p><br>
      <div class="row"><button class="btn go big" id="startBtn">יאללה, מתחילים ▶</button></div><br>
      <div class="row"><span class="faint">אורך:</span><div class="chips">${[10, 15, 20].map(n => `<button class="chip" data-len="${n}" aria-pressed="${p.set.len === n}">${n} דק'</button>`).join("")}</div></div><br>
      <div class="row"><span class="faint">סוג:</span><div class="chips"><button class="chip" data-day="auto" aria-pressed="${p.set.day === "auto"}">סבב אוטומטי</button>${Object.keys(DAYS).map(k => `<button class="chip" data-day="${k}" aria-pressed="${p.set.day === k}">${DAYS[k].emoji} ${DAYS[k].name}</button>`).join("")}</div></div>
    </section>
    <aside style="display:flex;flex-direction:column;gap:1.2rem">
      <section class="card"><div class="stats">
        <div class="stat"><b>${s.cur ? "🔥" + s.cur : "0"}</b><span>ימים ברצף</span></div>
        <div class="stat"><b>${s.weekDays}/${s.goal}</b><span>יעד השבוע</span></div>
        <div class="stat"><b>${s.n}</b><span>אימונים</span></div></div><br>
        <div class="week">${Array.from({ length: s.goal }, (_, i) => `<i class="${i < s.weekDays ? "on" : ""}"></i>`).join("")}</div>
      </section>
      <section class="card league"><h3>🏆 הליגה המשפחתית השבוע</h3>
        <ol>${ranks.map((r, i) => `<li><span>${["🥇", "🥈", "🥉"][i] || (i + 1) + "."}</span>${avatar(r.p)}<b>${esc(r.p.name)}</b><span class="pts">${r.s.pts}</span></li>`).join("")}</ol>
        <p class="faint" style="font-size:.8rem;margin-top:.5rem">10 נקודות לאימון, נקודה לכל דקה, ובונוס על רצף של 3 ימים ומעלה.</p></section>
    </aside></div>
  ${Voice.supported() && Voice.hasHe === false ? `<p class="card" style="margin-top:1rem;border-color:var(--amber)">⚠️ במכשיר הזה לא נמצא קול עברי להקראה. הספירה תוצג על המסך עם צפצופים. אפשר לבדוק בהגדרות.</p>` : ""}`;
  $("#startBtn").onclick = () => Player.start(buildPlan(ME, todayDay(ME), ME.set.len));
  $$("[data-len]").forEach(b => b.onclick = () => { ME.set.len = +b.dataset.len; Store.save(); viewHome(); $(`[data-len="${b.dataset.len}"]`).focus(); });
  $$("[data-day]").forEach(b => b.onclick = () => { ME.set.day = b.dataset.day; Store.save(); viewHome(); $(`[data-day="${b.dataset.day}"]`).focus(); });
  const y = $("#lvYes"); if (y) { y.onclick = () => { ME.set.level += sug === "up" ? 1 : -1; ME.easy = ME.hard = 0; Store.save(); toast("הרמה עודכנה ל" + LV[ME.set.level].name); viewHome(); }; $("#lvNo").onclick = () => { ME.easy = ME.hard = 0; Store.save(); viewHome(); }; }
  $("#startBtn").focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ library */
function viewLib() {
  const regs = ["warm", "cardio", "core", "arms", "legs", "cool"];
  $("#view").innerHTML = `<h1>התרגילים</h1><p class="muted">לחיצה פותחת את ההדגמה עם הסבר. ★ מועדף מופיע יותר באימונים, 🚫 מוציא את התרגיל מהאימונים שלך.</p>
    ${regs.map(r => `<h2 class="lib-group">${REG_NAME[r]}</h2><div class="lib">${Object.keys(EX).filter(id => EX[id].reg === r && id !== "breathe").map(id => {
    const x = EX[id], off = ME.hide.includes(id) || x.avoid.some(a => ME.set.avoid.includes(a));
    return `<button data-ex="${id}" class="${off ? "off" : ""}">${imgTag(id, x.he)}<b>${esc(x.he)}</b><small>${x.mus.slice(0, 2).join(" · ")}${x.lvl > 1 ? " · רמה " + x.lvl : ""}</small>${ME.fav.includes(id) ? '<span class="flag">★</span>' : off ? '<span class="flag">🚫</span>' : ""}</button>`;
  }).join("")}</div>`).join("")}`;
  $$("[data-ex]").forEach(b => b.onclick = () => exModal(b.dataset.ex));
}
function exModal(id) {
  const x = EX[id];
  openModal(`<div class="ex-view"><div class="vbox"><div class="fallback">${esc(x.he)}</div><img src="${thumb(id)}" alt="" onerror="this.remove()"><video muted loop playsinline autoplay preload="auto" src="${CLIP(x.clip)}" style="opacity:0" onplaying="this.style.opacity=1"></video></div>
    <div><h2>${esc(x.he)}</h2><p class="muted">${esc(REG_NAME[x.reg])}${x.lvl > 1 ? " · רמה " + x.lvl : ""}${x.beats ? "" : " · החזקה"}</p>
    <div class="musc" style="margin:.6rem 0">${x.mus.map(m => `<span>${esc(m)}</span>`).join("")}</div>
    <ol class="how">${x.how.map(h => `<li>${esc(h)}</li>`).join("")}</ol>
    <p class="tip">💡 ${esc(x.tip)}</p>
    <p><b>להקל:</b> ${esc(x.easy)}<br><b>להקשות:</b> ${esc(x.hard)}</p>
    <p class="muted" style="margin-top:.5rem">${esc(x.why)}</p>
    ${x.avoid.length ? `<p class="faint" style="margin-top:.5rem">לא מומלץ עם בעיה ב${x.avoid.map(a => PAIN_NAME[a]).join(" או ב")}.</p>` : ""}<br>
    <div class="row"><button class="btn sm" id="exSay">🔊 השמעת הסבר</button>
      <button class="btn sm" id="exFav">${ME.fav.includes(id) ? "★ מועדף" : "☆ למועדפים"}</button>
      <button class="btn sm" id="exHide">${ME.hide.includes(id) ? "↩ להחזיר לאימונים" : "🚫 לא בשבילי"}</button>
      <button class="btn ghost sm" data-close>סגירה</button></div></div></div>`);
  $("#exSay").onclick = () => { AudioEng.unlock(); Voice.on = true; Voice.say(x.he + ". " + x.how.join(" ") + " " + x.tip); Voice.on = ME.set.voice; };
  $("#exFav").onclick = () => { toggle(ME.fav, id); if (ME.fav.includes(id)) ME.hide = ME.hide.filter(i => i !== id); Store.save(); closeModal(); viewLib(); };
  $("#exHide").onclick = () => { toggle(ME.hide, id); if (ME.hide.includes(id)) ME.fav = ME.fav.filter(i => i !== id); Store.save(); closeModal(); viewLib(); };
  $("#exSay").focus();
}
const toggle = (arr, v) => { const i = arr.indexOf(v); if (i > -1) arr.splice(i, 1); else arr.push(v); };

/* ------------------------------------------------------------------ progress */
function viewProg() {
  const s = stats(ME), days = new Set(ME.hist.map(x => x.d));
  const cal = Array.from({ length: 28 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 27 + i); return `<i class="${days.has(dkey(d)) ? "on" : ""}" title="${dkey(d)}"></i>`; }).join("");
  $("#view").innerHTML = `<h1>ההתקדמות של ${esc(ME.name)}</h1><br>
    <section class="card"><div class="stats">
      <div class="stat"><b>${s.n}</b><span>אימונים</span></div><div class="stat"><b>${s.min}</b><span>דקות</span></div>
      <div class="stat"><b>${s.reps.toLocaleString("he-IL")}</b><span>חזרות</span></div><div class="stat"><b>${s.cur}</b><span>רצף נוכחי</span></div>
      <div class="stat"><b>${s.best}</b><span>רצף שיא</span></div><div class="stat"><b>${LV[ME.set.level].name}</b><span>רמה</span></div></div></section><br>
    <section class="card"><h3>ארבעת השבועות האחרונים</h3><br><div class="cal" style="grid-template-columns:repeat(14,1fr)">${cal}</div></section><br>
    <section class="card"><h3>הישגים</h3><br><div class="badges">${BADGES.map(b => `<div class="badge ${b.f(s) ? "got" : ""}"><span class="e">${b.e}</span><b>${b.n}</b><small>${b.d}</small></div>`).join("")}</div></section><br>
    <section class="card"><h3>אימונים אחרונים</h3><br>${ME.hist.slice(-10).reverse().map(h => `<div class="row" style="padding:.35rem 0;border-bottom:1px solid var(--line)"><b>${h.d.split("-").reverse().join(".")}</b><span>${DAYS[h.day] ? DAYS[h.day].emoji + " " + DAYS[h.day].name : ""}</span><span class="muted">${fmt(h.sec)} דק' · ${h.reps} חזרות${h.partial ? " · חלקי" : ""}</span><span class="faint">${h.rate === "easy" ? "קל" : h.rate === "hard" ? "קשה" : h.rate === "ok" ? "בדיוק" : ""}</span></div>`).join("") || '<p class="muted">עוד אין אימונים. הבוקר זה מתחיל.</p>'}</section>`;
}

/* ------------------------------------------------------------------ settings */
function viewSet() {
  const st = ME.set;
  $("#view").innerHTML = `<h1>הגדרות של ${esc(ME.name)}</h1><br><div class="grid2"><section class="card">
    <div class="field"><span class="lbl">רמה</span><div class="chips">${[1, 2, 3].map(l => `<button class="chip" data-lvl="${l}" aria-pressed="${st.level === l}">${LV[l].name} · ${LV[l].work}/${LV[l].rest}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">יעד שבועי (ימים)</span><div class="chips">${[3, 4, 5, 6, 7].map(n => `<button class="chip" data-goal="${n}" aria-pressed="${st.weekGoal === n}">${n}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">מוזיקה</span><div class="chips"><button class="chip" data-tg="music" aria-pressed="${st.music}">${st.music ? "פועלת" : "כבויה"}</button>${Object.keys(STYLES).map(k => `<button class="chip" data-style="${k}" aria-pressed="${st.style === k}">${STYLES[k].name} · ${STYLES[k].bpm}</button>`).join("")}</div></div>
    <div class="field"><label for="vol">עוצמת מוזיקה</label><input type="range" id="vol" min="0.1" max="1" step="0.05" value="${st.vol}"><button class="btn sm" id="mTest" style="align-self:flex-start">▶ השמעת דוגמה</button></div>
    <div class="field"><span class="lbl">קול</span><div class="chips"><button class="chip" data-tg="voice" aria-pressed="${st.voice}">הנחיה קולית</button><button class="chip" data-tg="count" aria-pressed="${st.count}">ספירה קולית</button><button class="btn sm" id="vTest">🔊 בדיקת קול</button></div>
      <small class="faint">${!Voice.supported() ? "הדפדפן הזה לא תומך בהקראה." : Voice.hasHe ? "נמצא קול עברי: " + esc(Voice.v.name) : Voice.hasHe === false ? "לא נמצא קול עברי במכשיר. יש להתקין קול עברי בהגדרות המכשיר, או להפעיל מהטלפון." : "בודק קולות זמינים…"}</small></div>
    <div class="field"><span class="lbl">בעיות שיש להתחשב בהן (התרגילים המתאימים יוצאו)</span><div class="chips">${Object.keys(PAIN_NAME).map(k => `<button class="chip" data-pain="${k}" aria-pressed="${st.avoid.includes(k)}">${PAIN_NAME[k]}</button>`).join("")}</div></div>
  </section><section class="card">
    <div class="row">${avatar(ME)}<h2 style="flex:1">${esc(ME.name)}</h2><button class="btn sm" id="editP">✎ עריכה</button></div><br>
    <div class="field"><span class="lbl">תרגילים שהוצאו (${ME.hide.length})</span><div class="chips">${ME.hide.map(id => `<button class="chip" data-unhide="${id}">↩ ${esc(EX[id].he)}</button>`).join("") || '<span class="faint">אין</span>'}</div></div>
    <div class="field"><span class="lbl">מועדפים (${ME.fav.length})</span><div class="chips">${ME.fav.map(id => `<span class="chip">★ ${esc(EX[id].he)}</span>`).join("") || '<span class="faint">אין</span>'}</div></div>
    <div class="field"><button class="btn sm" id="fsBtn3">⛶ מסך מלא</button></div>
    <div class="field"><button class="btn sm" id="delP" style="color:var(--burn)">מחיקת הפרופיל</button></div>
    <p class="faint" style="font-size:.8rem">ההדגמות המאוירות נטענות ישירות מ-chairsensei.com ודורשות חיבור לאינטרנט. הנתונים האישיים נשמרים רק במכשיר הזה.</p>
  </section></div>`;
  const re = () => { Store.save(); applyProfileAudio(); viewSet(); };
  $$("[data-lvl]").forEach(b => b.onclick = () => { st.level = +b.dataset.lvl; ME.easy = ME.hard = 0; re(); });
  $$("[data-goal]").forEach(b => b.onclick = () => { st.weekGoal = +b.dataset.goal; re(); });
  $$("[data-style]").forEach(b => b.onclick = () => { st.style = b.dataset.style; st.music = true; re(); });
  $$("[data-tg]").forEach(b => b.onclick = () => { st[b.dataset.tg] = !st[b.dataset.tg]; re(); });
  $$("[data-pain]").forEach(b => b.onclick = () => { toggle(st.avoid, b.dataset.pain); re(); });
  $$("[data-unhide]").forEach(b => b.onclick = () => { toggle(ME.hide, b.dataset.unhide); re(); });
  $("#vol").oninput = e => { st.vol = +e.target.value; Music.setVol(st.vol); Store.save(); };
  $("#mTest").onclick = () => { AudioEng.unlock(); if (Music.playing) { Music.stop(); return; } Music.on = true; Music.energy = "work"; Music.start(); setTimeout(() => { if (!Player.active) Music.stop(); Music.on = st.music; }, 8000); };
  $("#vTest").onclick = () => { AudioEng.unlock(); Voice.on = true; Voice.say("בדיקה. אחת, שתיים, שלוש. יאללה, מתחילים!"); Voice.on = st.voice; };
  $("#editP").onclick = () => editProfile(ME); $("#fsBtn3").onclick = fullscreen;
  $("#delP").onclick = e => { if (e.target.dataset.sure) { Store.remove(ME.id); renderWho(); } else { e.target.dataset.sure = 1; e.target.textContent = "בטוח? כל ההיסטוריה תימחק. לחיצה נוספת למחיקה"; } };
}

/* ------------------------------------------------------------------ modal */
function openModal(html) { closeModal(); const m = document.createElement("div"); m.className = "modal"; m.id = "modal"; m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`; m.onclick = e => { if (e.target === m || e.target.closest("[data-close]")) closeModal(); }; document.body.appendChild(m); }
function closeModal() { const m = $("#modal"); if (m) { $$("video", m).forEach(v => { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) { } }); m.remove(); } }

/* ===================================================================== VIDEO */
const Vid = {
  els: [], cur: 0,
  init() {
    this.els = [$("#vA"), $("#vB")];
    this.els.forEach(v => {
      v.muted = true; v.setAttribute("muted", ""); v.loop = true; v.playsInline = true; v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", "");
      v.addEventListener("playing", () => { v.dataset.ok = "1"; if (v === this.front()) v.style.opacity = 1; });
      v.addEventListener("error", () => { v.dataset.ok = ""; v.style.opacity = 0; });
    });
    $("#pPoster").addEventListener("error", e => { e.target.style.visibility = "hidden"; });
    $("#pPoster").addEventListener("load", e => { e.target.style.visibility = "visible"; });
  },
  front() { return this.els[this.cur]; }, back() { return this.els[1 - this.cur]; },
  load(v, src) { if (v.dataset.src === src) return; v.dataset.src = src; v.dataset.ok = ""; v.style.opacity = 0; v.src = src; try { v.load(); } catch (e) { } },
  preload(id) { if (!id) return; const src = CLIP(EX[id].clip); if (this.front().dataset.src === src) return; this.load(this.back(), src); },
  show(id) {
    const x = EX[id], src = CLIP(x.clip);
    $("#pFb").textContent = x.he; const po = $("#pPoster"); if (po.dataset.src !== x.clip) { po.dataset.src = x.clip; po.src = POSTER(x.clip); }
    let f = this.front();
    if (f.dataset.src !== src) {
      const b = this.back(); this.load(b, src); this.cur = 1 - this.cur;
      f.style.opacity = 0; setTimeout(() => { try { f.pause(); } catch (e) { } }, 400); f = b;
    }
    if (f.dataset.ok) f.style.opacity = 1;
    this.play(f);
  },
  play(v) { try { const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } },
  pause() { this.els.forEach(v => { try { v.pause(); } catch (e) { } }); },
  resume() { this.play(this.front()); },
  mirror(on) { this.front().style.transform = on ? "scaleX(-1)" : ""; }
};

/* ===================================================================== PLAYER */
const Player = {
  active: false, plan: null, items: [], idx: 0, itT: 0, paused: false, reps: 0, repsTotal: 0, f: {},
  start(plan) {
    AudioEng.unlock();
    this.plan = plan; this.items = plan.items; this.idx = 0; this.itT = 0; this.paused = false; this.repsTotal = 0; this.startedAt = Date.now(); this.done = new Set();
    this.active = true; show("player"); $("#pPaused").hidden = true; this.bar(); fullscreen();
    try { if (navigator.wakeLock) navigator.wakeLock.request("screen").then(l => this.lock = l).catch(() => { }); } catch (e) { }
    /* spoken inside the click: this is what lets every later cue play */
    Voice.say(`בוקר טוב ${ME.name}! היום: ${DAYS[plan.day].name}. ${Math.round(plan.total / 60)} דקות. מתחילים בחימום.`);
    Music.energy = "intro"; Music.start();
    this.enter(0); this.last = performance.now(); cancelAnimationFrame(this.raf); this.loop();
    $("#pPause").focus({ preventScroll: true });
  },
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now(); let dt = (now - this.last) / 1000; this.last = now; if (dt > .25) dt = .25;
    if (!this.paused) this.tick(dt * SPEED);
  },
  cur() { return this.items[this.idx]; },
  nextWorkId(from) { for (let i = from; i < this.items.length; i++) if (this.items[i].t !== "rest") return this.items[i].id; return null; },
  enter(i) {
    this.idx = i; this.itT = 0; this.f = {}; this.reps = 0;
    const it = this.cur(), x = EX[it.id];
    Music.setEnergy({ intro: "intro", warm: "warm", rest: "rest", work: "work", cool: "cool" }[it.t]);
    Vid.show(it.id); Vid.mirror(false);
    /* preload what comes after this item so the next clip is ready */
    const nxt = this.items[i + 1]; if (nxt && nxt.id !== it.id) Vid.preload(nxt.id);
    this.repDur = x.beats ? x.beats * (Music.playing ? 60 / Music.bpm : Music.spb()) : 0;
    this.repOff = Music.playing ? Music.beatDelay() : 0;
    this.render(true);
    const name = ME.name;
    if (it.t === "warm") Voice.say(`${x.he}. ${x.cues[0]}`);
    else if (it.t === "rest") {
      const pre = it.first && it.round === 1 ? "סיבוב שני! אותם תרגילים, עכשיו יותר חזק. " : it.first && it.round === 0 ? "סיימנו חימום. " : "מנוחה. ";
      Voice.say(`${pre}הבא: ${x.he}. ${x.cues[0]}`);
    } else if (it.t === "work") {
      Sfx.go(); this.flash();
      Voice.say(x.side === "switch" ? "יאללה! צד ראשון." : `יאללה! ${x.cues[0]}`);
    } else if (it.t === "cool") {
      const firstCool = this.items[i - 1] && this.items[i - 1].t !== "cool";
      Voice.say(`${firstCool ? "כל הכבוד! עכשיו מתיחות. " : ""}${x.he}. ${x.cues[0]}`);
    }
    void name;
  },
  tick(dt) {
    const it = this.cur(); if (!it) return;
    this.itT += dt;
    const x = EX[it.id], rem = it.dur - this.itT, f = this.f, q = this.itT / it.dur;
    if (this.repDur && (it.t === "work" || it.t === "warm")) {
      const r = Math.max(0, Math.floor((this.itT - this.repOff) / this.repDur));
      if (r > this.reps) { this.reps = r; if (it.t === "work") { this.repsTotal++; this.onRep(r, rem); } }
    }
    const half = it.dur / 2;
    if ((x.side === "switch" || ["shoulderRolls", "hipCircles", "armCircles"].includes(it.id)) && (it.t !== "rest" && it.t !== "intro") && !f.half && this.itT >= half) {
      f.half = true; Sfx.beep(880, .18, .4);
      Voice.say(x.side === "switch" ? "מחליפים צד!" : "מחליפים כיוון!");
      if (x.side === "switch") Vid.mirror(true);
    }
    if (it.t === "work") {
      const perRep = Voice.count && this.repDur >= 1.6;
      if (!perRep && !f.c1 && q >= .3 && !(x.side === "switch" && Math.abs(q - .5) < .08)) { f.c1 = true; Voice.say(x.cues[1]); }
      if (!f.hy && q >= .52) { f.hy = true; const h = HYPE[Math.floor(Math.random() * HYPE.length)]; this.hype(h); if (!perRep) Voice.say(h); }
      if (!perRep && !f.c2 && q >= .72) { f.c2 = true; Voice.say(x.cues[2]); }
      if (!f.t10 && rem <= 10.3 && it.dur >= 30) { f.t10 = true; Voice.say("עוד עשר שניות! תנו הכל!"); }
      const sec = Math.ceil(rem);
      if (rem <= 5.05 && sec >= 1 && sec <= 5 && f.cd !== sec) { f.cd = sec; if (sec <= 3) Sfx.beep(660, .1, .35); if (Voice.count) Voice.say(NUMW[sec], { rate: 1.25 }); }
    } else if (it.t === "rest") {
      if (!f.ready && rem <= 4.6) { f.ready = true; Voice.say("מוכנים?"); Music.riser(Math.min(3.6, rem)); }
      const sec = Math.ceil(rem); if (rem <= 3.05 && sec >= 1 && sec <= 3 && f.cd !== sec) { f.cd = sec; Sfx.beep(660, .12, .45); this.countOv(sec); }
      if (!f.c1 && q >= .45 && it.dur >= 15) { f.c1 = true; Voice.say(x.cues[1]); }
    } else if (it.t === "warm" || it.t === "cool") {
      if (!f.c1 && q >= .55 && !(x.side === "switch")) { f.c1 = true; Voice.say(x.cues[1]); }
      if (!f.nx && rem <= 3.2) { f.nx = true; Sfx.beep(660, .1, .3); }
    }
    if (this.itT >= it.dur) { if (it.t === "work") this.done.add(this.idx); return this.next(); }
    this.render(false);
  },
  onRep(n, rem) {
    $("#pRep").textContent = n;
    if (!Voice.on) { if (!Music.playing) Sfx.tick(); return; }
    if (rem < 5.5) return;
    const fast = this.repDur < 1.6;
    if (Voice.count && (!fast || n % 5 === 0) && n < NUMW.length && !(this.f.hy && Math.abs(this.itT / this.cur().dur - .52) < .03)) Voice.say(NUMW[n], { rate: 1.2 });
    else if (!Music.playing) Sfx.tick();
  },
  next() { if (this.idx + 1 >= this.items.length) return this.finish(false); this.enter(this.idx + 1); },
  skip() { if (!this.active) return; const it = this.cur(); if (it.t === "work") this.done.add(this.idx); this.next(); if (this.paused) this.resume(); },
  pause() { if (this.paused) return; this.paused = true; Music.stop(); Vid.pause(); Voice.stop(); $("#pPaused").hidden = false; $("#pResume").focus(); },
  resume() {
    AudioEng.unlock(); this.paused = false; $("#pPaused").hidden = true; Vid.resume(); Music.start();
    if (this.repDur) this.repOff = this.itT + (Music.playing ? Music.beatDelay() : 0) - this.reps * this.repDur;
    this.last = performance.now(); $("#pPause").focus({ preventScroll: true });
  },
  togglePause() { this.paused ? this.resume() : this.pause(); },
  toggleMusic() { ME.set.music = !ME.set.music; Store.save(); Music.on = ME.set.music; if (Music.on) { AudioEng.unlock(); Music.start(); if (this.repDur) this.repOff = this.itT + Music.beatDelay() - this.reps * this.repDur; } else Music.stop(); $("#pMusic").innerHTML = (Music.on ? "🎵" : "🔇") + '<span class="lbl"> מוזיקה</span>'; },
  close() { this.active = false; cancelAnimationFrame(this.raf); Music.stop(); Vid.pause(); try { if (this.lock) this.lock.release(); } catch (e) { } this.lock = null; },
  exit() {
    const doneWork = this.done.size, totalWork = this.items.filter(x => x.t === "work").length;
    if (doneWork / totalWork >= .6) return this.finish(true);
    this.close(); Voice.stop(); show("app"); go("home"); toast("האימון נעצר. מחר ממשיכים 💪");
  },
  finish(partial) {
    const sec = Math.round(this.items.slice(0, this.idx + 1).reduce((s, x, i) => s + (i === this.idx ? Math.min(x.dur, this.itT) : x.dur), 0));
    this.close(); Sfx.fanfare(); Voice.say(`סיימנו! כל הכבוד, ${ME.name}! זה בדיוק מה שהגוף צריך בבוקר.`);
    const before = BADGES.filter(b => b.f(stats(ME))).map(b => b.id);
    const rec = { d: dkey(), t: Date.now(), day: this.plan.day, sec, reps: this.repsTotal, level: this.plan.level, len: this.plan.len, partial: !!partial, main: this.plan.main };
    ME.hist.push(rec); if (ME.hist.length > 400) ME.hist = ME.hist.slice(-400);
    if (ME.set.day === "auto" || ME.set.day === this.plan.day) { const ks = Object.keys(DAYS); ME.next = ks[(ks.indexOf(this.plan.day) + 1) % ks.length]; }
    Store.save();
    const after = BADGES.filter(b => b.f(stats(ME)));
    DONE = { rec, fresh: after.filter(b => !before.includes(b.id)) };
    show("app"); go("done");
  },
  hype(t) { const el = document.createElement("div"); el.className = "hype"; el.textContent = t; $("#pFx").appendChild(el); setTimeout(() => el.remove(), 2500); },
  flash() { const el = document.createElement("div"); el.className = "flash"; $("#pFx").appendChild(el); setTimeout(() => el.remove(), 700); },
  countOv(n) { const el = document.createElement("div"); el.className = "count-ov"; el.innerHTML = `<b>${n}</b>`; $("#pFx").appendChild(el); setTimeout(() => el.remove(), 950); },
  bar() {
    $("#pBar").innerHTML = this.items.map((x, i) => i === 0 ? "" : `<i data-i="${i}" class="${x.t === "rest" ? "w" : ""}"></i>`).join("");
  },
  render(full) {
    const it = this.cur(), x = EX[it.id], rem = Math.max(0, it.dur - this.itT);
    if (full) {
      const ph = $("#pPhase");
      const label = { intro: "מתחילים", warm: "חימום", rest: "מנוחה", work: "עבודה!", cool: "שחרור ומתיחות" }[it.t];
      ph.textContent = label; ph.className = "phase" + (it.t === "rest" || it.t === "intro" ? " rest" : it.t === "cool" ? " cool" : "");
      const works = this.items.filter(y => y.t === "work"), wi = works.indexOf(it);
      $("#pStep").textContent = it.t === "work" || it.t === "rest" ? `סיבוב ${it.round + 1}/2 · תרגיל ${it.idx != null ? it.idx + 1 : (this.items[this.idx + 1] || {}).idx + 1}/${this.plan.main.length}` : "";
      void wi;
      if (it.t === "intro") { $("#pName").textContent = `בוקר טוב, ${ME.name}!`; $("#pMeta").textContent = `${DAYS[this.plan.day].emoji} ${DAYS[this.plan.day].name} · ${Math.round(this.plan.total / 60)} דקות`; }
      else { $("#pName").textContent = x.he; $("#pMeta").textContent = this.metaLine(it, x); }
      $("#pCues").innerHTML = (it.t === "intro" ? ["כיסא יציב בלי גלגלים", "בקבוק מים בהישג יד", "נושמים לאורך כל התרגיל"] : x.cues).map(c => `<li>${esc(c)}</li>`).join("");
      $("#pTip").textContent = it.t === "intro" ? "" : "💡 " + x.tip;
      $("#pMus").innerHTML = it.t === "intro" ? "" : x.mus.map(m => `<span>${esc(m)}</span>`).join("");
      $("#pRing").className = "ring" + (it.t === "rest" || it.t === "intro" ? " rest" : "");
      const showReps = !!x.beats && (it.t === "work" || it.t === "warm");
      $("#pReps").style.visibility = showReps ? "visible" : "hidden";
      if (showReps) { $("#pRep").textContent = 0; $("#pRepT").textContent = "/" + Math.max(1, Math.floor((it.dur - this.repOff) / this.repDur)); }
      $("#pBadge").textContent = it.t === "rest" ? "הבא בתור: " + x.he : it.t === "work" ? "עובדים" : "";
      $("#pBadge").hidden = !(it.t === "rest");
      const n = this.items[this.idx + 1];
      $("#pNext").innerHTML = n ? `אחר כך: <b>${esc(n.t === "rest" ? EX[n.id].he : EX[n.id].he)}</b>` : "אחרון!";
      $$("#pBar i").forEach(el => { const k = +el.dataset.i; el.className = (this.items[k].t === "rest" ? "w " : "") + (k < this.idx ? "done" : k === this.idx ? "now" : ""); });
      $("#pMusic").innerHTML = (Music.on ? "🎵" : "🔇") + '<span class="lbl"> מוזיקה</span>';
    }
    const sideB = $("#pSideB");
    if (x.side === "switch" && it.t !== "rest" && it.t !== "intro") { sideB.hidden = false; sideB.textContent = this.itT >= it.dur / 2 ? "צד שני" : "צד ראשון"; } else sideB.hidden = true;
    $("#pSec").textContent = Math.ceil(rem);
    $("#pRingFg").style.strokeDashoffset = String(276.5 * (this.itT / it.dur));
    const left = rem + this.items.slice(this.idx + 1).reduce((s, y) => s + y.dur, 0);
    $("#pTotal").textContent = "נותרו " + fmt(left);
  },
  metaLine(it, x) {
    if (it.t === "rest") return `${it.dur} שניות להתכונן · ${x.beats ? "כ-" + Math.floor(LV[this.plan.level].work / (x.beats * 60 / ((STYLES[Music.style] || STYLES.house).bpm))) + " חזרות" : "החזקה"}`;
    if (!x.beats) return `${it.dur} שניות${x.side === "switch" ? " · חצי לכל צד" : ""}`;
    const rd = x.beats * 60 / ((STYLES[Music.style] || STYLES.house).bpm);
    return `${it.dur} שניות · חזרה כל ${rd.toFixed(1)} שנ'${x.side === "alt" ? " · לסירוגין" : ""}`;
  }
};

/* ------------------------------------------------------------------ done */
let DONE = null;
function viewDone() {
  if (!DONE) return viewHome();
  const r = DONE.rec, s = stats(ME);
  $("#view").innerHTML = `<div class="done-hero"><div class="hero-t">${r.partial ? "כמעט! 💪" : "סיימנו! 🎉"}</div>
    <h2>${esc(ME.name)}, ${fmt(r.sec)} דקות · ${r.reps} חזרות${s.cur > 1 ? " · 🔥 " + s.cur + " ימים ברצף" : ""}</h2>
    ${DONE.fresh.length ? `<br><div class="badges" style="display:flex;flex-wrap:wrap;justify-content:center;gap:1rem">${DONE.fresh.map(b => `<div class="badge got"><span class="e">${b.e}</span><b>הישג חדש: ${b.n}</b><small>${b.d}</small></div>`).join("")}</div>` : ""}
    <br><h3>איך היה?</h3>
    <div class="rate"><button class="btn big" data-rate="easy">😎 קל מדי</button><button class="btn big go" data-rate="ok">👌 בדיוק</button><button class="btn big" data-rate="hard">🥵 קשה מדי</button></div>
    <h3>תרגיל שלא מתאים לך? (יוצא מהאימונים הבאים)</h3><br>
    <div class="chips" style="justify-content:center">${r.main.map(id => `<button class="chip" data-nope="${id}" aria-pressed="${ME.hide.includes(id)}">${esc(EX[id].he)}</button>`).join("")}</div><br><br>
    <button class="btn" id="doneHome">לדף הבית</button></div>`;
  $$("[data-rate]").forEach(b => b.onclick = () => {
    r.rate = b.dataset.rate; ME.easy = r.rate === "easy" ? ME.easy + 1 : 0; ME.hard = r.rate === "hard" ? ME.hard + 1 : 0; Store.save();
    $$("[data-rate]").forEach(x => x.setAttribute("aria-pressed", x === b)); toast(r.rate === "easy" ? "רשמתי. אם זה יחזור, נעלה רמה" : r.rate === "hard" ? "רשמתי. אם זה יחזור, נוריד רמה" : "מעולה, נשארים ככה");
  });
  $$("[data-nope]").forEach(b => b.onclick = () => { toggle(ME.hide, b.dataset.nope); ME.fav = ME.fav.filter(i => !ME.hide.includes(i)); Store.save(); b.setAttribute("aria-pressed", ME.hide.includes(b.dataset.nope)); });
  $("#doneHome").onclick = () => { DONE = null; go("home"); };
  $("[data-rate=ok]").focus();
}

/* ===================================================================== REMOTE / KEYBOARD
   LG remotes send arrows, Enter, and Back (keyCode 461). Arrow keys move focus spatially. */
function layer() { if ($("#modal")) return $("#modal"); if (Player.active) return $("#pPaused").hidden ? $("#player") : $("#pPaused"); return $("#who").hidden ? $("#app") : $("#who"); }
function focusables(root) { return $$('button:not([disabled]),a[href],input,select,[tabindex="0"]', root).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; }); }
function moveFocus(key) {
  const els = focusables(layer()); if (!els.length) return;
  const cur = document.activeElement; if (!els.includes(cur)) { els[0].focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bd = Infinity;
  els.forEach(el => {
    if (el === cur) return; const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
    const ok = key === "ArrowLeft" ? dx < -4 : key === "ArrowRight" ? dx > 4 : key === "ArrowUp" ? dy < -4 : dy > 4; if (!ok) return;
    const main = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dx) : Math.abs(dy), side = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const d = main + side * 2.2; if (d < bd) { bd = d; best = el; }
  });
  if (best) { best.focus(); best.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}
function back() {
  if ($("#modal")) return closeModal();
  if (Player.active) { if (!Player.paused) Player.pause(); else Player.exit(); return; }
  if (!$("#app").hidden) { if (VIEW !== "home") return go("home"); return renderWho(); }
}
document.addEventListener("keydown", e => {
  const code = e.keyCode, tag = (document.activeElement || {}).tagName;
  // older webOS / set-top browsers report "Left"/"Unidentified" in e.key: fall back to keyCode
  const k = ({ 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown" })[code] || ({ Left: "ArrowLeft", Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Esc: "Escape" })[e.key] || e.key || "";
  if (code === 461 || k === "GoBack" || k === "BrowserBack" || k === "Escape" || (k === "Backspace" && !/INPUT|TEXTAREA/.test(tag))) { e.preventDefault(); back(); return; }
  if (Player.active && (k === "MediaPlayPause" || code === 415 || code === 19 || code === 179 || (k === " " && tag !== "BUTTON"))) { e.preventDefault(); Player.togglePause(); return; }
  if (k.startsWith("Arrow")) {
    if (tag === "INPUT" && (k === "ArrowLeft" || k === "ArrowRight")) return;
    e.preventDefault(); document.body.classList.add("kbd"); moveFocus(k);
  }
});
document.addEventListener("pointerdown", () => document.body.classList.remove("kbd"));
document.addEventListener("visibilitychange", () => { if (document.hidden && Player.active && !Player.paused) Player.pause(); });

/* ===================================================================== BOOT */
function boot() {
  Store.load(); Vid.init();
  $("#pPause").onclick = () => Player.togglePause();
  $("#pSkip").onclick = () => Player.skip();
  $("#pMusic").onclick = () => Player.toggleMusic();
  $("#pResume").onclick = () => Player.resume();
  $("#pSkip2").onclick = () => Player.skip();
  $("#pExit").onclick = () => Player.exit();
  if (Store.d.profiles.length === 0) { renderWho(); editProfile(null); } else renderWho();
}
boot();
if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => { }));
