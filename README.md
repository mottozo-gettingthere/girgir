# Girgir

A two-phone intercom that runs with no internet, no server and no account.
Audio goes directly phone to phone over Wi-Fi using WebRTC. Pairing is a
two-step QR exchange, so nothing needs to broker the introduction.

Built for one Android phone and one iPhone, each with its own earphones.

It keeps no records: no call history, no recordings, no logs, and no settings
carried between launches. Anything an older version left on the phone is wiped
at startup.

Exactly one value survives a launch — a boolean noting the app has been
installed, so the install hint stops appearing. iOS gives a page no way to
detect that for itself. Nothing else persists, and **Clear cache** removes
that too.

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

### Ping

Tap **PING** to send a tone and a buzz. Press and hold for the urgent triple.
The tone is generated on the receiving phone rather than sent through the voice
stream, so it stays clean and works whichever mode either of you is in, even
with a muted microphone.

### Settings

The gear in the header opens a panel over the channel — the talk button stays
one tap away, and nothing is lost by opening it mid-call. Tap the backdrop,
the cross or Escape to close it. Everything in it starts in a sensible state,
so you can ignore it entirely.

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

## If someone drops out

A pairing code carries one session's ICE credentials and DTLS fingerprint, so
it cannot be reused — reconnecting always needs a fresh code. **Relink**, in
the channel, mints one without walking back out to the setup screen:

1. Whoever still has the app open taps **Relink**. A new code appears.
2. The other person opens the app and taps **Join channel**, then scans it.

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

Each phone gives you one and refuses the other, and they are opposites:

| | Earpiece (held to the ear) | Loudspeaker |
|---|---|---|
| **iPhone** | Yes — the default | No |
| **Android** | No | Yes — the default |

No web API moves audio between the two. iOS always sends call audio to the
receiver, Android always to the loudspeaker, and nothing a page can do changes
that. So holding the phone to your ear works on the iPhone and not on the
Android, while hands-free across the room works on the Android and not on the
iPhone.

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
