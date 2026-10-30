# Later

Things worth doing, with enough detail to pick up cold. Nothing here is
needed for the two-person case the app was built for.

---

## Support more than two people

**Today it is strictly two.** `app.js` holds one connection and one of
everything that belongs to a peer:

```js
let pc = null, dc = null;
let remoteStream = null;
let remoteLive = false;
let remoteAnalyser = null;
let lastLost = null, lastRecv = null, rtt = null;
```

Pairing a third phone calls `newPeer()`, overwrites `pc`, and silently drops
the first link — two people stay connected, one is cut off, and nothing in the
interface explains it. So this is a real change, not a flag.

### The shape of it

WebRTC has no group call of its own. The choice is a mixing server or a mesh,
and a server is out of the question for an app whose whole point is working
with no internet. So: **mesh** — every phone holds a direct connection to every
other phone.

Bandwidth is a non-issue. At the 32 kbps cap each stream already uses, three
people is about 64 kbps up and down per phone, four is 96. Nothing over Wi-Fi
notices that.

### What actually has to change

**1. Connections become a collection.** `pc` and `dc` turn into a `Map` keyed
by a peer id generated at pairing. Everything that reaches for `pc` today needs
to say *which* peer, or loop.

**2. Per-peer state follows.** Each of these is currently a single value and
has to move into the per-peer record: `remoteStream`, `remoteLive`,
`remoteAnalyser`, `lastLost`, `lastRecv`, `rtt`, and the battery figure
arriving over `stat`.

**3. Audio mixing.** One `<audio>` element cannot carry several remote streams.
Either give each peer its own element, or route them all through the existing
`AudioContext` into one destination — the latter is tidier and the gain chain
for the microphone is already there to copy.

**4. Half duplex and the roger beep need a rule.** Today "mute the other
person while I talk" has exactly one other person. With three, does
transmitting duck everyone? Does the roger beep fire when any peer stops, or
only the one you were listening to? Worth deciding deliberately rather than
falling out of the code.

**5. The live screen becomes a list.** The THEIRS battery cell, the incoming
level meter, LINK and NET all describe one other person right now.

**6. Pairing is the real obstacle.** Each pair needs its own exchange, so the
scans grow quadratically:

| People | Pairings | Scans |
|---|---|---|
| 2 | 1 | 2 |
| 3 | 3 | 6 |
| 4 | 6 | 12 |

Twelve scans to get four people talking is not usable. Past three, pairing
needs rethinking — one phone acting as host, handing out the other codes over
its already-established data channels, so each newcomer scans once and the
host introduces it to everyone else.

### Suggested order

Three people on a mesh with pairwise QR pairing, which works and is only three
exchanges. Host-brokered pairing only if four or more is ever actually wanted.

## Joining without scanning, for anyone on the same Wi-Fi

The wish: open the app on the hotspot and be in the channel, no codes, no
cameras. Worth writing down why that is not a small feature, and what the real
routes to it are.

### Why a browser cannot find another browser on a LAN

A WebRTC connection needs an offer and an answer to cross before anything
else can happen. A page in a browser has no way to carry them across a local
network by itself:

- No UDP. No broadcast, no multicast, so the usual "shout on 255.255.255.255
  and see who replies" is unavailable.
- No mDNS queries. Browsers use mDNS internally to hide local IPs in ICE
  candidates, but expose no API to ask who else is on the network.
- No listening. A page cannot bind a port or accept an inbound connection, so
  there is nothing for another phone to connect *to*.
- Subnet probing with `fetch` is possible and pointless — 254 requests that
  find nothing, because no page can answer them.

So two installed copies of this app on one Wi-Fi genuinely cannot see each
other. Nothing in the app can *discover* anything.

What it can do is let the phones hand a code to each other by other means. A
code now travels as a URL in the fragment, which AirDrop or Quick Share will
carry between the handsets over Bluetooth and peer-to-peer Wi-Fi with no
internet at all — see the README. That is not discovery: somebody still picks
the other phone out of a share sheet. But it removes the cameras from pairing
entirely, which was most of what "just join" was asking for.

### What would actually work

**1. A rendezvous already on the network.** Something that can listen, holding
offers and answers for a few seconds while the two phones collect each other's.
This is thirty lines on top of `devserve.py`: `POST /rv` to leave a
description, `GET /rv` to collect the other one.

The catch is the origin. It only works for phones that loaded the app *from*
that computer, because the installed copy from GitHub Pages is a different
origin served over HTTPS, and an HTTPS page may not call an HTTP endpoint.
That means either the laptop serves the app over HTTPS with a certificate the
phones trust, or this is a second, LAN-only install — which is fine for use at
home, and useless in a car park.

**2. A native wrapper.** Capacitor or equivalent on the phones, which can bind
a UDP socket and do real mDNS discovery, then hand the descriptions to the same
WebRTC code. This is the only route to zero-touch joining with nothing else on
the network, and it is the same escape hatch already needed for background
audio on iOS. If that wrapper ever gets built, do both at once.

### If standby meets more than two phones

The give-way rule — lower code answers — is written for two. With three in
standby at once the lowest gives way to both others, and both answers race for
the one connection object the winner has. Whoever lands first wins and the
other is orphaned with no error. Harmless today because only two phones are
ever in a channel; revisit alongside the mesh work above.
