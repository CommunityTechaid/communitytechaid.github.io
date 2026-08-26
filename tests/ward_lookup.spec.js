import { test, expect } from '@playwright/test';

// How long to wait for the 3.4 MB GeoJSON ward boundaries to finish loading
const GEOJSON_TIMEOUT = 30_000;

// A postcode firmly inside Southwark — used to verify end-to-end lookup
const TEST_POSTCODE = 'SE5 8QN';

// Intercept the Cloudflare geocoding proxy so postcode tests don't depend on
// an external network call being reachable from CI.
async function mockGeocoding(page) {
  await page.route('**/cta-maps-proxy.community-techaid.workers.dev/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.4736, lng: -0.0869 } } }]
      })
    })
  );
}

test.describe('Ward lookup page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ward_lookup.html');
  });

  test('has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('CommunityTechAid - Ward Lookup');
  });

  test('renders all key UI elements', async ({ page }) => {
    await expect(page.locator('#postcodeInput')).toBeVisible();
    await expect(page.locator('#submitBtn')).toBeVisible();
    await expect(page.locator('#submitBtn')).toHaveText('Lookup ward');
    await expect(page.locator('#result')).toHaveText('You have not selected a ward yet');
    await expect(page.locator('#sendToTypeform')).toBeVisible();
  });

  test('map initialises with Leaflet', async ({ page }) => {
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  // Regression guard for the "API KEY REQUIRED" outage.
  //
  // CARTO began requiring a key and answered unauthenticated requests with a
  // perfectly valid 200 PNG of the correct tile, with "API KEY REQUIRED"
  // stamped diagonally across it. Every tile loaded, the map rendered and
  // panned, and no console error fired — so the only symptom was the words
  // sitting across the map, and it reached production unnoticed until a user
  // reported it.
  //
  // That is why this does not assert "a tile loaded": that was true all the way
  // through the outage. It asserts the thing that actually differed, which is
  // whether we are ASKING for tiles as a paying-attention client — every request
  // to a host that requires credentials must carry them.
  //
  // Honest limit: this catches the key being dropped, mistyped into an ignored
  // parameter, or a keyed host being added bare. It cannot catch the key being
  // revoked at CARTO's end, which would look identical to a passing run from
  // here. That is a monitoring problem, not a test one.
  test('every basemap tile request carries the credentials its host requires', async ({ page }) => {
    // Hosts that serve a watermarked or refused tile without a key, and the
    // query parameter each one actually honours. CARTO is fussy here: it accepts
    // ?key= and silently IGNORES ?api_key= and ?apikey=, handing back the
    // watermarked tile with a 200. Pinning the parameter name is the point.
    const KEYED_TILE_HOSTS = [
      { host: 'basemaps.cartocdn.com', param: 'key' },
      { host: 'tiles.stadiamaps.com', param: 'api_key' },
      { host: 'tile.thunderforest.com', param: 'apikey' },
      { host: 'api.mapbox.com', param: 'access_token' },
    ];

    const tileRequests = [];
    page.on('response', response => {
      const url = response.url();
      if (/\/\d+\/\d+\/\d+(@\dx)?\.png/.test(url)) {
        tileRequests.push({ url, status: response.status() });
      }
    });

    await page.reload();
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 15_000 });

    expect(tileRequests.length, 'the map requested no tiles at all').toBeGreaterThan(0);

    const unauthenticated = tileRequests.filter(t => {
      const match = KEYED_TILE_HOSTS.find(k => t.url.includes(k.host));
      if (!match) return false;
      const value = new URL(t.url).searchParams.get(match.param);
      return !value;
    });
    expect(
      unauthenticated.map(t => t.url),
      'a tile was requested from a keyed host without its credential — this is the watermark bug',
    ).toEqual([]);

    const failed = tileRequests.filter(t => t.status !== 200);
    expect(failed.map(t => `${t.status} ${t.url}`), 'some basemap tiles failed to load')
      .toEqual([]);
  });

  test('ward boundaries load from GeoJSON', async ({ page }) => {
    // At least one SVG path (ward polygon) must appear within the timeout
    await expect(page.locator('.leaflet-interactive').first())
      .toBeVisible({ timeout: GEOJSON_TIMEOUT });
  });

  test('postcode lookup resolves to a ward in Lambeth or Southwark', async ({ page }) => {
    await mockGeocoding(page);
    // Ward polygons must be loaded before the point-in-polygon lookup can work
    await expect(page.locator('.leaflet-interactive').first())
      .toBeVisible({ timeout: GEOJSON_TIMEOUT });

    await page.locator('#postcodeInput').fill(TEST_POSTCODE);
    await page.locator('#submitBtn').click();

    await expect(page.locator('#result')).toHaveText(
      /You have selected ward .+ in the borough of (Lambeth|Southwark)/,
      { timeout: 10_000 }
    );
  });

  test('rejects a postcode that is too short', async ({ page }) => {
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('full postcode');
      await dialog.accept();
    });

    await page.locator('#postcodeInput').fill('SE');
    await page.locator('#submitBtn').click();
  });

  test('OK button navigates when a ward has been selected', async ({ page }) => {
    await mockGeocoding(page);
    await expect(page.locator('.leaflet-interactive').first())
      .toBeVisible({ timeout: GEOJSON_TIMEOUT });

    await page.locator('#postcodeInput').fill(TEST_POSTCODE);
    await page.locator('#submitBtn').click();

    await expect(page.locator('#result')).toHaveText(
      /You have selected ward/,
      { timeout: 10_000 }
    );

    // After a ward is selected the button's data-url should be populated
    const dataUrl = await page.locator('#sendToTypeform').getAttribute('data-url');
    expect(dataUrl).toMatch(/borough=.+&ward=.+/);
  });
});
