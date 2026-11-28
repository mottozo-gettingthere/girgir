# Girgir 5G relay (Cloudflare Worker)

Some mobile networks will not let two phones connect to each other directly.
For those, Girgir 5G sends the voice through a Cloudflare TURN relay. The relay
only forwards packets; the voice stays encrypted end to end between the
phones.

The TURN key cannot go in the app, because the app is a public web page. This
Worker holds the key as a secret and hands each pairing a set of credentials
that expire after 6 hours. It stores and logs nothing of its own.

## Set it up once (about 10 minutes)

1. **Create a TURN key.** In the Cloudflare dashboard, open **Realtime**
   (named *Calls* on some accounts), then **TURN Server**, then **Create**.
   Name it `girgir-test`. Keep the two values it shows: the **Turn Token ID**
   (the key ID) and the **API Token**. The token is shown only once.

2. **Create the Worker.** Use either of these:
   - **In the dashboard:** go to **Workers & Pages**, then **Create**, then
     **Create Worker**, and name it `girgir-turn`. Click **Edit code**, replace
     everything with `worker.js` from this folder, and click **Deploy**.
   - **From a computer, with Node installed:** in this folder run
     `npx wrangler deploy`.

3. **Add the secrets.** In the Worker, open **Settings**, then **Variables and
   Secrets**. Add `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`, both as type
   *Secret*. With wrangler, run `npx wrangler secret put TURN_KEY_ID`, then the
   same for `TURN_KEY_API_TOKEN`.

4. **Optional: serve it from a test subdomain.** Open the Worker's
   **Settings**, then **Domains & Routes**, then **Add**, then **Custom
   domain**, and enter for example `girgir-test.yourdomain.com`. Your domain
   must be on the same Cloudflare account. Otherwise the Worker's
   `girgir-turn.<account>.workers.dev` address works just as well.

5. **Recommended: add a rate limit.** In your domain's **Security**, then
   **WAF**, then **Rate limiting rules**, limit the Worker's address to about
   30 requests a minute per IP. The Worker answers only pages from GitHub
   Pages, but a script can fake that header, and relay traffic counts against
   your Cloudflare usage.

6. **Check it.** Send a request with GitHub Pages as the origin:

   ```
   curl -X POST -H "Origin: https://mottozo-gettingthere.github.io" https://<worker address>/
   ```

   A working Worker replies `{"iceServers":[...],"ttl":21600}`. A `503` means a
   secret is missing, and a `502` means Cloudflare refused the key.

7. **Point the app at it.** Set `RELAY_ENDPOINT` near the top of
   `cell/app.js` to the Worker address, for example
   `https://girgir-test.yourdomain.com/`. Then push.

## Testing from a computer

To test from a local copy of the app (`python3 -m http.server 8777`), add
`http://localhost:8777` to the Worker's `EXTRA_ORIGINS` variable.

## Revoking

Delete or roll the TURN key in the dashboard. Credentials already handed out
then stop working, and the app falls back to direct links only.

## Not verified

This was written without access to Cloudflare's documentation and has not
been run against the live API. It calls
`POST https://rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers`
with `{"ttl": 21600}`, and accepts either a list or a single object as the
answer. If step 6 returns a `502`, check that endpoint against Cloudflare's
current TURN documentation.
