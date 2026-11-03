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
const APP_VERSION = 35;

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
  btnCreate: $('btnCreate'), btnJoin: $('btnJoin'), btnGuide: $('btnGuide'),
  btnDrill: $('btnDrill'), drillPrompt: $('drillPrompt'), drillSub: $('drillSub'),
  drillPanel: $('drillPanel'), drillSyms: $('drillSyms'), drillCands: $('drillCands'),
  drillChoices: $('drillChoices'), drillKey: $('drillKey'), drillFeedback: $('drillFeedback'),
  drillScore: $('drillScore'), btnDrillSend: $('btnDrillSend'), btnDrillHear: $('btnDrillHear'),
  btnDrillPool: $('btnDrillPool'), btnDrillReplay: $('btnDrillReplay'),
  btnDrillSkip: $('btnDrillSkip'), btnDrillBack: $('btnDrillBack'),
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
  togEars: $('togEars'),
  togMorse: $('togMorse'), togMorseHelp: $('togMorseHelp'),
  morsePanel: $('morsePanel'), morseSyms: $('morseSyms'), morseCands: $('morseCands'),
  morseText: $('morseText'), morseGrid: $('morseGrid'), morseSheet: $('morseSheet'),
  btnMorseHide: $('btnMorseHide'), btnMorseClear: $('btnMorseClear'),
  btnMorseChart: $('btnMorseChart'), btnMorseClose: $('btnMorseClose'),  flash: $('flash'), toast: $('toast'), remoteAudio: $('remoteAudio')
};

/* ---------------- state ---------------- */

let pc = null, dc = null;
let micStream = null, micTrack = null, remoteStream = null;
let micRaw = null, micRawTrack = null, micGainNode = null, micGain = 100;
let myName = '', peerName = '';
let amOfferer = false, recoverTimer = 0, recovering = false;
let lastOfferCode = '', linkedOnce = false;
/* Which form the other phone's last code arrived in, and whether the short
   form is still trusted on this pairing. A failure that produced no route at
   all is the one signature that would follow from a description this phone
   rebuilt wrongly, so the next code goes out whole rather than asking anyone
   to decide anything. */
let lastRemoteForm = '', lastLocalForm = '', shortFormOk = true, shortFormWhy = '';
/* What the ICE agent held the moment the other side's description was
   applied. Counting only at failure cannot tell a description that was
   refused on arrival from one whose addresses were taken up and later
   discarded - and those are different faults with the same face. */
let heldOnArrival = -1, iceEverUp = false;
let standbyCode = '', standbyTimer = 0, lastHeard = 0;
let bus = null;
let route = 'earpiece';
let micDest = null, voice = 'off', voiceNodes = [];
let voiceTapTimer = 0, lastVoiceTap = 0, pingTaps = [];
let morseOn = false, morseHelp = true, morseHidden = false;
let morseSyms = '', morseText = '', morseLetterTimer = 0, morseWordTimer = 0;
let keyDownAt = 0, keyOsc = null, keyGain = null;
let mode = 'hold', live = false, openMuted = false, remoteLive = false;
let halfDuplex = true, rogerBeep = true, volume = 100, keepAwake = true;
let handsFree = false;
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
    localStorage.setItem('girgir', JSON.stringify({ mode, halfDuplex, rogerBeep, volume, handsFree, morseHelp }));
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

/* ---------------- the short form ----------------

   A full session description is around 1.7 kB of text, and almost all of it is
   the same on every phone in the world: the codec line, the bundle group, the
   SCTP port. Only a handful of fields actually differ - the ICE user and
   password, the DTLS fingerprint, the addresses, a payload number. Those come
   to about ninety bytes.

   So the short form carries only those, as bytes, and both phones rebuild the
   rest from a template they already share. The code goes from roughly 820
   characters to roughly 125, which is the difference between a 97-module QR
   and a 45-module one - the whole reason for doing it.

   Anything unexpected in the description (a second codec, a relayed
   candidate, a fingerprint that is not sha-256) and packing gives up, and the
   caller falls back to sending the whole text compressed, as before. */

const SETUPS = ['actpass', 'active', 'passive', 'holdconn'];
const DIRS = ['sendrecv', 'sendonly', 'recvonly', 'inactive'];
const MAX_MSG = 65536;   /* we only ever send a few bytes of control JSON */

function sdpSections(sdp) {
  const head = [], secs = [];
  let cur = null;
  sdp.replace(/\r\n/g, '\n').split('\n').forEach(l => {
    if (!l) return;
    if (l.slice(0, 2) === 'm=') { cur = { m: l.slice(2), lines: [] }; secs.push(cur); }
    else if (cur) cur.lines.push(l);
    else head.push(l);
  });
  return { head, secs };
}
function attrOf(lines, name) {
  const p = 'a=' + name + ':';
  for (let i = 0; i < lines.length; i++) if (lines[i].slice(0, p.length) === p) return lines[i].slice(p.length);
  return null;
}
function hasFlag(lines, name) {
  return lines.indexOf('a=' + name) >= 0;
}

/* Writing bytes into a growing array keeps the layout readable; the whole
   thing is under a hundred bytes, so the copying costs nothing. */
function Buf() { this.b = []; }
Buf.prototype.u8 = function (n) { this.b.push(n & 255); return this; };
Buf.prototype.u16 = function (n) { this.b.push((n >> 8) & 255, n & 255); return this; };
Buf.prototype.u32 = function (n) { this.b.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); return this; };
Buf.prototype.bytes = function (a) { for (let i = 0; i < a.length; i++) this.b.push(a[i] & 255); return this; };
Buf.prototype.str = function (s) { const e = new TextEncoder().encode(s); return this.u8(e.length).bytes(e); };
Buf.prototype.out = function () { return new Uint8Array(this.b); };

function Rdr(bytes) { this.a = bytes; this.i = 0; }
Rdr.prototype.u8 = function () { if (this.i >= this.a.length) throw new Error('short code'); return this.a[this.i++]; };
Rdr.prototype.u16 = function () { return (this.u8() << 8) | this.u8(); };
Rdr.prototype.u32 = function () { return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0; };
Rdr.prototype.take = function (n) {
  if (this.i + n > this.a.length) throw new Error('short code');
  const s = this.a.subarray(this.i, this.i + n); this.i += n; return s;
};
Rdr.prototype.str = function () { return new TextDecoder().decode(this.take(this.u8())); };

/* Which candidates a code actually carries, and the only answer to that
   question anywhere in this app. The packer uses it to decide what to write
   and the self-check uses it to decide what must survive; when those two had
   their own opinions, the check failed every healthy code on the first real
   phone to run it, because Chrome offers a TCP candidate on port 9 that the
   packer is right to drop and the check counted as damage.

   Only the first section's candidates travel: once the two ends agree on
   BUNDLE - and they always do, both being this app - everything rides on that
   one transport and the rest are never used. Of those, only UDP, only the
   first component, because a TCP candidate on the discard port needs a
   listening peer that no phone here offers, and RTCP has its own component
   only when rtcp-mux is off, which it never is. */
function carriedCands(lines) {
  const out = [];
  lines.forEach(l => {
    const c = /^a=candidate:\S+ (\d+) (udp|tcp) (\d+) (\S+) (\d+) typ (\w+)/i.exec(l);
    if (!c) return;
    if (c[6].toLowerCase() !== 'host') throw new Error('not a local candidate');
    if (c[1] !== '1' || c[2].toLowerCase() !== 'udp') return;
    out.push({ addr: c[4], port: +c[5] });
  });
  return out;
}

/* Candidate address kinds. An address is four bytes, sixteen bytes of UUID, a
   full IPv6 address, or - if it is none of those - the text as written. */
const A4 = 0, AMDNS = 1, A6 = 2, ATXT = 3;

/* An IPv6 address is sixteen bytes however it is written, and a phone on an
   IPv6 network offers two or three of them, so it is worth unpicking the
   shorthand rather than carrying the text. */
function ip6Bytes(addr) {
  if (addr.indexOf(':') < 0 || /[^0-9a-f:.]/i.test(addr)) return null;
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const grow = part => {
    if (!part) return [];
    const out = [];
    for (const g of part.split(':')) {
      if (g.indexOf('.') >= 0) {
        const q = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(g);
        if (!q) return null;
        const o = q.slice(1).map(Number);
        if (o.some(n => n > 255)) return null;
        out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
        out.push(parseInt(g, 16));
      }
    }
    return out;
  };
  const head = grow(halves[0]), tail = halves.length > 1 ? grow(halves[1]) : [];
  if (!head || !tail) return null;
  let groups;
  if (halves.length > 1) {
    const gap = 8 - head.length - tail.length;
    if (gap < 1) return null;
    groups = head.concat(new Array(gap).fill(0), tail);
  } else groups = head;
  if (groups.length !== 8) return null;
  const b = [];
  groups.forEach(g => b.push((g >> 8) & 255, g & 255));
  return b;
}
function ip6Text(b) {
  const g = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[i] << 8) | b[i + 1]).toString(16));
  /* Collapse the longest run of zero groups, the way every tool writes it. */
  let best = -1, bestLen = 0, run = -1, len = 0;
  for (let i = 0; i <= 8; i++) {
    if (i < 8 && g[i] === '0') { if (run < 0) run = i; len++; }
    else { if (len > bestLen) { bestLen = len; best = run; } run = -1; len = 0; }
  }
  if (bestLen < 2) return g.join(':');
  return (g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':'));
}

function packAddr(buf, addr) {
  let m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(addr);
  if (m) {
    const o = [+m[1], +m[2], +m[3], +m[4]];
    if (o.every(n => n >= 0 && n <= 255)) return buf.u8(A4).bytes(o), A4;
  }
  m = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i.exec(addr);
  if (m) {
    const hex = m.slice(1).join(''), o = [];
    for (let i = 0; i < 32; i += 2) o.push(parseInt(hex.slice(i, i + 2), 16));
    return buf.u8(AMDNS).bytes(o), AMDNS;
  }
  const six = ip6Bytes(addr);
  if (six) return buf.u8(A6).bytes(six), A6;
  buf.u8(ATXT).str(addr);
  return ATXT;
}
function readAddr(r) {
  const kind = r.u8();
  if (kind === A4) { const b = r.take(4); return b[0] + '.' + b[1] + '.' + b[2] + '.' + b[3]; }
  if (kind === AMDNS) {
    const b = r.take(16); let h = '';
    for (let i = 0; i < 16; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
           h.slice(16, 20) + '-' + h.slice(20) + '.local';
  }
  if (kind === A6) return ip6Text(r.take(16));
  return r.str();
}

/* ---- pack ---- */

function packStruct(sdp) {
  const { secs } = sdpSections(sdp);
  if (!secs.length || secs.length > 2) throw new Error('unexpected media layout');

  let audio = null, data = null;
  secs.forEach((s, i) => {
    const mid = attrOf(s.lines, 'mid');
    if (mid !== String(i)) throw new Error('unexpected mid');
    if (/^audio /.test(s.m)) audio = s;
    else if (/^application /.test(s.m)) data = s;
    else throw new Error('unexpected media kind');
  });
  if (!audio) throw new Error('no audio');

  const first = secs[0];
  const ufrag = attrOf(first.lines, 'ice-ufrag');
  const pwd = attrOf(first.lines, 'ice-pwd');
  const setup = attrOf(first.lines, 'setup');
  const fp = attrOf(first.lines, 'fingerprint');
  if (!ufrag || !pwd || !fp || SETUPS.indexOf(setup) < 0) throw new Error('missing ICE parts');
  if (ufrag.length > 255 || pwd.length > 255) throw new Error('ICE parts too long');

  const fm = /^sha-256 ((?:[0-9a-f]{2}:){31}[0-9a-f]{2})$/i.exec(fp);
  if (!fm) throw new Error('fingerprint is not sha-256');
  const fpb = fm[1].split(':').map(h => parseInt(h, 16));

  const mp = /^audio \d+ UDP\/TLS\/RTP\/SAVPF (\d+)$/.exec(audio.m);
  if (!mp) throw new Error('more than one codec offered');
  const pt = +mp[1];
  if (attrOf(audio.lines, 'rtpmap') !== pt + ' opus/48000/2') throw new Error('codec is not opus');
  if (!hasFlag(audio.lines, 'rtcp-mux')) throw new Error('no rtcp-mux');

  const dir = DIRS.findIndex(d => hasFlag(audio.lines, d));
  if (dir < 0) throw new Error('no direction');

  let ssrc = 0;
  const sl = attrOf(audio.lines, 'ssrc');
  if (sl) { const n = parseInt(sl, 10); if (n > 0) ssrc = n >>> 0; }

  const cands = carriedCands(first.lines);
  if (cands.length > 15) cands.length = 15;

  const buf = new Buf();
  buf.u8(1);
  buf.u8((SETUPS.indexOf(setup) & 3) | ((dir & 3) << 2) | (data ? 16 : 0)
         | (data && secs[0] === data ? 32 : 0));
  buf.u8(pt);
  buf.str(ufrag);
  buf.str(pwd);
  buf.bytes(fpb);
  buf.u32(ssrc);
  buf.u8(cands.length);
  cands.forEach(c => { packAddr(buf, c.addr); buf.u16(c.port); });
  return buf.out();
}

/* ---- rebuild ---- */

function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }

function unpackStruct(bytes) {
  const r = new Rdr(bytes);
  if (r.u8() !== 1) throw new Error('newer code');
  const flags = r.u8();
  const setup = SETUPS[flags & 3], dir = DIRS[(flags >> 2) & 3], hasData = !!(flags & 16);
  const dataFirst = !!(flags & 32);
  const pt = r.u8();
  const ufrag = r.str(), pwd = r.str();
  const fpb = r.take(32);
  const ssrc = r.u32();
  const n = r.u8(), cands = [];
  for (let i = 0; i < n; i++) { const addr = readAddr(r); cands.push({ addr: addr, port: r.u16() }); }

  let fp = '';
  for (let i = 0; i < 32; i++) fp += (i ? ':' : '') + hex2(fpb[i]);

  const cname = 'g' + (ssrc || 1).toString(36);
  const candLines = cands.map((c, i) =>
    'a=candidate:' + (i + 1) + ' 1 udp ' + (2113937151 - i) + ' ' + c.addr + ' ' + c.port +
    ' typ host generation 0');

  const ice = [
    'a=ice-ufrag:' + ufrag,
    'a=ice-pwd:' + pwd,
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + fp,
    'a=setup:' + setup
  ];

  const L = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
             'a=group:BUNDLE' + (hasData ? ' 0 1' : ' 0'),
             'a=msid-semantic: WMS gs'];

  /* The media sections go back in the order they came in. Which one the browser
     puts first is its own business - Chrome leads with the audio even when the
     data channel was created first - but the answer has to echo the offer's
     labels, and those follow the order. Rebuilding them the other way round
     hands the far side an answer that labels the wrong section. */
  const audioAt = dataFirst ? 1 : 0;
  const sections = [];
  sections[audioAt] = () => {
    L.push('m=audio 9 UDP/TLS/RTP/SAVPF ' + pt, 'c=IN IP4 0.0.0.0', 'a=rtcp:9 IN IP4 0.0.0.0');
    candLines.forEach(l => L.push(l));
    ice.forEach(l => L.push(l));
    L.push('a=mid:' + audioAt, 'a=' + dir, 'a=msid:gs gt', 'a=rtcp-mux',
           'a=rtpmap:' + pt + ' opus/48000/2',
           'a=fmtp:' + pt + ' minptime=10;useinbandfec=1');
    if (ssrc) L.push('a=ssrc:' + ssrc + ' cname:' + cname, 'a=ssrc:' + ssrc + ' msid:gs gt');
  };
  if (hasData) sections[dataFirst ? 0 : 1] = () => {
    L.push('m=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0');
    /* The same addresses are repeated here, as the browser repeats them. Once
       the two ends agree on BUNDLE this section rides on the other one's
       transport and these are never used - but a phone that paired nothing at
       all is the one report that would follow from leaving them out, and they
       cost nothing, being already in hand. */
    candLines.forEach(l => L.push(l));
    ice.forEach(l => L.push(l));
    L.push('a=mid:' + (dataFirst ? 0 : 1), 'a=sctp-port:5000', 'a=max-message-size:' + MAX_MSG);
  };
  sections.forEach(fn => fn && fn());
  return L.join('\r\n') + '\r\n';
}

/* Header extensions and congestion feedback are optional on a LAN, and dropping
   them takes the QR down about three versions, which matters when one phone
   has to read the code off another phone's screen. */
function trimSdp(sdp) {
  return sdp.split('\r\n')
    .filter(l => !/^a=(extmap:|rtcp-fb:|msid-semantic)/.test(l))
    .join('\r\n');
}

/* A code is PROTO + role(O|A) + format + base64url payload, where the format
   is S for the short form, D or Z for the whole description compressed, and P
   for the whole description as it stands. */
/* The short form is an optimisation this app performs on the browser's own
   work, and a phone cannot be asked to take it on trust: a description
   rebuilt wrongly produces a code that scans perfectly and then pairs with
   nothing, which is the most expensive failure there is. So every phone
   proves it on itself before the code goes on screen.

   Three checks, in rising order of what they cost. Packing the rebuilt
   description again must give back the same bytes, or something was lost on
   the way through. The addresses and the fingerprint - the parts that have to
   survive exactly or there is no connection - must match the original text.
   And the browser itself must accept the result: a throwaway peer is handed
   the rebuilt description as a remote offer, which is the same parser that
   will read it on the other phone. Nothing here touches the network, asks for
   a permission, or outlives the call. */
async function shortFormHolds(sdp, short) {
  const rebuilt = unpackStruct(short);

  const again = packStruct(rebuilt);
  if (again.length !== short.length) return 'bytes changed on the way through';
  for (let i = 0; i < again.length; i++) {
    if (again[i] !== short[i]) return 'bytes changed on the way through';
  }

  /* Both sides of this comparison ask carriedCands what travels, so the check
     can no longer disagree with the packer about what a code is meant to hold.
     Two readings of that went out before this one: the whole description,
     where each media section has its own port for the same address, and then
     every candidate in the first section, which counted Chrome's TCP
     candidate on port 9 as something lost. */
  const firstLines = t => {
    const at = t.indexOf('\r\nm=');
    if (at < 0) return [];
    const rest = t.slice(at + 2), next = rest.indexOf('\r\nm=');
    return (next < 0 ? rest : rest.slice(0, next)).split('\r\n');
  };
  const show = cs => cs.map(c => c.addr + ':' + c.port).join(' ');
  const was = show(carriedCands(firstLines(sdp)));
  const now = show(carriedCands(firstLines(rebuilt)));
  if (was !== now) return 'addresses did not survive: ' + was + ' became ' + now;

  const fp = t => (/^a=fingerprint:(.+)$/m.exec(t) || [])[1];
  if (fp(sdp) !== fp(rebuilt)) return 'the fingerprint did not survive';

  /* An answer cannot be applied to a bare peer, but its text parses by the
     same rules, so it is offered up as one. Only the parse is being tested. */
  const probe = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
  try {
    await probe.setRemoteDescription({
      type: 'offer', sdp: rebuilt.replace(/^a=setup:.*$/gm, 'a=setup:actpass')
    });
  } catch (e) {
    return 'this browser will not read it back: ' + (e && e.message || e);
  } finally {
    try { probe.close(); } catch (e) {}
  }
  return '';
}

async function packDesc(role, sdp) {
  if (shortFormOk) {
    try {
      const short = packStruct(sdp);
      const wrong = await shortFormHolds(sdp, short);
      if (wrong) {
        shortFormOk = false;
        shortFormWhy = wrong;
      } else {
        lastLocalForm = 'S';
        return PROTO + role + 'S' + b64u(short);
      }
    } catch (e) { /* something unexpected in the description: send the whole thing */ }
  }
  lastLocalForm = 'D';
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
  if (role !== 'O' && role !== 'A') throw new Error('That code is malformed.');
  const payload = unb64u(text.slice(4));
  lastRemoteForm = tag;
  if (tag === 'S') return { role, sdp: unpackStruct(payload) };
  if (tag === 'P') return { role, sdp: new TextDecoder().decode(payload) };
  if (!FORMATS[tag]) throw new Error('That code came from a newer Girgir than this one. Update this phone.');
  return { role, sdp: new TextDecoder().decode(await expand(payload, FORMATS[tag])) };
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

/* ---------------- morse ---------------- */

/* The two charts people hand you are one table in different clothes. The
   alphabetical one answers "how do I send K", which you want when writing.
   The branching one answers "what could this still be", which is what you
   want while someone is sending - each dot or dash halves what is left. The
   helper below is that second chart: a prefix filter over this table. */
const MORSE = {
  A: '.-',    B: '-...',  C: '-.-.',  D: '-..',   E: '.',     F: '..-.',
  G: '--.',   H: '....',  I: '..',    J: '.---',  K: '-.-',   L: '.-..',
  M: '--',    N: '-.',    O: '---',   P: '.--.',  Q: '--.-',  R: '.-.',
  S: '...',   T: '-',     U: '..-',   V: '...-',  W: '.--',   X: '-..-',
  Y: '-.--',  Z: '--..',
  '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.', '0': '-----',
  '.': '.-.-.-', ',': '--..--', '?': '..--..'
};

/* Real Morse puts a dash at three dots, a letter gap at three and a word gap
   at seven. These keep those ratios around a deliberately slow 260 ms dot,
   which is about as fast as a thumb can be accurate. */
const DOT_MAX = 260;
const LETTER_GAP = 820;
const WORD_GAP = 1900;

function morseLetter(syms) {
  for (const k in MORSE) if (MORSE[k] === syms) return k;
  return '';
}

function morseCandidates(prefix) {
  const out = [];
  for (const k in MORSE) if (MORSE[k].indexOf(prefix) === 0) out.push(k);
  return out;
}

function morsePretty(syms) {
  return syms.replace(/\./g, '·').replace(/-/g, '–');
}

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

/* The far end gets discrete symbols rather than a stream, so its tone is
   rebuilt at the right length instead of carried over the microphone. */
function morseBeep(sym) {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const dur = sym === '-' ? 0.24 : 0.08;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 620;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.008);
  g.gain.setValueAtTime(0.12, t0 + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.03);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.07);
}

function morseKeyDown() {
  keyDownAt = Date.now();
  clearTimeout(morseLetterTimer);
  clearTimeout(morseWordTimer);
  keyToneOn();
}

function morseKeyUp() {
  if (!keyDownAt) return;
  const held = Date.now() - keyDownAt;
  keyDownAt = 0;
  keyToneOff();
  morsePush(held > DOT_MAX ? '-' : '.', true);
}

/* mine says whether this phone keyed it. The far end replays the same
   symbols and runs no timers of its own, so the sender owns where the
   letters break and the two slates cannot drift apart. */
function morsePush(sym, mine) {
  morseSyms += sym;
  if (mine) {
    sendCtl({ t: 'mor', s: sym });
    morseLetterTimer = setTimeout(() => morseCommit(true), LETTER_GAP);
    morseWordTimer = setTimeout(() => morseSpace(true), WORD_GAP);
  }
  renderMorse();
}

function morseCommit(mine) {
  if (!morseSyms) return;
  morseText += morseLetter(morseSyms) || '¿';
  morseSyms = '';
  if (mine) sendCtl({ t: 'mor', s: '|' });
  renderMorse();
}

function morseSpace(mine) {
  morseCommit(mine);
  if (morseText && morseText.slice(-1) !== ' ') {
    morseText += ' ';
    if (mine) sendCtl({ t: 'mor', s: '_' });
  }
  renderMorse();
}

function morseClear(mine) {
  clearTimeout(morseLetterTimer);
  clearTimeout(morseWordTimer);
  morseSyms = '';
  morseText = '';
  if (mine) sendCtl({ t: 'mor', s: 'x' });
  renderMorse();
}

function renderMorse() {
  ui.morseSyms.textContent = morseSyms ? morsePretty(morseSyms) : '—';

  ui.morseCands.hidden = !morseHelp;
  if (morseHelp) {
    const left = morseCandidates(morseSyms);
    const exact = morseLetter(morseSyms);
    if (!left.length) {
      ui.morseCands.textContent = 'nothing has that pattern — pause to clear it';
    } else {
      ui.morseCands.innerHTML = '';
      if (exact) {
        const b = document.createElement('b');
        b.textContent = exact;
        ui.morseCands.appendChild(b);
        ui.morseCands.appendChild(document.createTextNode(' · '));
      }
      ui.morseCands.appendChild(document.createTextNode(
        left.filter(k => k !== exact).join(' ') || 'nothing longer'));
    }
  }

  const shown = morseHidden ? morseText.replace(/[^ ]/g, '•') : morseText;
  ui.morseText.textContent = shown || '—';
  ui.morseText.classList.toggle('masked', morseHidden);
}

function renderMorseChart() {
  if (ui.morseGrid.childElementCount) return;
  Object.keys(MORSE).forEach(k => {
    const d = document.createElement('div');
    d.className = 'mg';
    const b = document.createElement('b');
    b.textContent = k;
    const s = document.createElement('span');
    s.textContent = morsePretty(MORSE[k]);
    d.appendChild(b);
    d.appendChild(s);
    ui.morseGrid.appendChild(d);
  });
}

function setMorse(on, fromPeer) {
  morseOn = !!on;
  ui.togMorse.setAttribute('aria-pressed', String(morseOn));
  ui.morsePanel.hidden = !morseOn;
  if (morseOn) {
    setLive(false);
    renderMorse();
  } else {
    clearTimeout(morseLetterTimer);
    clearTimeout(morseWordTimer);
    keyToneOff();
  }
  updateTalk();
  /* Opening the keyer on one phone opens it on the other, because a message
     arriving on a screen that is not showing it is no use to anybody. */
  if (!fromPeer) sendCtl({ t: 'mor', on: morseOn });
}

/* ---------------- morse practice ---------------- */

/* Learning Morse needs both directions and neither needs a second phone, so
   practice lives outside the channel entirely: it never touches the data
   channel and works with nothing paired. */
let drillMode = 'send', drillDigits = false, drillTarget = '';
let drillSyms = '', drillDownAt = 0, drillTimer = 0, drillNextTimer = 0;
let drillStreak = 0, drillBest = 0;

function drillPool() {
  const all = Object.keys(MORSE);
  return drillDigits ? all.filter(k => /[A-Z0-9]/.test(k)) : all.filter(k => /[A-Z]/.test(k));
}

/* A whole character at a steady speed, which is the only way the rhythm of a
   letter ever becomes recognisable. */
function playMorseCode(code) {
  const ctx = audio();
  if (!ctx) return;
  const unit = 0.09;
  let t = ctx.currentTime + 0.06;
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
}

function renderDrill() {
  ui.drillSyms.textContent = drillSyms ? morsePretty(drillSyms) : '—';
  ui.drillCands.hidden = !morseHelp || drillMode !== 'send';
  if (!ui.drillCands.hidden) {
    const left = morseCandidates(drillSyms);
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
  drillSay('✓ ' + drillTarget + '   ' + morsePretty(MORSE[drillTarget]), 'good');
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
  drillWrong('that was ' + morsePretty(sent) + (was ? ' — ' + was : '') +
             '.  ' + drillTarget + ' is ' + morsePretty(MORSE[drillTarget]));
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
    drillWrong('that was ' + drillTarget + '   ' + morsePretty(MORSE[drillTarget]));
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
  const pool = drillPool();
  let next = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1) {
    while (next === drillTarget) next = pool[Math.floor(Math.random() * pool.length)];
  }
  drillTarget = next;
  drillSay('—');

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
  drillStreak = 0;
  nextDrill();
}

function openDrill() {
  show('drill');
  /* A tap got us here, so the context is allowed to start now. */
  audio();
  setDrillMode(drillMode);
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
  /* On earphones the phone is going in a pocket, so the session has to keep
     claiming it is playing even between turns or Android will freeze it. */
  setSessionState(on || mode === 'open' || handsFree);
  updateTalk();
  updateStatus();
}

function releaseHold() {
  /* OPEN is continuous by definition. On earphones the gate is driven from
     the cable, and the screen going dark is exactly when you still want that
     to work - but only for LATCH. HOLD keeps cutting out whenever the app
     leaves the screen, because a held finger cannot be verified from here. */
  if (mode === 'open') return;
  if (handsFree && mode === 'latch') return;
  setLive(false);
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
  if (morseOn) {
    ui.talk.classList.remove('live', 'muted');
    ui.liveBanner.hidden = true;
    ui.talkLabel.textContent = 'KEY \u00b7 SHORT = DOT';
    return;
  }
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
    if (m.t === 'mor') {
      if (m.on != null) { if (!!m.on !== morseOn) setMorse(!!m.on, true); return; }
      if (m.s === '|') morseCommit(false);
      else if (m.s === '_') morseSpace(false);
      else if (m.s === 'x') morseClear(false);
      else if (m.s === '.' || m.s === '-') { morseBeep(m.s); morsePush(m.s, false); }
      return;
    }
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

function sameSubnet(a, b) {
  const pa = String(a).split('.'), pb = String(b).split('.');
  return pa.length === 4 && pb.length === 4 &&
    pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
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
  const sameLan = sameSubnet(a, b);
  /* The subnet is as close to a network name as a browser can get, so when
     the two do not match it is worth saying so rather than leaving two
     addresses to be compared by eye. */
  ui.vNet.textContent = sameLan
    ? pa.slice(0, 3).join('.') + '.x  \u00b7  ' + pa[3] + ' \u25b8 ' + pb[3]
    : 'not the same network  \u00b7  ' + a + ' \u25b8 ' + b;
  ui.vNet.classList.toggle('warn', !sameLan);
}

/* Whether the far side has ever sent us a connectivity check of its own.

   requestsReceived is the only counter that answers this. A phone that has
   not taken our reply up still *answers* our checks - it can validate them
   against the credentials it published in its own offer - so responsesReceived
   climbs normally and proves nothing. Measured on two peers in one browser:
   reply scanned, requestsReceived 6; reply ignored, requestsReceived 0 while
   responsesReceived still reached 6. */
/* What the two phones actually tried, and what came back from each attempt.

   Every message this screen can show is a summary, and a summary is exactly
   what stops being believable once it has been wrong. A phone that fails on
   its home Wi-Fi, on a hotspot and on everything else is not being blocked by
   any of them, and no worded guess will say which interface is swallowing the
   packets - the pairs will. Nothing here is stored: it is read from the live
   connection when the screen is drawn and goes when the page does. */
/* Every address a description actually carries, which is the thing the pair
   table cannot tell you when there are no pairs: whether the two phones had
   anything to put together in the first place. */
function sdpAddrs(sdp) {
  if (!sdp) return [];
  const seen = [];
  (sdp.match(/^a=candidate:.*$/gm) || []).forEach(l => {
    const m = /^a=candidate:\S+ (\d+) (\S+) \d+ (\S+) (\d+) typ (\w+)/.exec(l);
    if (!m || m[1] !== '1') return;
    const one = m[3] + ':' + m[4] + (m[5] === 'host' ? '' : ' ' + m[5]);
    if (seen.indexOf(one) < 0) seen.push(one);
  });
  return seen;
}

/* Who is meant to speak first in the encryption handshake. The offer says
   actpass, the answer picks active or passive, and the active side is the one
   that must open. Two passives and nobody ever opens it: the routes connect,
   the handshake never starts, and from the outside that is indistinguishable
   from a network that drops everything. Worth printing, since it is decided
   entirely by these two words. */
function sdpSetup(sdp) {
  if (!sdp) return '';
  const m = /^a=setup:(\S+)$/m.exec(sdp);
  return m ? m[1] : '';
}

function formName(tag) {
  return tag === 'S' ? 'short' : tag ? 'whole' : 'none';
}

/* Takes the connection to look at rather than reading the live one, because
   a failure schedules a recovery that replaces it, and a report that measured
   whatever happened to be there two seconds later is worse than no report.

   It also counts what the ICE agent itself holds, which is not the same thing
   as what the descriptions say. A description can name three addresses and the
   agent hold none of them, and those are completely different faults wearing
   the same face: no pairs. Until this was printed there was no way to tell
   them apart from the outside. */
/* The high-water mark of the other side's addresses, sampled over the first
   few seconds after their code goes in.

   One reading taken at a single instant was useless twice over: before this
   side has a local description there is no transport to hold them, and even
   after there is, the candidates are added a beat later. Both readings came
   back nought on the answering phone while ICE went on to connect, which
   cannot both be true, and the nought was read as a refusal. A maximum over
   several samples cannot be fooled that way: whatever the browser ever held,
   it held. */
function noteArrival(target) {
  heldOnArrival = -1;
  if (!target || !target.getStats) return;
  let left = 8;
  const tick = async () => {
    if (!target || target !== pc || target.signalingState === 'closed') return;
    try {
      let n = 0;
      (await target.getStats()).forEach(r => { if (r.type === 'remote-candidate') n++; });
      if (n > heldOnArrival) heldOnArrival = n;
    } catch (e) { return; }
    if (--left > 0) setTimeout(tick, 400);
  };
  tick();
}

async function pairSnapshot(target) {
  if (!target || !target.getStats) return null;
  const cands = new Map(), rows = [];
  let report;
  try { report = await target.getStats(); } catch (e) { return null; }
  let locals = 0, remotes = 0, dtls = '', srtp = '', role = '';
  report.forEach(r => {
    if (r.type === 'transport') {
      if (r.dtlsState) dtls = r.dtlsState;
      if (r.srtpCipher) srtp = r.srtpCipher;
      if (r.dtlsRole) role = r.dtlsRole;
    }
    if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
      cands.set(r.id, r);
      if (r.type === 'local-candidate') locals++; else remotes++;
    }
  });
  const pc = target;
  /* getStats blanks candidate addresses until the microphone is allowed, the
     same trap pollStats works around: the descriptions carry the addresses, so
     fall back to those rather than printing a row of question marks. */
  const myHost = sdpHost(pc.localDescription && pc.localDescription.sdp);
  const theirHost = sdpHost(pc.remoteDescription && pc.remoteDescription.sdp);
  report.forEach(r => {
    if (r.type !== 'candidate-pair') return;
    const l = cands.get(r.localCandidateId), m = cands.get(r.remoteCandidateId);
    const side = (c, fallback) => c
      ? ((c.address || fallback || 'address hidden') + ':' + (c.port || '?')
         + (c.candidateType && c.candidateType !== 'host' ? ' ' + c.candidateType : ''))
      : (fallback || '?');
    rows.push({
      line: side(l, myHost) + '  \u2192  ' + side(m, theirHost),
      state: r.state || '?',
      sent: r.requestsSent || 0,
      back: r.responsesReceived || 0,
      theirs: r.requestsReceived || 0,
      sel: !!(r.nominated || r.selected)
    });
  });
  rows.sort((a, b) => (b.sel - a.sel) || (b.back - a.back) || (b.sent - a.sent));
  return {
    rows: rows, locals: locals, remotes: remotes,
    ice: target.iceConnectionState, gather: target.iceGatheringState,
    sig: target.signalingState, conn: target.connectionState,
    dtls: dtls, srtp: srtp, role: role,
    mySetup: sdpSetup(target.localDescription && target.localDescription.sdp),
    theirSetup: sdpSetup(target.remoteDescription && target.remoteDescription.sdp),
    offerer: amOfferer,
    localSdp: target.localDescription && target.localDescription.sdp,
    remoteSdp: target.remoteDescription && target.remoteDescription.sdp
  };
}

function footer() {
  return '\n\nGirgir ' + APP_VERSION + ' \u00b7 your code ' + formName(lastLocalForm)
    + ', theirs ' + formName(lastRemoteForm)
    + (shortFormWhy ? '\nShort form dropped: ' + shortFormWhy : '');
}

function formatPairs(snap) {
  if (!snap) return '';
  const rows = snap.rows;
  const mine = sdpAddrs(snap.localSdp);
  const theirs = sdpAddrs(snap.remoteSdp);
  const held = '\n  the browser is holding: ' + snap.locals + ' of your addresses, '
    + snap.remotes + ' of theirs'
    + (heldOnArrival >= 0
        ? ' (most of theirs ever held: ' + heldOnArrival + ')' : '')
    + '\n  states: ' + snap.sig + ' \u00b7 gathering ' + snap.gather
    + ' \u00b7 ice ' + snap.ice + ' \u00b7 link ' + snap.conn
    + '\n  encryption: ' + (snap.dtls || 'never started')
    + (snap.srtp ? ' \u00b7 ' + snap.srtp : '')
    + '\n  who opens it: this phone ' + (snap.offerer ? 'created' : 'answered')
    + ', ' + (snap.mySetup || '?') + ' against their ' + (snap.theirSetup || '?')
    + (snap.role ? ' \u00b7 acting as ' + snap.role : '');
  if (!rows.length) {
    /* No pairs is not the same failure as pairs that go unanswered, and saying
       nothing arrives would be a straight untruth: nothing was sent. */
    return 'No route was ever tried.\n\n  this phone offered: '
      + (mine.length ? mine.join(', ') : 'nothing')
      + '\n  their code carried: ' + (theirs.length ? theirs.join(', ') : 'nothing')
      + held
      + '\n\n' + (!mine.length || !theirs.length
        ? 'One side put up no address at all, so there was nothing to pair with.'
        : (!snap.remotes && heldOnArrival > 0)   /* held, then thrown away */
          ? 'Their addresses were taken up when the code went in and have '
            + 'since been thrown away, which is what happens when a link that '
            + 'was working is repaired and the repair goes unanswered. The '
            + 'addresses were never the problem.'
          : (!snap.remotes && heldOnArrival === 0)
            ? 'Their addresses were in the code and the browser took none of '
              + 'them up, so there was nothing to pair with. That is this '
              + 'browser refusing the addresses, not the network losing them.'
            : 'Both sides had addresses, the browser holds them, and it still '
              + 'put none of them together. Nothing was sent, so nothing was '
              + 'dropped on the way.')
      + footer();
  }
  const body = rows.map(r => (r.sel ? '\u2022 ' : '  ') + r.line + '\n    '
    + r.state + ' \u00b7 sent ' + r.sent + ' \u00b7 answered ' + r.back
    + ' \u00b7 their checks ' + r.theirs).join('\n');
  const mute = rows.every(r => r.back === 0);
  return body + held + '\n\n' + (mute
    ? 'Nothing answered on any route. Both phones are talking and neither is '
      + 'hearing, which is a VPN, Samsung Secure Wi-Fi, or client isolation '
      + 'on the network \u2014 and a phone that does this on a hotspot too has it '
      + 'on the phone, not the network.'
    : 'At least one route answered, so the two phones can reach each other.')
    + footer();
}

/* Appended next to whatever the screen already says, rather than replacing it. */
async function showPairs(hintEl, snap) {
  if (!hintEl || !hintEl.parentNode) return;
  let pre = hintEl.parentNode.querySelector('pre.pairs');
  if (!pre) {
    pre = document.createElement('pre');
    pre.className = 'pairs';
    hintEl.parentNode.insertBefore(pre, hintEl.nextSibling);
  }
  const txt = formatPairs(snap === undefined ? await pairSnapshot(pc) : snap);
  pre.textContent = txt;
  pre.hidden = !txt;
}

async function peerEverProbed() {
  if (!pc || !pc.getStats) return false;
  try {
    let seen = false;
    (await pc.getStats()).forEach(r => {
      if (r.type !== 'candidate-pair') return;
      if (r.requestsReceived > 0) seen = true;
    });
    return seen;
  } catch (e) { return false; }
}

/* LOST on its own says nothing, and the screen behind it still reads
   "Linking up" - which is how a dead link looks like a slow one. The two
   descriptions already hold the answer: a failure here is almost always one
   of three things, and which one is readable from the addresses the two
   sides offered each other. */
/* Two different things, and calling both of them 'expired' was wrong: a
   reply nobody has scanned yet is still perfectly good, and saying otherwise
   talked over a handover that went on to succeed. Only a connection that has
   actually failed takes the code down with it. */
function staleMsg(theirs, hard) {
  /* A .local name is Chrome hiding the address; printing one at someone is
     noise, not information. */
  const who = (theirs && !/\.local$/i.test(theirs)) ? theirs : 'the other phone';
  return hard
    ? 'Their phone never took this code up \u2014 ' + who + ' answered us but never sent ' +
      'a check of its own, which is what an unscanned reply looks like. This code has ' +
      'gone down with the connection: tap Fresh code and let them scan that one.'
    : 'Still not scanned \u2014 ' + who + ' is answering us but has not taken this reply ' +
      'up yet. The code below is still good, so there is nothing to redo: let them scan ' +
      'it, or send it as a link.';
}

function showStale(theirs, hard) {
  const msg = staleMsg(theirs, hard);
  toast(msg, hard ? 12000 : 8000);
  if (hard) setPill('lost', 'NOT SCANNED');
  const step = hard ? 'CODE EXPIRED' : 'NOT SCANNED YET';
  if (!ui.views.code.hidden) {
    ui.codeStep.textContent = step; ui.codeHint.textContent = msg; showPairs(ui.codeHint);
  } else if (!ui.views.scan.hidden) {
    ui.scanStep.textContent = step; ui.scanHint.textContent = msg; showPairs(ui.scanHint);
  }
  /* Only offered once the old code is genuinely dead. Replacing a working one
     invalidates the very code the other phone may be lining up on. */
  if (hard && lastOfferCode) {
    ui.btnNext.textContent = 'Fresh code';
    ui.btnNext.onclick = () => {
      const again = lastOfferCode;
      teardownPeer();
      consume(again, takeOffer);
    };
  }
  return msg;
}

/* The reply that nobody scans never fails - it hangs.

   Because the far phone answers our checks without holding our reply, ICE
   reaches 'connected' and stops there: DTLS never starts, because nothing on
   that side knows a handshake is due. connectionState sits on 'connecting'
   for as long as the page is open, which is the 'Linking up' that never
   finishes. Waiting for a failure here waits forever, so this watches for
   the signature instead - ICE up, no inbound check.

   The wait has to be generous. Every healthy pairing passes through this exact
   state between the reply going on screen and the other phone scanning it, and
   a ten second hold cut straight across a slow handover in testing and called
   a code dead that connected moments later. Walking a phone across a room is
   not a fault, so nothing is said for a full minute. */
const UPTAKE_QUIET_MS = 60000;
let uptakeTimer = 0;
function watchAnswerUptake() {
  clearInterval(uptakeTimer);
  let iceUpSince = 0;
  uptakeTimer = setInterval(async () => {
    if (!pc || amOfferer || pc.connectionState === 'connected') { clearInterval(uptakeTimer); return; }
    if (await peerEverProbed()) { clearInterval(uptakeTimer); return; }
    if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') { iceUpSince = 0; return; }
    if (!iceUpSince) { iceUpSince = Date.now(); return; }
    if (Date.now() - iceUpSince < UPTAKE_QUIET_MS) return;
    clearInterval(uptakeTimer);
    showStale(sdpHost(pc.remoteDescription && pc.remoteDescription.sdp), false);
  }, 2000);
}

async function explainFailure() {
  /* Held for the whole of this function: the recovery scheduled alongside it
     will put a different connection in pc, and this report is about the one
     that failed. */
  const target = pc;
  if (!target) return '';
  const mine = sdpHost(target.localDescription && target.localDescription.sdp);
  const theirs = sdpHost(target.remoteDescription && target.remoteDescription.sdp);
  showNet(mine, theirs);
  const snap = await pairSnapshot(target);
  const probed = !!snap && snap.rows.some(r => r.theirs > 0);
  const noRoutes = !!snap && !snap.rows.length;
  let msg, stale = false;
  if (noRoutes && (linkedOnce || iceEverUp)) {
    /* This link was up and is gone, so the empty pair table is the repair's,
       not the pairing's: an ICE restart throws the old routes away and waits
       for new ones that only arrive if the other side is still listening.
       Reporting that as "no route was ever tried" sent days of debugging at
       the network, the codes and the camera, none of which were involved. */
    msg = linkedOnce
      ? 'The link dropped and the repair found nobody \u2014 ' + (peerName || 'the other phone')
        + ' has gone quiet. This is not a pairing fault: the two did link. '
        + 'Pair again when they are back.'
      : 'The two phones reached each other and the encryption handshake on top '
        + 'never finished, so the link never completed. Not a network fault: '
        + 'the checks were crossing. Pair again with a fresh code on both.';
  } else if (noRoutes && mine && theirs) {
    /* Addresses on both sides and not one route tried, and the two never
       linked. Not packets going missing between the phones, because none were
       sent - so it does not get the client-isolation speech either. The short
       form used to be dropped here on the theory that a rebuilt description
       was the likely culprit; it was not, and demoting the codes on a failure
       they are measurably not part of only made the next report harder to
       read. The check in packDesc proves the rebuilding on its own. */
    msg = 'No route \u2014 both phones put up an address and the browser tried '
        + 'none of them. Nothing was sent, so nothing was lost on the way.';
  } else if (!mine || !theirs) {
    msg = 'No route \u2014 one phone offered no address at all. Allow the microphone on both, then pair again.';
  } else if (/\.local$/i.test(mine) || /\.local$/i.test(theirs)) {
    msg = 'No route \u2014 a browser hid its address behind a .local name and this network cannot resolve it. Allow the microphone on both phones before pairing.';
  } else if (!probed && !amOfferer) {
    /* Nothing was ever heard from them, and this phone is the one holding a
       reply on screen. That is a scan that has not happened, not a network
       that cannot carry it. */
    stale = true;
    msg = staleMsg(theirs, true);
  } else if (!sameSubnet(mine, theirs)) {
    msg = 'No route \u2014 ' + mine + ' and ' + theirs + ' are on different networks.';
  } else {
    /* Both ends are on one subnet and the packets still are not arriving.
       Client isolation is the usual reason but it is not the only one, and
       guessing at a single cause sent one debugging session down the wrong
       road - so name the addresses and let them be checked. */
    msg = 'No route: ' + mine + ' \u25b8 ' + theirs + '. Same network, but nothing ' +
          'arrives. A guest network, client isolation or a VPN on either device will ' +
          'each do this \u2014 a phone hotspot is the quickest way to tell which.';
  }
  toast(msg, 12000);
  if (!ui.views.scan.hidden) {
    ui.scanStep.textContent = stale ? 'CODE EXPIRED' : 'NO ROUTE';
    ui.scanHint.textContent = msg;
    showPairs(ui.scanHint, snap);
  }
  if (!ui.views.code.hidden) {
    ui.codeStep.textContent = stale ? 'CODE EXPIRED' : 'NO ROUTE';
    ui.codeHint.textContent = msg;
    showPairs(ui.codeHint, snap);
    if (stale) showStale(theirs, true);
  }
  return msg;
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
  clearInterval(uptakeTimer);
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
    navigator.mediaSession.setActionHandler('play', () => headsetTalk());
    navigator.mediaSession.setActionHandler('pause', () => headsetTalk());
    try {
      navigator.mediaSession.setActionHandler('nexttrack', () => sendPing(0));
      navigator.mediaSession.setActionHandler('previoustrack', () => cycleVoice());
    } catch (e) { /* these two are optional */ }
  } catch (e) { /* older or partial implementation */ }
}

/* The button on a headset arrives as a media key: one click is play or pause,
   two and three clicks are usually next and previous track.

   Which of play or pause a single click sends depends on what the session
   says is happening - and this session claims to be playing the whole time it
   is linked, because that is what stops Android freezing the page. So both
   are treated as the same thing, a toggle, and the gate itself is the only
   state that decides. There is no key-up event in any of it either, so a
   button cannot hold a gate open the way a finger can: in HOLD it latches.

   The one expression covers all three modes, because OPEN reads as not live
   while it is muted. */
function headsetTalk() {
  const on = !live;
  if (mode === 'open') openMuted = !on;
  setLive(on);
  updateTalk();
  buzz(on ? 18 : 10);
}

/* Echo cancellation is there to subtract this phone's own loudspeaker out of
   its own microphone. On earphones there is nothing to subtract, so it only
   costs clarity, and so does automatic gain riding the level up and down.
   Noise suppression stays on - that one is doing a different job.

   Not every browser will change this on a live track, so the result is read
   back and reported rather than assumed. */
async function setEars(on) {
  handsFree = on;
  ui.togEars.setAttribute('aria-pressed', String(on));
  save();
  if (!micRawTrack || !micRawTrack.applyConstraints) {
    toast(on ? 'Earphones on' : 'Earphones off', 2600);
    return;
  }
  try {
    await micRawTrack.applyConstraints({
      echoCancellation: !on,
      autoGainControl: !on,
      noiseSuppression: true
    });
    const got = micRawTrack.getSettings ? micRawTrack.getSettings() : {};
    if (on && got.echoCancellation === true) {
      toast('Earphones on. This browser keeps echo cancelling anyway.', 5000);
    } else {
      toast(on ? 'Earphones on \u2014 clearer mic, and LATCH survives your pocket'
               : 'Earphones off \u2014 echo cancelling back on', 4000);
    }
  } catch (e) {
    toast(on ? 'Earphones on. The mic settings could not be changed.' : 'Earphones off', 4000);
  }
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
    ui.dropText.textContent = linkedOnce
      ? (peerName || 'They') + ' left the channel. Going on standby \u2014 point the two phones at each other.'
      : 'Never linked up. Point the two phones at each other and pair again.';
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
  linkedOnce = false;
  iceEverUp = false;
  heldOnArrival = -1;
  pc = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
  pc.ontrack = ev => {
    remoteStream = ev.streams[0] || new MediaStream([ev.track]);
    ui.remoteAudio.srcObject = remoteStream;
    ui.remoteAudio.play().catch(() => {});
    attachRemoteAnalyser();
  };
  /* ICE reaching connected and the link completing are different events, and
     reporting only the second one cost days. ICE connects as soon as the two
     ends are exchanging checks; the link completes only once the encryption
     handshake on top of it finishes. A pair that does the first and not the
     second has reached each other perfectly well - saying "no route was ever
     tried" at that is the opposite of the truth. */
  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') iceEverUp = true;
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') {
      linkedOnce = true;
      clearInterval(uptakeTimer);
      clearTimeout(recoverTimer);
      clearTimeout(standbyTimer);
      recovering = false;
      ui.dropBar.hidden = true;
      setPill('linked', 'LINKED');
      goLive();
    } else if (s === 'failed' || s === 'disconnected') {
      setPill('lost', s === 'failed' ? 'LOST' : 'DROPPED');
      if (s === 'failed') explainFailure();
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
  lastOfferCode = code;
  const { role, sdp } = await unpackDesc(code);
  if (role !== 'O') throw new Error('That is the wrong code — scan the one from "Create channel".');
  newPeer();
  pc.ondatachannel = ev => wireChannel(ev.channel);
  await pc.setRemoteDescription({ type: 'offer', sdp });
  micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
  preferOpus();
  await pc.setLocalDescription(await pc.createAnswer());
  noteArrival(pc);
  await gatheringDone();
  const answer = await packDesc('A', pc.localDescription.sdp);
  watchAnswerUptake();
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
  noteArrival(pc);
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
  /* A short code has room to spare, so it gets the strong error correction:
     53 modules instead of 41, but a quarter of the code can be lost to glare,
     a scratch or a thumb and it still reads. A long fallback code cannot
     afford that and stays on the light level. */
  const qr = qrcode(0, text.length <= 300 ? 'Q' : 'L');
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
    /* A script that loads but defines nothing is a failure, not a success -
       claiming the backup is in use when it is not sends the scan back into
       exactly the silence this was meant to end. */
    s.onload = () => (window.jsQR ? res() : rej(new Error('jsQR missing')));
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
  } else {
    /* Warmed in the background, because a native decoder that reports itself
       healthy may still decode nothing, and the swap should not then wait on
       a download. */
    loadJsQR().catch(() => {});
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
/* Chrome on Android backs BarcodeDetector with a Play Services module that
   is fetched on demand. When that module is not there the object still
   exists, still reports qr_code among its formats, still constructs - and
   then returns an empty array for every frame it is ever given. Scanning
   fails silently and permanently, and the camera looks perfectly healthy
   while it happens.

   Nothing tells an empty result apart from "no code in shot", and two attempts
   to guess anyway both did damage. The first retired the native decoder after
   twenty barren frames and handed the camera to jsQR - but `nativeDead` is held
   for the life of the page, and twenty frames is two seconds, which is less time
   than it takes to line up a shot and let the camera focus. So a phone that had
   been reading codes perfectly would, the first time anyone was slow with it,
   permanently lose its good decoder in favour of the slower one, on a 97-module
   code where that difference decides it. The second attempt made the swap happen
   even when the backup had not loaded, leaving no decoder at all.

   The judgement was never answerable from the data, so it is not made any more.
   Both decoders run: the phone's own every frame, the backup alongside it on a
   lighter cycle. A broken native decoder costs nothing because the backup is
   already looking, and a working one is never taken away. */
const JS_EVERY = 3;   /* backup frames while the native decoder is also running */

/* However bad a decoder is, a scan that silently never ends is worse: there
   is always the link, and nothing was ever pointing at it. */
const SCAN_HINT_MS = 25000;

function runScanLoop(videoEl, detector, handler, filter) {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let busy = false;
  let det = detector;
  let frame = 0, hinted = false, noDecoder = false, jsqrAsked = false;
  const startedAt = Date.now();

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
        /* The phone's own decoder, every frame, for as long as the camera is
           open. It is the faster of the two and on most phones the better one,
           and nothing it does or fails to do takes it out of the loop. */
        if (det) {
          try {
            const codes = await det.detect(canvas);
            if (codes && codes.length) text = codes[0].rawValue;
          } catch (e) {
            /* Throwing is the one unambiguous failure, and even then only this
               scan gives up on it. */
            det = null;
          }
        }
        /* The backup, alongside rather than instead. On a lighter duty cycle
           while the native decoder is in play, because decoding a 760px frame
           in script is not free, and every frame once it is the only one left. */
        frame++;
        if (!text && window.jsQR && (!det || frame % JS_EVERY === 0)) {
          const img = g.getImageData(0, 0, sz, sz);
          const found = jsQR(img.data, sz, sz, { inversionAttempts: 'dontInvert' });
          if (found) text = found.data;
        }
        if (!text && !window.jsQR && !jsqrAsked) {
          jsqrAsked = true;
          loadJsQR().catch(() => { noDecoder = true; });
        }
        if (text && text.startsWith(PROTO) && (!filter || filter(text))) {
          buzz(30);
          consume(text, handler);
          return;
        }
        if (!text && !hinted && Date.now() - startedAt > SCAN_HINT_MS) {
          hinted = true;
          toast(noDecoder || (!det && !window.jsQR)
            ? 'This phone is not decoding QR codes at all \u2014 use Send as link, or paste the code'
            : 'Still nothing \u2014 fill the frame with the code, or use Send as link',
            10000);
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
  if (morseOn) setMorse(false, true);
  morseClear(false);
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
  if (morseOn) { morseKeyDown(); return; }
  if (mode === 'hold') setLive(true);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.talk.addEventListener(type, () => {
    if (morseOn) { morseKeyUp(); return; }
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
['vNet', 'btnRelink', 'sheet', 'btnSettings', 'btnSheetClose', 'micLvl', 'micVal', 'togEars',
  'togMorse', 'togMorseHelp', 'morsePanel', 'morseSyms', 'morseCands', 'morseText',
  'morseGrid', 'morseSheet', 'btnMorseHide', 'btnMorseClear', 'btnMorseChart', 'btnMorseClose',
  'btnDrill', 'drillPrompt', 'drillSub', 'drillPanel', 'drillSyms', 'drillCands',
  'drillChoices', 'drillKey', 'drillFeedback', 'drillScore', 'btnDrillSend', 'btnDrillHear',
  'btnDrillPool', 'btnDrillReplay', 'btnDrillSkip', 'btnDrillBack',
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
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  openSheet(false);
  ui.morseSheet.hidden = true;
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

ui.togRoger.onclick = () => {
  rogerBeep = !rogerBeep;
  ui.togRoger.setAttribute('aria-pressed', String(rogerBeep));
  save();
};

ui.togEars.onclick = () => { setEars(!handsFree); };

ui.togMorse.onclick = () => setMorse(!morseOn);

ui.togMorseHelp.onclick = () => {
  morseHelp = !morseHelp;
  ui.togMorseHelp.setAttribute('aria-pressed', String(morseHelp));
  renderMorse();
  save();
};

/* The listener's own choice, so it is never sent anywhere. */
ui.btnMorseHide.onclick = () => {
  morseHidden = !morseHidden;
  ui.btnMorseHide.setAttribute('aria-pressed', String(morseHidden));
  ui.btnMorseHide.textContent = morseHidden ? 'Reveal' : 'Hide';
  renderMorse();
};

ui.btnMorseClear.onclick = () => morseClear(true);

ui.btnDrill.onclick = openDrill;
ui.btnDrillBack.onclick = () => {
  clearTimeout(drillTimer);
  clearTimeout(drillNextTimer);
  keyToneOff();
  show('setup');
};
ui.btnDrillSend.onclick = () => setDrillMode('send');
ui.btnDrillHear.onclick = () => setDrillMode('hear');
ui.btnDrillPool.onclick = () => {
  drillDigits = !drillDigits;
  ui.btnDrillPool.setAttribute('aria-pressed', String(drillDigits));
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

ui.drillKey.addEventListener('contextmenu', e => e.preventDefault());
ui.drillKey.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { ui.drillKey.setPointerCapture(e.pointerId); } catch (err) {}
  drillKeyDown();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.drillKey.addEventListener(type, () => drillKeyUp());
});

ui.btnMorseChart.onclick = () => { renderMorseChart(); ui.morseSheet.hidden = false; };
ui.btnMorseClose.onclick = () => { ui.morseSheet.hidden = true; };
ui.morseSheet.addEventListener('click', e => {
  if (e.target === ui.morseSheet) ui.morseSheet.hidden = true;
});

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
ui.togEars.setAttribute('aria-pressed', String(handsFree));
ui.togMorseHelp.setAttribute('aria-pressed', String(morseHelp));
updateTalk();
setPill('idle', 'IDLE');
initBattery();

if (!navigator.mediaDevices || !window.RTCPeerConnection) {
  ui.btnCreate.disabled = ui.btnJoin.disabled = true;
  toast('This browser cannot do WebRTC. Open the page over HTTPS.', 8000);
}

/* The fallback decoder is fetched whether or not this browser claims to have
   one of its own, because a native decoder that quietly returns nothing
   cannot be told from an empty frame until it has been tried - and by the
   time it has, the network may well be gone. */
loadJsQR().catch(() => {});

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
