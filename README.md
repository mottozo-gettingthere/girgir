# Girgir

A two-phone intercom that runs with no internet, no server and no account.
Audio goes directly phone to phone over Wi-Fi using WebRTC. Pairing is a
two-step QR exchange, so nothing needs to broker the introduction.

Built for one Android phone and one iPhone, each with its own earphones.

It keeps no records: no call history, no recordings, no logs, and no settings
carried between launches. Anything an older version left on the phone is wiped
at startup.

Two values survive a launch: a boolean noting the app has been installed, so
the install hint stops appearing, and the name you chose for yourself. Nothing
else persists — no call history, no peer names, no settings — and **Clear
cache** removes both.

## What you need

- Both phones on the same Wi-Fi network. A phone hotspot counts, and it does
  not need an internet connection.
- The app loaded over HTTPS **once**, so it can install and cache itself.
  After that it runs fully offline.

## Setup, once

### 1. Put the files on HTTPS

Any static HTTPS host works. GitHub Pages is free and fine:

```bash
git init && git add . && git commit -m "Girgir"
gh repo create girgir --public --source=. --push
gh api -X POST repos/:owner/girgir/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

The site appears at `https://mottozo-gettingthere.github.io/girgir/` within a minute
or two. Any later change needs a `git push` and a reload on both phones.

To try it on your Mac first: `python3 -m http.server 8777` and open
`http://localhost:8777`. Localhost counts as secure, so the microphone works.
A LAN address like `http://192.168.x.x:8777` does **not** — the browser blocks
the microphone on plain HTTP, which is the whole reason for the HTTPS step.

### 2. Install on both phones

- **Android, Chrome** — open the URL, menu, **Install app**. You want "Install",
  not "Add to Home screen"; the first makes a real installed app.
- **iPhone, Safari** — open the URL, Share, **Add to Home Screen**. It must be
  Safari. Installing matters here: Safari evicts cached data for ordinary sites
  after 7 days of non-use, and home-screen web apps are exempt.

Open it once from the home screen icon while still online, and allow the
microphone and camera when asked. Now it works with no network.

### 3. Check each phone

Open `diag.html` on both phones — `https://mottozo-gettingthere.github.io/girgir/diag.html`.
It reports exactly what that phone supports: microphone, WebRTC, QR decoding,
whether software volume works, where audio comes out by default, vibration and
battery. The three buttons at the bottom test the microphone, the buzz and the
ping tone for real. Nothing is sent anywhere.

Run it once per phone and you will know what to expect before you rely on it.

### 4. Set up the hotspot

The **Android phone hosts**, because an iPhone's Personal Hotspot requires an
active cellular plan while Android's does not.

On the Android phone:
- Hotspot band: **2.4 GHz** (better range and wall penetration).
- Turn **off** "switch off hotspot automatically when no devices are connected",
  or it dies after ten minutes.

On the iPhone:
- Settings, Cellular, turn **off Wi-Fi Assist**, or iOS quietly moves traffic
  to cellular when it notices the network has no internet.

## Using it

The app carries its own illustrated 4-step guide — tap **?** in the top right,
or **First time? Read the 4-step setup** on the opening screen. Everything
below is also in there, so neither of you needs this file on a phone.

One phone taps **Create channel** and shows a code. The other taps
**Join channel** and scans it, then shows a code back for the first phone to
scan. Two scans, and you are linked.

### Talk modes

Each phone picks its own mode; they do not have to match.

| Mode | Behaviour | Best with |
|---|---|---|
| **Open** | Microphone always live; the button mutes | Earphones |
| **Latch** | Tap to go live, tap to stop | Either |
| **Hold** | Live only while pressed | Loudspeaker |

### Earphones

Worth more to this app than any accessory. On a loudspeaker the microphone and
the speaker share the same air, which is why OPEN mode needs half duplex to
duck the other person while you talk. Put the sound in your ears and that
problem is gone: nothing to duck, no feedback, and a genuinely open line both
of you can talk over at once.

The talk mode is never sent to the other phone, so **one pair between the two
of you works**. Whoever is wearing them runs OPEN and is hands free; the other
stays on HOLD with the phone's speaker, and neither side cares what the other
chose.

**The button on the cable is the talk key.** A headset button arrives as a
media key, and the app claims those: one click toggles transmit, and on
headsets that send them, two clicks ping and three change the voice. Which
click does what varies by model, and some gestures are reserved by the phone
itself, so treat the second and third as a bonus rather than a promise.

The **Earphones** switch in settings turns off echo cancelling and automatic
gain. Both exist to keep a loudspeaker out of a microphone and have no work to
do once the sound is in your ears, where they only cost clarity. Noise
suppression stays on, since it is doing something else. Not every browser will
change this on a live microphone, so the app reads the setting back afterwards
and tells you if it was refused.

It also lets **LATCH keep transmitting with the screen off**, which is the
point of using the cable at all, and it keeps the media session claiming to
play so Android does not freeze the page in your pocket. **HOLD still cuts out
whenever the app leaves the screen** — a finger that cannot be seen is not a
finger that is still pressing.

### Voices

The face beside the talk button disguises how you sound **to the other
person** — the effect is applied on the way out, so you hear yourself
unchanged and they get the joke.

- **Tap** turns it on and off.
- **Double-tap** moves to the next voice.

Five of them: robot, helium, radio, tuner, wobble.

Web Audio has no pitch shifter, so there is one written out of two delay lines
whose delay is swept and crossfaded — sweeping a delay changes playback rate,
and so pitch. **Helium** rides it half again up, **tuner** doubles you a few
semitones above yourself and squashes the result, which is the part of
autotune these nodes can actually reach; real autotune needs pitch tracking
and a scale to snap to. The other three colour the sound instead, with ring
modulation, filtering and distortion. All of it is cheap, stable, and daft.

### Ping

Three strengths, so the loudest one cannot go off by accident:

| | How | What they get |
|---|---|---|
| **Ping** | Tap | One tone, a short buzz |
| **Urgent** | Hold half a second | Rising triple, longer buzz |
| **Alarm** | Hold five seconds, **or** ten quick jabs | Five rising pairs over about 1.3s, a long buzz pattern, and a flashing screen |

The ping button fills with red while an alarm is arming, so a long press is
never a surprise. The alarm also skips the rate limit the other two obey.

The tone is generated on the receiving phone rather than sent through the voice
stream, so it stays clean and works whichever mode either of you is in, even
with a muted microphone.

### Settings

The gear in the header opens a panel over the channel — the talk button stays
one tap away, and nothing is lost by opening it mid-call. Tap the backdrop,
the cross or Escape to close it. Everything in it starts in a sensible state,
so you can ignore it entirely — apart from **Earphones**, which is off until
you say otherwise, because the app cannot tell what you are wearing.

- **NAME** — what the other phone calls you. It replaces `THEM` on their
  screen and `YOU` becomes `<your name> (me)` on yours. Leave it empty and the
  plain labels are used. It is sent over the data channel when you link and
  whenever you change it, capped at 12 characters, and it is the only thing
  either phone learns about the other.
- **MIC** — how loudly you are sent, 0 to 200%. Past 100 lifts a quiet
  headset; too far and you distort. The YOU meter shows the level after this
  is applied, so watch it while you talk.
- **VOL** — incoming volume. Hidden on iOS, which ignores software volume.
- **OUT** — output device, where the browser allows choosing one.
- **Half duplex** — on by default. Mutes the other person while you transmit,
  so you never hear yourself back. It applies to LATCH and HOLD only; in OPEN
  both microphones are live continuously, so there is nothing to duck.
- **Roger beep** — on by default. A short two-tone chirp on *their* phone when
  you stop transmitting, so they know you are done.

## What the readouts mean

| Readout | Meaning |
|---|---|
| **Bars, top right** | Link quality from round-trip time, packet loss and jitter. Four bars is clean. |
| **LINK** | Round-trip time and the share of audio packets being lost. |
| **BATT / THEIRS** | Battery on each phone, sent over the control channel. Amber under 30%, red under 15%. |
| **INPUT** | Which microphone is actually open — `EARBUD`, `WIRED` or `BUILT-IN` — so a headset that failed to connect is obvious instead of silent. Hover or long-press for the full device name. |
| **NET** | The subnet both phones share, plus each one's last octet. No browser can read a Wi-Fi name, so this is how you confirm you are on the same network. It turns amber if the two are on different subnets, which means audio will not flow. |
| **Meters** | Live audio level — yours amber, theirs teal. |
| **VOL** | Incoming volume. Hidden on iOS, which ignores software volume; use the phone's buttons there. |

Link quality comes from WebRTC statistics rather than Wi-Fi signal strength —
no browser can read the Wi-Fi radio. It is the more useful number anyway, since
it measures the thing you actually care about: whether your voices are arriving.

Battery comes from the Battery Status API, which **Android supports and iOS does
not**. So the Android phone shows its own level and sends it across, and the
iPhone shows a dash for itself while still displaying the Android phone's.

## Screen off, phone in a pocket

Whether the channel survives the screen going off is decided by the browser,
not by this app, and the two platforms differ completely.

**Android — yes, in OPEN mode.** Live microphone capture plus an ongoing media
session keeps Chrome from freezing the page, so the channel keeps running with
the screen off. The app declares itself a media session, which is what earns
that treatment and puts a notification in the shade. Turn **Keep screen on**
off in settings first, or the screen never sleeps at all.

If it dies after a minute or two, the culprit is the manufacturer's battery
optimisation rather than Chrome. Settings → Apps → Chrome → Battery →
Unrestricted. Samsung, Xiaomi and OnePlus are the usual offenders.

**iPhone — no, and there is no way around it in a browser.** Safari suspends a
backgrounded page and stops microphone capture with it. Adding to the home
screen does not change this; neither does the media session, which iOS accepts
and then ignores. Background audio on iOS needs an `AVAudioSession` entitlement
that no web app can obtain. On the iPhone the screen has to stay awake, so
leave **Keep screen on** enabled there and let the display dim.

If you need an iPhone in a pocket, the app has to stop being a web app — see
the Capacitor note below, which costs about a day and gets you the same code
in a native shell that *can* hold background audio.

**LATCH and HOLD close the microphone when the app goes to the background.**
That is deliberate: neither mode gives you any way to see that you are still
transmitting once the screen is off, and a hot microphone in a pocket is worse
than a dropped call. OPEN is the pocket mode, and its button still mutes you.

## Opening it from a shortcut or an NFC tag

An automation can do exactly one thing to a web app: open a URL. So the URL
says what to do on arrival, and the setup screen is skipped:

| URL | What happens |
|---|---|
| `…/girgir/?go=standby` | Shows a code and watches for one. **Put this on both phones** — hosting is symmetric, so the same shortcut on both ends sorts out which one hosts |
| `…/girgir/?go=host` | Creates the channel and shows the code |
| `…/girgir/?go=join` | Opens the scanner |

The parameter is consumed and wiped from the address bar, so a reload will not
fire it again, and a pairing link in the fragment always wins over it.

**On the iPhone:** Shortcuts → Automation → *When I connect to* your hotspot →
**Open URLs** with the standby link, then turn off *Ask Before Running*, which
Wi-Fi triggers have allowed since iOS 15.4. Try **Open App** first and see
whether the home screen web app is offered — if it is, use that. Open URLs
goes to Safari instead, and iOS keeps Safari's storage apart from the home
screen app's, so Safari needs to have loaded the page once with internet and
will ask for the microphone in its own right.

**On Android:** any routine or Tasker can open a URL when a network is joined.
Turning the hotspot *on* by automation is the awkward half — Tasker has a
WiFi Tether action, Samsung has Modes and Routines, and otherwise it wants
Shizuku or an ADB-granted permission. It depends on the phone.

**An NFC tag works on both**, and this is the one thing NFC is actually good
for here: a tag by the door, a tag in the car, tap and the app opens already
pairing. A tag cannot carry a code — those die with the page — but it can
carry the standby URL.

What no automation can do is the handshake itself. It can get both phones onto
the network and both apps into standby, and then the two still have to see
each other's code, because nothing but a camera or a link can carry one
between the handsets.

One caveat worth knowing: a page opened with no tap has a suspended audio
context, and on iOS it stays suspended until something is touched. The app
notices and says **Tap the screen once to switch the microphone on** rather
than letting you talk into a dead line.

## Pairing by link, which needs no camera at all

A code can travel as a URL instead of as a picture. **Send this as a link** on
the code screen opens the phone's own share sheet, and the code rides in the
fragment — the part after the `#`, which browsers never send to a server, so
GitHub Pages sees nothing but the path.

AirDrop reaches between Apple and some Android handsets now, Quick Share goes
the other way, and both run over Bluetooth and peer-to-peer Wi-Fi with no
internet involved. Where that works, the whole pairing is taps:

1. One phone taps **Create channel**, then **Send this as a link**, and
   AirDrops it over.
2. The other taps the notification. The app opens, answers by itself, and
   shows its reply.
3. It taps **Send this as a link** back. The first phone taps that
   notification and the channel is up.

Nothing is scanned and neither camera is used. If the reply link lands in a
new tab rather than the one holding the offer, the app passes it across to the
right tab over a `BroadcastChannel` and that tab takes it from there.

This suits an uneven pair, which is the usual case: whoever is happier driving
can create the channel and send both links, leaving the other person two taps
on two notifications.

Three things to know before relying on it:

- **Whether the share sheet can reach the other phone depends on the
  handsets.** Apple-to-Apple AirDrop has always worked; Android-to-Apple
  arrived with Quick Share's AirDrop support and is not on every model. The
  share sheet itself is the test — if the other phone is offered, it works.
- **On an iPhone the link opens in Safari, not in the app installed on the
  home screen**, and iOS keeps their storage apart. So Safari needs to have
  loaded the page once with internet before it can open a link offline.
  Afterwards it has its own cached copy and works on the hotspot.
- **A link is as perishable as a code.** It carries one live connection's ICE
  credentials and fingerprint, so an old one is useless. Send a fresh one.

QR is still there and still works, for when none of the above does.

## Pairing by camera, and why it is not one scan

Two codes have to cross, so two scans happen. What the app removes is the step
in between: the phone that created the channel **keeps its camera running
behind its own code**, so once the reply appears it links itself. Nobody
presses anything between the scans.

Hosting is also symmetric, which removes the other decision. A phone showing a
code is watching for one at the same time, so **both of you can tap Create
channel** and simply point the phones at each other. Each sees the other's
offer, and the rule for who gives way needs no exchange: the lower-sorting
code answers, the other stays host. The codes carry random ICE credentials, so
they cannot tie. **Join channel** is still there for when one of you would
rather scan deliberately.

It would be neater for the first phone to open its camera the moment the other
one scans, and that is not possible. Until the reply arrives there is no
channel, and the first phone's ICE agent cannot even validate the other's
probes without a remote description, so there is no event to react to. Leaving
the camera open and waiting is the closest thing to it.

The decode loop runs on a timer rather than `requestAnimationFrame`, because
rAF stops whenever the page is not being painted, which would freeze scanning
without any sign of it.

## If the link drops

There are two different situations here and they cost very different amounts
of effort.

### The network moved, both apps still open

This is nearly every drop: you walked out of range, the hotspot hiccuped, the
phone changed network. **Nothing is required of either of you.** Two seconds
after the link falls over, the app renegotiates over its own control channel —
an ICE restart — and the audio comes back. The pill shows `RELINKING` and then
`LINKED` again. No codes, no scanning, no tapping.

**Relink** forces the same thing by hand if the audio is bad but the link has
not formally dropped. Either side can press it; if you are not the side that
opened the channel, your phone asks the other one to do the re-offer.

### One of you actually quit the app

Now there is nothing to renegotiate over. **A pairing code cannot be saved and
reused** — it carries ICE credentials and a DTLS fingerprint belonging to one
live connection object, plus port numbers that stop existing when the page
closes. Replaying an old code points at an endpoint that is gone, with keys
that no longer match, and nothing can be cached to avoid that, because the
information does not survive the app closing. Something fresh has to cross the
gap.

So the app makes that crossing as small as it can be, rather than asking you
to work out a procedure. Four seconds after the other phone goes away, this
one **goes on standby by itself**: a fresh code on screen, camera watching
behind it, pill reading `STANDBY`. The returning phone opens the app and taps
**Return to channel**, which does the same thing. Then you point them at
each other and they link up — no roles, no steps, nothing to press in between.

Neither phone has to be the one that went away, and it does not matter which
of you reopens first; whoever is ready waits for the other. **Stand by now**
on the dropped-channel bar skips the four-second wait, and **Relink** does the
same thing when the link is already gone.

What this cannot do is link two phones that are merely on the same Wi-Fi
without ever facing each other. A browser cannot broadcast on a LAN, cannot
answer an mDNS query and cannot listen on a port, so with no server there is
nothing for one app to discover another with. The cameras are the whole
transport, and this is the shortest ritual they allow.

## Versions and updating

The guide shows the installed version beside the cache size, and whether a
newer one is published. When there is, a bar appears on the first screen with
an **Update** button; it clears the caches, drops the service worker and
reloads, which is the only way to be certain the new files land rather than
being served from the old set.

The check reads `version.json`, which the service worker is written to fetch
from the network every time and never from the cache — cache it and the app
could only ever confirm its own version to itself.

Making the update actually land took more than clearing the caches, and the
reason is worth knowing if the bar ever comes back after an update:

- `unregister()` does not stop the worker already controlling the page, so it
  answers the reload — and on a miss it writes what it got straight back into
  the cache it was just cleared of.
- Under that, GitHub Pages serves every file with `max-age=600`, and
  `location.reload()` does **not** bypass the browser's own HTTP cache for
  scripts or stylesheets.

Between them the reload served the build being replaced, the check read
`version.json` fresh, saw a newer number, and put the same bar back up. It
looked like a loop and was really a ten-minute cache.

So the update now installs a fresh worker *before* reloading, and the worker's
install step fetches every file with `cache: 'reload'`, which goes past both
caches. If an older build is ever stuck in that loop, **Clear cache** in the
guide breaks it, and so does waiting ten minutes.

Releasing means bumping the same number in three places, which must agree:

| File | What to change |
|---|---|
| `app.js` | `const APP_VERSION = N` |
| `version.json` | `{ "version": N }` |
| `sw.js` | `const CACHE = 'girgir-vN'` |

GitHub Pages caches for ten minutes, so allow for that before expecting a
phone to notice.

## Storage footprint

Deliberately small, and you can see and clear it in the app under **?**.

| | Cached |
|---|---|
| Android | ~142 KB |
| iPhone | ~270 KB |

The difference is the QR decoder. Chrome on Android decodes QR codes natively
through `BarcodeDetector`, so the 127 KB fallback decoder is never downloaded
or cached there. Safari has no such API, so the iPhone fetches it once on first
run — while still online — and keeps it.

Beyond the cached app, **nothing is stored at all**. On every launch the app
clears `localStorage`, `sessionStorage` and any IndexedDB databases, so stale
data from an older version cannot linger. No cookies, no analytics, no history,
and once cached it makes no network requests whatsoever.

The cost is that your mode, toggles and volume reset to defaults each launch.
If you would rather it remembered them, set `REMEMBER_SETTINGS = true` at the
top of `app.js` — that is the only line involved.

## Earpiece or loudspeaker

| | Earpiece (held to the ear) | Loudspeaker |
|---|---|---|
| **iPhone** | Yes — the default | Yes — switchable |
| **Android** | No | Yes — the default |

**On the iPhone you can choose.** Safari exposes `navigator.audioSession`, and
its `type` decides where sound lands: `play-and-record` sends it to the
receiver, `playback` to the loudspeaker. Settings shows **Earpiece / Speaker**
where that API exists.

Be warned that it is reported to be unreliable on some iOS builds — the switch
can take a moment, or not take at all. Try it on your own phone rather than
trusting it.

**On Android there is no equivalent.** Chrome implements no audio session API,
and `setSinkId` only ever offers whole devices like headphones, never the two
outputs inside the phone. The loudspeaker is the only option there.

Earphones sidestep the question entirely, which is why a pair each is the setup
worth using. Where a phone exposes an output picker the app shows one under
**OUT**; where it does not, OUT names what the system is doing. A small
Bluetooth speaker also works on either phone, and is the one way to get
loudspeaker audio out of the iPhone.

## Known limits

- **No vibration on the iPhone.** iOS Safari has no Vibration API, so pings
  there are tone and flash only. Android buzzes.
- **Keep the app in the foreground.** iOS suspends backgrounded pages, which
  drops the microphone and the connection. The app holds a screen wake lock
  while it can. If the link drops, tap End and pair again; it takes a few
  seconds.
- **Range is the hotspot's, not Bluetooth's** — roughly 15 to 30 m indoors for
  a phone access point, less through several walls.
- Each pairing needs a fresh QR exchange. WebRTC regenerates its credentials
  every connection, and a browser cannot listen on a port, so there is no way
  around this in a web app.

## If you want to remove those limits

Wrapping this same code in [Capacitor](https://capacitorjs.com) gives a native
shell around the identical HTML and JS, and fixes every item above: the iOS
audio session can be forced to the loudspeaker, the Haptics plugin vibrates on
iPhone, background audio keeps the channel alive with the screen off, and real
sockets plus Bonjour let the phones discover each other automatically with no
QR at all.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup for all four screens |
| `app.js` | Signalling, WebRTC, talk modes, tones |
| `styles.css` | Instrument-panel styling, dark only |
| `sw.js` | Service worker; caches everything for offline use |
| `manifest.webmanifest` | Makes it installable |
| `diag.html` | Standalone capability check — open it on each phone |
| `vendor/qrcode.js` | QR encoder, always cached |
| `vendor/jsQR.min.js` | QR decoder, fetched only where `BarcodeDetector` is missing |
| `vendor/plex-mono-*.woff2` | Typeface, local — nothing loads from a CDN |

Everything is vendored deliberately: a CDN reference would be one more thing
that fails when there is no internet, which is exactly when you want this to work.

## Changing it

Bump `CACHE` in `sw.js` whenever you change a file, or the phones keep serving
the cached version. It is currently `girgir-v1`.

If you add a file that must work offline, add it to `ASSETS` in `sw.js` too —
and check it returns 200, because one bad path makes `addAll` reject and the
whole precache silently fails.
