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
