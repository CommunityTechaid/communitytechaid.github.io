// Proxies the Google Geocoding API for the ward-lookup page on
// https://communitytechaid.github.io (ward_lookup.html), keeping the billed
// GOOGLE_API_KEY server-side.
//
// The origin gate predates 2026-07-19 (only the github.io origin is accepted).
// Hardening added 2026-07-19: per-IP rate limit via the Workers rate-limiting
// binding, so forged-Origin scripts can't burn the billed geocoding quota.

const ALLOWED_ORIGIN = 'https://communitytechaid.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const origin = request.headers.get('Origin');
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Unauthorized domain', { status: 403 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return new Response('Too many requests', { status: 429, headers: CORS_HEADERS });
    }

    const incomingUrl = new URL(request.url);
    const searchParams = new URLSearchParams(incomingUrl.search);

    const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    for (const [key, value] of searchParams.entries()) {
      googleUrl.searchParams.append(key, value);
    }
    googleUrl.searchParams.append('key', env.GOOGLE_API_KEY);

    try {
      const googleResponse = await fetch(googleUrl.toString());
      const data = await googleResponse.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch map data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};
