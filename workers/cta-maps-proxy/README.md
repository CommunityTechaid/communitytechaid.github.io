# cta-maps-proxy

Cloudflare Worker that proxies the Google Geocoding API for `ward_lookup.html`,
keeping the billed `GOOGLE_API_KEY` server-side. Only accepts requests whose
`Origin` is `https://communitytechaid.github.io`, rate-limited to 30/min per IP.

This directory is the source of truth, but deploys are **manual** — run
`npx wrangler deploy` from here after editing, or the repo and the deployed
worker will drift.
