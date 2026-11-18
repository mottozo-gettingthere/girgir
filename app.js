/* Girgir — peer-to-peer LAN intercom. No server, no internet.
   Signalling is a two-step QR exchange; audio and control run over WebRTC. */
(() => {
'use strict';

const PROTO = 'E1';
const $ = id => document.getElementById(id);

/* This tool keeps no records: no history, no recordings, no settings carried
   between launches. Flip this to true if you would rather it remembered your
   mode, toggles and volume. */
/* Must match the number in version.json and the cache name in sw.js.

   This is version 12's code, shipped above 35. The number had to go up: the
   updater only ever offers a build newer than the installed one, and a phone
   running 35 would never be offered a 12, so a revert shipped as 12 would
   reach nobody. The settings line says which code is actually running. */
const APP_VERSION = 56;
const CODE_OF = 12;

/* Shown as 0.NN. The updater still compares the whole number, so a phone on
   45 is offered 46 exactly as before. */
function verText(n) { return '0.' + String(n).padStart(2, '0'); }

const REMEMBER_SETTINGS = false;
const INSTALLED_KEY = 'girgir-installed';
const NAME_KEY = 'girgir-name';
const LAST_KEY = 'girgir-last';
const KEEP_KEYS = [INSTALLED_KEY, NAME_KEY, LAST_KEY];

const ui = {
  brandDot: $('brandDot'), pill: $('statePill'), bars: $('bars'), help: $('btnHelp'),
  views: {
    setup: $('viewSetup'), help: $('viewHelp'), code: $('viewCode'),
    scan: $('viewScan'), live: $('viewLive'), drill: $('viewDrill')
  },
  btnDrill: $('btnDrill'), drillPrompt: $('drillPrompt'), drillSub: $('drillSub'),
  drillPanel: $('drillPanel'), drillSyms: $('drillSyms'), drillCands: $('drillCands'),
  drillChoices: $('drillChoices'), drillKey: $('drillKey'), drillFeedback: $('drillFeedback'),
  drillScore: $('drillScore'), btnDrillSend: $('btnDrillSend'), btnDrillHear: $('btnDrillHear'),
  btnDrillDigits: $('btnDrillDigits'), btnDrillMarks: $('btnDrillMarks'),
  btnDrillReplay: $('btnDrillReplay'), btnDrillSkip: $('btnDrillSkip'),
  btnDrillBack: $('btnDrillBack'), btnDrillChart: $('btnDrillChart'),
  morseSheet: $('morseSheet'), morseChart: $('morseChart'), btnMorseClose: $('btnMorseClose'),
  btnDrillLive: $('btnDrillLive'), drillTogs: $('drillTogs'), freeKeyer: $('freeKeyer'),
  freePhrase: $('freePhrase'), btnMorse: $('btnMorse'), callKeyer: $('callKeyer'),
  callPhrase: $('callPhrase'),
  btnCreate: $('btnCreate'), btnJoin: $('btnJoin'), btnGuide: $('btnGuide'),
  helpBack: $('btnHelpBack'), storeUsed: $('storeUsed'), btnClear: $('btnClear'),
  codeStep: $('codeStep'), codeHint: $('codeHint'), qrCanvas: $('qrCanvas'),
  btnNext: $('btnNext'), codeText: $('codeText'), btnCopy: $('btnCopy'),
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
  togHalf: $('togHalf'), togRoger: $('togRoger'), togRange: $('togRange'),
  groupRow: $('groupRow'), btnAdd: $('btnAdd'),
  meters: document.querySelector('#viewLive .meters'), hangup: $('btnHangup'),
  vNet: $('vNet'), btnRelink: $('btnRelink'),
  sheet: $('sheet'), btnSettings: $('btnSettings'), btnSheetClose: $('btnSheetClose'),
  installBar: $('installBar'), installText: $('installText'), btnInstall: $('btnInstall'),
  btnInstallHide: $('btnInstallHide'), nameIn: $('nameIn'),
  routeRow: $('routeRow'), btnEarpiece: $('btnEarpiece'), btnSpeaker: $('btnSpeaker'),
  voice: $('voiceBtn'), voiceFace: $('voiceFace'), voiceName: $('voiceName'),
  updateBar: $('updateBar'), updateText: $('updateText'), btnUpdate: $('btnUpdate'),
  verNow: $('verNow'), verLatest: $('verLatest'), verFoot: $('verFoot'),
  dropBar: $('dropBar'), dropText: $('dropText'), btnDropPair: $('btnDropPair'),
  watching: $('watching'), codeCam: $('codeCam'),
  btnCamSwitch: $('btnCamSwitch'), btnCamSwitch2: $('btnCamSwitch2'),
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
let extras = [], adding = null, hub = null, hubTimer = 0;
let extraSeq = 0, relaySeq = 0, groupSize = 0, peerTalker = '';
let savedCancel1 = null, savedCancel2 = null;

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

/* Two phones on the same Wi-Fi only ever need their Wi-Fi addresses. A phone
   with mobile data on also offers its carrier address and a global IPv6 one,
   and the browser will happily try those, pick one that answers through the
   internet, and then lose it - which shows up as linking and dropping on that
   phone alone, while a phone on Wi-Fi only links every time. So every
   description that crosses between the phones, in either direction, keeps
   only UDP routes on a private IPv4 address (or a .local name standing in for
   one). A pair of private addresses can only work on a shared local network,
   so nothing that survives this can lead anywhere else. If a phone somehow
   has no such address, its description passes through untouched rather than
   being emptied. */
function isLocalAddr(a) {
  if (/\.local$/i.test(a)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(a);
  if (!m) return false;
  const x = +m[1], y = +m[2];
  return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
}

function localOnly(sdp) {
  const lines = String(sdp).split('\r\n');
  const isCand = l => l.startsWith('a=candidate:');
  const keep = l => {
    const c = /^a=candidate:\S+ \d+ (\S+) \d+ (\S+) \d+ typ host/i.exec(l);
    return !!c && c[1].toLowerCase() === 'udp' && isLocalAddr(c[2]);
  };
  if (!lines.some(l => isCand(l) && keep(l))) return String(sdp);
  return lines.filter(l => !isCand(l) || keep(l)).join('\r\n');
}

/* A code is PROTO + role(O|A) + format(D|Z|P) + base64url payload. */
async function packDesc(role, sdp) {
  const bytes = new TextEncoder().encode(trimSdp(localOnly(sdp)));
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
  return { role, sdp: localOnly(new TextDecoder().decode(bytes)) };
}

/* ---------------- audio ---------------- */

function audio() {
  if (!actx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    actx = new C();
  }
  /* iOS also has an "interrupted" state (a call, Siri, the microphone
     starting), and a context left in it sends silence. */
  if (actx.state !== 'running' && actx.state !== 'closed') actx.resume().catch(() => {});
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
  syncExtrasOutput();
  clearTimeout(duckTimer);
  duckTimer = setTimeout(syncDuck, ms);
}
function syncDuck() {
  /* In open channel both sides transmit continuously, so ducking on `live`
     would mute the other person for the whole call. It only means anything
     while a press-to-talk gate is what opens the mic. */
  ui.remoteAudio.muted = halfDuplex && live && mode !== 'open';
  syncExtrasOutput();
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
      syncExtrasOutput();
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
    try { await ui.remoteAudio.setSinkId(ui.outSel.value); syncExtrasOutput(); }
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

/* The microphone is held only while it is needed. A page that keeps it open
   keeps it from every other app on the phone - voice notes, calls, the
   camera - even while muted, because muting only silences what is sent. So
   the link stays up the whole time but the microphone itself is opened for
   pairing and for talking, and let go MIC_IDLE_MS after you stop; leaving
   the app, another app taking the microphone, or ending the call let go at
   once. Pressing to talk takes it back, which needs no new permission.

   What goes out is the Web Audio graph's own track (for the mic level and
   voices), which stays put; only the source feeding it comes and goes, so
   nothing is renegotiated. When the graph is unavailable, or has been
   bypassed, the sender's track is swapped instead. */
const MIC_IDLE_MS = 15000;
const MIC_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  video: false
};
let graphReady = false, micSource = null, micOpening = null, micReleaseTimer = 0;

function audioSender() {
  if (!pc) return null;
  const t = pc.getTransceivers().find(tr =>
    (tr.sender.track && tr.sender.track.kind === 'audio') ||
    (tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'audio'));
  return t ? t.sender : null;
}

function micIsOpen() {
  return !!(micRawTrack && micRawTrack.readyState === 'live');
}

function buildGraph() {
  graphReady = true;
  const ctx = audio();
  if (!ctx) return;
  try {
    micGainNode = ctx.createGain();
    micGainNode.gain.value = micGain / 100;
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 512;
    micDest = ctx.createMediaStreamDestination();
    micGainNode.connect(micAnalyser);
    micGainNode.connect(micDest);
    micStream = micDest.stream;
    micTrack = micStream.getAudioTracks()[0];
    micTrack.enabled = live;
  } catch (e) {
    micGainNode = null;
    micAnalyser = null;
    micDest = null;
  }
}

function attachCapture() {
  if (micDest && !micDirect) {
    micSource = actx.createMediaStreamSource(micRaw);
    micSource.connect(micGainNode);
    return;
  }
  micStream = micRaw;
  micTrack = micRawTrack;
  micTrack.enabled = live;
  const sender = audioSender();
  if (sender) sender.replaceTrack(micRawTrack).catch(() => {});
}

function acquireMic() {
  clearTimeout(micReleaseTimer);
  if (micIsOpen()) return Promise.resolve();
  if (micOpening) return micOpening;
  micOpening = (async () => {
    const s = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    micRaw = s;
    micRawTrack = s.getAudioTracks()[0];
    micRawTrack.addEventListener('ended', () => toast('Microphone disconnected', 5000));
    /* The phone handed the microphone to another app: let go rather than
       hold a silent claim on it. */
    micRawTrack.addEventListener('mute', () => { if (!live) releaseMic(); });
    showInput();
    if (!graphReady) buildGraph();
    attachCapture();
    if (extras.length) hubWire();
  })().finally(() => { micOpening = null; });
  return micOpening;
}

function releaseMic() {
  clearTimeout(micReleaseTimer);
  if (!micIsOpen()) return;
  if (micSource) { try { micSource.disconnect(); } catch (e) {} micSource = null; }
  if (!micDest || micDirect) {
    const sender = audioSender();
    if (sender) sender.replaceTrack(null).catch(() => {});
  }
  micRaw.getTracks().forEach(t => t.stop());
  ui.vInput.textContent = 'FREE';
  ui.vInput.title = 'Microphone released - other apps can use it. Press to talk takes it back.';
}

function scheduleMicRelease(ms = MIC_IDLE_MS) {
  clearTimeout(micReleaseTimer);
  micReleaseTimer = setTimeout(() => { if (!live) releaseMic(); }, ms);
}

async function ensureMic() {
  await acquireMic();
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
  if (on) {
    audio();
    acquireMic()
      .then(() => { if (micTrack) micTrack.enabled = live; })
      .catch(() => toast('Microphone blocked. Allow it in site settings.', 5000));
    watchMic();
  } else {
    clearInterval(micWatch);
    if (pc && pc.connectionState === 'connected') scheduleMicRelease();
  }
  syncDuck();
  sendMicState();
  if (on) buzz(12);
  setSessionState(on || mode === 'open');
  updateTalk();
  updateStatus();
}

/* What you say reaches the call through Web Audio (for the mic level and the
   voices). An iPhone can stop that graph - Safari suspends or interrupts the
   context, and some versions feed silence into a context made before the
   microphone opened - and then the other phone hears nothing while this one
   shows LIVE. So while live, check the graph is running and producing sound.
   If it stays dead for a few seconds while the microphone itself is fine,
   send the microphone straight to the call instead, for the rest of this
   page's life. Mic level and voices stop applying, and a toast says so. */
let micDirect = false, micWatch = 0, micDeadSince = 0;

function watchMic() {
  clearInterval(micWatch);
  micDeadSince = 0;
  if (micDirect || !micDest || !micRawTrack) return;
  const buf = micAnalyser ? new Float32Array(micAnalyser.fftSize) : null;
  micWatch = setInterval(() => {
    if (!live || micDirect) { clearInterval(micWatch); return; }
    let dead = !actx || actx.state !== 'running';
    if (dead && actx) actx.resume().catch(() => {});
    /* A real microphone never gives exact zeros, even in a silent room;
       a stalled graph gives nothing else. A level of 0 is a deliberate
       silence, so it is left alone. */
    if (!dead && buf && micGain > 0) {
      micAnalyser.getFloatTimeDomainData(buf);
      dead = buf.every(v => v === 0);
    }
    if (!dead || micRawTrack.readyState !== 'live' || micRawTrack.muted) { micDeadSince = 0; return; }
    if (!micDeadSince) micDeadSince = Date.now();
    else if (Date.now() - micDeadSince > 2500) micGoDirect();
  }, 500);
}

function micGoDirect() {
  clearInterval(micWatch);
  micDirect = true;
  if (micSource) { try { micSource.disconnect(); } catch (e) {} micSource = null; }
  micStream = micRaw;
  micTrack = micRawTrack;
  micTrack.enabled = live;
  const sender = audioSender();
  if (sender) sender.replaceTrack(micRawTrack).catch(() => {});
  if (extras.length) hubWire();
  toast('Your voice is now sent straight from the microphone. Mic level and voices are off for this call.', 7000);
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
  else {
    const r = remoteTalkers();
    if (r.any) {
      if (r.who) {
        s.textContent = '';
        const b = document.createElement('bdi');
        b.textContent = clipText(r.who.toUpperCase(), 22);
        s.append(b, ' TALKING');
      } else s.textContent = 'THEY’RE TALKING';
      s.classList.add('rx');
    } else s.textContent = 'QUIET';
  }
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
    sendMicState();
    sendCtl({ t: 'name', name: myName });
    if (extras.length) sendGroup();
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
      peerTalker = cleanList(m.who);
      if (spoke && !remoteLive && rogerBeep) playRoger();
      updateStatus();
      if (extras.length) { sendMicState(); renderGroup(); }
    }
    else if (m.t === 'ping') {
      const lvl = typeof m.level === 'number' ? m.level : (m.urgent ? 1 : 0);
      receivePing(Math.max(0, Math.min(2, lvl)), cleanList(m.from) || (extras.length ? peerName : ''));
      sendCtl({ t: 'ack', id: m.id });
    }
    else if (m.t === 'name') {
      peerName = cleanName(m.name);
      renderGroup();
      if (extras.length) sendRoster();
    }
    else if (m.t === 'roster') { takeRoster(m); }
    else if (m.t === 'lv') { takeLevels(m); }
    else if (m.t === 'reoffer') { takeReoffer(m.sdp); }
    else if (m.t === 'ask-reoffer') { attemptRecovery(true); }
    else if (m.t === 'reanswer') { takeReanswer(m.sdp); }
    else if (m.t === 'bye') {
      toast((peerName || 'They') + ' are re-pairing - tap Join channel', 8000);
    }
    else if (m.t === 'ack') { if (String(m.id).charAt(0) !== 'r') toast('Ping delivered'); }
    else if (m.t === 'group') { groupSize = Math.max(0, Math.min(99, m.size | 0)); updateNames(); }
    else if (m.t === 'removed') { toast('You were taken off the channel', 5000); hangUp(); return; }
    else if (m.t === 'range') {
      const on = !!m.long;
      if (on !== longRange) {
        setLongRange(on, extras.length > 0);
        toast((cleanList(m.from) || peerName || 'They') + (on ? ' turned on long range' : ' turned long range off'), 3000);
      }
    }
    else if (m.t === 'mword' || m.t === 'mbreak' || m.t === 'mclear') {
      showShared(m, cleanList(m.from) || peerName || 'They');
    }
    else if (m.t === 'hb') { sendCtl({ t: 'hbr', ts: m.ts }); }
    else if (m.t === 'hbr') { rtt = Math.round(performance.now() - m.ts); }
    else if (m.t === 'stat' && m.batt) {
      ui.vBattThem.textContent = m.batt.lvl + '%' + (m.batt.chg ? '+' : '');
      ui.vBattThem.classList.toggle('bad', m.batt.lvl <= 15 && !m.batt.chg);
      ui.vBattThem.classList.toggle('warn', m.batt.lvl > 15 && m.batt.lvl <= 30 && !m.batt.chg);
    }
    if (RELAY_TYPES.has(m.t)) relay('p', m);
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
  /* A member's view of the group came from this link. */
  roster = null;
  lvMap = {};
  renderGroup();
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
/* Names can be any script or emoji, so they are counted and cut by what a
   reader sees as one character (a grapheme), never mid-emoji or mid-letter.
   Control characters go, and so do the direction overrides that could make
   a name display as something else; the joiners emoji and Arabic need stay. */
const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter)
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
function graphemes(v) {
  const s = String(v);
  return segmenter ? Array.from(segmenter.segment(s), x => x.segment) : Array.from(s);
}
function clipText(v, n, units = 96) {
  let g = graphemes(v).slice(0, n);
  while (g.length && g.join('').length > units) g.pop();
  return g.join('');
}
function cleanText(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
}
function cleanName(v) {
  return clipText(cleanText(v), 12, 64).trim();
}

function updateNames() {
  ui.labelYou.textContent = myName ? myName + ' (me)' : 'YOU';
  const people = joinedExtras();
  const first = (primaryUp() || !people.length) ? (peerName || 'THEM') : (people[0].name || 'THEM');
  const more = (primaryUp() ? people.length : Math.max(0, people.length - 1)) + Math.max(0, groupSize - 2);
  ui.labelThem.textContent = first + (more ? ' +' + more : '');
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
  if (!ui.groupRow.hidden) renderGroup();
  if (announce) sendAll({ t: 'name', name: myName });
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
  if (primaryLeftGroup()) return;
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
    if (primaryLeftGroup()) return;
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
    /* Safari reveals this phone's address only while it is capturing. */
    await acquireMic().catch(() => {});
    if (!live) scheduleMicRelease();
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
    await gatheringDone();
    sendCtl({ t: 'reoffer', sdp: localOnly(pc.localDescription.sdp) });
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
    await acquireMic().catch(() => {});
    if (!live) scheduleMicRelease();
    await pc.setRemoteDescription({ type: 'offer', sdp: localOnly(sdp) });
    await pc.setLocalDescription(await pc.createAnswer());
    await gatheringDone();
    sendCtl({ t: 'reanswer', sdp: localOnly(pc.localDescription.sdp) });
  } catch (e) {
    toast('Could not relink by itself - tap Relink', 6000);
  }
  recovering = false;
  settlePill();
}

async function takeReanswer(sdp) {
  if (!pc) return;
  try { await pc.setRemoteDescription({ type: 'answer', sdp: localOnly(sdp) }); }
  catch (e) { toast('Could not relink by itself - tap Relink', 6000); }
  recovering = false;
  settlePill();
}

/* The installed build is whatever this script says it is. version.json is
   fetched past the service worker, so it reports what the site serves now
   rather than what was cached - otherwise the app could only ever confirm its
   own version to itself. */
function showUpdate(latest) {
  ui.updateText.textContent = 'Version ' + verText(latest) + ' is out. You have ' +
    verText(APP_VERSION) + '. Update while you have internet.';
  ui.updateBar.hidden = false;
}

async function checkVersion() {
  ui.verNow.textContent = verText(APP_VERSION);
  if (!navigator.onLine) { ui.verLatest.textContent = ' \u00b7 offline'; return; }
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const latest = Number(data && data.version);
    if (!latest) return;
    if (latest > APP_VERSION) {
      ui.verLatest.textContent = ' \u00b7 ' + verText(latest) + ' available';
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

/* Clearing the caches and dropping the worker is the only way to be certain
   the new files land rather than being served from the old set. */
async function applyUpdate() {
  ui.btnUpdate.disabled = true;
  ui.updateText.textContent = 'Updating\u2026';
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch (e) { /* no cache storage */ }
  try {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { /* ignore */ }
  location.reload();
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

function receivePing(level, who) {
  playPing(level);
  buzz(level >= 2 ? [0, 220, 90, 220, 90, 220, 90, 500]
     : level === 1 ? [0, 130, 80, 130, 80, 220] : [0, 150]);
  ui.flash.classList.toggle('urgent', level >= 1);
  ui.flash.classList.toggle('alarm', level >= 2);
  ui.flash.hidden = true;
  void ui.flash.offsetWidth;
  ui.flash.hidden = false;
  setTimeout(() => { ui.flash.hidden = true; }, level >= 2 ? 1700 : 540);
  toast((who ? who + ': ' : '') + (level >= 2 ? 'ALARM' : level === 1 ? 'Urgent ping' : 'Ping'),
        level >= 2 ? 3000 : 2500);
}

let lastPingAt = 0;
function sendPing(level) {
  const now = Date.now();
  /* The alarm is deliberate, so it is allowed to jump the rate limit. */
  if (level < 2 && now - lastPingAt < 900) return;
  lastPingAt = now;
  if (!anyLinkOpen()) { toast('Not linked'); return; }
  sendAll({ t: 'ping', level: level, urgent: level >= 1, id: ++pingSeq });
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
    if (extras.length) hubWire();
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
      /* Say so when the cause is known, instead of a bare LOST. */
      if (s === 'failed') localNetState().then(st => { if (st === 'denied') toast(LNA_BLOCKED, 12000); });
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

/* Long range: a thinner voice stream for links that only carry a trickle,
   such as Wi-Fi HaLow at the edge of its reach. Measured in Chrome, a 12 kbps
   cap gives about 18 kbps of voice against about 32 kbps normally; packets
   stay at 50 a second, since browsers ignore a longer packet time here. It is
   a setting for this session only, and both phones follow whichever of them
   turns it on or off. */
const NORMAL_BPS = 32000;
const LONG_BPS = 12000;
let longRange = false;
function rangeBps() { return longRange ? LONG_BPS : NORMAL_BPS; }
function setLongRange(on, tell) {
  longRange = on;
  ui.togRange.setAttribute('aria-pressed', String(on));
  if (pc) capBitrate(rangeBps());
  extras.forEach(extraBitrate);
  if (tell) sendAll({ t: 'range', long: on });
}

async function capBitrate(bps) {
  if (!pc) return;
  /* The transceiver's sender, found even while the microphone is released
     and the sender has no track. */
  const sender = audioSender();
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
  checkLocalNetwork();
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
  /* The code already carries this phone's address, so a long wait - standby
     can last until the other person comes back - need not hold the
     microphone. A quick pairing finishes well before this. */
  scheduleMicRelease();
}

function createChannel() {
  return host('STEP 1 OF 2',
    'Let the other phone scan this \u2014 or just point the two phones at each other.');
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
  checkLocalNetwork();
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
  showCode(answer, 'STEP 2 OF 2', 'Let their phone scan this. You will connect automatically.',
    'Waiting for them…', () => { if (pc.connectionState !== 'connected') toast('Still waiting for them to scan'); });
  scheduleMicRelease();
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

/* Some phones open the camera for a web page with focus fixed wherever it
   started, so a screen held close stays blurred. Where the browser exposes
   focus control, ask for continuous autofocus, and let a tap on the picture
   force a fresh focus. Where it does not, nothing changes. */
function keepFocusing(stream, videoEl) {
  const track = stream.getVideoTracks()[0];
  let modes = [];
  try { modes = (track.getCapabilities && track.getCapabilities().focusMode) || []; }
  catch (e) { modes = []; }
  const set = mode => track.applyConstraints({ advanced: [{ focusMode: mode }] }).catch(() => {});
  if (modes.includes('continuous')) set('continuous');
  videoEl.onclick = !modes.includes('single-shot') ? null : () => {
    set('single-shot').then(() => setTimeout(() => {
      if (modes.includes('continuous') && track.readyState === 'live') set('continuous');
    }, 1500));
  };
}

/* Asking for the back camera gets whichever one the browser lists first, and
   on the Galaxy S25 Chrome hands over the wide-angle lens, which cannot focus
   on a screen held close. So the scanner offers a switch through the back
   cameras, and keeps the one picked for the rest of this session - in memory
   only, so the next launch starts from the browser's choice again. */
let camChoice = null;

function camConstraints(deviceId) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  else video.facingMode = { ideal: 'environment' };
  return { video };
}

async function backCameras() {
  let devs = [];
  try {
    devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  } catch (e) { devs = []; }
  const back = devs.filter(d => /back|rear|environment/i.test(d.label));
  return back.length >= 2 ? back : devs;
}

function focusModesOf(stream) {
  try {
    const t = stream.getVideoTracks()[0];
    const m = t.getCapabilities && t.getCapabilities().focusMode;
    return Array.isArray(m) ? m : null;
  } catch (e) { return null; }
}

/* On the S25 the camera Chrome opens reports manual focus only, and the next
   back camera reports autofocus and reads at once. So when the browser's pick
   offers focus modes but not autofocus, try the other cameras labelled as
   back ones, in the order listed, and keep the first that autofocuses. A
   browser that reports no focus modes at all is left alone, and so is any
   phone whose cameras are not labelled front and back - a front camera must
   never be picked for this. If none does better, the original is reopened. */
let camEpoch = 0;
async function preferFocusing(stream) {
  const modes = focusModesOf(stream);
  if (!modes || !modes.length || modes.includes('continuous')) return stream;
  let devs = [];
  try {
    devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  } catch (e) { devs = []; }
  const cur = stream.getVideoTracks()[0].getSettings().deviceId;
  const others = devs.filter(d => d.deviceId !== cur && /back|rear|environment/i.test(d.label));
  if (!others.length) return stream;
  stream.getTracks().forEach(t => t.stop());
  for (const d of others) {
    let s = null;
    try { s = await navigator.mediaDevices.getUserMedia(camConstraints(d.deviceId)); }
    catch (e) { s = null; }
    if (!s) continue;
    const m = focusModesOf(s);
    if (m && m.includes('continuous')) { camChoice = d.deviceId; return s; }
    s.getTracks().forEach(t => t.stop());
  }
  try { return await navigator.mediaDevices.getUserMedia(camConstraints(cur)); }
  catch (e) {
    try { return await navigator.mediaDevices.getUserMedia(camConstraints(null)); }
    catch (e2) { return null; }
  }
}

function switchButtonFor(videoEl) {
  return videoEl === ui.cam ? ui.btnCamSwitch : ui.btnCamSwitch2;
}

async function offerSwitch(videoEl) {
  const btn = switchButtonFor(videoEl);
  const list = await backCameras();
  if (!scanning || !scanStream) return;
  btn.hidden = list.length < 2;
  btn.onclick = e => { e.stopPropagation(); switchCamera(videoEl); };
}

let switching = false;
async function switchCamera(videoEl) {
  if (switching || !scanning || !scanStream) return;
  switching = true;
  try {
    const list = await backCameras();
    if (list.length < 2) return;
    const cur = scanStream.getVideoTracks()[0].getSettings().deviceId;
    const at = list.findIndex(d => d.deviceId === cur);
    const next = list[(at + 1) % list.length];
    /* Phones often cannot run two cameras at once, so close this one first. */
    scanStream.getTracks().forEach(t => t.stop());
    let s = null, picked = null;
    try {
      s = await navigator.mediaDevices.getUserMedia(camConstraints(next.deviceId));
      picked = next.deviceId;
    } catch (e) {
      try { s = await navigator.mediaDevices.getUserMedia(camConstraints(camChoice)); }
      catch (e2) { s = null; }
    }
    if (!scanning) { if (s) s.getTracks().forEach(t => t.stop()); return; }
    if (!s) {
      scanStream = null;
      toast('The camera could not be reopened - paste the code instead', 5000);
      return;
    }
    scanStream = s;
    if (picked) camChoice = picked;
    videoEl.srcObject = s;
    await videoEl.play().catch(() => {});
    keepFocusing(s, videoEl);
    if (picked) toast('Camera ' + (list.indexOf(next) + 1) + ' of ' + list.length, 1500);
  } finally {
    switching = false;
  }
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
  const epoch = camEpoch;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(camConstraints(camChoice));
  } catch (e) {
    if (!camChoice) return { ok: false, detector: null };
    camChoice = null;
    try { stream = await navigator.mediaDevices.getUserMedia(camConstraints(null)); }
    catch (e2) { return { ok: false, detector: null }; }
  }
  if (!camChoice) stream = await preferFocusing(stream);
  /* The scanner may have been closed while the cameras were being tried. */
  if (epoch !== camEpoch) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    return { ok: false, detector: null, cancelled: true };
  }
  if (!stream) return { ok: false, detector: null };
  scanStream = stream;
  videoEl.srcObject = scanStream;
  await videoEl.play().catch(() => {});
  keepFocusing(scanStream, videoEl);
  offerSwitch(videoEl);
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
    if (!started.cancelled) toast('Camera blocked — paste the code instead', 5000);
    return;
  }
  runScanLoop(ui.cam, started.detector, handler);
}

function stopScanner() {
  camEpoch++;
  scanning = false;
  clearTimeout(rafId);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  ui.cam.srcObject = null;
  ui.codeCam.srcObject = null;
  ui.watching.hidden = true;
  ui.btnCamSwitch.hidden = ui.btnCamSwitch2.hidden = true;
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
  channelUp = true;
  armGuard();
  if (extras.length) afterGroupChange();
  else renderGroup();
  /* Linked: from here the microphone is only held while talking. */
  if (!live) scheduleMicRelease();
  if (!ui.views.live.hidden) return;
  stopScanner();
  show('live');
  setMode(mode);
  updateTalk();
  updateStatus();
  initVolume();
  initOutput();
  capBitrate(rangeBps());
  if (longRange) sendCtl({ t: 'range', long: true });
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
      updateRings();
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
  endGroup();
  releaseMic();
  stopHeartbeat();
  stopScanner();
  clearTimeout(standbyTimer);
  cancelAnimationFrame(meterRaf);
  if (dc) { try { dc.close(); } catch (e) {} dc = null; }
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
  setLongRange(false, false);
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
  if (callKeyer) callKeyer.reset();
  openCallKeyer(false);
  ui.dropBar.hidden = true;
  setPill('idle', 'IDLE');
  show('setup');
  disarmGuard();
}

/* ---------------- groups ---------------- */

/* More than two phones. The phone that adds someone becomes a hub: each new
   phone links to it with the ordinary two-scan pairing, so the phone joining
   needs nothing new, and the first link carries on exactly as before.

   The hub mixes for every link separately: its own microphone plus every
   other link's incoming voice, never the listener's own, so nobody hears
   themselves back. Morse, pings and long range are passed on the same way.
   A phone that is a member of one hub can be a hub for others; the links
   form a tree, so nothing loops. */
const GROUP_MAX = 5;
const RELAY_TYPES = new Set(['mword', 'mbreak', 'mclear', 'ping']);

function cleanList(v) {
  return clipText(cleanText(v), 40, 160).trim();
}

function joinedExtras() { return extras.filter(x => x.joined); }
function primaryUp() { return !!(pc && dc && dc.readyState === 'open'); }
function anyLinkOpen() {
  return primaryUp() || extras.some(x => x.dc && x.dc.readyState === 'open');
}

function sendTo(x, obj) {
  if (x.dc && x.dc.readyState === 'open') {
    try { x.dc.send(JSON.stringify(obj)); } catch (e) { /* closing */ }
  }
}
function sendAll(obj) {
  sendCtl(obj);
  extras.forEach(x => sendTo(x, obj));
}

/* Passes a message on to every link but the one it came from, naming who
   sent it. A relayed ping gets its own id, so the acks it draws are not
   mistaken for replies to this phone's own pings. */
function relay(from, m) {
  if (!extras.length) return;
  const out = Object.assign({}, m);
  out.from = cleanList(m.from) || (from === 'p' ? peerName : from.name) || '';
  if (out.t === 'ping') out.id = 'r' + (++relaySeq);
  if (from !== 'p') sendCtl(out);
  extras.forEach(x => { if (x !== from && x.joined) sendTo(x, out); });
}

/* Who is talking, as heard down one link: everyone except that link. */
function talkersFor(skip) {
  const names = [];
  let any = false;
  if (live) { any = true; names.push(myName); }
  if (skip !== 'p' && remoteLive) { any = true; names.push(peerTalker || peerName); }
  extras.forEach(x => {
    if (x !== skip && x.joined && x.live) { any = true; names.push(x.talker || x.name); }
  });
  return { live: any, who: cleanList(names.filter(Boolean).join(', ')) };
}

function sendMicState() {
  if (!extras.length) { sendCtl({ t: 'mic', live }); return; }
  sendCtl(Object.assign({ t: 'mic' }, talkersFor('p')));
  extras.forEach(x => sendTo(x, Object.assign({ t: 'mic' }, talkersFor(x))));
}

/* The status line names whoever is talking when it knows. */
function remoteTalkers() {
  const names = [];
  if (remoteLive) names.push(peerTalker || peerName);
  joinedExtras().forEach(x => { if (x.live) names.push(x.talker || x.name); });
  return { any: remoteLive || joinedExtras().some(x => x.live), who: cleanList(names.filter(Boolean).join(', ')) };
}

function groupCount() {
  return 1 + (primaryUp() ? 1 : 0) + joinedExtras().length;
}
function sendGroup() {
  sendAll({ t: 'group', size: groupCount() });
}

/* ----- circles: one per person, ringed by their voice ----- */

/* With three or more phones the two level bars give way to a circle per
   person: their initial on a colour of their own, and a ring that swells
   with their voice. The hub can measure every voice; members cannot, since
   they get one mixed stream, so the hub sends them the list of people and
   about ten level readings a second. */
const RING_COLORS = ['#e07a5f', '#f2cc8f', '#81b29a', '#7aa5d8', '#c38fd6', '#e9a3b5', '#6cc4c4', '#d4a373'];
let roster = null, lvMap = {}, onSet = new Set(), lvTimer = 0;
const lvBuf = new Uint8Array(256);

/* The first thing a reader sees: a letter in any script, or a whole emoji
   (flags, skin tones and family sequences included). */
function initialOf(name, fallback) {
  const g = graphemes(cleanText(name))[0];
  if (!g) return fallback;
  const up = g.toUpperCase();
  return graphemes(up).length === 1 ? up : g;
}

/* The people to draw, or null when there is no link to draw. */
function circlePeople() {
  if (joinedExtras().length) {
    const list = [{ id: 'h', name: myName, me: true }];
    if (primaryUp()) list.push({ id: 'p', name: peerName });
    joinedExtras().forEach(x => list.push({ id: 'x' + x.id, name: x.name, x }));
    return list;
  }
  if (roster && roster.people.length >= 3) {
    return roster.people.map(p => ({ id: p.id, name: p.name, me: p.id === roster.you }));
  }
  /* Two phones: you first on each screen, but colours by role - the phone
     that created the channel takes the first colour - so both phones agree
     on who is which colour. */
  if (pc) {
    return [
      { id: 'me', name: myName, me: true, ci: amOfferer ? 0 : 1 },
      { id: 'them', name: peerName, ci: amOfferer ? 1 : 0 }
    ];
  }
  return null;
}

/* Levels as the hub measures them, 0 to 1, and who has their mic open. */
function hubLevels() {
  const lv = {}, on = [];
  const read = an => an ? Math.min(1, levelOf(an, lvBuf) * 4) : 0;
  lv.h = live ? read(micAnalyser) : 0;
  if (live) on.push('h');
  if (primaryUp()) { lv.p = read(hub && hub.pAn); if (remoteLive) on.push('p'); }
  joinedExtras().forEach(x => { lv['x' + x.id] = read(x.an); if (x.live) on.push('x' + x.id); });
  return { lv, on };
}

function sendRoster() {
  if (!hub && !extras.length) {
    /* Back to two phones: tell the one left, so it drops its circles. */
    sendCtl({ t: 'roster', you: 'p', people: [] });
    return;
  }
  const people = [{ id: 'h', name: myName }];
  if (primaryUp()) people.push({ id: 'p', name: peerName });
  joinedExtras().forEach(x => people.push({ id: 'x' + x.id, name: x.name }));
  sendCtl({ t: 'roster', you: 'p', people });
  joinedExtras().forEach(x => sendTo(x, { t: 'roster', you: 'x' + x.id, people }));
}

function startLevels() {
  if (lvTimer) return;
  lvTimer = setInterval(() => {
    if (!joinedExtras().length) { stopLevels(); return; }
    const { lv, on } = hubLevels();
    const l = {};
    Object.keys(lv).forEach(k => { l[k] = Math.round(lv[k] * 100); });
    sendAll({ t: 'lv', l, on });
  }, 100);
}
function stopLevels() { clearInterval(lvTimer); lvTimer = 0; }

function takeRoster(m) {
  const people = Array.isArray(m.people) ? m.people.slice(0, 12).map(p => ({
    id: String(p && p.id || '').slice(0, 8), name: cleanName(p && p.name)
  })) : [];
  roster = people.length >= 3 ? { you: String(m.you || '').slice(0, 8), people } : null;
  if (!roster) { lvMap = {}; onSet = new Set(); }
  renderGroup();
}

function takeLevels(m) {
  lvMap = (m.l && typeof m.l === 'object') ? m.l : {};
  onSet = new Set(Array.isArray(m.on) ? m.on.map(String) : []);
}

function renderGroup() {
  const row = ui.groupRow;
  const list = circlePeople();
  row.hidden = !list;
  ui.meters.hidden = !!list;
  row.innerHTML = '';
  updateNames();
  if (!list) return;
  row.classList.toggle('duo', list.length === 2);
  list.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'pp' + (p.me ? ' me' : '');
    d.dataset.id = p.id;
    /* By place in the hub's list, which every phone gets in the same order:
       the same colour for a person on every screen, and no two alike. */
    d.style.setProperty('--c', RING_COLORS[(p.ci != null ? p.ci : i) % RING_COLORS.length]);
    const label = p.me ? (p.name ? p.name + ' (me)' : 'You')
      : (p.name || (list.length === 2 ? 'Them' : 'Phone ' + (i + 1)));
    const ring = document.createElement('span');
    ring.className = 'pp-ring';
    const face = document.createElement('span');
    face.className = 'pp-face';
    face.textContent = initialOf(p.name, p.me ? 'Y' : list.length === 2 ? 'T' : String(i + 1));
    const name = document.createElement('span');
    name.className = 'pp-name';
    /* The name sits in its own direction, so an Arabic name reads right to
       left without pulling "(me)" round with it. */
    if (p.name) {
      const b = document.createElement('bdi');
      b.textContent = p.name;
      name.append(b);
      if (p.me) name.append(' (me)');
    } else name.textContent = label;
    d.append(ring, face, name);
    d.setAttribute('aria-label', label);
    if (p.x) {
      const b = document.createElement('button');
      b.className = 'pp-x';
      b.textContent = '×';
      b.setAttribute('aria-label', 'Remove ' + label + ' from the channel');
      b.onclick = () => removeExtra(p.x);
      d.append(b);
    }
    row.append(d);
  });
}

/* Called from the meter loop, about sixty times a second. */
function updateRings() {
  if (ui.groupRow.hidden) return;
  const isHub = joinedExtras().length > 0;
  const mine = isHub ? hubLevels() : null;
  ui.groupRow.querySelectorAll('.pp').forEach(d => {
    const id = d.dataset.id;
    let lv, on;
    if (d.classList.contains('me')) {
      lv = live && micAnalyser ? Math.min(1, levelOf(micAnalyser, lvBuf) * 4) : 0;
      on = live;
    } else if (mine) {
      lv = mine.lv[id] || 0;
      on = mine.on.includes(id);
    } else if (id === 'them') {
      lv = remoteAnalyser ? Math.min(1, levelOf(remoteAnalyser, lvBuf) * 4) : 0;
      on = remoteLive;
    } else {
      lv = (lvMap[id] || 0) / 100;
      on = onSet.has(id);
    }
    d.style.setProperty('--lv', lv.toFixed(2));
    d.classList.toggle('talking', on);
  });
}

/* ----- audio: one mix per link ----- */

function hubWire() {
  if (!extras.length) { hubStop(); return; }
  const ctx = audio();
  if (!ctx) return;
  if (!hub) {
    hub = {
      micStream: null, micSrc: null, micOut: ctx.createGain(),
      pStream: null, pSrc: null, pIn: ctx.createGain(),
      pDest: ctx.createMediaStreamDestination()
    };
  }
  const feed = (stream, holder, srcKey, streamKey, into) => {
    if (holder[streamKey] === stream) return;
    if (holder[srcKey]) { try { holder[srcKey].disconnect(); } catch (e) {} }
    holder[srcKey] = null;
    holder[streamKey] = stream;
    if (stream && stream.getAudioTracks().length) {
      try {
        holder[srcKey] = ctx.createMediaStreamSource(stream);
        holder[srcKey].connect(into);
      } catch (e) { holder[srcKey] = null; }
    }
  };
  /* The outgoing microphone stream is muted while this phone is not live, so
     taking it as the hub's microphone keeps the talk button in charge. */
  feed(micStream, hub, 'micSrc', 'micStream', hub.micOut);
  feed(remoteStream, hub, 'pSrc', 'pStream', hub.pIn);
  extras.forEach(x => {
    if (!x.in) x.in = ctx.createGain();
    feed(x.stream, x, 'src', 'srcStream', x.in);
  });

  const inputs = [{ key: 'p', node: hub.pIn }].concat(extras.map(x => ({ key: x, node: x.in })));
  const outputs = [{ key: 'p', dest: hub.pDest }].concat(extras.map(x => ({ key: x, dest: x.dest })));
  [hub.micOut].concat(inputs.map(i => i.node)).forEach(n => { try { n.disconnect(); } catch (e) {} });
  outputs.forEach(o => {
    hub.micOut.connect(o.dest);
    inputs.forEach(i => { if (i.key !== o.key) i.node.connect(o.dest); });
  });
  if (remoteAnalyser) extras.forEach(x => x.in.connect(remoteAnalyser));
  /* One analyser per voice, for the rings. */
  if (!hub.pAn) { hub.pAn = ctx.createAnalyser(); hub.pAn.fftSize = 512; }
  hub.pIn.connect(hub.pAn);
  extras.forEach(x => {
    if (!x.an) { x.an = ctx.createAnalyser(); x.an.fftSize = 512; }
    x.in.connect(x.an);
  });

  const sender = audioSender();
  const mixed = hub.pDest.stream.getAudioTracks()[0];
  if (sender && sender.track !== mixed) sender.replaceTrack(mixed).catch(() => {});
}

function hubStop() {
  if (!hub) return;
  [hub.micSrc, hub.micOut, hub.pSrc, hub.pIn].forEach(n => { if (n) { try { n.disconnect(); } catch (e) {} } });
  hub = null;
  /* Back to sending the microphone itself, as a two-phone link always has. */
  const sender = audioSender();
  if (sender && micTrack && micTrack.readyState === 'live') sender.replaceTrack(micTrack).catch(() => {});
}

function extraBitrate(x) {
  const sender = x.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
  if (!sender || !sender.getParameters) return;
  try {
    const p = sender.getParameters();
    p.encodings = (p.encodings && p.encodings.length) ? p.encodings : [{}];
    p.encodings[0].maxBitrate = rangeBps();
    sender.setParameters(p).catch(() => {});
  } catch (e) { /* not supported here */ }
}

function syncExtrasOutput() {
  extras.forEach(x => {
    if (!x.el) return;
    x.el.muted = ui.remoteAudio.muted;
    if (volumeWorks) x.el.volume = volume / 100;
    if (ui.outSel.value && typeof x.el.setSinkId === 'function' && !ui.outSel.hidden) {
      x.el.setSinkId(ui.outSel.value).catch(() => {});
    }
  });
}

/* ----- links to the extra phones ----- */

function gathered(p, timeout = 2500) {
  if (p.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(t); p.removeEventListener('icegatheringstatechange', check); resolve(); };
    const check = () => { if (p.iceGatheringState === 'complete') finish(); };
    const t = setTimeout(finish, timeout);
    p.addEventListener('icegatheringstatechange', check);
  });
}

function opusOnly(p) {
  try {
    const caps = RTCRtpSender.getCapabilities('audio');
    const opus = caps ? caps.codecs.filter(c => /opus/i.test(c.mimeType)) : [];
    if (!opus.length) return;
    p.getTransceivers().forEach(t => { if (t.setCodecPreferences) t.setCodecPreferences(opus); });
  } catch (e) { /* not supported here */ }
}

function makeExtra(offerer) {
  const ctx = audio();
  const p = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
  const x = {
    id: ++extraSeq, pc: p, dc: null, offerer, joined: false, name: '', talker: '',
    live: false, stream: null, src: null, srcStream: null, in: null, el: null,
    dest: ctx.createMediaStreamDestination(), lastHeard: Date.now(),
    dropTimer: 0, restarting: false, code: ''
  };
  const out = x.dest.stream;
  p.addTrack(out.getAudioTracks()[0], out);
  p.ontrack = ev => {
    x.stream = ev.streams[0] || new MediaStream([ev.track]);
    /* Playing it is how this phone hears them; Chrome also feeds a remote
       stream into Web Audio only while a media element holds it. */
    if (!x.el) {
      x.el = new Audio();
      x.el.autoplay = true;
      x.el.setAttribute('playsinline', '');
    }
    x.el.srcObject = x.stream;
    x.el.play().catch(() => {});
    syncExtrasOutput();
    hubWire();
  };
  p.onconnectionstatechange = () => extraState(x);
  if (offerer) {
    x.dc = p.createDataChannel('ctl', { ordered: true });
    wireExtra(x);
  } else {
    p.ondatachannel = ev => { x.dc = ev.channel; wireExtra(x); };
  }
  return x;
}

function wireExtra(x) {
  x.dc.onopen = () => {
    x.lastHeard = Date.now();
    sendTo(x, { t: 'name', name: myName });
    if (longRange) sendTo(x, { t: 'range', long: true });
    sendMicState();
  };
  /* A phone that taps End closes its channel at once; no need to wait for
     the heartbeat to notice. */
  x.dc.onclose = () => { if (x.joined) dropExtra(x, 'left the channel'); };
  x.dc.onmessage = ev => {
    x.lastHeard = Date.now();
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    const who = cleanList(m.from) || x.name || 'Someone';
    if (m.t === 'mic') {
      const was = x.live;
      x.live = !!m.live;
      x.talker = cleanList(m.who);
      if (was && !x.live && rogerBeep) playRoger();
      updateStatus();
      sendMicState();
      renderGroup();
    }
    else if (m.t === 'name') { x.name = cleanName(m.name); renderGroup(); sendRoster(); }
    else if (m.t === 'hb') sendTo(x, { t: 'hbr', ts: m.ts });
    else if (m.t === 'ping') {
      const lvl = typeof m.level === 'number' ? m.level : (m.urgent ? 1 : 0);
      receivePing(Math.max(0, Math.min(2, lvl)), who);
      sendTo(x, { t: 'ack', id: m.id });
    }
    else if (m.t === 'ack') { if (String(m.id).charAt(0) !== 'r') toast('Ping delivered'); }
    else if (m.t === 'range') {
      const on = !!m.long;
      if (on !== longRange) {
        setLongRange(on, true);
        toast(who + (on ? ' turned on long range' : ' turned long range off'), 3000);
      }
    }
    else if (m.t === 'ask-reoffer') restartExtra(x);
    else if (m.t === 'reoffer') answerExtraRestart(x, m.sdp);
    else if (m.t === 'reanswer') {
      x.pc.setRemoteDescription({ type: 'answer', sdp: localOnly(m.sdp) }).catch(() => {});
      x.restarting = false;
    }
    else showShared(m, who);
    if (RELAY_TYPES.has(m.t)) relay(x, m);
  };
}

/* Morse words, breaks and clears look the same wherever they came from. */
function showShared(m, who) {
  if (!callKeyer) return;
  if (m.t === 'mword') {
    const w = cleanWord(m.w);
    if (!w) return;
    /* The tones themselves announce it; the toast, for when the keyer is
       closed, waits until the word is whole so it does not give it away. */
    callKeyer.addWord(w, 'them', {
      onStart: () => buzz(30),
      onDone: () => { if (ui.callKeyer.hidden) toast(who + ' keyed: ' + w, 4000); }
    });
  }
  else if (m.t === 'mbreak') {
    if (callKeyer.addBreak('them') && ui.callKeyer.hidden) {
      toast(who + ' started a new sentence (BT)', 3000);
    }
  }
  else if (m.t === 'mclear') {
    callKeyer.clearPhrase(false);
    toast(who + ' cleared the phrase');
  }
}

function extraState(x) {
  const s = x.pc.connectionState;
  if (s === 'connected') {
    clearTimeout(x.dropTimer);
    x.restarting = false;
    if (!x.joined) extraJoined(x);
  } else if (s === 'disconnected' && x.joined) {
    /* Usually the network moving under it. Try a restart over the data
       channel first; give up if nothing comes of it. */
    clearTimeout(x.dropTimer);
    x.dropTimer = setTimeout(() => {
      if (x.pc.connectionState === 'connected') return;
      restartExtra(x);
      x.dropTimer = setTimeout(() => {
        if (x.pc.connectionState !== 'connected') dropExtra(x, 'dropped out');
      }, 10000);
    }, 2000);
  } else if (s === 'failed') {
    if (x.joined) dropExtra(x, 'dropped out');
    else if (adding === x) { toast('Could not link to the new phone. Same Wi-Fi? Try again.', 6000); cancelAdd(); }
  }
}

async function restartExtra(x) {
  if (!x.offerer || x.restarting || !x.dc || x.dc.readyState !== 'open') return;
  x.restarting = true;
  try {
    await x.pc.setLocalDescription(await x.pc.createOffer({ iceRestart: true }));
    await gathered(x.pc);
    sendTo(x, { t: 'reoffer', sdp: localOnly(x.pc.localDescription.sdp) });
  } catch (e) { /* the drop timer decides */ }
  setTimeout(() => { x.restarting = false; }, 8000);
}

async function answerExtraRestart(x, sdp) {
  try {
    await x.pc.setRemoteDescription({ type: 'offer', sdp: localOnly(sdp) });
    await x.pc.setLocalDescription(await x.pc.createAnswer());
    await gathered(x.pc);
    sendTo(x, { t: 'reanswer', sdp: localOnly(x.pc.localDescription.sdp) });
  } catch (e) { /* the drop timer decides */ }
}

function closeExtra(x) {
  clearTimeout(x.dropTimer);
  if (x.dc) { try { x.dc.close(); } catch (e) {} }
  try { x.pc.close(); } catch (e) {}
  if (x.src) { try { x.src.disconnect(); } catch (e) {} }
  if (x.in) { try { x.in.disconnect(); } catch (e) {} }
  if (x.el) { x.el.srcObject = null; }
  extras = extras.filter(e => e !== x);
}

function afterGroupChange() {
  hubWire();
  sendMicState();
  sendGroup();
  sendRoster();
  if (joinedExtras().length) startLevels(); else stopLevels();
  renderGroup();
  updateStatus();
  if (!joinedExtras().length && !adding) stopHubBeat();
  /* Everyone else gone: do what a two-phone link does when the other side
     leaves, rather than sit on a live screen talking to no one. */
  if (!pc && !extras.length && channelUp && !ui.views.live.hidden) {
    ui.dropText.textContent = 'Everyone has left. Going on standby \u2014 point two phones at each other, or tap End.';
    ui.dropBar.hidden = false;
    setPill('lost', 'ALONE');
    clearTimeout(standbyTimer);
    standbyTimer = setTimeout(() => {
      if (!pc && !extras.length && !ui.views.live.hidden) standby().catch(() => {});
    }, 2500);
  }
}

function dropExtra(x, why) {
  if (!extras.includes(x)) return;
  closeExtra(x);
  toast((x.name || 'A phone') + ' ' + why, 4000);
  afterGroupChange();
}

function removeExtra(x) {
  sendTo(x, { t: 'removed' });
  /* A moment for the message to leave before the link closes. */
  setTimeout(() => dropExtra(x, 'removed'), 200);
}

function extraJoined(x) {
  x.joined = true;
  x.lastHeard = Date.now();
  if (adding === x) finishAdd();
  extraBitrate(x);
  startHubBeat();
  /* The name comes over the data channel a moment after the link. */
  setTimeout(() => { if (extras.includes(x)) toast((x.name || 'A new phone') + ' joined', 3000); }, 700);
  afterGroupChange();
}

/* The same heartbeat as the first link, for the others: a member that hears
   nothing for twelve seconds assumes the hub is gone, and the hub drops a
   member it has not heard from in as long. */
function startHubBeat() {
  if (hubTimer) return;
  hubTimer = setInterval(() => {
    const now = Date.now();
    joinedExtras().forEach(x => {
      if (now - x.lastHeard > PEER_GONE_MS) { dropExtra(x, 'left the channel'); return; }
      sendTo(x, { t: 'hb', ts: performance.now() });
    });
  }, 4000);
}
function stopHubBeat() { clearInterval(hubTimer); hubTimer = 0; }

/* ----- adding a person ----- */

function holdCancels() {
  if (savedCancel1) return;
  savedCancel1 = ui.cancel1.onclick;
  savedCancel2 = ui.cancel2.onclick;
  ui.cancel1.onclick = cancelAdd;
  ui.cancel2.onclick = cancelAdd;
}
function restoreCancels() {
  if (!savedCancel1) return;
  ui.cancel1.onclick = savedCancel1;
  ui.cancel2.onclick = savedCancel2;
  savedCancel1 = savedCancel2 = null;
}

async function addPerson() {
  if (adding) return;
  if (joinedExtras().length >= GROUP_MAX) {
    toast('This phone can take ' + GROUP_MAX + ' more people at most. Another member can add more.', 5000);
    return;
  }
  try {
    /* Safari only shows its address while capturing. */
    await ensureMic();
  } catch (e) {
    toast('Microphone blocked. Allow it in site settings.', 5000);
    return;
  }
  const x = makeExtra(true);
  extras.push(x);
  adding = x;
  holdCancels();
  try {
    opusOnly(x.pc);
    await x.pc.setLocalDescription(await x.pc.createOffer());
    await gathered(x.pc);
    x.code = await packDesc('O', x.pc.localDescription.sdp);
  } catch (e) {
    toast('Could not make a code. Try again.', 5000);
    cancelAdd();
    return;
  }
  if (adding !== x) return;
  hubWire();
  showAddCode();
  if (!live) scheduleMicRelease();
}

function showAddCode() {
  const x = adding;
  if (!x) return;
  showCode(x.code, 'ADD A PERSON',
    'On the new phone: Join channel, then scan this. Then let this phone scan their reply.',
    'Scan their reply',
    () => openScanner('ADD A PERSON', 'Scan the reply code on the new phone.', takeAddCode),
    takeAddCode, addFilter);
}

/* Someone coming back from standby shows an offer of their own. The rule for
   who gives way matches standby's - the lower-sorting code answers - so the
   two phones agree without talking. */
function addFilter(code) {
  if (!adding || !adding.code || code === adding.code) return false;
  if (code.charAt(2) === 'A') return true;
  return code > adding.code;
}

async function takeAddCode(code) {
  let x = adding;
  if (!x) return;
  try {
    const { role, sdp } = await unpackDesc(code);
    if (role === 'A') {
      if (!x.offerer) throw new Error('Scan the code on the new phone.');
      ui.camWrap.hidden = true;
      ui.scanStep.textContent = 'ADDING';
      ui.scanHint.textContent = 'Linking up…';
      show('scan');
      await x.pc.setRemoteDescription({ type: 'answer', sdp });
      return;
    }
    /* Their offer: answer it instead of our own. */
    closeExtra(x);
    x = makeExtra(false);
    extras.push(x);
    adding = x;
    await x.pc.setRemoteDescription({ type: 'offer', sdp });
    opusOnly(x.pc);
    await x.pc.setLocalDescription(await x.pc.createAnswer());
    await gathered(x.pc);
    const answer = await packDesc('A', x.pc.localDescription.sdp);
    hubWire();
    showCode(answer, 'ADD A PERSON', 'Let their phone scan this. You will connect automatically.',
      'Waiting for them…', () => toast('Still waiting for them to scan'));
  } catch (e) {
    toast(e.message || 'That code could not be read', 5000);
    if (adding && adding.offerer) showAddCode();
    else cancelAdd();
  }
}

function finishAdd() {
  adding = null;
  restoreCancels();
  stopScanner();
  ui.camWrap.hidden = false;
  show('live');
}

function cancelAdd() {
  const x = adding;
  adding = null;
  if (x && !x.joined) closeExtra(x);
  restoreCancels();
  stopScanner();
  ui.camWrap.hidden = false;
  show('live');
  afterGroupChange();
}

/* The first link going for good while others remain: carry on with them
   rather than going on standby, which would take this phone off the call. */
function primaryLeftGroup() {
  if (!joinedExtras().length) return false;
  const name = peerName;
  teardownPeer();
  peerName = '';
  ui.dropBar.hidden = true;
  setPill('linked', 'LINKED');
  toast((name || 'A phone') + ' left the channel', 4000);
  afterGroupChange();
  return true;
}

function endGroup() {
  if (adding && !adding.joined) closeExtra(adding);
  adding = null;
  restoreCancels();
  extras.slice().forEach(closeExtra);
  extras = [];
  stopHubBeat();
  hubStop();
  stopLevels();
  groupSize = 0;
  peerTalker = '';
  roster = null;
  lvMap = {};
  onSet = new Set();
  renderGroup();
}

/* ---------------- leaving guard ---------------- */

/* A closed page cannot get its link back without a fresh code swap, so while
   a channel is up - linked, or on standby after a drop - leaving has to be a
   choice. The back gesture pops a placeholder history entry instead of
   leaving, and asks; closing or reloading gets the browser's own "Leave
   site?" check. iOS ignores the latter, so there only the back swipe is
   caught. Nothing is stored: the placeholder lives in this page's history. */
let channelUp = false, guardArmed = false;

function armGuard() {
  if (guardArmed) return;
  try { history.pushState({ girgir: 'channel' }, ''); guardArmed = true; }
  catch (e) { guardArmed = false; }
}

function disarmGuard() {
  channelUp = false;
  if (guardArmed) {
    guardArmed = false;
    /* Take the placeholder back off, so the next back press leaves as usual.
       The popstate this causes finds the guard disarmed and does nothing. */
    try { if (history.state && history.state.girgir === 'channel') history.back(); }
    catch (e) { /* ignore */ }
  }
}

window.addEventListener('popstate', () => {
  if (!guardArmed) return;
  guardArmed = false;
  if (!channelUp) return;
  if (!ui.views.help.hidden) { show(helpReturn); armGuard(); return; }
  if (adding) { cancelAdd(); armGuard(); return; }
  if (window.confirm('Leave the channel? The link ends, and getting back means pairing again.')) {
    hangUp();
  } else {
    armGuard();
  }
});

window.addEventListener('beforeunload', ev => {
  if (!channelUp) return;
  ev.preventDefault();
  ev.returnValue = '';
});

/* ---------------- local network permission ---------------- */

/* Android 17 keeps an app off the local network unless it holds the "nearby
   devices" permission, and Chrome is adding a matching per-site "local
   network" permission. A web page cannot grant either one; it can only ask,
   the way it asks for the microphone. Chrome asks when a page makes a request
   marked as bound for the local network, so this makes one such request - to
   this phone's own Wi-Fi address, where nothing is listening - purely to bring
   the question up. A browser without the permission ignores the marking and
   the request simply fails, which costs nothing. */
const LNA_NAMES = ['local-network', 'local-network-access'];
let lnaAsked = false;

async function localNetState() {
  if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
  for (const name of LNA_NAMES) {
    try { return (await navigator.permissions.query({ name })).state; } catch (e) { /* not this name */ }
  }
  return 'unknown';
}

/* The phone's own private IPv4 address, read from a throwaway connection.
   With the microphone allowed, browsers show the real address rather than a
   .local name. */
async function ownPrivateAddr() {
  let probe;
  try {
    probe = new RTCPeerConnection({ iceServers: [] });
    probe.createDataChannel('probe');
    const found = new Promise(resolve => {
      probe.onicecandidate = ev => {
        if (!ev.candidate) { resolve(''); return; }
        const m = / (\d+\.\d+\.\d+\.\d+) \d+ typ host/.exec(ev.candidate.candidate);
        if (m && isLocalAddr(m[1])) resolve(m[1]);
      };
      setTimeout(() => resolve(''), 2000);
    });
    await probe.setLocalDescription(await probe.createOffer());
    return await found;
  } catch (e) {
    return '';
  } finally {
    try { probe && probe.close(); } catch (e) {}
  }
}

async function askLocalNetwork() {
  const state = await localNetState();
  if (state === 'granted' || state === 'denied' || lnaAsked) return state;
  lnaAsked = true;
  const ip = await ownPrivateAddr();
  if (ip) {
    const stop = new AbortController();
    const t = setTimeout(() => stop.abort(), 30000);
    try {
      await fetch('http://' + ip + '/', {
        targetAddressSpace: 'local', mode: 'no-cors', cache: 'no-store', signal: stop.signal
      });
    } catch (e) { /* nothing listens there; only the question mattered */ }
    clearTimeout(t);
  }
  return localNetState();
}

const LNA_BLOCKED = 'Could not reach the other phone, and this site’s "Local network" ' +
  'permission is off. Allow it in the browser’s site settings, then pair again.';

/* Asked alongside the microphone, without holding pairing up: the code can
   be shown and scanned while the question is on screen. A "denied" is not
   reported here - some browsers connect with it off - only once a
   connection has actually failed. */
function checkLocalNetwork() {
  askLocalNetwork().catch(() => {});
}

/* ---------------- morse ---------------- */

/* The full international chart, plus the handful of marks that are not ITU
   but that every chart prints anyway (! & _ $). Each pattern is unique, so a
   pattern always names exactly one character. */
const MORSE_GROUPS = [
  ['Letters', {
    A: '.-',    B: '-...',  C: '-.-.',  D: '-..',   E: '.',     F: '..-.',
    G: '--.',   H: '....',  I: '..',    J: '.---',  K: '-.-',   L: '.-..',
    M: '--',    N: '-.',    O: '---',   P: '.--.',  Q: '--.-',  R: '.-.',
    S: '...',   T: '-',     U: '..-',   V: '...-',  W: '.--',   X: '-..-',
    Y: '-.--',  Z: '--..'
  }],
  ['Numbers', {
    '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
    '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----'
  }],
  ['Punctuation', {
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.',  '(': '-.--.',  ')': '-.--.-', '&': '.-...',  ':': '---...',
    ';': '-.-.-.', '=': '-...-',  '+': '.-.-.',  '-': '-....-', '_': '..--.-',
    '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
    /* Not in standard Morse: added here so <3 can be sent. A mirrored pair,
       on patterns nothing else uses. */
    '<': '-.-..', '>': '..-.-'
  }]
];
const MORSE = Object.assign({}, ...MORSE_GROUPS.map(g => g[1]));

/* Real Morse puts a dash at three dots and a letter gap at three. These keep
   that ratio around a deliberately slow 260 ms dot, which is about as fast as
   a thumb can be accurate. */
const DOT_MAX = 260;
const LETTER_GAP = 820;
/* After a character lands, this much more quiet finishes the word: about
   two and a half seconds of silence in all, the long gap Morse already
   uses between words. Off, a word only goes on Send word. */
const WORD_GAP = 1600;
let autoSpace = true;
/* BT, the prosign for a break in thought. Keyed on its own it starts a new
   sentence; inside a word it stays '='. */
const BT = '-...-';

function morseLetter(syms) {
  for (const k in MORSE) if (MORSE[k] === syms) return k;
  return '';
}

function morseCandidates(prefix, pool) {
  return pool.filter(k => MORSE[k].indexOf(prefix) === 0);
}

function morsePretty(syms) {
  return syms.replace(/\./g, '·').replace(/-/g, '–');
}

/* For running text, where letter-spacing does not apply: a thin space keeps
   two dashes from merging into one long line. */
function morseSpaced(syms) {
  return morsePretty(syms).split('').join('\u2009');
}

let keyOsc = null, keyGain = null;

/* Held down, so it lasts exactly as long as the thumb does - that is the
   whole point of a key. */
function keyToneOn() {
  const ctx = audio();
  if (!ctx) return;
  keyToneOff();
  keyOsc = ctx.createOscillator();
  keyGain = ctx.createGain();
  keyOsc.type = 'sine';
  keyOsc.frequency.value = 620;
  keyGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  keyGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.008);
  keyOsc.connect(keyGain).connect(ctx.destination);
  keyOsc.start();
}

function keyToneOff() {
  if (!keyOsc) return;
  const o = keyOsc, g = keyGain;
  keyOsc = keyGain = null;
  const ctx = audio();
  if (!ctx) return;
  try {
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.02);
    o.stop(ctx.currentTime + 0.06);
  } catch (e) { /* already stopped */ }
}

/* A whole character at a steady speed, which is the only way the rhythm of a
   letter ever becomes recognisable. */
function playMorseCode(code) {
  playMorsePatterns([code]);
}

function playMorsePatterns(codes) {
  const ctx = audio();
  if (!ctx) return;
  const unit = 0.09;
  let t = ctx.currentTime + 0.06;
  codes.forEach((code, i) => {
  if (i) t += unit * 2;
  for (const sym of code) {
    const dur = sym === '-' ? unit * 3 : unit;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 620;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    g.gain.setValueAtTime(0.12, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
    t += dur + unit;
  }
  });
}

/* ---- live playback: letters arrive the way they would on the air ----
   Each letter starts as a blur when its tone starts, sharpens while the dots
   and dashes play, and lands clear only when its last tone ends. That leaves
   the listener the length of the letter to guess it by ear. Characters go at
   the usual speed with an extra beat between them, so each clear letter can
   be read before the next one starts (spaced the way learners are taught). */
const TX_UNIT = 0.09;      // one dot, in seconds
const TX_LETTER_GAP = 4;   // units between letters (3 on the air)
const TX_WORD_GAP = 8;     // units between words (7 on the air)
let txQueue = [], txCur = null, txRaf = 0;

function txTone(ctx, t, dur) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 620;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
  g.gain.setValueAtTime(0.12, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.02);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
  return g;
}

/* Words are buttons holding one span per letter, so each can be revealed on
   its own. Screen readers get the word whole, once. */
function txFill(node, text) {
  node.textContent = '';
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'tx-ch';
    s.textContent = ch;
    s.setAttribute('aria-hidden', 'true');
    node.append(s);
  }
}
function txItem(node, text) {
  const spans = node.querySelectorAll('.tx-ch');
  return { node, letters: [...text].map((ch, i) => ({ el: spans[i] || node, code: MORSE[ch] || '' })) };
}

/* A job is a run of words (and BT marks) played back to back.
   'in' jobs are what the other phone keyed: the letters grow out of nothing.
   're' jobs are replays: the word keeps its place and refills letter by
   letter. A replay never holds up incoming Morse. */
function txPlay(job) {
  job.oscs = [];
  if (job.kind === 're') txQueue = txQueue.filter(j => j.kind !== 're');
  if (txCur && txCur.kind === 're') txStop(txCur);
  txQueue.push(job);
  if (!txCur) txNext();
}

function txNext() {
  txCur = null;
  const j = txQueue.shift();
  if (j) txStart(j);
}

function txStart(job) {
  txCur = job;
  const ctx = audio();
  /* A context not yet allowed to run has a frozen clock; go by the page
     clock then, silently, rather than not at all. */
  const live = ctx && ctx.state === 'running' ? ctx : null;
  job.now = live ? () => live.currentTime : () => performance.now() / 1000;
  let t = job.now() + 0.08;
  job.letters = [];
  job.items.forEach((it, i) => {
    if (i) t += TX_UNIT * (TX_WORD_GAP - 1);
    it.node.classList.remove('tx-queued');
    if (job.kind === 'in') it.node.classList.add('tx-live');
    it.letters.forEach((L, j) => {
      if (j) t += TX_UNIT * (TX_LETTER_GAP - 1);
      L.start = t;
      L.syms = [];
      L.done = false;
      for (const sym of L.code) {
        const d = sym === '-' ? TX_UNIT * 3 : TX_UNIT;
        L.syms.push({ s: t, e: t + d, sym });
        if (live) job.oscs.push(txTone(live, t, d));
        t += d + TX_UNIT;
      }
      L.end = L.code ? t - TX_UNIT : t;
      clearTimeout(L.el._txT);
      delete L.el.dataset.sy;
      L.el.classList.remove('tx-done', 'tx-on', 'tx-key');
      L.el.classList.add(job.kind === 'in' ? 'tx-hidden' : 'tx-ghost');
      job.letters.push(L);
    });
  });
  job.end = t;
  if (job.onStart) job.onStart();
  /* Animation frames stop with the screen off; the timer still ends the job
     so whatever is queued behind it is not stuck. */
  job.timer = setTimeout(txTick, (job.end - job.now()) * 1000 + 60);
  txTick();
}

function txTick() {
  cancelAnimationFrame(txRaf);
  const job = txCur;
  if (!job) return;
  const now = job.now();
  for (const L of job.letters) {
    if (L.done || now < L.start) continue;
    if (now >= L.end) { txReveal(L, true); continue; }
    const el = L.el;
    if (!el.classList.contains('tx-on')) {
      el.classList.remove('tx-hidden', 'tx-ghost');
      el.classList.add('tx-on');
    }
    el.style.setProperty('--p', ((now - L.start) / (L.end - L.start)).toFixed(3));
    const heard = L.syms.filter(x => x.s <= now);
    el.dataset.sy = morsePretty(heard.map(x => x.sym).join(''));
    el.classList.toggle('tx-key', heard.some(x => now < x.e));
  }
  if (now >= job.end) { txFinish(job); return; }
  txRaf = requestAnimationFrame(txTick);
}

function txReveal(L, pop) {
  L.done = true;
  const el = L.el;
  el.classList.remove('tx-hidden', 'tx-ghost', 'tx-on', 'tx-key');
  el.style.removeProperty('--p');
  if (!pop || !L.code) { delete el.dataset.sy; return; }
  el.dataset.sy = morsePretty(L.code);
  void el.offsetWidth;
  el.classList.add('tx-done');
  clearTimeout(el._txT);
  el._txT = setTimeout(() => {
    if (el.classList.contains('tx-on')) return;
    el.classList.remove('tx-done');
    delete el.dataset.sy;
  }, 1800);
}

function txWrapUp(job, pop) {
  clearTimeout(job.timer);
  job.letters.forEach(L => { if (!L.done) txReveal(L, pop); });
  job.items.forEach(it => it.node.classList.remove('tx-live', 'tx-queued'));
}

function txFinish(job) {
  txWrapUp(job, true);
  if (job.onDone) job.onDone();
  txNext();
}

/* Cut short: silence what is still scheduled and show everything. */
function txStop(job) {
  job.oscs.forEach(g => {
    try { g.gain.cancelScheduledValues(0); g.gain.value = 0; g.disconnect(); } catch (e) { /* gone */ }
  });
  if (job.letters) txWrapUp(job, false);
  if (job.onDone && job.kind === 'in') job.onDone();
  if (txCur === job) {
    cancelAnimationFrame(txRaf);
    txCur = null;
  }
}

/* Everything one keyer has queued or playing, e.g. when its phrase clears. */
function txCancel(owner, kind) {
  const hit = j => j.owner === owner && (!kind || j.kind === kind);
  txQueue.filter(hit).forEach(j => { j.oscs = j.oscs || []; j.items.forEach(it => it.node.classList.remove('tx-queued')); });
  txQueue = txQueue.filter(j => !hit(j));
  if (txCur && hit(txCur)) { txStop(txCur); txNext(); }
}

/* Every character, grouped the way charts print them. Tapping one plays it,
   because a chart you can hear teaches the rhythm and not just the shape. */
function renderMorseChart() {
  if (ui.morseChart.childElementCount) return;
  MORSE_GROUPS.forEach(([title, table]) => {
    const h = document.createElement('h3');
    h.className = 'mg-title';
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'morse-grid';
    Object.keys(table).forEach(k => {
      const b = document.createElement('button');
      b.className = 'mg';
      b.setAttribute('aria-label', k + ', ' + table[k].replace(/\./g, 'dot ').replace(/-/g, 'dash ').trim());
      const c = document.createElement('b');
      c.textContent = k;
      const s = document.createElement('span');
      s.textContent = morsePretty(table[k]);
      b.appendChild(c);
      b.appendChild(s);
      b.onclick = () => playMorseCode(table[k]);
      grid.appendChild(b);
    });
    ui.morseChart.appendChild(h);
    ui.morseChart.appendChild(grid);
  });
}

function openMorseChart(on) {
  if (on) renderMorseChart();
  ui.morseSheet.hidden = !on;
}

/* ---------------- morse practice ---------------- */

/* Learning Morse needs both directions and neither needs a second phone, so
   practice lives outside the channel entirely: it never touches the data
   channel and works with nothing paired. Nothing about it is kept - the
   streak starts at zero every time. */
let drillMode = 'send', drillDigits = false, drillMarks = false, drillTarget = '';
let drillSyms = '', drillDownAt = 0, drillTimer = 0, drillNextTimer = 0;
let drillStreak = 0, drillBest = 0;

function drillPool() {
  return MORSE_GROUPS
    .filter(([title]) => title === 'Letters' ||
      (title === 'Numbers' && drillDigits) || (title === 'Punctuation' && drillMarks))
    .flatMap(([, table]) => Object.keys(table));
}

function renderDrill() {
  ui.drillSyms.textContent = drillSyms ? morsePretty(drillSyms) : '';
  /* Only once something has been keyed, and only from what is being
     practised: before the first tap the whole pool is just noise. */
  const hint = drillMode === 'send' && !!drillSyms;
  /* Hidden but still taking its room, so the key stays put. */
  ui.drillCands.style.visibility = hint ? '' : 'hidden';
  if (hint) {
    const left = morseCandidates(drillSyms, drillPool());
    ui.drillCands.textContent = left.length
      ? left.join(' ')
      : 'nothing has that pattern — pause to clear it';
  }
  ui.drillScore.textContent = 'streak ' + drillStreak + ' · best ' + drillBest;
}

function drillSay(msg, kind) {
  ui.drillFeedback.textContent = msg;
  ui.drillFeedback.className = 'drill-feedback' + (kind ? ' ' + kind : '');
}

function drillRight() {
  drillStreak++;
  if (drillStreak > drillBest) drillBest = drillStreak;
  drillSay('✓ ' + drillTarget + '   ' + morseSpaced(MORSE[drillTarget]), 'good');
  renderDrill();
  clearTimeout(drillNextTimer);
  drillNextTimer = setTimeout(nextDrill, 900);
}

function drillWrong(msg) {
  drillStreak = 0;
  drillSay('✗ ' + msg, 'bad');
  renderDrill();
  clearTimeout(drillNextTimer);
  drillNextTimer = setTimeout(nextDrill, 2600);
}

function drillJudgeKeyed() {
  if (!drillSyms) return;
  const sent = drillSyms;
  drillSyms = '';
  if (sent === MORSE[drillTarget]) { drillRight(); return; }
  const was = morseLetter(sent);
  drillWrong('you keyed ' + morseSpaced(sent) + (was ? ' (' + was + ')' : ' (no character)') +
             '.  ' + drillTarget + ' is ' + morseSpaced(MORSE[drillTarget]));
}

function drillKeyDown() {
  clearTimeout(drillTimer);
  drillDownAt = Date.now();
  keyToneOn();
}

function drillKeyUp() {
  if (!drillDownAt) return;
  const held = Date.now() - drillDownAt;
  drillDownAt = 0;
  keyToneOff();
  drillSyms += held > DOT_MAX ? '-' : '.';
  renderDrill();
  drillTimer = setTimeout(drillJudgeKeyed, LETTER_GAP);
}

function drillChoose(pick, btn) {
  Array.from(ui.drillChoices.children).forEach(b => { b.disabled = true; });
  if (pick === drillTarget) drillRight();
  else {
    if (btn) btn.style.borderColor = 'var(--bad)';
    drillWrong('it was ' + drillTarget + '   ' + morseSpaced(MORSE[drillTarget]));
  }
}

function buildChoices() {
  const pool = drillPool().filter(k => k !== drillTarget);
  const picks = [drillTarget];
  while (picks.length < 4 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = picks[i]; picks[i] = picks[j]; picks[j] = t;
  }
  ui.drillChoices.innerHTML = '';
  picks.forEach(k => {
    const b = document.createElement('button');
    b.textContent = k;
    b.onclick = () => drillChoose(k, b);
    ui.drillChoices.appendChild(b);
  });
}

function nextDrill() {
  clearTimeout(drillTimer);
  clearTimeout(drillNextTimer);
  drillSyms = '';
  if (drillMode === 'live') { if (freeKeyer) freeKeyer.refresh(); return; }
  const pool = drillPool();
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1) {
    while (next === drillTarget) next = pool[Math.floor(Math.random() * pool.length)];
  }
  drillTarget = next;
  drillSay('');

  const sending = drillMode === 'send';
  ui.drillPrompt.textContent = sending ? drillTarget : '?';
  ui.drillSub.textContent = sending ? 'key this one' : 'which one was that?';
  ui.drillPanel.hidden = !sending;
  ui.drillKey.hidden = !sending;
  ui.btnDrillReplay.hidden = sending;
  ui.drillChoices.hidden = sending;
  if (!sending) {
    buildChoices();
    setTimeout(() => playMorseCode(MORSE[drillTarget]), 260);
  }
  renderDrill();
}

function setDrillMode(m) {
  drillMode = m;
  ui.btnDrillSend.setAttribute('aria-pressed', String(m === 'send'));
  ui.btnDrillHear.setAttribute('aria-pressed', String(m === 'hear'));
  ui.btnDrillLive.setAttribute('aria-pressed', String(m === 'live'));
  const liveKey = m === 'live';
  document.querySelectorAll('#viewDrill .drill-only').forEach(el => { el.hidden = liveKey; });
  ui.freeKeyer.hidden = !liveKey;
  ui.freePhrase.hidden = !liveKey;
  /* Live has its own abc / 123 / .,? row. */
  ui.drillTogs.hidden = liveKey;
  if (!liveKey && freeKeyer) freeKeyer.stop();
  if (liveKey) {
    ui.drillPanel.hidden = ui.drillKey.hidden = ui.drillChoices.hidden = true;
    ui.btnDrillReplay.hidden = true;
  }
  drillStreak = 0;
  nextDrill();
}

function openDrill() {
  show('drill');
  /* A tap got us here, so the context is allowed to start now. */
  audio();
  setDrillMode(drillMode);
}

function closeDrill() {
  clearTimeout(drillTimer);
  clearTimeout(drillNextTimer);
  drillDownAt = 0;
  keyToneOff();
  if (freeKeyer) freeKeyer.reset();
  openMorseChart(false);
  show('setup');
}

/* ---------------- live keyer ---------------- */

/* Free keying with the chart folded in. As each dot or dash goes in, the
   guide narrows to the characters still possible and shows, for each, what is
   left to key. A pause commits the character to the word; the done button
   moves the word into the phrase. The same keyer serves practice (Live) and
   the call (Morse), where every finished word goes to the other phone too.

   The phrase lives in memory only: it is gone when the call ends, practice is
   closed or the page goes away. Nothing is written anywhere. */
const PHRASE_MAX = 80;
const WORD_MAX = 40;

let freeKeyer = null, callKeyer = null;

function cleanWord(w) {
  return String(w || '').toUpperCase().split('').filter(c => MORSE[c]).join('').slice(0, WORD_MAX);
}

function makeKeyer(root, opts) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  root.classList.add('kx');
  root.innerHTML = '';
  /* Who owns a playback, so clearing this keyer stops only its own. */
  const me = {};

  const panel = el('div', 'morse kx-panel');
  const line = el('div', 'kx-line');
  const wordEl = el('span', 'kx-word');
  const symsEl = el('span', 'kx-syms');
  line.append(wordEl, symsEl);
  const nextEl = el('p', 'kx-next');
  const guideEl = el('div', 'kx-guide');
  panel.append(line, nextEl, guideEl);

  /* Which characters the guide offers. Keying always decodes everything;
     these only choose what the hints show, and with none on the guide is
     out of the way. All turns the three on, or back to letters only. */
  const row = el('div', 'kx-row');
  const sets = { Letters: true, Numbers: false, Punctuation: false };
  const setBtns = [['Letters', 'abc'], ['Numbers', '123'], ['Punctuation', '.,?']].map(([k, label]) => {
    const b = el('button', 'tog tiny', label);
    b.setAttribute('aria-label', 'Show ' + k.toLowerCase() + ' in the guide');
    b.onclick = () => { sets[k] = !sets[k]; render(); };
    row.append(b);
    return [k, b];
  });
  const togAll = el('button', 'tog tiny', 'All');
  togAll.setAttribute('aria-label', 'Show every character in the guide');
  togAll.onclick = () => {
    const all = Object.values(sets).every(Boolean);
    Object.keys(sets).forEach(k => { sets[k] = !all || k === 'Letters'; });
    render();
  };
  row.append(togAll);
  const togAuto = el('button', 'tog tiny kx-auto-tog', 'Auto ␣');
  togAuto.setAttribute('aria-label', 'Send the word by itself after a long pause');
  togAuto.onclick = () => {
    autoSpace = !autoSpace;
    if (!autoSpace) stopWordGap();
    else if (word && !syms) startWordGap();
    render();
    toast(autoSpace ? 'A long pause sends the word' : 'Words go only on ' + opts.doneLabel, 2200);
  };
  row.append(togAuto);

  const key = el('button', 'talk kx-key');
  key.append(el('span', 'talk-label', 'KEY · TAP = DOT · HOLD = DASH'));

  const actions = el('div', 'kx-actions');
  const btnBack = el('button', 'tog kx-back', '⌫');
  btnBack.setAttribute('aria-label', 'Delete the last character');
  const btnDone = el('button', 'btn primary', opts.doneLabel);
  const btnClear = el('button', 'tog', 'Clear');
  actions.append(btnBack, btnDone, btnClear);

  /* How it works, folded away until asked for: what each move does, and in
     grey why it is there. */
  const how = el('details', 'kx-how');
  how.append(el('summary', null, 'How keying works'));
  const dl = el('dl');
  const doneName = opts.doneLabel;
  [
    ['tap · hold', 'Dot · dash', 'A tap is a dot, a hold is a dash.'],
    ['short pause', 'Letter lands', 'A brief stop turns the dots and dashes into a letter.'],
    ['long pause', 'Word goes', 'About 2½ s of quiet sends it, like the longer gap between words in real Morse. With Auto off, press ' + doneName + '.'],
    ['– · · · –', '¶ New sentence', 'On its own this is BT, the operator\'s break sign. Starts a new line' + (opts.onWord ? ' on both phones' : '') + '. Inside a word it is still =.'],
    ['tap a word · ▶', 'Hear it again', 'Letters come back one at a time, each sharpening while its tone plays. Tap a letter you are keying for just that one; ▶ plays the whole sentence.'],
    ['abc 123 .,?', 'Guide only', 'Choose what the guide suggests. Every character decodes either way.']
  ].forEach(([k, what, why]) => {
    const dt = el('dt', null, k);
    const dd = el('dd');
    dd.append(el('b', null, what), el('span', null, why));
    dl.append(dt, dd);
  });
  how.append(dl);

  root.append(panel, row, key, actions, how);

  let syms = '', word = '', phrase = [], note = '';
  let downAt = 0, gapTimer = 0, wordTimer = 0, clearArmed = 0;

  /* The send button fills while the word gap runs, so the pause has a face. */
  function startWordGap() {
    stopWordGap();
    if (!autoSpace || !word) return;
    btnDone.style.setProperty('--gap', WORD_GAP + 'ms');
    void btnDone.offsetWidth;
    btnDone.classList.add('kx-filling');
    wordTimer = setTimeout(() => { wordTimer = 0; done(); }, WORD_GAP);
  }
  function stopWordGap() {
    clearTimeout(wordTimer);
    wordTimer = 0;
    btnDone.classList.remove('kx-filling');
  }

  function pool() {
    return MORSE_GROUPS.filter(([t]) => sets[t]).flatMap(([, table]) => Object.keys(table));
  }

  function chip(ch) {
    const code = MORSE[ch];
    const b = el('button', 'kx-chip');
    const isBreak = code === BT && !word;
    b.append(el('b', null, isBreak ? '¶' : ch));
    if (isBreak) b.title = 'On its own this is BT: a new sentence';
    if (syms) b.append(el('span', 'done', morsePretty(syms)));
    const rest = code.slice(syms.length);
    if (rest) b.append(el('span', 'left', morsePretty(rest)));
    else { b.classList.add('now'); b.append(el('span', 'left', 'pause')); }
    b.setAttribute('aria-label', ch + (rest ? ', then ' + rest.replace(/\./g, 'dot ').replace(/-/g, 'dash ').trim() : ', pause now'));
    b.onclick = () => playMorseCode(code);
    return b;
  }

  /* The word being keyed, a letter per button: tap one to hear it again. */
  function renderWord() {
    if (wordEl.dataset.w === word) return;
    wordEl.dataset.w = word;
    wordEl.textContent = '';
    [...word].forEach(ch => {
      const b = el('button', 'kx-lt', ch);
      b.setAttribute('aria-label', ch + ', tap to hear it');
      b.onclick = () => txPlay({ kind: 're', owner: me, items: [{ node: b, letters: [{ el: b, code: MORSE[ch] || '' }] }] });
      wordEl.append(b);
    });
  }

  function render() {
    renderWord();
    symsEl.textContent = syms ? morsePretty(syms) : '';
    line.classList.toggle('empty', !word && !syms);

    const guideOn = Object.values(sets).some(Boolean);
    panel.classList.toggle('no-guide', !guideOn);
    setBtns.forEach(([k, b]) => b.setAttribute('aria-pressed', String(sets[k])));
    togAll.setAttribute('aria-pressed', String(Object.values(sets).every(Boolean)));
    togAuto.setAttribute('aria-pressed', String(autoSpace));

    const order = pool();
    let cands = order.filter(k => MORSE[k].indexOf(syms) === 0);
    /* Keying a number with numbers switched off still works; the guide just
       follows along once nothing in the chosen set fits. */
    if (!cands.length) cands = Object.keys(MORSE).filter(k => MORSE[k].indexOf(syms) === 0);
    cands.sort((a, b) => MORSE[a].length - MORSE[b].length || order.indexOf(a) - order.indexOf(b));

    nextEl.textContent = '';
    if (note) {
      nextEl.textContent = note;
    } else if (!syms) {
      nextEl.textContent = word
        ? (autoSpace ? 'Next character, or pause to send the word'
                     : 'Next character, or ' + opts.doneLabel.toLowerCase() + ' to finish the word')
        : (phrase.length && !phrase[phrase.length - 1].br
          ? 'Next word, or – · · · – for a new sentence'
          : 'Start with a dot or a dash');
    } else if (syms === BT && !word) {
      nextEl.append(el('b', null, 'pause'), ' → new sentence (BT)');
    } else if (!cands.length) {
      nextEl.textContent = 'No character starts ' + morseSpaced(syms) + ' — pause to drop it';
    } else {
      const exact = morseLetter(syms);
      /* What each next move leads to: the characters themselves while they
         fit on the line, a count once there are too many to read. */
      const after = s => {
        const list = cands.filter(k => MORSE[k].indexOf(syms + s) === 0);
        return list.length <= 5 ? list.join(' ') : list.length + ' more';
      };
      const dot = after('.'), dash = after('-');
      const bits = [];
      if (exact) bits.push(['pause', exact]);
      if (dot) bits.push(['·', dot]);
      if (dash) bits.push(['–', dash]);
      bits.forEach(([k, v], i) => {
        if (i) nextEl.append('   ');
        nextEl.append(el('b', null, k), ' → ' + v);
      });
    }

    guideEl.innerHTML = '';
    if (guideOn) cands.forEach(k => guideEl.append(chip(k)));
  }

  /* Each entry keeps its own nodes, and the phrase only ever appends or trims
     what changed: rebuilding it would restart any letter still playing. */
  const emptyEl = el('span', 'empty', opts.emptyText);

  function entryNodes(e) {
    if (!e.nodes) {
      if (e.br) {
        const m = el('button', 'kx-br ' + e.who, '¶ BT');
        m.setAttribute('aria-label', (e.who === 'them' ? 'they' : 'you') + ' started a new sentence, tap to hear BT');
        m.onclick = () => replay([e]);
        e.nodes = [m, el('br')];
      } else {
        const b = el('button', 'kx-w ' + e.who);
        txFill(b, e.w);
        b.setAttribute('aria-label', (e.who === 'them' ? 'their word ' : 'your word ') + e.w + ', tap to hear it');
        b.onclick = () => replay([e]);
        e.nodes = [b, document.createTextNode(' ')];
      }
      if (e.queued) e.nodes.forEach(n => n.nodeType === 1 && n.classList.add('tx-queued'));
    }
    return e.nodes;
  }

  /* A sentence runs from its first word up to and including its BT. */
  function playBtn(e) {
    if (!e.play) {
      const b = el('button', 'kx-play');
      b.setAttribute('aria-label', 'Play this sentence');
      b.onclick = () => {
        const i = phrase.indexOf(e);
        if (i < 0) return;
        const list = [];
        for (let k = i; k < phrase.length; k++) {
          list.push(phrase[k]);
          if (phrase[k].br) break;
        }
        replay(list);
      };
      e.play = b;
    }
    return e.play;
  }

  function replay(list) {
    const items = list
      .filter(e => e.nodes && !e.nodes[0].classList.contains('tx-queued'))
      .map(e => e.br ? { node: e.nodes[0], letters: [{ el: e.nodes[0], code: BT }] } : txItem(e.nodes[0], e.w));
    if (items.length) txPlay({ kind: 're', owner: me, items });
  }

  function renderPhrase() {
    const p = opts.phraseEl;
    const want = [];
    if (!phrase.length) want.push(emptyEl);
    phrase.forEach((e, i) => {
      if (!e.br && (i === 0 || phrase[i - 1].br)) want.push(playBtn(e));
      want.push(...entryNodes(e));
    });
    const kids = p.childNodes;
    let i = 0;
    while (i < want.length && kids[i] === want[i]) i++;
    while (kids.length > i) p.lastChild.remove();
    for (; i < want.length; i++) p.append(want[i]);
    if (opts.onPhrase) opts.onPhrase(phrase.length);
    /* The hint line depends on the phrase too (BT only after a word). */
    if (!syms) render();
  }

  function commit() {
    clearTimeout(gapTimer);
    if (!syms) return;
    if (syms === BT && !word) {
      syms = '';
      if (addBreak('you') && opts.onBreak) opts.onBreak();
      render();
      return;
    }
    const ch = morseLetter(syms);
    if (ch && word.length < WORD_MAX) { word += ch; note = ''; }
    else if (!ch) note = morseSpaced(syms) + ' is not a character — dropped';
    syms = '';
    render();
    startWordGap();
  }

  /* A break only means something after a word, and two in a row say no more
     than one. */
  function addBreak(who) {
    const last = phrase[phrase.length - 1];
    if (!last || last.br) {
      if (who === 'you') note = phrase.length ? 'Already on a new sentence' : 'Key a word first, then BT';
      return false;
    }
    const e = { br: true, who, queued: who === 'them' };
    phrase.push(e);
    if (phrase.length > PHRASE_MAX) phrase.splice(0, phrase.length - PHRASE_MAX);
    renderPhrase();
    /* Theirs plays in turn behind any word still arriving. */
    if (e.queued && e.nodes) {
      txPlay({
        kind: 'in', owner: me,
        items: [{ node: e.nodes[0], letters: [{ el: e.nodes[0], code: BT }] }],
        onStart() { e.queued = false; e.nodes[1].classList.remove('tx-queued'); }
      });
    }
    return true;
  }

  function down() {
    txCancel(me, 're');
    clearTimeout(gapTimer);
    stopWordGap();
    note = '';
    downAt = Date.now();
    keyToneOn();
  }

  function up() {
    if (!downAt) return;
    const held = Date.now() - downAt;
    downAt = 0;
    keyToneOff();
    syms += held > DOT_MAX ? '-' : '.';
    render();
    gapTimer = setTimeout(commit, LETTER_GAP);
  }

  /* Your own words land whole: you just keyed them. Theirs arrive live. */
  function addWord(w, who, cb = {}) {
    const e = { w, who, queued: who === 'them' };
    phrase.push(e);
    if (phrase.length > PHRASE_MAX) phrase.splice(0, phrase.length - PHRASE_MAX);
    renderPhrase();
    if (!e.queued) return;
    if (!e.nodes) { if (cb.onDone) cb.onDone(); return; }
    txPlay({
      kind: 'in', owner: me,
      items: [txItem(e.nodes[0], w)],
      onStart() { e.queued = false; if (cb.onStart) cb.onStart(); },
      onDone: cb.onDone
    });
  }

  function done() {
    stopWordGap();
    commit();
    stopWordGap();
    if (!word) return;
    const w = word;
    word = '';
    addWord(w, 'you');
    if (opts.onWord) opts.onWord(w);
    render();
  }

  function clearPhrase(tell) {
    txCancel(me);
    phrase = [];
    renderPhrase();
    if (tell && opts.onClear) opts.onClear();
  }

  function stop() {
    clearTimeout(gapTimer);
    stopWordGap();
    downAt = 0;
    keyToneOff();
  }

  key.addEventListener('contextmenu', e => e.preventDefault());
  key.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { key.setPointerCapture(e.pointerId); } catch (err) {}
    down();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => key.addEventListener(t, up));

  btnBack.onclick = () => {
    clearTimeout(gapTimer);
    note = '';
    if (syms) syms = '';
    else word = word.slice(0, -1);
    render();
    if (!syms) startWordGap();
  };
  btnDone.onclick = done;
  /* Clearing reaches the other phone too, so it takes a second tap. */
  btnClear.onclick = () => {
    if (!phrase.length) return;
    if (Date.now() - clearArmed > 3000) {
      clearArmed = Date.now();
      btnClear.textContent = 'Sure?';
      setTimeout(() => { if (Date.now() - clearArmed >= 3000) btnClear.textContent = 'Clear'; }, 3100);
      return;
    }
    clearArmed = 0;
    btnClear.textContent = 'Clear';
    clearPhrase(true);
  };

  render();
  renderPhrase();

  return {
    refresh: render,
    stop,
    addWord,
    addBreak,
    clearPhrase,
    count: () => phrase.length,
    reset() { stop(); txCancel(me); syms = ''; word = ''; note = ''; phrase = []; render(); renderPhrase(); }
  };
}

function updateCallPhrase() {
  ui.callPhrase.hidden = ui.callKeyer.hidden && !(callKeyer && callKeyer.count());
}

function openCallKeyer(on) {
  ui.callKeyer.hidden = !on;
  ui.btnMorse.setAttribute('aria-pressed', String(on));
  if (!on && callKeyer) callKeyer.stop();
  updateCallPhrase();
  if (on) {
    audio();
    ui.callPhrase.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
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
  /* A press is a user gesture, the moment iOS lets audio restart. */
  audio();
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
  'verNow', 'verLatest', 'verFoot', 'dropBar', 'dropText', 'btnDropPair',
  'watching', 'codeCam', 'btnCamSwitch', 'btnCamSwitch2', 'btnDrill', 'drillPrompt', 'drillSub', 'drillPanel', 'drillSyms',
  'drillCands', 'drillChoices', 'drillKey', 'drillFeedback', 'drillScore', 'btnDrillSend',
  'btnDrillHear', 'btnDrillDigits', 'btnDrillMarks', 'btnDrillReplay', 'btnDrillSkip',
  'btnDrillBack', 'btnDrillChart', 'morseSheet', 'morseChart', 'btnMorseClose',
  'btnDrillLive', 'drillTogs', 'freeKeyer', 'freePhrase', 'btnMorse', 'callKeyer',
  'callPhrase', 'togRange', 'groupRow', 'btnAdd', 'meters'].forEach(k => {
  if (!ui[k]) ui[k] = document.createElement('span');
});

function openSheet(on) {
  ui.sheet.hidden = !on;
}
ui.btnSettings.onclick = () => openSheet(ui.sheet.hidden);
ui.btnSheetClose.onclick = () => openSheet(false);
/* Tapping the backdrop closes it; taps inside the card must not. */
ui.sheet.addEventListener('click', e => { if (e.target === ui.sheet) openSheet(false); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { openSheet(false); openMorseChart(false); }
});

freeKeyer = makeKeyer(ui.freeKeyer, {
  doneLabel: 'Word done',
  emptyText: 'Finished words build up here. Tap one to hear it.',
  phraseEl: ui.freePhrase
});
callKeyer = makeKeyer(ui.callKeyer, {
  doneLabel: 'Send word',
  emptyText: 'Finished words show here on both phones: yours amber, theirs teal.',
  phraseEl: ui.callPhrase,
  onWord: w => sendAll({ t: 'mword', w }),
  onClear: () => sendAll({ t: 'mclear' }),
  onBreak: () => sendAll({ t: 'mbreak' }),
  onPhrase: updateCallPhrase
});
ui.btnMorse.onclick = () => openCallKeyer(ui.callKeyer.hidden);
ui.btnAdd.onclick = () => addPerson().catch(e => { toast(e.message || 'Could not add', 5000); cancelAdd(); });

ui.btnDrill.onclick = openDrill;
ui.btnDrillLive.onclick = () => setDrillMode('live');
ui.btnDrillBack.onclick = closeDrill;
ui.btnDrillSend.onclick = () => setDrillMode('send');
ui.btnDrillHear.onclick = () => setDrillMode('hear');
ui.btnDrillDigits.onclick = () => {
  drillDigits = !drillDigits;
  ui.btnDrillDigits.setAttribute('aria-pressed', String(drillDigits));
  nextDrill();
};
ui.btnDrillMarks.onclick = () => {
  drillMarks = !drillMarks;
  ui.btnDrillMarks.setAttribute('aria-pressed', String(drillMarks));
  nextDrill();
};
ui.btnDrillReplay.onclick = () => playMorseCode(MORSE[drillTarget]);
ui.btnDrillSkip.onclick = () => {
  drillStreak = 0;
  drillSay(drillTarget + '   ' + morsePretty(MORSE[drillTarget]));
  renderDrill();
  clearTimeout(drillNextTimer);
  drillNextTimer = setTimeout(nextDrill, 1400);
};
ui.btnDrillChart.onclick = () => openMorseChart(true);
ui.btnMorseClose.onclick = () => openMorseChart(false);
ui.morseSheet.addEventListener('click', e => { if (e.target === ui.morseSheet) openMorseChart(false); });

ui.drillKey.addEventListener('contextmenu', e => e.preventDefault());
ui.drillKey.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { ui.drillKey.setPointerCapture(e.pointerId); } catch (err) {}
  drillKeyDown();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.drillKey.addEventListener(type, () => drillKeyUp());
});

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

ui.togRange.onclick = () => {
  setLongRange(!longRange, true);
  toast(longRange ? 'Long range on, both phones' : 'Normal voice, both phones', 2600);
};

ui.togRoger.onclick = () => {
  rogerBeep = !rogerBeep;
  ui.togRoger.setAttribute('aria-pressed', String(rogerBeep));
  save();
};

/* Safety releases. */
window.addEventListener('blur', releaseHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseHold();
    /* Switching to another app frees the microphone for it straight away -
       unless this phone is live in Open mode, which is meant to carry on
       from a pocket. */
    if (!live && channelUp) releaseMic();
  } else requestWakeLock();
});

if (navigator.mediaDevices && 'ondevicechange' in navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (micIsOpen()) showInput();
    if (!ui.views.live.hidden) refreshOutputs();
  });
}

/* ---------------- boot ---------------- */

purgeStoredData();
load();
ui.verFoot.textContent = 'v' + verText(APP_VERSION);
document.querySelectorAll('.mode').forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
setMicGain(micGain);
updateVoiceBtn();
checkVersion();
watchWorkerUpdates();
loadName();
initInstall();
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

/* isSecureContext is the browser's own verdict, so it also covers a LAN
   origin whitelisted for testing, which a protocol/hostname check misses. */
const secureHere = window.isSecureContext === true;
if ('serviceWorker' in navigator && window === window.top && secureHere) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

})();
