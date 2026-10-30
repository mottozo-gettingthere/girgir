/* Girgir — peer-to-peer LAN intercom. No server, no internet.
   Signalling is a two-step QR exchange; audio and control run over WebRTC. */
(() => {
'use strict';

const PROTO = 'E1';
const $ = id => document.getElementById(id);

/* This tool keeps no records: no history, no recordings, no settings carried
   between launches. Flip this to true if you would rather it remembered your
   mode, toggles and volume. */
/* Must match the number in version.json and the cache name in sw.js. */
const APP_VERSION = 13;

const REMEMBER_SETTINGS = false;
const INSTALLED_KEY = 'girgir-installed';
const NAME_KEY = 'girgir-name';
const LAST_KEY = 'girgir-last';
const KEEP_KEYS = [INSTALLED_KEY, NAME_KEY, LAST_KEY];

const ui = {
  brandDot: $('brandDot'), pill: $('statePill'), bars: $('bars'), help: $('btnHelp'),
  views: {
    setup: $('viewSetup'), help: $('viewHelp'), code: $('viewCode'),
    scan: $('viewScan'), live: $('viewLive')
  },
  btnCreate: $('btnCreate'), btnJoin: $('btnJoin'), btnGuide: $('btnGuide'),
  helpBack: $('btnHelpBack'), storeUsed: $('storeUsed'), btnClear: $('btnClear'),
  codeStep: $('codeStep'), codeHint: $('codeHint'), qrCanvas: $('qrCanvas'),
  btnNext: $('btnNext'), codeText: $('codeText'), btnCopy: $('btnCopy'),
  shareRow: $('shareRow'), btnShare: $('btnShare'),
  scanStep: $('scanStep'), scanHint: $('scanHint'), cam: $('cam'),
  camWrap: document.querySelector('.cam-wrap'),
  pasteText: $('pasteText'), btnPaste: $('btnPaste'),
  cancel1: $('btnCancel1'), cancel2: $('btnCancel2'),
  statusText: $('statusText'), liveBanner: $('liveBanner'),
  meterYou: $('meterYou'), meterThem: $('meterThem'),
  vLink: $('vLink'), vBattYou: $('vBattYou'), vBattThem: $('vBattThem'), vInput: $('vInput'),
  volRow: $('volRow'), vol: $('vol'), volVal: $('volVal'), volNote: $('volNote'),
  outRow: $('outRow'), outSel: $('outSel'), outNote: $('outNote'),
  talk: $('talkBtn'), talkLabel: $('talkLabel'),
  ping: $('pingBtn'),
  togHalf: $('togHalf'), togRoger: $('togRoger'), hangup: $('btnHangup'),
  vNet: $('vNet'), btnRelink: $('btnRelink'),
  sheet: $('sheet'), btnSettings: $('btnSettings'), btnSheetClose: $('btnSheetClose'),
  installBar: $('installBar'), installText: $('installText'), btnInstall: $('btnInstall'),
  btnInstallHide: $('btnInstallHide'), nameIn: $('nameIn'),
  routeRow: $('routeRow'), btnEarpiece: $('btnEarpiece'), btnSpeaker: $('btnSpeaker'),
  voice: $('voiceBtn'), voiceFace: $('voiceFace'), voiceName: $('voiceName'),
  updateBar: $('updateBar'), updateText: $('updateText'), btnUpdate: $('btnUpdate'),
  verNow: $('verNow'), verLatest: $('verLatest'),
  dropBar: $('dropBar'), dropText: $('dropText'), btnDropPair: $('btnDropPair'),
  watching: $('watching'), codeCam: $('codeCam'),
  resumeBar: $('resumeBar'), resumeText: $('resumeText'),
  btnResume: $('btnResume'), btnResumeHide: $('btnResumeHide'),
  labelYou: $('labelYou'), labelThem: $('labelThem'),
  micLvl: $('micLvl'), micVal: $('micVal'), togAwake: $('togAwake'),
  flash: $('flash'), toast: $('toast'), remoteAudio: $('remoteAudio')
};

/* ---------------- state ---------------- */

let pc = null, dc = null;
let micStream = null, micTrack = null, remoteStream = null;
let micRaw = null, micRawTrack = null, micGainNode = null, micGain = 100;
let myName = '', peerName = '';
let amOfferer = false, recoverTimer = 0, recovering = false;
let standbyCode = '', standbyTimer = 0, lastHeard = 0;
let bus = null;
let route = 'earpiece';
let micDest = null, voice = 'off', voiceNodes = [];
let voiceTapTimer = 0, lastVoiceTap = 0, pingTaps = [];
let mode = 'hold', live = false, openMuted = false, remoteLive = false;
let halfDuplex = true, rogerBeep = true, volume = 100, keepAwake = true;
let actx = null, micAnalyser = null, remoteAnalyser = null, rafId = 0;
let scanning = false, scanStream = null, jsqrLoad = null;
let wakeLock = null, hbTimer = 0, statsTimer = 0, rtt = null;
let pingSeq = 0, duckTimer = 0, holdTimer = 0, alarmTimer = 0, urgentArmed = false;
let helpReturn = 'setup', volumeWorks = false;
let lastLost = null, lastRecv = null;

/* ---------------- settings ---------------- */

/* Wipe anything a previous version or session left on this device. */
function purgeStoredData() {
  try {
    if (!REMEMBER_SETTINGS) {
      /* The only thing carried between launches. iOS gives a page no way to
         tell it has already been added to the home screen, so without this
         the install hint would nag forever in a Safari tab. One boolean -
         no call data of any kind survives a launch. */
      const kept = KEEP_KEYS.map(k => [k, localStorage.getItem(k)]);
      localStorage.clear();
      kept.forEach(([k, v]) => { if (v !== null) localStorage.setItem(k, v); });
    }
    sessionStorage.clear();
  } catch (e) { /* storage blocked */ }
  try {
    if (indexedDB.databases) {
      indexedDB.databases()
        .then(dbs => dbs.forEach(db => db.name && indexedDB.deleteDatabase(db.name)))
        .catch(() => {});
    }
  } catch (e) { /* not supported */ }
}

function load() {
  if (!REMEMBER_SETTINGS) return;
  try {
    const s = JSON.parse(localStorage.getItem('girgir') || '{}');
    if (s.mode) mode = s.mode;
    if (typeof s.halfDuplex === 'boolean') halfDuplex = s.halfDuplex;
    if (typeof s.rogerBeep === 'boolean') rogerBeep = s.rogerBeep;
    if (typeof s.volume === 'number') volume = s.volume;
  } catch (e) { /* storage unavailable */ }
}
function save() {
  if (!REMEMBER_SETTINGS) return;
  try {
    localStorage.setItem('girgir', JSON.stringify({ mode, halfDuplex, rogerBeep, volume }));
  } catch (e) { /* storage unavailable */ }
}

/* ---------------- small helpers ---------------- */

function show(name) {
  Object.entries(ui.views).forEach(([k, v]) => { v.hidden = (k !== name); });
}

function setPill(state, text) {
  ui.pill.dataset.state = state;
  ui.pill.textContent = text;
  ui.brandDot.classList.toggle('on', state === 'linked');
}

let toastTimer = 0;
function toast(msg, ms = 2600) {
  ui.toast.textContent = msg;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast.hidden = true; }, ms);
}

function buzz(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) { /* iOS has no vibration */ }
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/* ---------------- code packing ---------------- */

const FORMATS = { D: 'deflate-raw', Z: 'deflate' };

function b64u(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function squeeze(bytes, format) {
  const cs = new CompressionStream(format);
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function expand(bytes, format) {
  const ds = new DecompressionStream(format);
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/* Header extensions and congestion feedback are optional on a LAN, and dropping
   them takes the QR down about three versions, which matters when one phone
   has to read the code off another phone's screen. */
function trimSdp(sdp) {
  return sdp.split('\r\n')
    .filter(l => !/^a=(extmap:|rtcp-fb:|msid-semantic)/.test(l))
    .join('\r\n');
}

/* A code is PROTO + role(O|A) + format(D|Z|P) + base64url payload. */
async function packDesc(role, sdp) {
  const bytes = new TextEncoder().encode(trimSdp(sdp));
  for (const tag of ['D', 'Z']) {
    try { return PROTO + role + tag + b64u(await squeeze(bytes, FORMATS[tag])); }
    catch (e) { /* this compression format is unavailable */ }
  }
  return PROTO + role + 'P' + b64u(bytes);
}

async function unpackDesc(code) {
  const text = String(code).trim();
  if (!text.startsWith(PROTO)) throw new Error('That is not a Girgir code.');
  const role = text[2], tag = text[3];
  const payload = unb64u(text.slice(4));
  if (role !== 'O' && role !== 'A') throw new Error('That code is malformed.');
  const bytes = tag === 'P' ? payload : await expand(payload, FORMATS[tag]);
  return { role, sdp: new TextDecoder().decode(bytes) };
}

/* ---------------- audio ---------------- */

function audio() {
  if (!actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    actx = new C();
  }
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  return actx;
}

function bell(ctx, f, t0) {
  [[f, 0.42, 0.62], [f * 2, 0.12, 0.34], [f * 3, 0.045, 0.18]].forEach(([freq, amp, dur]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  });
}

function blip(ctx, f, t0, dur, amp) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(amp, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function playPing(level) {
  const ctx = audio();
  if (!ctx) return;
  if (level >= 2) {
    /* Hard to ignore on purpose: a rising pair repeated, over a second of it. */
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      bell(ctx, 1174.7, t + i * 0.26);
      bell(ctx, 1567.9, t + i * 0.26 + 0.11);
    }
    duck(1700);
    return;
  }
  const base = level === 1 ? 1046.5 : 880;
  const offsets = level === 1 ? [0, 0.17, 0.34] : [0];
  offsets.forEach(o => bell(ctx, base, ctx.currentTime + o));
  duck(level === 1 ? 620 : 380);
}

function playRoger() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime;
  blip(ctx, 700, t, 0.06, 0.14);
  blip(ctx, 540, t + 0.07, 0.09, 0.14);
}

function playSent() {
  const ctx = audio();
  if (!ctx) return;
  blip(ctx, 1200, ctx.currentTime, 0.05, 0.06);
}

/* Mute incoming audio briefly so a tone is not buried under speech. */
function duck(ms) {
  ui.remoteAudio.muted = true;
  clearTimeout(duckTimer);
  duckTimer = setTimeout(syncDuck, ms);
}
function syncDuck() {
  /* In open channel both sides transmit continuously, so ducking on `live`
     would mute the other person for the whole call. It only means anything
     while a press-to-talk gate is what opens the mic. */
  ui.remoteAudio.muted = halfDuplex && live && mode !== 'open';
}

/* iOS ignores volume on media elements. Detect it rather than show a dead slider. */
function initVolume() {
  const a = ui.remoteAudio;
  const prev = a.volume;
  try {
    a.volume = 0.42;
    volumeWorks = Math.abs(a.volume - 0.42) < 0.02;
  } catch (e) { volumeWorks = false; }
  a.volume = volumeWorks ? volume / 100 : prev;
  ui.volRow.hidden = !volumeWorks;
  ui.volNote.hidden = volumeWorks;
  if (volumeWorks) {
    ui.vol.value = String(volume);
    ui.volVal.textContent = String(volume);
    ui.vol.oninput = () => {
      volume = Number(ui.vol.value);
      ui.volVal.textContent = String(volume);
      a.volume = volume / 100;
      save();
    };
  }
}

/* Output routing. Safari exposes navigator.audioSession, and its type decides
   where sound lands: play-and-record goes to the receiver, playback to the
   loudspeaker. It is reportedly not reliable on every iOS build, so the choice
   is offered rather than assumed. Chrome has no equivalent, so on Android the
   loudspeaker really is the only option, and setSinkId only ever offers whole
   devices rather than the two outputs inside the phone. */
function looksLikeIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

async function refreshOutputs() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outs = devices.filter(d => d.kind === 'audiooutput');
    if (!outs.length) { showDefaultRouting(); return; }
    const current = ui.outSel.value;
    ui.outSel.innerHTML = '';
    outs.forEach(d => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || (d.deviceId === 'default' ? 'Default output' : 'Output');
      ui.outSel.appendChild(o);
    });
    if (current) ui.outSel.value = current;
    ui.outSel.hidden = false;
    ui.outNote.hidden = true;
  } catch (e) { showDefaultRouting(); }
}

function hasAudioSession() {
  try { return !!(navigator.audioSession && 'type' in navigator.audioSession); }
  catch (e) { return false; }
}

function setRoute(r) {
  if (!hasAudioSession()) return;
  try {
    navigator.audioSession.type = (r === 'speaker') ? 'playback' : 'play-and-record';
    route = r;
  } catch (e) {
    toast('This phone would not switch output', 4000);
  }
  ui.btnEarpiece.setAttribute('aria-pressed', String(route === 'earpiece'));
  ui.btnSpeaker.setAttribute('aria-pressed', String(route === 'speaker'));
}

function showDefaultRouting() {
  ui.outSel.hidden = true;
  ui.outNote.hidden = false;
  ui.outNote.textContent = looksLikeIOS() ? 'EARPIECE — hold to ear' : 'LOUDSPEAKER';
}

async function initOutput() {
  if (hasAudioSession()) {
    ui.routeRow.hidden = false;
    ui.outSel.hidden = true;
    ui.outNote.hidden = false;
    ui.outNote.textContent = 'switching can take a moment';
    ui.btnEarpiece.onclick = () => setRoute('earpiece');
    ui.btnSpeaker.onclick = () => setRoute('speaker');
    setRoute(route);
    return;
  }
  if (typeof ui.remoteAudio.setSinkId !== 'function') { showDefaultRouting(); return; }
  await refreshOutputs();
  ui.outSel.onchange = async () => {
    try { await ui.remoteAudio.setSinkId(ui.outSel.value); }
    catch (e) { toast('This phone will not switch output'); }
  };
}

function classifyInput(label) {
  if (!label) return '—';
  if (/airpod|buds?|bluetooth|headset|hands-?free|earphone|\bbt\b/i.test(label)) return 'EARBUD';
  if (/headphone|wired|external|usb/i.test(label)) return 'WIRED';
  return 'BUILT-IN';
}

/* Which microphone is actually open, so a headset that failed to connect is
   obvious rather than silent. The full device name goes in the tooltip. */
function showInput() {
  const label = micRawTrack ? micRawTrack.label : '';
  ui.vInput.textContent = classifyInput(label);
  ui.vInput.title = label || '';
}

async function ensureMic() {
  if (micStream) return micStream;
  micRaw = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    video: false
  });
  micRawTrack = micRaw.getAudioTracks()[0];
  micRawTrack.addEventListener('ended', () => toast('Microphone disconnected', 5000));
  showInput();

  /* What goes out is routed through a gain node so the mic level is
     adjustable. The raw track keeps the device name for the INPUT readout,
     and if Web Audio is unavailable it is simply sent unchanged. */
  micStream = micRaw;
  const ctx = audio();
  if (ctx) {
    try {
      micGainNode = ctx.createGain();
      micGainNode.gain.value = micGain / 100;
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 512;
      micDest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(micRaw).connect(micGainNode);
      micGainNode.connect(micAnalyser);
      micGainNode.connect(micDest);
      micStream = micDest.stream;
    } catch (e) {
      micGainNode = null;
      micAnalyser = null;
      micDest = null;
      micStream = micRaw;
    }
  }
  micTrack = micStream.getAudioTracks()[0];
  micTrack.enabled = false;
  return micStream;
}

function setMicGain(v) {
  micGain = Math.max(0, Math.min(200, v | 0));
  if (micGainNode) micGainNode.gain.value = micGain / 100;
  ui.micLvl.value = String(micGain);
  ui.micVal.textContent = String(micGain);
}

/* ---------------- voices ---------------- */

/* Played with on the way out, so it is the other person who hears it. Web
   Audio has no pitch shifter, so none of these transpose; they colour the
   voice with ring modulation, filtering and distortion instead, which is
   cheap, stable and still daft enough to be worth having. */
const VOICES = [
  { id: 'off',     face: '\u{1F610}', name: 'straight' },
  { id: 'robot',   face: '\u{1F916}', name: 'robot'    },
  { id: 'helium',  face: '\u{1F388}', name: 'helium'   },
  { id: 'radio',   face: '\u{1F4FB}', name: 'radio'    },
  { id: 'tuner',   face: '\u{1F3A4}', name: 'tuner'    },
  { id: 'wobble',  face: '\u{1F974}', name: 'wobble'   }
];

/* Web Audio has no pitch shifter, so here is one: two delay lines whose delay
   is swept linearly and crossfaded into each other. Sweeping a delay changes
   playback rate, and therefore pitch; the crossfade hides the jump when each
   sweep restarts. Granular, so it sounds a bit grainy - which for a helium
   voice is no loss at all.

   The ratio works out as 1 + amount, measured against a 330 Hz tone through
   an OfflineAudioContext: 0.2 gave 1.18x and 0.5 gave 1.48x. */
const SHIFT_WINDOW = 0.100;
const SHIFT_FADE = 0.050;

function fadeBuffer(ctx) {
  const rate = ctx.sampleRate;
  const len1 = Math.floor(SHIFT_WINDOW * rate);
  const len2 = Math.floor((SHIFT_WINDOW - 2 * SHIFT_FADE) * rate);
  const buf = ctx.createBuffer(1, len1 + len2, rate);
  const p = buf.getChannelData(0);
  const fade = SHIFT_FADE * rate;
  const upTo = len1 - fade;
  for (let i = 0; i < len1; i++) {
    if (i < fade) p[i] = Math.sqrt(i / fade);
    else if (i >= upTo) p[i] = Math.sqrt(1 - (i - upTo) / fade);
    else p[i] = 1;
  }
  return buf;
}

function rampBuffer(ctx, up) {
  const rate = ctx.sampleRate;
  const len1 = Math.floor(SHIFT_WINDOW * rate);
  const len2 = Math.floor((SHIFT_WINDOW - 2 * SHIFT_FADE) * rate);
  const buf = ctx.createBuffer(1, len1 + len2, rate);
  const p = buf.getChannelData(0);
  for (let i = 0; i < len1; i++) p[i] = up ? (len1 - i) / len1 : i / len1;
  return buf;
}

/* amount is how far the delay is swept: bigger means a bigger shift. Positive
   raises the pitch, negative lowers it. */
function makeShifter(ctx, amount, nodes) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const d1 = ctx.createDelay(1);
  const d2 = ctx.createDelay(1);
  const m1 = ctx.createGain();
  const m2 = ctx.createGain();

  const fade = fadeBuffer(ctx);
  const ramp = rampBuffer(ctx, amount > 0);
  const srcs = [];
  const mk = (buffer, target) => {
    const n = ctx.createBufferSource();
    n.buffer = buffer;
    n.loop = true;
    n.connect(target);
    srcs.push(n);
    return n;
  };

  const sweep1 = ctx.createGain();
  const sweep2 = ctx.createGain();
  sweep1.gain.value = SHIFT_WINDOW * Math.abs(amount);
  sweep2.gain.value = SHIFT_WINDOW * Math.abs(amount);
  sweep1.connect(d1.delayTime);
  sweep2.connect(d2.delayTime);

  const r1 = mk(ramp, sweep1);
  const r2 = mk(ramp, sweep2);
  const f1 = mk(fade, m1.gain);
  const f2 = mk(fade, m2.gain);

  m1.gain.value = 0;
  m2.gain.value = 0;
  input.connect(d1); d1.connect(m1); m1.connect(output);
  input.connect(d2); d2.connect(m2); m2.connect(output);

  const t = ctx.currentTime + 0.05;
  const t2 = t + SHIFT_WINDOW - SHIFT_FADE;
  r1.start(t); f1.start(t);
  r2.start(t2); f2.start(t2);

  nodes.push(d1, d2, m1, m2, sweep1, sweep2);
  srcs.forEach(n => nodes.push(n));
  return { input: input, output: output, sweeps: [sweep1, sweep2] };
}

function distortionCurve(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  return curve;
}

/* Multiplying the signal by an oscillator - the gain node's own value sits at
   zero and the oscillator drives it between -1 and 1. */
function ringMod(ctx, hz, nodes) {
  const g = ctx.createGain();
  g.gain.value = 0;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = hz;
  osc.connect(g.gain);
  osc.start();
  nodes.push(osc, g);
  return g;
}

function buildVoice(ctx, id) {
  const nodes = [];
  let input, output;

  if (id === 'robot') {
    input = output = ringMod(ctx, 48, nodes);

  } else if (id === 'helium') {
    /* Up about half again, which is squeaky and still intelligible. The
       highpass clears the rumble the sweep leaves at the bottom, and the
       shelf puts back the brightness that makes it read as helium rather
       than as a slowed-down tape played fast. */
    const sh = makeShifter(ctx, 0.5, nodes);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 180;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 2200; shelf.gain.value = 3;
    /* 0.7 measures within a decibel of the straight voice at every input
       level from a whisper to a shout - two swept taps summing plus the
       shelf would otherwise come out several decibels hot. */
    const trim = ctx.createGain();
    trim.gain.value = 0.7;
    sh.output.connect(hp); hp.connect(shelf); shelf.connect(trim);
    nodes.push(hp, shelf, trim);
    input = sh.input; output = trim;

  } else if (id === 'radio') {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(12);
    const trim = ctx.createGain();
    trim.gain.value = 0.7;
    hp.connect(lp); lp.connect(ws); ws.connect(trim);
    nodes.push(hp, lp, ws, trim);
    input = hp; output = trim;

  } else if (id === 'tuner') {
    /* Not real autotune - that needs pitch tracking and a scale to snap to,
       neither of which these nodes can do. What it does have is the part
       people actually recognise: the voice doubled a few semitones above
       itself. 0.2 is about three.

       The compressor is there for the other half of that sound, the squashed
       vocal: measured across a 20 dB range of input it holds the output
       inside 9 dB, so the double sits at one level however loudly you talk.
       It is not smoothing the crossfade - that ripple turned out to be about
       a decibel either way. */
    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    const sh = makeShifter(ctx, 0.2, nodes);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    const trim = ctx.createGain();
    trim.gain.value = 1.0;
    dry.connect(comp);
    dry.connect(sh.input);
    sh.output.connect(wet); wet.connect(comp);
    comp.connect(trim);
    nodes.push(dry, wet, comp, trim);
    input = dry; output = trim;

  } else if (id === 'wobble') {
    /* Vibrato: a short delay whose length is wobbled by a slow oscillator. */
    const dly = ctx.createDelay(0.05);
    dly.delayTime.value = 0.012;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.004;
    lfo.connect(depth); depth.connect(dly.delayTime);
    lfo.start();
    nodes.push(dly, lfo, depth);
    input = output = dly;

  } else {
    return null;
  }
  return { input: input, output: output, nodes: nodes };
}

function voiceInfo(id) {
  for (let i = 0; i < VOICES.length; i++) if (VOICES[i].id === id) return VOICES[i];
  return VOICES[0];
}

function updateVoiceBtn() {
  const v = voiceInfo(voice);
  ui.voiceFace.textContent = v.face;
  ui.voiceName.textContent = v.name;
  ui.voice.setAttribute('aria-pressed', String(voice !== 'off'));
  ui.voice.classList.toggle('on', voice !== 'off');
}

function setVoice(id) {
  voice = id;
  updateVoiceBtn();
  if (!micGainNode || !micDest) return;

  try { micGainNode.disconnect(); } catch (e) {}
  voiceNodes.forEach(n => {
    try { if (n.stop) n.stop(); } catch (e) {}
    try { n.disconnect(); } catch (e) {}
  });
  voiceNodes = [];

  let head = micGainNode;
  if (id !== 'off') {
    const built = buildVoice(actx, id);
    if (built) {
      micGainNode.connect(built.input);
      head = built.output;
      voiceNodes = built.nodes;
    }
  }
  head.connect(micDest);
  if (micAnalyser) head.connect(micAnalyser);
}

function cycleVoice() {
  const i = VOICES.findIndex(v => v.id === voice);
  setVoice(VOICES[(i + 1) % VOICES.length].id);
  toast('Voice: ' + voiceInfo(voice).name, 1600);
}

/* ---------------- transmit gate ---------------- */

function setLive(on) {
  on = !!on;
  if (on === live) return;
  const wasLive = live;
  live = on;
  if (micTrack) micTrack.enabled = on;
  syncDuck();
  sendCtl({ t: 'mic', live: on });
  if (on) buzz(12);
  setSessionState(on || mode === 'open');
  updateTalk();
  updateStatus();
}

function releaseHold() {
  if (mode !== 'open') setLive(false);
}

function setMode(m) {
  mode = m;
  save();
  document.querySelectorAll('.mode').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  if (m === 'open') { openMuted = false; setLive(true); }
  else setLive(false);
  updateTalk();
}

function updateTalk() {
  ui.talk.classList.toggle('live', live);
  ui.talk.classList.toggle('muted', mode === 'open' && openMuted);
  ui.liveBanner.hidden = !live;
  ui.brandDot.classList.toggle('tx', live);
  if (mode === 'open') ui.talkLabel.textContent = openMuted ? 'MUTED' : 'MIC OPEN';
  else if (mode === 'latch') ui.talkLabel.textContent = live ? 'LIVE — TAP TO STOP' : 'TAP TO TALK';
  else ui.talkLabel.textContent = live ? 'LIVE' : 'HOLD TO TALK';
}

function updateStatus() {
  const s = ui.statusText;
  s.classList.remove('tx', 'rx');
  if (live) { s.textContent = "YOU'RE LIVE"; s.classList.add('tx'); }
  else if (remoteLive) { s.textContent = 'THEY’RE TALKING'; s.classList.add('rx'); }
  else s.textContent = 'QUIET';
}

/* ---------------- battery ---------------- */

let myBattery = null;

async function initBattery() {
  if (!navigator.getBattery) { ui.vBattYou.textContent = '—'; return; }
  try {
    const b = await navigator.getBattery();
    const push = () => {
      myBattery = { lvl: Math.round(b.level * 100), chg: !!b.charging };
      ui.vBattYou.textContent = myBattery.lvl + '%' + (myBattery.chg ? '+' : '');
      ui.vBattYou.classList.toggle('bad', myBattery.lvl <= 15 && !myBattery.chg);
      ui.vBattYou.classList.toggle('warn', myBattery.lvl > 15 && myBattery.lvl <= 30 && !myBattery.chg);
      sendCtl({ t: 'stat', batt: myBattery });
    };
    b.addEventListener('levelchange', push);
    b.addEventListener('chargingchange', push);
    push();
  } catch (e) { ui.vBattYou.textContent = '—'; }
}

/* ---------------- control channel ---------------- */

function sendCtl(obj) {
  if (dc && dc.readyState === 'open') {
    try { dc.send(JSON.stringify(obj)); } catch (e) { /* channel closing */ }
  }
}

function wireChannel(channel) {
  dc = channel;
  dc.onopen = () => {
    setPill('linked', 'LINKED');
    sendCtl({ t: 'mic', live });
    sendCtl({ t: 'name', name: myName });
    if (myBattery) sendCtl({ t: 'stat', batt: myBattery });
    startHeartbeat();
  };
  dc.onclose = () => stopHeartbeat();
  dc.onmessage = ev => {
    lastHeard = Date.now();
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'mic') {
      const spoke = remoteLive;
      remoteLive = !!m.live;
      /* "Over" is for whoever is listening, so the beep belongs here - on the
         phone that just stopped receiving - not on the talker's own handset. */
      if (spoke && !remoteLive && rogerBeep) playRoger();
      updateStatus();
    }
    else if (m.t === 'ping') {
      const lvl = typeof m.level === 'number' ? m.level : (m.urgent ? 1 : 0);
      receivePing(Math.max(0, Math.min(2, lvl)));
      sendCtl({ t: 'ack', id: m.id });
    }
    else if (m.t === 'name') { peerName = cleanName(m.name); updateNames(); }
    else if (m.t === 'reoffer') { takeReoffer(m.sdp); }
    else if (m.t === 'ask-reoffer') { attemptRecovery(true); }
    else if (m.t === 'reanswer') { takeReanswer(m.sdp); }
    else if (m.t === 'bye') {
      toast((peerName || 'They') + ' are re-pairing - tap Join channel', 8000);
    }
    else if (m.t === 'ack') { toast('Ping delivered'); }
    else if (m.t === 'hb') { sendCtl({ t: 'hbr', ts: m.ts }); }
    else if (m.t === 'hbr') { rtt = Math.round(performance.now() - m.ts); }
    else if (m.t === 'stat' && m.batt) {
      ui.vBattThem.textContent = m.batt.lvl + '%' + (m.batt.chg ? '+' : '');
      ui.vBattThem.classList.toggle('bad', m.batt.lvl <= 15 && !m.batt.chg);
      ui.vBattThem.classList.toggle('warn', m.batt.lvl > 15 && m.batt.lvl <= 30 && !m.batt.chg);
    }
  };
}

/* A page that closes without saying goodbye leaves the data channel looking
   open from this side until it times out, which can take minutes. Silence is
   the reliable signal instead: nothing at all against a four-second heartbeat
   means the other app is gone, not merely quiet. */
const PEER_GONE_MS = 12000;

function startHeartbeat() {
  stopHeartbeat();
  lastHeard = Date.now();
  hbTimer = setInterval(() => {
    if (lastHeard && Date.now() - lastHeard > PEER_GONE_MS) { peerGone(); return; }
    sendCtl({ t: 'hb', ts: performance.now() });
    if (myBattery) sendCtl({ t: 'stat', batt: myBattery });
  }, 4000);
  statsTimer = setInterval(pollStats, 2000);
  pollStats();
}
function stopHeartbeat() {
  clearInterval(hbTimer);
  clearInterval(statsTimer);
  hbTimer = statsTimer = 0;
  ui.bars.dataset.q = '0';
  ui.vLink.textContent = '—';
}

/* ---------------- link quality ---------------- */

function scoreLink(rttMs, loss, jitterMs) {
  if (rttMs == null) return 0;
  if (rttMs > 260 || loss > 0.10 || jitterMs > 120) return 1;
  if (rttMs > 140 || loss > 0.04 || jitterMs > 60) return 2;
  if (rttMs > 70 || loss > 0.01 || jitterMs > 30) return 3;
  return 4;
}

async function pollStats() {
  if (!pc) return;
  let rttMs = null, lost = null, recv = null, jitterMs = 0;
  const cands = new Map();
  let localId = null, remoteId = null;
  try {
    const report = await pc.getStats();
    report.forEach(r => {
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands.set(r.id, r);
      if (r.type === 'candidate-pair' && r.state === 'succeeded' &&
          (r.nominated || r.selected)) {
        localId = r.localCandidateId;
        remoteId = r.remoteCandidateId;
        if (typeof r.currentRoundTripTime === 'number') {
          rttMs = Math.round(r.currentRoundTripTime * 1000);
        }
      }
      if (r.type === 'inbound-rtp' && r.kind === 'audio') {
        lost = r.packetsLost;
        recv = r.packetsReceived;
        if (typeof r.jitter === 'number') jitterMs = r.jitter * 1000;
      }
    });
    /* getStats blanks candidate addresses until mic permission is granted,
       so fall back to the descriptions, which carry the same addresses. */
    const lc = cands.get(localId), rc = cands.get(remoteId);
    showNet(
      (lc && lc.address) || sdpHost(pc.localDescription && pc.localDescription.sdp),
      (rc && rc.address) || sdpHost(pc.remoteDescription && pc.remoteDescription.sdp));
  } catch (e) { /* stats unavailable */ }

  if (rttMs == null && rtt != null) rttMs = rtt;

  let loss = 0;
  if (lost != null && recv != null) {
    if (lastLost != null) {
      const dL = Math.max(0, lost - lastLost);
      const dR = Math.max(0, recv - lastRecv);
      if (dL + dR > 0) loss = dL / (dL + dR);
    }
    lastLost = lost;
    lastRecv = recv;
  }

  const q = scoreLink(rttMs, loss, jitterMs);
  ui.bars.dataset.q = String(q);
  ui.vLink.textContent = rttMs == null ? '—' : rttMs + 'ms ' + (loss * 100).toFixed(loss >= 0.01 ? 0 : 1) + '%';
  ui.vLink.classList.toggle('bad', q === 1);
  ui.vLink.classList.toggle('warn', q === 2 || q === 3);
}

/* No browser exposes the Wi-Fi name, so the subnet the two phones share is
   the closest honest answer to "are we on the same network?". */
function sdpHost(sdp) {
  if (!sdp) return null;
  const m = sdp.match(/a=candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ host/);
  return m ? m[1] : null;
}

function showNet(a, b) {
  if (!a || !b) { ui.vNet.textContent = '\u2014'; ui.vNet.title = ''; return; }
  ui.vNet.title = 'you ' + a + '  \u00b7  them ' + b;
  if (/\.local$/i.test(a) || /\.local$/i.test(b)) {
    ui.vNet.textContent = 'addresses hidden';
    ui.vNet.classList.remove('warn');
    return;
  }
  const pa = a.split('.'), pb = b.split('.');
  const sameLan = pa.length === 4 && pb.length === 4 &&
    pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
  ui.vNet.textContent = sameLan
    ? pa.slice(0, 3).join('.') + '.x  \u00b7  ' + pa[3] + ' \u25b8 ' + pb[3]
    : a + ' \u25b8 ' + b;
  ui.vNet.classList.toggle('warn', !sameLan);
}

/* Tries the cheap repair first. While the control channel is alive the two
   sides renegotiate over it and nobody scans anything. Only a genuinely dead
   channel forces a fresh pairing, and a code cannot be reused for that - it
   carries one session's ICE credentials and DTLS fingerprint. */
async function relink() {
  if (pc && dc && dc.readyState === 'open') {
    setPill('pairing', 'RELINKING');
    recovering = false;
    if (amOfferer) await attemptRecovery(true);
    else sendCtl({ t: 'ask-reoffer' });
    return;
  }

  await standby();
}

/* Drops everything that belonged to one session while keeping the microphone,
   so a fresh offer can be built on the spot. */
function teardownPeer() {
  stopHeartbeat();
  lastHeard = 0;
  clearTimeout(recoverTimer);
  recovering = false;
  if (dc) { try { dc.close(); } catch (e) {} dc = null; }
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
  remoteStream = null;
  remoteAnalyser = null;
  remoteLive = false;
  lastLost = lastRecv = null;
  ui.remoteAudio.srcObject = null;
  ui.vBattThem.textContent = '\u2014';
  ui.vNet.textContent = '\u2014';
  ui.meterThem.style.width = '0%';
}

/* Android keeps a page alive in the background when it presents itself as an
   ongoing media session, and gives it a notification with controls. iOS
   accepts the metadata but still suspends the page, so this buys nothing
   there. */
function initMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Voice channel',
      artist: 'Girgir',
      album: 'Offline'
    });
    navigator.mediaSession.setActionHandler('play', () => {
      if (mode === 'open') { openMuted = false; setLive(true); updateTalk(); }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (mode === 'open') { openMuted = true; setLive(false); updateTalk(); }
    });
  } catch (e) { /* older or partial implementation */ }
}

function setSessionState(playing) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  } catch (e) { /* ignore */ }
}

/* Android fires beforeinstallprompt, so installing is one tap from inside
   the page. iOS has no such event and no install API at all - WebKit has had
   the request open for years - so the best available there is pointing
   straight at the share sheet instead of letting people hunt for it. */
let installEvent = null;

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true;
}

function markInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, '1'); } catch (e) { /* blocked */ }
  ui.installBar.hidden = true;
}

function alreadyInstalled() {
  try { return localStorage.getItem(INSTALLED_KEY) === '1'; }
  catch (e) { return false; }
}

function initInstall() {
  /* Running from the home screen is proof it is installed, so record that
     now - a later visit in a browser tab then stays quiet. */
  if (isStandalone()) { markInstalled(); return; }
  if (alreadyInstalled()) return;
  if (looksLikeIOS()) {
    ui.installText.innerHTML =
      'Install it: tap <b>Share</b>, then <b>Add to Home Screen</b>. ' +
      'After that it opens from your home screen and needs no internet.';
    ui.installBar.hidden = false;
  }
}

/* The peer's name arrives over the data channel, so it is untrusted input:
   capped, stripped of control characters, and only ever written as text. */
function cleanName(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .trim()
    .slice(0, 12);
}

function updateNames() {
  ui.labelYou.textContent = myName ? myName + ' (me)' : 'YOU';
  ui.labelThem.textContent = peerName || 'THEM';
  ui.labelYou.title = myName ? myName + ' - you' : 'You';
  ui.labelThem.title = peerName ? peerName + ' - the other phone' : 'The other phone';
}

function setMyName(v, announce) {
  myName = cleanName(v);
  try {
    if (myName) localStorage.setItem(NAME_KEY, myName);
    else localStorage.removeItem(NAME_KEY);
  } catch (e) { /* storage blocked */ }
  updateNames();
  if (announce) sendCtl({ t: 'name', name: myName });
}

function loadName() {
  let stored = '';
  try { stored = localStorage.getItem(NAME_KEY) || ''; } catch (e) {}
  myName = cleanName(stored);
  ui.nameIn.value = myName;
  updateNames();
}

/* A dropped link usually means the network moved, not that anyone left. While
   the control channel is still up the two sides can renegotiate over it with
   no scanning at all - that is what an ICE restart is for. Only once that
   channel is gone does pairing have to start from scratch. */
/* A restart forced while the link is still up never changes connectionState,
   so onconnectionstatechange will not fire and nothing would clear the
   RELINKING pill. Settle it by hand once renegotiation finishes. */
function settlePill() {
  if (pc && pc.connectionState === 'connected') setPill('linked', 'LINKED');
}

/* The other app is gone for good, so there is nothing to renegotiate and no
   point waiting: this phone goes on standby by itself. */
function peerGone() {
  stopHeartbeat();
  lastHeard = 0;
  if (ui.views.live.hidden && ui.views.code.hidden) return;
  ui.dropText.textContent = (peerName || 'They') +
    ' left the channel. Going on standby \u2014 point the two phones at each other.';
  ui.dropBar.hidden = false;
  setPill('lost', 'DROPPED');
  clearTimeout(standbyTimer);
  standbyTimer = setTimeout(() => { standby().catch(() => {}); }, 2500);
}

function scheduleRecovery() {
  clearTimeout(recoverTimer);
  recoverTimer = setTimeout(attemptRecovery, 2000);
}

async function attemptRecovery(force) {
  if (!pc || recovering) return;
  if (!force && pc.connectionState === 'connected') return;

  if (!dc || dc.readyState !== 'open') {
    /* Nothing left to renegotiate over. Rather than asking for a decision,
       this phone goes on standby by itself - see standby() for why that is
       the whole procedure from here. */
    ui.dropText.textContent = (peerName || 'They') +
      ' left the channel. Going on standby \u2014 point the two phones at each other.';
    ui.dropBar.hidden = false;
    clearTimeout(standbyTimer);
    standbyTimer = setTimeout(() => {
      if (!ui.views.live.hidden) standby().catch(() => {});
    }, 4000);
    return;
  }
  /* Only one side may re-offer, or the two offers collide. */
  if (!amOfferer) return;

  recovering = true;
  setPill('pairing', 'RELINKING');
  try {
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
    await gatheringDone();
    sendCtl({ t: 'reoffer', sdp: pc.localDescription.sdp });
    /* If no reply comes back the flag would latch and block every later
       attempt, including the one that notices the peer has gone. */
    setTimeout(() => {
      if (recovering && pc && pc.connectionState !== 'connected') recovering = false;
    }, 8000);
  } catch (e) {
    recovering = false;
    toast('Could not relink by itself - tap Relink', 6000);
  }
}

async function takeReoffer(sdp) {
  if (!pc) return;
  recovering = true;
  setPill('pairing', 'RELINKING');
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: String(sdp) });
    await pc.setLocalDescription(await pc.createAnswer());
    await gatheringDone();
    sendCtl({ t: 'reanswer', sdp: pc.localDescription.sdp });
  } catch (e) {
    toast('Could not relink by itself - tap Relink', 6000);
  }
  recovering = false;
  settlePill();
}

async function takeReanswer(sdp) {
  if (!pc) return;
  try { await pc.setRemoteDescription({ type: 'answer', sdp: String(sdp) }); }
  catch (e) { toast('Could not relink by itself - tap Relink', 6000); }
  recovering = false;
  settlePill();
}

/* The installed build is whatever this script says it is. version.json is
   fetched past the service worker, so it reports what the site serves now
   rather than what was cached - otherwise the app could only ever confirm its
   own version to itself. */
function showUpdate(latest) {
  ui.updateText.textContent = 'Version ' + latest + ' is out. You have ' +
    APP_VERSION + '. Update while you have internet.';
  ui.updateBar.hidden = false;
}

async function checkVersion() {
  ui.verNow.textContent = String(APP_VERSION);
  if (!navigator.onLine) { ui.verLatest.textContent = ' \u00b7 offline'; return; }
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const latest = Number(data && data.version);
    if (!latest) return;
    if (latest > APP_VERSION) {
      ui.verLatest.textContent = ' \u00b7 ' + latest + ' available';
      ui.verLatest.className = 'stale';
      showUpdate(latest);
    } else {
      ui.verLatest.textContent = ' \u00b7 up to date';
      ui.verLatest.className = '';
    }
  } catch (e) {
    ui.verLatest.textContent = ' \u00b7 could not check';
  }
}

/* Emptying the caches and reloading is not enough, and the reason is worth
   writing down because it looks like it should be.

   unregister() does not stop the worker that is already controlling this page,
   so it answers the reload - and on a miss it writes whatever it got straight
   back into the cache it was just cleared of. Underneath that, the browser's
   own HTTP cache is holding every file for ten minutes, and location.reload()
   does not bypass it for scripts or stylesheets. Between them the reload
   serves the build being replaced, the version check reads version.json
   fresh, sees a newer number, and puts the same bar back up.

   Installing a fresh worker first is what makes it land: a worker's install
   step fetches past both caches, so by the time the page reloads the shell it
   is served has come from the network. */
async function applyUpdate() {
  ui.btnUpdate.disabled = true;
  ui.updateText.textContent = 'Updating\u2026';
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if (navigator.serviceWorker) await freshWorker();
  } catch (e) { /* reload anyway and let the next check try again */ }
  location.reload();
}

/* Registers again and waits for the new worker to take over, so the reload is
   served out of a cache filled moments ago from the network. Gives up after
   fifteen seconds rather than leaving the button stuck. */
function freshWorker() {
  return new Promise(resolve => {
    const giveUp = setTimeout(resolve, 15000);
    const finish = () => { clearTimeout(giveUp); resolve(); };
    navigator.serviceWorker.register('sw.js').then(reg => {
      const sw = reg.installing || reg.waiting || reg.active;
      if (!sw || sw.state === 'activated') { finish(); return; }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') finish();
      });
    }).catch(finish);
  });
}

function watchWorkerUpdates() {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          ui.updateText.textContent = 'A new version is ready. Update to use it.';
          ui.updateBar.hidden = false;
        }
      });
    });
  }).catch(() => {});
}

function receivePing(level) {
  playPing(level);
  buzz(level >= 2 ? [0, 220, 90, 220, 90, 220, 90, 500]
     : level === 1 ? [0, 130, 80, 130, 80, 220] : [0, 150]);
  ui.flash.classList.toggle('urgent', level >= 1);
  ui.flash.classList.toggle('alarm', level >= 2);
  ui.flash.hidden = true;
  void ui.flash.offsetWidth;
  ui.flash.hidden = false;
  setTimeout(() => { ui.flash.hidden = true; }, level >= 2 ? 1700 : 540);
  toast(level >= 2 ? 'ALARM' : level === 1 ? 'Urgent ping' : 'Ping',
        level >= 2 ? 3000 : 2500);
}

let lastPingAt = 0;
function sendPing(level) {
  const now = Date.now();
  /* The alarm is deliberate, so it is allowed to jump the rate limit. */
  if (level < 2 && now - lastPingAt < 900) return;
  lastPingAt = now;
  if (!dc || dc.readyState !== 'open') { toast('Not linked'); return; }
  sendCtl({ t: 'ping', level: level, urgent: level >= 1, id: ++pingSeq });
  playSent();
  buzz(level >= 2 ? [0, 90, 60, 90, 60, 90, 60, 300] : level === 1 ? [0, 60, 50, 60] : 25);
  ui.ping.classList.add('sent');
  setTimeout(() => ui.ping.classList.remove('sent'), 400);
  if (level >= 2) toast('Alarm sent', 2200);
}

/* ---------------- peer connection ---------------- */

function newPeer() {
  pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
  pc.ontrack = ev => {
    remoteStream = ev.streams[0] || new MediaStream([ev.track]);
    ui.remoteAudio.srcObject = remoteStream;
    ui.remoteAudio.play().catch(() => {});
    attachRemoteAnalyser();
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') {
      clearTimeout(recoverTimer);
      clearTimeout(standbyTimer);
      recovering = false;
      ui.dropBar.hidden = true;
      setPill('linked', 'LINKED');
      goLive();
    } else if (s === 'failed' || s === 'disconnected') {
      setPill('lost', s === 'failed' ? 'LOST' : 'DROPPED');
      scheduleRecovery();
    }
  };
  return pc;
}

/* Opus only: smaller SDP, and no chance of falling back to a narrowband codec. */
function preferOpus() {
  try {
    const caps = RTCRtpSender.getCapabilities('audio');
    if (!caps) return;
    const opus = caps.codecs.filter(c => /opus/i.test(c.mimeType));
    if (!opus.length) return;
    pc.getTransceivers().forEach(t => {
      const kind = (t.receiver && t.receiver.track && t.receiver.track.kind)
        || (t.sender && t.sender.track && t.sender.track.kind);
      if (kind === 'audio' && t.setCodecPreferences) t.setCodecPreferences(opus);
    });
  } catch (e) { /* not supported here */ }
}

async function capBitrate(bps) {
  const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
  if (!sender || !sender.getParameters) return;
  try {
    const p = sender.getParameters();
    p.encodings = (p.encodings && p.encodings.length) ? p.encodings : [{}];
    p.encodings[0].maxBitrate = bps;
    await sender.setParameters(p);
  } catch (e) { /* not supported here */ }
}

function gatheringDone(timeout = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const t = setTimeout(done, timeout);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/* ---------------- pairing by link ---------------- */

/* The camera is not quite the only channel the two phones share any more.
   AirDrop now reaches between Apple and some Android handsets, Quick Share
   goes the other way, and both run over Bluetooth and peer-to-peer Wi-Fi with
   no internet involved - so a URL can cross between the phones on its own.

   The code rides in the fragment, which never leaves the handset: a fragment
   is not sent to the server, so GitHub Pages never sees a line of it. */
function codeLink(code) {
  return location.origin + location.pathname + '#' + code;
}

async function shareCode(code) {
  const url = codeLink(code);
  if (navigator.share) {
    try { await navigator.share({ url: url, title: 'Girgir channel' }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied \u2014 send it to them', 4000);
  } catch (e) {
    toast('Could not share the link', 4000);
  }
}

/* Read once and wiped, because a reload must never try to use a description
   that has already been answered. */
function takeHash() {
  let hash = (location.hash || '').replace(/^#/, '').trim();
  try { hash = decodeURIComponent(hash).trim(); } catch (e) { /* leave as is */ }
  if (!hash.startsWith(PROTO)) return '';
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  return hash;
}

async function openFromLink(code) {
  if (code.charAt(2) === 'A') return handAnswerOver(code);
  try {
    await ensureMic();
  } catch (e) {
    toast('Microphone blocked. Allow it in site settings.', 5000);
    return;
  }
  setPill('pairing', 'PAIRING');
  teardownPeer();
  await consume(code, takeOffer);
}

/* An answer is no use to any page but the one still holding the matching
   offer. If that is this page, take it. Otherwise hand it to the tab that is,
   which is what a link opened from a notification needs - the browser may
   well give it a tab of its own. */
async function handAnswerOver(code) {
  if (pc && amOfferer && pc.connectionState !== 'connected') {
    await consume(code, takeAnswer);
    return;
  }
  if (!bus) {
    toast('Open that link on the phone that showed the code', 6000);
    return;
  }
  let claimed = false;
  const ack = ev => { if (ev.data && ev.data.t === 'got') claimed = true; };
  bus.addEventListener('message', ack);
  bus.postMessage({ t: 'answer', code: code });
  setTimeout(() => {
    bus.removeEventListener('message', ack);
    if (claimed) toast('Reply handed to the waiting app', 3000);
    else toast('That reply belongs to the phone that showed the code', 6000);
  }, 1500);
}

function initBus() {
  try { bus = new BroadcastChannel('girgir'); } catch (e) { bus = null; return; }
  bus.onmessage = ev => {
    const m = ev.data;
    if (!m || m.t !== 'answer') return;
    if (!pc || !amOfferer || pc.connectionState === 'connected') return;
    bus.postMessage({ t: 'got' });
    consume(m.code, takeAnswer).catch(() => {});
  };
}

/* ---------------- pairing flow ---------------- */

/* Hosting is symmetric: this phone shows an offer and watches for a code at
   the same time, so both ends can do exactly this and still link up. That is
   what makes standby work - neither phone has to be told which one is
   hosting, and nothing has to be pressed in between. */
async function host(step, hint) {
  try {
    await ensureMic();
  } catch (e) {
    toast('Microphone blocked. Allow it in site settings.', 5000);
    return;
  }
  teardownPeer();
  setPill('pairing', step === 'STANDBY' ? 'STANDBY' : 'PAIRING');
  amOfferer = true;
  newPeer();
  wireChannel(pc.createDataChannel('ctl', { ordered: true }));
  micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
  preferOpus();
  await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: true }));
  await gatheringDone();
  standbyCode = await packDesc('O', pc.localDescription.sdp);
  showCode(standbyCode, step, hint, 'Scan full screen instead',
    () => openScanner(step, 'Scan the code the other phone shows.', takeStandby),
    takeStandby, standbyFilter);
}

function createChannel() {
  return host('STEP 1 OF 2',
    'Send it as a link, let the other phone scan it, or just point the two ' +
    'phones at each other.');
}

/* A page that has been closed takes its code with it: the ICE credentials and
   the DTLS fingerprint died with it, so something fresh has to cross the gap
   and no stored code can stand in. Standby makes that crossing as small as it
   can be. Both ends show a code and both watch through the camera, so you
   point the phones at each other and nothing else happens by hand. */
function standby() {
  return host('STANDBY',
    'Point the two phones at each other. Whichever is ready first waits for the other.');
}

/* Both phones see the other's offer, so they need the same rule for who gives
   way, settled with no exchange at all: the lower-sorting code answers. The
   codes carry random ICE credentials, so they can never tie. */
function standbyFilter(code) {
  if (!standbyCode || code === standbyCode) return false;
  if (code.charAt(2) === 'A') return true;
  return code > standbyCode;
}

async function takeStandby(code) {
  if (String(code).charAt(2) === 'A') return takeAnswer(code);
  /* Giving way: drop this phone's own offer and answer theirs instead. */
  teardownPeer();
  return takeOffer(code);
}

async function joinChannel() {
  try {
    await ensureMic();
  } catch (e) {
    toast('Microphone blocked. Allow it in site settings.', 5000);
    return;
  }
  setPill('pairing', 'PAIRING');
  openScanner('STEP 1 OF 2', 'Scan the code on the other phone.', takeOffer);
}

async function takeOffer(code) {
  amOfferer = false;
  const { role, sdp } = await unpackDesc(code);
  if (role !== 'O') throw new Error('That is the wrong code — scan the one from "Create channel".');
  newPeer();
  pc.ondatachannel = ev => wireChannel(ev.channel);
  await pc.setRemoteDescription({ type: 'offer', sdp });
  micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
  preferOpus();
  await pc.setLocalDescription(await pc.createAnswer());
  await gatheringDone();
  const answer = await packDesc('A', pc.localDescription.sdp);
  showCode(answer, 'STEP 2 OF 2',
    'Send this back as a link, or let their phone scan it. You will connect automatically.',
    'Waiting for them…', () => { if (pc.connectionState !== 'connected') toast('Still waiting for them to scan'); });
}

async function takeAnswer(code) {
  const { role, sdp } = await unpackDesc(code);
  if (role !== 'A') throw new Error('That is the wrong code — scan their reply code.');
  /* The reply can be caught from either screen, so show the same thing on
     both rather than leaving the code screen sitting there. */
  ui.camWrap.hidden = true;
  ui.scanStep.textContent = 'CONNECTING';
  ui.scanHint.textContent = 'Linking up…';
  show('scan');
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

function showCode(code, step, hint, nextLabel, onNext, watchHandler, watchFilter) {
  ui.btnShare.onclick = () => shareCode(code);
  ui.shareRow.hidden = false;
  ui.codeStep.textContent = step;
  ui.codeHint.textContent = hint;
  ui.codeText.value = code;
  ui.btnNext.textContent = nextLabel;
  ui.btnNext.onclick = onNext;
  show('code');
  ui.watching.hidden = true;
  requestAnimationFrame(() => {
    try { drawQR(code, ui.qrCanvas); }
    catch (e) { toast('Code too long for a QR — use the text option', 5000); }
  });
  if (watchHandler) watchForAnswer(watchHandler, watchFilter);
}

function drawQR(text, canvas) {
  const qr = qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  const total = n + quiet * 2;
  const target = Math.min(canvas.clientWidth || 340, 420);
  const scale = Math.max(2, Math.floor(target * Math.min(window.devicePixelRatio || 1, 3) / total));
  const size = scale * total;
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
}

/* ---------------- scanner ---------------- */

/* Chrome on Android decodes QR natively, so the 130KB decoder is only
   downloaded — and only ever cached — on phones that actually need it. */
async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('qr_code')) return null;
    return new window.BarcodeDetector({ formats: ['qr_code'] });
  } catch (e) { return null; }
}

function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (jsqrLoad) return jsqrLoad;
  jsqrLoad = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsQR.min.js';
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return jsqrLoad;
}

/* The camera and the decode loop are shared, because the creator watches for
   the reply from the code screen while the joiner scans from the scan screen.
   Only one of those is ever on, so a single stream is enough. */
async function startCamera(videoEl) {
  const detector = await nativeDetector();
  if (!detector) {
    try { await loadJsQR(); }
    catch (e) { toast('QR reader unavailable - paste the code instead', 5000); }
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } catch (e) {
    return { ok: false, detector: null };
  }
  videoEl.srcObject = scanStream;
  await videoEl.play().catch(() => {});
  scanning = true;
  return { ok: true, detector: detector };
}

/* Paced by a timer rather than requestAnimationFrame. Decoding does not need
   to line up with frames, ten looks a second is plenty, and rAF stops
   entirely whenever the page is not being painted - which would silently
   freeze scanning. */
const SCAN_INTERVAL_MS = 100;

/* A filter lets the loop pass over a code it is not meant to act on - the
   other phone's offer when this one is staying host - and keep looking
   instead of stopping on it. */
function runScanLoop(videoEl, detector, handler, filter) {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let busy = false;

  const tick = async () => {
    if (!scanning) return;
    const v = videoEl;
    if (!busy && v.readyState >= 2 && v.videoWidth) {
      busy = true;
      try {
        const side = Math.min(v.videoWidth, v.videoHeight);
        const sz = Math.min(side, 760);
        canvas.width = sz;
        canvas.height = sz;
        g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2,
                    side, side, 0, 0, sz, sz);
        let text = null;
        if (detector) {
          const codes = await detector.detect(canvas);
          if (codes && codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          const img = g.getImageData(0, 0, sz, sz);
          const found = jsQR(img.data, sz, sz, { inversionAttempts: 'dontInvert' });
          if (found) text = found.data;
        }
        if (text && text.startsWith(PROTO) && (!filter || filter(text))) {
          buzz(30);
          consume(text, handler);
          return;
        }
      } catch (e) { /* skip this frame */ }
      busy = false;
    }
    rafId = setTimeout(tick, SCAN_INTERVAL_MS);
  };
  rafId = setTimeout(tick, 0);
}

/* Watching for the reply from behind the code, so the creator never has to
   press anything between the two scans. There is no way to know the other
   phone has scanned - no channel exists until its answer arrives - so the
   camera simply stays open and waits. */
async function watchForAnswer(handler, filter) {
  const started = await startCamera(ui.codeCam);
  if (!started.ok) { ui.watching.hidden = true; return; }
  ui.watching.hidden = false;
  runScanLoop(ui.codeCam, started.detector, handler, filter);
}

async function openScanner(step, hint, handler) {
  /* The code screen may already be holding the camera. */
  stopScanner();
  ui.scanStep.textContent = step;
  ui.scanHint.textContent = hint;
  ui.camWrap.hidden = false;
  ui.pasteText.value = '';
  ui.btnPaste.onclick = () => consume(ui.pasteText.value, handler);
  show('scan');

  const started = await startCamera(ui.cam);
  if (!started.ok) {
    toast('Camera blocked — paste the code instead', 5000);
    return;
  }
  runScanLoop(ui.cam, started.detector, handler);
}

function stopScanner() {
  scanning = false;
  clearTimeout(rafId);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  ui.cam.srcObject = null;
  ui.codeCam.srcObject = null;
  ui.watching.hidden = true;
}

async function consume(code, handler) {
  stopScanner();
  try {
    await handler(String(code).trim());
  } catch (e) {
    toast(e.message || 'That code could not be read', 5000);
    show('setup');
    setPill('idle', 'IDLE');
  }
}

/* ---------------- live session ---------------- */

function attachRemoteAnalyser() {
  const ctx = audio();
  if (!ctx || !remoteStream) return;
  try {
    remoteAnalyser = ctx.createAnalyser();
    remoteAnalyser.fftSize = 512;
    ctx.createMediaStreamSource(remoteStream).connect(remoteAnalyser);
  } catch (e) { remoteAnalyser = null; }
}

/* Remembers only which side you were on, so resuming puts each phone back on
   the right half of a fresh pairing. The old session itself cannot be
   restored - its codes die with the page. */
function rememberChannel() {
  try { localStorage.setItem(LAST_KEY, amOfferer ? 'O' : 'A'); } catch (e) {}
}

function forgetChannel() {
  try { localStorage.removeItem(LAST_KEY); } catch (e) {}
}

function initResume() {
  let last = '';
  try { last = localStorage.getItem(LAST_KEY) || ''; } catch (e) {}
  if (last !== 'O' && last !== 'A') return;
  ui.resumeText.textContent =
    'You were in a channel. Return puts this phone on standby \u2014 point the ' +
    'two phones at each other and they link up by themselves.';
  ui.resumeBar.hidden = false;
  ui.btnResume.onclick = () => {
    ui.resumeBar.hidden = true;
    standby().catch(e => toast(e.message || 'Could not start', 5000));
  };
  ui.btnResumeHide.onclick = () => { forgetChannel(); ui.resumeBar.hidden = true; };
}

function goLive() {
  rememberChannel();
  if (!ui.views.live.hidden) return;
  stopScanner();
  show('live');
  setMode(mode);
  updateTalk();
  updateStatus();
  initVolume();
  initOutput();
  capBitrate(32000);
  requestWakeLock();
  initMediaSession();
  setSessionState(true);
  startMeters();
}

function levelOf(analyser, buf) {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

let meterRaf = 0;
function startMeters() {
  const bufA = new Uint8Array(256), bufB = new Uint8Array(256);
  const step = () => {
    if (!ui.views.live.hidden) {
      if (micAnalyser) {
        const l = live ? levelOf(micAnalyser, bufA) : 0;
        ui.meterYou.style.width = Math.min(100, l * 320) + '%';
      }
      if (remoteAnalyser) {
        const l = levelOf(remoteAnalyser, bufB);
        ui.meterThem.style.width = Math.min(100, l * 320) + '%';
      }
    }
    meterRaf = requestAnimationFrame(step);
  };
  cancelAnimationFrame(meterRaf);
  meterRaf = requestAnimationFrame(step);
}

async function requestWakeLock() {
  try {
    if (keepAwake && navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* denied or unsupported */ }
}

function hangUp() {
  setLive(false);
  stopHeartbeat();
  stopScanner();
  clearTimeout(standbyTimer);
  cancelAnimationFrame(meterRaf);
  if (dc) { try { dc.close(); } catch (e) {} dc = null; }
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  remoteStream = null;
  remoteAnalyser = null;
  remoteLive = false;
  peerName = '';
  updateNames();
  lastLost = lastRecv = null;
  ui.remoteAudio.srcObject = null;
  ui.codeText.value = '';
  ui.pasteText.value = '';
  ui.meterYou.style.width = '0%';
  ui.meterThem.style.width = '0%';
  ui.vBattThem.textContent = '—';
  ui.vNet.textContent = '—';
  forgetChannel();
  ui.dropBar.hidden = true;
  setPill('idle', 'IDLE');
  show('setup');
}

/* ---------------- storage ---------------- */

async function renderStorage() {
  let text = '—';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est && est.usage != null) text = fmtBytes(est.usage);
    }
  } catch (e) { /* unsupported */ }
  ui.storeUsed.textContent = text;
}

let clearArmed = 0;
async function clearData() {
  if (Date.now() - clearArmed > 4000) {
    clearArmed = Date.now();
    ui.btnClear.textContent = 'Tap again to clear';
    setTimeout(() => {
      if (Date.now() - clearArmed >= 4000) ui.btnClear.textContent = 'Clear cache';
    }, 4100);
    return;
  }
  clearArmed = 0;
  ui.btnClear.textContent = 'Clear cache';
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) { /* no cache storage */ }
  try { localStorage.removeItem('girgir'); } catch (e) {}
  try { localStorage.removeItem(INSTALLED_KEY); } catch (e) {}
  try { localStorage.removeItem(NAME_KEY); } catch (e) {}
  try { localStorage.removeItem(LAST_KEY); } catch (e) {}
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) {}
  toast('Cleared. Reload while online to reinstall.', 6000);
  renderStorage();
}

/* ---------------- input wiring ---------------- */

ui.btnCreate.onclick = () => createChannel().catch(e => toast(e.message || 'Could not start', 5000));
ui.btnJoin.onclick = () => joinChannel().catch(e => toast(e.message || 'Could not start', 5000));
ui.cancel1.onclick = hangUp;
ui.cancel2.onclick = () => { stopScanner(); hangUp(); };
ui.hangup.onclick = hangUp;

function openHelp() {
  if (!ui.views.help.hidden) { show(helpReturn); return; }
  helpReturn = Object.keys(ui.views).find(k => !ui.views[k].hidden) || 'setup';
  show('help');
  renderStorage();
}
ui.help.onclick = openHelp;
ui.btnGuide.onclick = openHelp;
ui.helpBack.onclick = () => show(helpReturn);
ui.btnClear.onclick = clearData;

ui.btnCopy.onclick = async () => {
  try { await navigator.clipboard.writeText(ui.codeText.value); toast('Code copied'); }
  catch (e) { ui.codeText.select(); toast('Select and copy the code'); }
};

document.querySelectorAll('.mode').forEach(b => {
  b.onclick = () => setMode(b.dataset.mode);
});

/* Talk button. Hold mode must treat every possible interruption as a release,
   or the microphone can be left open without anyone noticing. */
ui.talk.addEventListener('contextmenu', e => e.preventDefault());
ui.talk.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { ui.talk.setPointerCapture(e.pointerId); } catch (err) {}
  if (mode === 'hold') setLive(true);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.talk.addEventListener(type, () => {
    if (mode === 'hold') { setLive(false); return; }
    if (type !== 'pointerup') return;
    if (mode === 'latch') setLive(!live);
    else if (mode === 'open') { openMuted = !openMuted; setLive(!openMuted); updateTalk(); }
  });
});

/* Ping has three strengths: a tap, a half-second hold for the urgent triple,
   and the alarm - which needs either five seconds of holding or ten quick
   jabs, so it cannot be set off by accident. */
const ALARM_HOLD_MS = 5000;
const ALARM_TAPS = 10;
const ALARM_TAP_WINDOW = 5000;

function countRapidTap() {
  const now = Date.now();
  pingTaps = pingTaps.filter(t => now - t < ALARM_TAP_WINDOW);
  pingTaps.push(now);
  if (pingTaps.length >= ALARM_TAPS) {
    pingTaps = [];
    return true;
  }
  return false;
}

ui.ping.addEventListener('contextmenu', e => e.preventDefault());
ui.ping.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { ui.ping.setPointerCapture(e.pointerId); } catch (err) {}
  urgentArmed = false;
  clearTimeout(holdTimer);
  clearTimeout(alarmTimer);
  holdTimer = setTimeout(() => { urgentArmed = true; sendPing(1); }, 550);
  alarmTimer = setTimeout(() => {
    urgentArmed = true;
    ui.ping.classList.remove('arming');
    sendPing(2);
  }, ALARM_HOLD_MS);
  ui.ping.classList.add('arming');
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.ping.addEventListener(type, () => {
    clearTimeout(holdTimer);
    clearTimeout(alarmTimer);
    ui.ping.classList.remove('arming');
    if (type === 'pointerup' && !urgentArmed) {
      if (countRapidTap()) sendPing(2);
      else sendPing(0);
    }
    urgentArmed = false;
  });
});

/* Voice: a tap turns the disguise on or off, two taps move to the next one. */
ui.voice.addEventListener('contextmenu', e => e.preventDefault());
ui.voice.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastVoiceTap < 350) {
    clearTimeout(voiceTapTimer);
    lastVoiceTap = 0;
    cycleVoice();
    return;
  }
  lastVoiceTap = now;
  voiceTapTimer = setTimeout(() => {
    if (voice === 'off') { setVoice('robot'); toast('Voice: robot', 1600); }
    else { setVoice('off'); toast('Voice off', 1400); }
  }, 360);
});

ui.togHalf.onclick = () => {
  halfDuplex = !halfDuplex;
  ui.togHalf.setAttribute('aria-pressed', String(halfDuplex));
  syncDuck();
  save();
};
/* A cached index.html from an older version can be missing a control that the
   newer script wires up. Standing in for it keeps one absent node from
   aborting setup and leaving a dead screen. */
['vNet', 'btnRelink', 'sheet', 'btnSettings', 'btnSheetClose', 'micLvl', 'micVal',
  'togAwake', 'installBar', 'installText', 'btnInstall', 'btnInstallHide',
  'nameIn', 'labelYou', 'labelThem', 'routeRow', 'btnEarpiece', 'btnSpeaker',
  'resumeBar', 'resumeText', 'btnResume', 'btnResumeHide',
  'voice', 'voiceFace', 'voiceName', 'updateBar', 'updateText', 'btnUpdate',
  'verNow', 'verLatest', 'dropBar', 'dropText', 'btnDropPair',
  'watching', 'codeCam', 'shareRow', 'btnShare'].forEach(k => {
  if (!ui[k]) ui[k] = document.createElement('span');
});

function openSheet(on) {
  ui.sheet.hidden = !on;
}
ui.btnSettings.onclick = () => openSheet(ui.sheet.hidden);
ui.btnSheetClose.onclick = () => openSheet(false);
/* Tapping the backdrop closes it; taps inside the card must not. */
ui.sheet.addEventListener('click', e => { if (e.target === ui.sheet) openSheet(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') openSheet(false); });

ui.micLvl.addEventListener('input', () => setMicGain(+ui.micLvl.value));

ui.nameIn.addEventListener('input', () => setMyName(ui.nameIn.value, true));
ui.nameIn.addEventListener('blur', () => { ui.nameIn.value = myName; });

ui.togAwake.onclick = () => {
  keepAwake = !keepAwake;
  ui.togAwake.setAttribute('aria-pressed', String(keepAwake));
  if (keepAwake) requestWakeLock();
  else if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
};

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installEvent = e;
  if (isStandalone() || alreadyInstalled()) return;
  ui.installText.textContent = 'Install it so it runs with no internet.';
  ui.btnInstall.hidden = false;
  ui.installBar.hidden = false;
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  markInstalled();
});

ui.btnInstall.onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  let outcome = 'dismissed';
  try { outcome = (await installEvent.userChoice).outcome; } catch (e) {}
  installEvent = null;
  ui.btnInstall.hidden = true;
  if (outcome === 'accepted') markInstalled();
};

ui.btnInstallHide.onclick = markInstalled;

ui.btnUpdate.onclick = () => applyUpdate();
ui.btnDropPair.onclick = () => {
  ui.dropBar.hidden = true;
  clearTimeout(standbyTimer);
  standby().catch(e => toast(e.message || 'Could not start', 5000));
};

ui.btnRelink.onclick = () =>
  relink().catch(e => toast(e.message || 'Could not relink', 5000));

ui.togRoger.onclick = () => {
  rogerBeep = !rogerBeep;
  ui.togRoger.setAttribute('aria-pressed', String(rogerBeep));
  save();
};

/* Safety releases. */
window.addEventListener('blur', releaseHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseHold();
  else requestWakeLock();
});

if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (micRawTrack) showInput();
    if (!ui.views.live.hidden) refreshOutputs();
  });
}

/* ---------------- boot ---------------- */

purgeStoredData();
load();
document.querySelectorAll('.mode').forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
setMicGain(micGain);
updateVoiceBtn();
checkVersion();
watchWorkerUpdates();
loadName();
initInstall();
initBus();
initResume();
ui.togAwake.setAttribute('aria-pressed', String(keepAwake));
ui.togHalf.setAttribute('aria-pressed', String(halfDuplex));
ui.togRoger.setAttribute('aria-pressed', String(rogerBeep));
updateTalk();
setPill('idle', 'IDLE');
initBattery();

if (!navigator.mediaDevices || !window.RTCPeerConnection) {
  ui.btnCreate.disabled = ui.btnJoin.disabled = true;
  toast('This browser cannot do WebRTC. Open the page over HTTPS.', 8000);
}

/* Phones without a native QR decoder fetch the fallback now, while there is
   still a network, so that pairing works offline later. */
nativeDetector().then(d => { if (!d) loadJsQR().catch(() => {}); });

/* A code may have arrived in the link that opened this page, or in one opened
   while it was already running. */
window.addEventListener('hashchange', () => {
  const code = takeHash();
  if (code) openFromLink(code).catch(e => toast(e.message || 'That link could not be used', 5000));
});

const linkCode = takeHash();
if (linkCode) openFromLink(linkCode).catch(e => toast(e.message || 'That link could not be used', 5000));

/* isSecureContext is the browser's own verdict, so it also covers a LAN
   origin whitelisted for testing, which a protocol/hostname check misses. */
const secureHere = window.isSecureContext === true;
if ('serviceWorker' in navigator && window === window.top && secureHere) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

})();
