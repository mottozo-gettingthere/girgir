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

### Morse

Turn on **Morse keyer** in settings and the talk button stops being a
microphone and becomes a key. A short press is a dot, a long one a dash,
letting go for a moment lands the letter, and a longer pause is a space. The
far end's panel opens by itself, because a message arriving on a screen that
is not showing it is no use to anyone.

Both phones see the same slate, and the far end gets its tone rebuilt at the
right length from the symbols rather than carried over the microphone — so it
stays clean and works with the mic muted.

**The letter helper** is the useful part if you are learning. It starts with
all 39 characters and removes the ones you can no longer reach with each dot
or dash, showing the exact match in colour when you land on one. Tap a single
dot and 19 remain; every character it drops begins with a dash. That is the
branching Morse chart doing its job — and it is why those charts exist, since
reading an alphabetical list while someone is sending is hopeless. Turn the
helper off to send blind.

**The listener has their own Hide button.** It masks the message to one dot
per letter, keeping the word breaks, so you can try to read it in your head
and reveal it only to check. It is a local choice and is never sent, so you
can hide while the sender sees everything.

**Chart** opens the full table, built from the same data the decoder uses, so
it cannot drift out of step with what the app actually accepts. It holds the
26 letters, the ten digits and `.` `,` `?`. The branching charts you find
online carry the letters only.

### Practising on your own

**Practise Morse on your own** sits on the first screen and needs nothing
paired — no channel, no second phone, no network. Two drills, because
learning Morse needs both directions and they are genuinely different skills:

- **Send it** shows you a letter and you key it. Get it wrong and it tells
  you what you actually sent, which letter that turned out to be, and what
  the target should have been — far more useful than "wrong".
- **Hear it** plays a letter at a steady speed and gives you four to choose
  from, with a Replay button. Sending teaches your thumb; only listening
  teaches you to recognise the rhythm of a letter, which is the harder half.

**+ digits** widens the pool from the 26 letters to include 0–9. There is a
streak and a best, and the streak resets when you miss, so it is worth
something. **Skip** reveals the answer and moves on without pretending you
knew it.

The letter helper applies here too, so you can learn with the net and then
switch it off.

Timing is deliberately slow: a dot is anything under 260 ms, a letter lands
after 820 ms of nothing and a word after 1.9 s. Real Morse keeps the same
ratios — dash is three dots, letter gap three, word gap seven — just much
faster than a thumb can be accurate.

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
one scans, and that is not possible: until the reply arrives there is no
channel to carry the news. Leaving the camera open and waiting is the closest
thing to it.

The phone holding the reply, though, **can** tell whether anyone has taken it,
and this turned out to matter. A phone that has not yet scanned your reply
still answers your connectivity checks - it validates them against the
credentials it published in its own code, no remote description required - so
ICE climbs all the way to `connected` and then stops dead, because nothing on
that side knows an encryption handshake is due. The call state sits on
`connecting` for as long as the page is open. That is the **Linking up that
never finishes**, and it is not a network fault: the two phones are reaching
each other perfectly.

One counter separates the two cases, `requestsReceived` - checks the other
phone started itself, which it only does once it holds your reply. Measured on
two peers in one browser: reply scanned, 6 inbound checks; reply ignored, 0
inbound while the *replies* to our own checks still reached 6. So
`responsesReceived` proves nothing, which is the trap, and only
`requestsReceived` answers the question.

After a minute of that signature the app says **Not scanned yet** and names
what is actually wrong. It does not touch the code on screen, because the code
is still perfectly good - an earlier draft called it expired after ten seconds
and cut straight across a handover that connected moments later. Only a
connection that has genuinely failed takes the code down with it, and that is
the one case that offers a fresh one.

The decode loop runs on a timer rather than `requestAnimationFrame`, because
rAF stops whenever the page is not being painted, which would freeze scanning
without any sign of it.

## What is actually in a code, and why it got six times smaller

A session description is about 1.7 kB of text, and almost none of it varies.
The codec line, the bundle group, the SCTP port, the transport profile - every
phone running this app writes them identically. What actually differs comes to
roughly ninety bytes: an ICE user and password, a DTLS fingerprint, one or two
addresses and ports, a payload number, which side goes first.

So that is all a code carries. The two phones rebuild the rest from a template
they both already hold. A pairing code went from **824 characters to 123**, and
the QR from **97 modules to 53**.

That is worth more than it sounds, because a QR is read in modules, not
pixels. In a 760-pixel camera frame with the code filling it:

| | old | new |
|---|---|---|
| modules | 97 | 53 |
| pixels per module | 5.5 | 10.0 |
| still reads through a blur of | 2 px | 4 px |
| still reads when the code fills only | 36% of the frame | 10% of the frame |
| still reads with a glare patch over | 6% of it | 15% of it |

The last row is the error correction, which the spare room paid for: short
codes are drawn at level Q, which can lose a quarter of itself, where the old
ones were at level L and could lose a fifteenth. A long code still uses L,
because at that length the strong level would push it to 129 modules and make
everything worse.

One measurement went the other way and is worth writing down. Against
*per-pixel* noise - every pixel jittered independently - the small code is
clearly worse: 1 read in 8 where the old one managed 6. It is not the error
correction, since a 41-module version at level L fails identically; it is the
module size. The bundled decoder thresholds each 8x8 block of pixels against
its own local average, and once a module is wider than that block the average
is simply the module's own colour, so the threshold sits on top of the signal
and noise tips it either way. Real camera noise is not per-pixel - it is
smeared by the lens and the demosaic - and against grainy noise the small code
wins or ties. But the mechanism is real, and a sharp, very noisy frame is the
one case where the old codes read better.

Anything unexpected in the description - a second codec offered, a relayed
candidate, a fingerprint that is not sha-256 - and the short form gives up and
the whole description is sent compressed, as before. Both forms are understood
on the way in, so the fallback costs nothing but size. A code from a newer
version reaching an older phone is the one thing that does not work, and it
says so: *that code came from a newer Girgir than this one.*

## When a phone will not scan

One handset read nothing for days. The camera was up, the preview was sharp,
the code was right in frame, and nothing ever happened — no error, no timeout,
no sign anything was wrong.

Android's `BarcodeDetector` is backed by a Play Services module fetched on
demand. When that module is not on the phone the object still exists, still
lists `qr_code` among its formats, still constructs, and then returns an empty
array for every frame it is ever given. There is no error to catch and nothing
that tells "no code in this frame" apart from "this decoder is dead".

Two attempts to guess anyway both did damage, and the second broke a phone that
had been working. The first retired the native decoder after twenty barren
frames and handed the camera to the bundled one — but that flag is held for the
life of the page, and twenty frames is **two seconds**, which is less than it
takes to line up a shot and let the camera focus. So a phone that read codes
perfectly would, the first time anyone was slow with it, permanently lose its
good decoder for the slower one, on a 97-module code where that difference
decides it. The second attempt made the swap happen even when the backup had
not loaded, leaving no decoder at all. A guard written to rescue the scan was
the thing breaking it.

The judgement was never answerable from the data, so it is no longer made.
**Both decoders run**: the phone's own on every frame, the bundled one
alongside it on a lighter cycle. A broken native decoder costs nothing, because
the backup is already looking. A working one is never taken away. Measured: a
healthy decoder reads a code on the first frame; a permanently dead one is
covered by the backup in under a second; and a decoder that finds nothing for
six seconds and then works is still being called, where the old code had
stopped at frame twenty.

The backup is cached on every phone, so this needs no network. A scan that
finds nothing for 25 seconds says so and points at the link, which needs no
camera at all.

**diag.html** settles it on any phone in two seconds. *Test QR scanner* draws a
clean code at the density a real pairing code reaches, hands it to the phone's
own reader and then to the backup, and tells you which of them can actually
read it. A phone that fails the first line and passes the second has exactly
this fault, and the app will now handle it by itself.

## When the app says no route

The failure message used to assert a cause it had not measured, and a report
came back proving it: *no routes were tried at all*, under a headline reading
*same network, but nothing arrives*. Both phones had named a real address on
one subnet. Those two statements cannot both be true - with no route there is
nothing to send, so nothing was dropped on the way.

So the readout states what happened and stops there. When no route was tried
it prints what each side actually put up:

```
No route was ever tried.

  this phone offered: 192.168.68.111:51111
  their code carried: 192.168.68.103:49722

Both sides had addresses and the browser still put none of them
together. Nothing was sent, so nothing was dropped on the way.

Girgir 28 · your code short, theirs short
```

The client-isolation explanation is kept for the case it was written for:
routes tried, checks sent, nothing answered. The last line names the build and
which form each code took, because a mismatch there explains more failures than
anything about the network.

That case also stops trusting the short form for the rest of the session, so
the next code carries the whole description. Nobody has to decide anything, and
if the rebuilt description was at fault the second attempt will simply work.

Two faults in the rebuilding turned up while looking into it, neither of which
desktop Chrome will show you:

- The rebuilt description always led with the audio section, whatever order it
  arrived in. Chrome leads with the audio even when the data channel was made
  first, so this never showed - but a browser that leads with the data channel
  would be handed an answer labelling the wrong section. The order now travels
  in the code.
- Candidates went into the first media section only. That is correct once the
  two ends agree on BUNDLE, and desktop Chrome pairs and connects on it. But a
  phone that pairs *nothing at all* is the one report that would follow from
  leaving them out, so they are now repeated in both sections, as the browser
  itself repeats them. The bytes were already in hand, so the code did not grow.

## The code proves itself before anyone sees it

Rebuilding a description from ninety bytes is an optimisation this app performs
on the browser's own work, and no phone should take it on trust. A description
rebuilt wrongly produces a code that scans perfectly and then pairs with
nothing, which is the most expensive failure there is - it looks exactly like a
network fault, and it sent one debugging session after guest networks and VPNs
for days.

So every phone proves it on itself before the code reaches the screen. Three
checks, cheapest first:

- packing the rebuilt description again must give back the same bytes;
- the addresses the code carries, and the fingerprint, must match the original
  text exactly;
- the browser must accept the result - a throwaway peer is handed the rebuilt
  description as a remote offer, which is the same parser that will read it on
  the other phone.

Nothing there touches the network, asks for a permission, or outlives the call.
The throwaway peer is the only part with any cost worth measuring, and it is
1.6 ms, 3.6 ms on the first call of the page, against the roughly 300 ms the
phone spends gathering its addresses in the first place. Any check that fails
and the whole description is sent instead, for the rest of the session, with
the reason printed in the readout.

Tested by sabotage: a single flipped byte in a port, an address, or the
fingerprint, and a dropped candidate, are each caught. The byte comparison
alone catches none of them - re-packing a wrongly rebuilt description gives
back the same wrong bytes, consistently - which is why the addresses and
fingerprint are compared against the original text and not against a
round trip.

The first phone to run the check failed its own healthy code, and the check was
wrong, not the code: it compared addresses across the whole description, where
the browser gives each media section its own port for the same address while
the rebuild repeats one set across both. A real difference, and not a fault.
Only the first section's addresses are compared now, because only those travel.

## Testing a phone on its own

*Test pairing on this phone* in **diag.html** pairs a phone with itself: two
peers in the one page, no servers, the same settings the app uses. It reports
the addresses it gathered, how many routes were tried, how many answered, and
whether it linked.

A phone that cannot pair with itself cannot pair with anything, and until that
is ruled out every other theory is guesswork - which is how one handset's
scanner fault spent days looking like a network problem. If the test says the
phone links to itself, the fault is between the two phones. If it says no route
was tried even locally, it is on that handset.

## When one phone fails on every network

**Check the scanner first.** A phone that cannot read a pairing code cannot
pair on any network, and that looks exactly like a network fault from the
outside — including on a hotspot. The section above covers it, and *diag.html →
Test QR scanner* settles it in two seconds. Only once a phone is known to read
codes is it worth suspecting the network at all.

If it does read codes and still will not pair anywhere — home Wi-Fi, hotspot,
anything — then no network is to blame, because a hotspot has no router in it
to misbehave. Whatever is swallowing the packets is travelling with the phone.

That is almost always an extra network interface. A VPN is the obvious one, and
the one that catches people is **Samsung's "Secure Wi-Fi"**, which is a VPN
wearing a name that does not sound like one and switches itself on per network.
Mobile data left on alongside Wi-Fi does a milder version of the same thing.
Any of them gives the phone an address that is not on the local network, and
packets sent from it never arrive. Nothing the page can do routes around a VPN
that has claimed the default route — that is the one case where the app cannot
help itself, and the routes it now prints will say so plainly rather than
leaving it to be guessed.

**diag.html → Test local address** now names every interface rather than
printing bare numbers. A healthy phone shows one *Usable address* on
192.168.x.x or 10.x.x.x. Anything reported as an **Extra interface** — a public
address, a carrier-NAT address, a VPN range — should not be there while you are
pairing over Wi-Fi. Turn those off and run it again; they should disappear.

A failed pairing in the app now shows the routes themselves, under the
message:

```
• 192.168.68.100:54321  →  192.168.68.108:49152
    failed · sent 23 · answered 0 · their checks 0
```

Three numbers per route, and they divide the problem cleanly. **answered 0 on
every route** means both phones are talking and neither is hearing — a VPN,
Secure Wi-Fi, or client isolation. **answered, but their checks 0** means the
route works and the other phone simply has not taken your code up yet. Nothing
is stored: it is read from the live connection as the screen is drawn and goes
when the page does.

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
| Any phone | ~270 KB |

Both now cache the same thing, the 128 KB backup QR decoder included. It used
to be skipped on Android, which decodes QR codes natively through
`BarcodeDetector`, on the reasoning that those phones would never need it.
That reasoning cost a week. See **When a phone will not scan** below.

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
| `vendor/jsQR.min.js` | Backup QR decoder, cached on every phone |
| `vendor/plex-mono-*.woff2` | Typeface, local — nothing loads from a CDN |

Everything is vendored deliberately: a CDN reference would be one more thing
that fails when there is no internet, which is exactly when you want this to work.

## Changing it

Bump `CACHE` in `sw.js` whenever you change a file, or the phones keep serving
the cached version. It is currently `girgir-v1`.

If you add a file that must work offline, add it to `ASSETS` in `sw.js` too —
and check it returns 200, because one bad path makes `addAll` reject and the
whole precache silently fails.
