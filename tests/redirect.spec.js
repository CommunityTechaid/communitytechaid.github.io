import { test, expect } from '@playwright/test';

// The ward lookup was retired on 2026-10-07; every page on this site now sends visitors to
// the main Community TechAid site. The destination is stubbed so the test does not depend on
// www.communitytechaid.org.uk being reachable from CI.
const DESTINATION = 'https://www.communitytechaid.org.uk/';

for (const path of ['/', '/index.html', '/ward_lookup.html', '/ward_lookup.html?tada=true']) {
  test(`${path} redirects to the main site`, async ({ page }) => {
    await page.route('https://www.communitytechaid.org.uk/**', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>CTA</title>' })
    );
    await page.goto(path);
    await expect(page).toHaveURL(DESTINATION);
  });
}

test('the retired page makes no geocoding or map calls', async ({ page }) => {
  const thirdParty = [];
  page.on('request', req => {
    if (/workers\.dev|googleapis|cartocdn|openstreetmap/.test(req.url())) thirdParty.push(req.url());
  });
  await page.route('https://www.communitytechaid.org.uk/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>CTA</title>' })
  );
  await page.goto('/ward_lookup.html');
  await expect(page).toHaveURL(DESTINATION);
  expect(thirdParty).toEqual([]);
});
