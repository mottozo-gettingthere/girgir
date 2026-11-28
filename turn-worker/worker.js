/* Girgir 5G relay credentials.

   Girgir 5G is a public web page, so it cannot hold the Cloudflare TURN key.
   This Worker holds it (as secrets) and hands each pairing a set of TURN
   credentials that expire after a few hours. It keeps nothing and logs
   nothing of its own.

   Secrets (Cloudflare dashboard, or `npx wrangler secret put NAME`):
     TURN_KEY_ID         the TURN key's ID
     TURN_KEY_API_TOKEN  the TURN key's API token
   Optional variable:
     EXTRA_ORIGINS       more allowed page origins, comma-separated
                         (for example http://localhost:8777 for testing)

   Only pages from the allowed origins get an answer a browser will accept.
   That stops other sites using it from a browser; it does not stop a script
   that fakes the header, so also add a rate-limiting rule in the dashboard. */

const ALLOWED_ORIGINS = ['https://mottozo-gettingthere.github.io'];
const TTL_SECONDS = 6 * 3600;
const CF_TURN = 'https://rtc.live.cloudflare.com/v1/turn/keys/';

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers)
  });
}

/* Cloudflare's answer has been either a list of servers or a single server
   object; accept both and hand the page a list. Port 53 goes: browsers
   refuse it. */
export function tidy(data) {
  let list = data && data.iceServers;
  if (list && !Array.isArray(list)) list = [list];
  if (!Array.isArray(list)) return [];
  return list.map(s => {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls])
      .filter(u => typeof u === 'string' && !/:53(\?|$)/.test(u));
    const out = { urls };
    if (s.username) out.username = s.username;
    if (s.credential) out.credential = s.credential;
    return out;
  }).filter(s => s.urls.length);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const extra = String(env.EXTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowed = ALLOWED_ORIGINS.includes(origin) || extra.includes(origin);
    const cors = allowed
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Max-Age': '86400', 'Vary': 'Origin' }
      : { 'Vary': 'Origin' };

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!allowed) return json({ error: 'origin not allowed' }, 403, cors);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'relay not configured' }, 503, cors);

    let res;
    try {
      res = await fetch(CF_TURN + encodeURIComponent(env.TURN_KEY_ID) + '/credentials/generate-ice-servers', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + env.TURN_KEY_API_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS })
      });
    } catch (e) {
      return json({ error: 'relay unreachable' }, 502, cors);
    }
    if (!res.ok) return json({ error: 'relay refused: ' + res.status }, 502, cors);
    const iceServers = tidy(await res.json());
    if (!iceServers.length) return json({ error: 'relay gave no servers' }, 502, cors);
    return json({ iceServers, ttl: TTL_SECONDS }, 200, cors);
  }
};
