/* Girgir — peer-to-peer LAN intercom. No server, no internet.
   Signalling is a two-step QR exchange; audio and control run over WebRTC. */
(() => {
'use strict';

const PROTO = 'E1';
const $ = id => document.getElementById(id);

/* This tool keeps no records: no history, no recordings, no settings carried
   between launches. Flip this to true if you would rather it remembered your
   mode, toggles and volume. */
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
let route = 'earpiece';
let mode = 'hold', live = false, openMuted = false, remoteLive = false;
let halfDuplex = true, rogerBeep = true, volume = 100, keepAwake = true;
let actx = null, micAnalyser = null, remoteAnalyser = null, rafId = 0;
let scanning = false, scanStream = null, jsqrLoad = null;
let wakeLock = null, hbTimer = 0, statsTimer = 0, rtt = null;
let pingSeq = 0, duckTimer = 0, holdTimer = 0, urgentArmed = false;
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

function playPing(urgent) {
  const ctx = audio();
  if (!ctx) return;
  const base = urgent ? 1046.5 : 880;
  const offsets = urgent ? [0, 0.17, 0.34] : [0];
  offsets.forEach(o => bell(ctx, base, ctx.currentTime + o));
  duck(urgent ? 620 : 380);
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
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(micRaw).connect(micGainNode);
      micGainNode.connect(micAnalyser);
      micGainNode.connect(dest);
      micStream = dest.stream;
    } catch (e) {
      micGainNode = null;
      micAnalyser = null;
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
    else if (m.t === 'ping') { receivePing(!!m.urgent); sendCtl({ t: 'ack', id: m.id }); }
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

function startHeartbeat() {
  stopHeartbeat();
  hbTimer = setInterval(() => {
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

  toast('Pairing again. Have them tap Join channel.', 8000);
  stopHeartbeat();
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
  await createChannel();
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

function scheduleRecovery() {
  clearTimeout(recoverTimer);
  recoverTimer = setTimeout(attemptRecovery, 2000);
}

async function attemptRecovery(force) {
  if (!pc || recovering) return;
  if (!force && pc.connectionState === 'connected') return;

  if (!dc || dc.readyState !== 'open') {
    toast('Link lost. Tap Relink, and have them tap Join channel.', 7000);
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

function receivePing(urgent) {
  playPing(urgent);
  buzz(urgent ? [0, 130, 80, 130, 80, 220] : [0, 150]);
  ui.flash.classList.toggle('urgent', urgent);
  ui.flash.hidden = true;
  void ui.flash.offsetWidth;
  ui.flash.hidden = false;
  setTimeout(() => { ui.flash.hidden = true; }, 540);
  toast(urgent ? 'Urgent ping' : 'Ping');
}

let lastPingAt = 0;
function sendPing(urgent) {
  const now = Date.now();
  if (now - lastPingAt < 900) return;
  lastPingAt = now;
  if (!dc || dc.readyState !== 'open') { toast('Not linked'); return; }
  sendCtl({ t: 'ping', urgent, id: ++pingSeq });
  playSent();
  buzz(urgent ? [0, 60, 50, 60] : 25);
  ui.ping.classList.add('sent');
  setTimeout(() => ui.ping.classList.remove('sent'), 400);
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
      recovering = false;
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

/* ---------------- pairing flow ---------------- */

async function createChannel() {
  try {
    await ensureMic();
  } catch (e) {
    toast('Microphone blocked. Allow it in site settings.', 5000);
    return;
  }
  setPill('pairing', 'PAIRING');
  amOfferer = true;
  newPeer();
  wireChannel(pc.createDataChannel('ctl', { ordered: true }));
  micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
  preferOpus();
  await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: true }));
  await gatheringDone();
  const code = await packDesc('O', pc.localDescription.sdp);
  showCode(code, 'STEP 1 OF 2', 'Let the other phone scan this, then tap below.',
    'Now scan their code', () => openScanner('STEP 2 OF 2', 'Scan the code their phone shows.', takeAnswer));
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
  showCode(answer, 'STEP 2 OF 2', 'Let their phone scan this. You will connect automatically.',
    'Waiting for them…', () => { if (pc.connectionState !== 'connected') toast('Still waiting for them to scan'); });
}

async function takeAnswer(code) {
  const { role, sdp } = await unpackDesc(code);
  if (role !== 'A') throw new Error('That is the wrong code — scan their reply code.');
  ui.camWrap.hidden = true;
  ui.scanStep.textContent = 'CONNECTING';
  ui.scanHint.textContent = 'Linking up…';
  await pc.setRemoteDescription({ type: 'answer', sdp });
}

function showCode(code, step, hint, nextLabel, onNext) {
  ui.codeStep.textContent = step;
  ui.codeHint.textContent = hint;
  ui.codeText.value = code;
  ui.btnNext.textContent = nextLabel;
  ui.btnNext.onclick = onNext;
  show('code');
  requestAnimationFrame(() => {
    try { drawQR(code, ui.qrCanvas); }
    catch (e) { toast('Code too long for a QR — use the text option', 5000); }
  });
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

async function openScanner(step, hint, handler) {
  ui.scanStep.textContent = step;
  ui.scanHint.textContent = hint;
  ui.camWrap.hidden = false;
  ui.pasteText.value = '';
  ui.btnPaste.onclick = () => consume(ui.pasteText.value, handler);
  show('scan');

  const detector = await nativeDetector();
  if (!detector) {
    try { await loadJsQR(); }
    catch (e) { toast('QR reader unavailable — paste the code instead', 5000); }
  }

  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
  } catch (e) {
    toast('Camera blocked — paste the code instead', 5000);
    return;
  }
  ui.cam.srcObject = scanStream;
  await ui.cam.play().catch(() => {});
  scanning = true;

  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d', { willReadFrequently: true });
  let busy = false;

  const tick = async () => {
    if (!scanning) return;
    const v = ui.cam;
    if (!busy && v.readyState >= 2 && v.videoWidth) {
      busy = true;
      try {
        const side = Math.min(v.videoWidth, v.videoHeight);
        const s = Math.min(side, 760);
        canvas.width = s;
        canvas.height = s;
        g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, s, s);
        let text = null;
        if (detector) {
          const codes = await detector.detect(canvas);
          if (codes && codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          const img = g.getImageData(0, 0, s, s);
          const found = jsQR(img.data, s, s, { inversionAttempts: 'dontInvert' });
          if (found) text = found.data;
        }
        if (text && text.startsWith(PROTO)) {
          buzz(30);
          consume(text, handler);
          return;
        }
      } catch (e) { /* skip this frame */ }
      busy = false;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function stopScanner() {
  scanning = false;
  cancelAnimationFrame(rafId);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  ui.cam.srcObject = null;
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
  ui.resumeText.textContent = last === 'O'
    ? 'You were hosting the last channel. Resume shows a fresh code for them to scan.'
    : 'You joined the last channel. Resume opens the scanner for their fresh code.';
  ui.resumeBar.hidden = false;
  ui.btnResume.onclick = () => {
    ui.resumeBar.hidden = true;
    const go = last === 'O' ? createChannel() : joinChannel();
    go.catch(e => toast(e.message || 'Could not start', 5000));
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

/* Ping: tap sends one, press and hold sends the urgent triple. */
ui.ping.addEventListener('contextmenu', e => e.preventDefault());
ui.ping.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { ui.ping.setPointerCapture(e.pointerId); } catch (err) {}
  urgentArmed = false;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { urgentArmed = true; sendPing(true); }, 550);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
  ui.ping.addEventListener(type, () => {
    clearTimeout(holdTimer);
    if (type === 'pointerup' && !urgentArmed) sendPing(false);
    urgentArmed = false;
  });
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
  'resumeBar', 'resumeText', 'btnResume', 'btnResumeHide'].forEach(k => {
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
