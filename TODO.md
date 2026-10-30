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
