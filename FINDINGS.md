# Why pairing failed, and what it took to find out

A record of the pairing failures from 30 October to 9 November 2026: what
happened, what was measured, which conclusions held, and which did not. Times
are local (UTC+3). Addresses on the home network are given as they were;
carrier addresses are left out because this repository is public.

## The short version

**The app was not the cause.** One handset - the primary Android - cannot
reach other devices on the Wi-Fi from Chrome. The same handset reaches them
from Samsung Internet, and the other Android reaches them from Chrome. Every
change made to the app between versions 13 and 38 was aimed at the wrong
thing.

| Test, 9 November | Result |
|---|---|
| Secondary Android + Mac, build 38 | **pairs** |
| Primary Android + Mac, build 38 | fails |
| Router page `http://192.168.68.1` in Chrome, secondary | opens |
| Router page in Chrome, primary | fails: `ERR_TOO_MANY_RETRIES` |
| Router page in Samsung Internet, primary | opens |
| Router page in Chrome on the Mac | opens |

What is still not known is *why* Chrome on that phone cannot reach the local
network. See [Still open](#still-open).

## What the failure looked like from the inside

Chrome's own connection log (`chrome://webrtc-internals`) on the Mac, during
a failed attempt with the primary phone, 9 November 03:00:

| Wi-Fi route, Mac `192.168.68.113` → phone `192.168.68.112` | Count |
|---|---|
| Connection checks the Mac sent, over 14 seconds | 81 |
| Replies from the phone | 0 |
| Checks from the phone that reached the Mac | 0 |

The connection went `checking` → `disconnected` → `failed` and never reached
`connected`. Encryption never started because there was never a route to start
it on. Nothing crossed in either direction, while plain pings between the two
devices worked. That is a network-level block on that phone, below anything a
web page controls.

## Timeline

**30 October.** Girgir built and put on GitHub Pages. Pairing worked between
the phones through the early versions; by 18:04 the app was installed and in
use, and the complaint of the moment was an update banner that would not go
away. Versions 13-16 added pairing by link, a rewritten updater, a headset talk
key and a shortcut that opened the app already pairing.

**30 October, 20:02.** First report of failure: *"web app is not working on
ipad now"*, then *"not working now, on any device"*. Version 16 was reverted
and shipped as 17. Reverting to 15 and 14 was asked for.

**30 October, 22:14.** The user noticed one phone was on the live site and
another on a local address served from the Mac (`http://192.168.68.103:8777`).
The dev server was stopped. See [Mistakes](#mistakes-made-along-the-way) - a
copy of the app from that address stayed on a phone anyway.

**31 October, 01:48.** On version 20: *"android 2 is doing good and connected
it with laptop and another phone without problem"* while *"android 1 is not
reading the qr code successfully"*. This is the first explicit report of a
clean connection, and in hindsight it already named the handset at fault.

**1-3 November.** Morse keyer and practice added (21-22). Then versions 23-35
went into pairing: scanner fixes, codes shrunk from 824 to 123 characters, a
self-check of every code, and six rounds of on-screen readouts of the
connection. They established what was not at fault and never what was.

**1 November, 22:25.** *"android one is not connecting at all with another
andriods, even if it's a hotspot"* - the primary fails off the home Wi-Fi too.

**3 November.** *"it used to work in up to version 12, then you started losing
track and derailing."* Version 12 was put up at `/v12/` to test against.

**4 November.** Version 12 at `/v12/` also failed. Which phones were used was
not recorded, so this could not separate the code from the handset.

**6 November.** The app was reverted to version 12's code and shipped as 36
(the updater only offers higher numbers). 37 added *Test this phone* on the
main page.

**8 November, 01:57.** The Mac was upgraded from macOS 26.6.2 to 27.2. The
Mac-to-primary failures go back to 3 November, before this, so it is not the
cause.

**9 November, early hours.** The primary was confirmed as the only failing
handset; its diagnostics showed ten addresses (Wi-Fi, two carrier IPv4, two
IPv6, each over UDP and TCP) against the secondary's two. Version 38 made each
code carry only private Wi-Fi addresses. It did not help, and the connection
log above shows why: the Wi-Fi route itself carried nothing. Then the router
test, and Samsung Internet opening what Chrome could not.

**9 November.** Pairing put on hold. Version 39 brought back Morse practice
with a full chart of all 54 characters.

## Ruled out, by measurement

- **The code and its format.** The pairing path in version 12 and version 35 is
  byte-for-byte the same, and long codes, short codes and version 12's codes
  all failed the same way on the primary. Build 38, which is version 12's
  pairing code, pairs on the secondary.
- **The router or Wi-Fi blocking devices from each other.** The secondary pairs
  with the Mac on the same Wi-Fi; the Mac reaches the router over TCP and UDP.
- **The Mac.** Firewall off, no VPN, Chrome on the Mac opens local addresses,
  and it pairs with the secondary.
- **A VPN on the primary.** None connected, and no VPN icon in the status bar.
- **The QR scanner.** It mattered on 30-31 October, but by 2 November the
  diagnostics showed both QR readers working on the primary, and pairing still
  failed.
- **Encryption roles.** The roles in the failing connections were correct; the
  handshake never started because no route existed.
- **The extra mobile-data addresses as the cause.** Filtering them out of the
  codes (38) changed nothing.

## Mistakes made along the way

These are mine, recorded so they are not repeated.

- **Reading `disconnected` as proof the phones had found each other.** Built
  into versions 32-35. Chrome reports `disconnected` straight from `checking`
  without ever connecting; the log above shows it.
- **Theories without measurements.** The Deco router isolating clients, then
  mobile data stealing the route. Both sounded right and neither was checked
  before code was written. Chrome's own log and one router test settled in
  minutes what eight versions had not.
- **Asserting what the record did not say.** Version 11 was called "confirmed
  working" when the message only complained about a banner; `/v12/` failing was
  called proof that "the app is not what changed" without knowing which phones
  were used.
- **A Chrome flag set on a phone.** On 30 October a phone was told to treat
  `http://192.168.68.103:8777` as secure, for testing. That broke the rule of
  not changing phone settings, and it let the app install itself from that
  address - so an old copy (version 18-19) went on running from a phone after
  the server was gone. It was claimed at the time that no copy could survive
  there; that was wrong.
- **Telling a phone to turn something off to satisfy a diagnostic.** The
  diagnostics page once reported extra interfaces in red and said to switch
  them off. It now states them without judging.

## Still open

- **Why Chrome on the primary cannot reach the local network.** The likely
  places, not yet checked: Settings → Apps → Chrome → Permissions (a *Nearby
  devices* or *Local network* permission), and Chrome's data permission
  (Wi-Fi allowed or mobile-only). Whether being on a phone call matters was
  not tested; most attempts were made during one.
- **Samsung Internet as the primary's browser.** It reaches the local network.
  Whether Girgir pairs in it has not been tried yet.
- **Leftovers on the phones.** Reset `chrome://flags` on both Androids, and
  clear the old `192.168.68.103:8777` site data and any home-screen icon
  pointing at it.
- **The diagnostics page.** *Test pairing on this phone* says "This phone can
  pair" after pairing with itself, which the primary passes - it cannot see
  this fault. It needs a test that reaches another device.
- **The Wi-Fi filter keeps one carrier address.** The primary's carrier
  network uses a private range (`10.x`), which build 38 treats as local. Harmless,
  since that route leads nowhere, but it means the filter cannot tell a carrier
  network from a home one by address alone.

## Where the app stands

Build 39 is version 12's code plus three things: the *Test this phone* link
(37), Wi-Fi-only routes in the codes (38), and Morse practice with a full chart
(39). Everything from 13 to 35 is out, and kept under the git tag
`v35-diagnostics`.
