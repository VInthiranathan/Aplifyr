// Local production UI with synthetic Auth responses; no real email/password writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = new URL(process.env.APLIFYR_UI_TEST_BASE_URL ?? 'http://localhost:3102');
const authUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://fixture.supabase.co');
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/' || target.username || target.password || target.search || target.hash) throw Error('Auth UI checks require a loopback origin.');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.invalid', role: 'authenticated', aud: 'authenticated', email_confirmed_at: '2026-10-08T00:00:00Z', app_metadata: {}, user_metadata: {} };
const exp = Math.floor(Date.now() / 1000) + 3600;
const session = { user, access_token: `${encode({alg:'HS256'})}.${encode({sub:user.id,exp})}.synthetic`, refresh_token: 'synthetic-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer' };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.APLIFYR_UI_TEST_BROWSER ?? (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
  try {
    for (const locale of ['en', 'sv']) for (const width of [390, 1440]) for (const theme of ['light','dark']) {
      const messages = require(path.join(__dirname, '..', 'public/locales', locale, 'common.json')).auth;
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      await context.addInitScript(value => localStorage.setItem('theme', value), theme);
      let requests = 0;
      const authRequests = [];
      const errors = [];
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === authUrl.origin) authRequests.push(request.method() + ' ' + url.pathname);
        if (url.origin === authUrl.origin && url.pathname === '/auth/v1/recover') {
          requests++; assert.equal(request.method(), 'POST');
          assert.ok(url.searchParams.get('redirect_to').includes(locale === 'sv' ? '/sv/auth/reset-password' : '/auth/reset-password'));
          return route.fulfill({ json: {} });
        }
        if (url.origin === authUrl.origin && url.pathname === '/auth/v1/user') {
          if (request.method() === 'PUT') return route.fulfill({ status: 422, headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version', 'Access-Control-Allow-Origin': '*' }, json: { code: 'weak_password', msg: 'SYNTHETIC PRIVATE PROVIDER ERROR' } });
          return route.fulfill({ json: user });
        }
        if (url.origin === target.origin && url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic test fixture' } });
        if (url.origin === target.origin) return route.continue();
        errors.push('Unexpected external request: ' + url.origin); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.name));
      const prefix = locale === 'sv' ? '/sv' : '';
      const response = await page.goto(target.origin + prefix + '/auth/forgot-password');
      assert.equal(response.status(), 200); assert.ok(response.headers()['content-security-policy'].includes('nonce-'));
      await page.getByLabel(messages.email, { exact: true }).fill(user.email);
      await page.getByRole('button', { name: messages.sendResetLink, exact: true }).click();
      await page.getByText(messages.resetPasswordEmailSent, { exact: true }).waitFor();
      assert.equal(requests, 1);
      assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await context.addCookies([{ name: `sb-${authUrl.hostname.split('.')[0]}-auth-token`, value: `base64-${encode(session)}`, domain: target.hostname, path: '/', sameSite: 'Lax' }]);
      await page.goto(target.origin + prefix + '/auth/reset-password');
      await page.getByLabel(messages.newPassword, { exact: true }).fill('synthetic-password');
      await page.getByLabel(messages.confirmNewPassword, { exact: true }).fill('synthetic-password');
      await page.locator('#confirm-new-password').press('Enter');
      try { await page.getByRole('alert').filter({ hasText: messages.errors.weakPassword }).waitFor(); } catch (error) {
        const rendered = await page.locator('body').innerText();
        console.error(JSON.stringify({ authRequests, visibleErrorKeys: Object.entries(messages.errors).filter(([, value]) => rendered.includes(value)).map(([key]) => key), successVisible: rendered.includes(messages.resetPasswordSuccess) }));
        throw error;
      }
      assert.ok(!(await page.locator('body').innerText()).includes('SYNTHETIC PRIVATE PROVIDER ERROR'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
      const invalid = await page.goto(target.origin + prefix + '/auth/reset-password?code=synthetic&sb_flow_id=bad');
      assert.equal(invalid.status(), 200);
      assert.ok(page.url().includes('result=invalid'));
      assert.ok(!page.url().includes('code='));
      assert.equal(await page.locator('button[type=submit]').isDisabled(), true);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS synthetic recovery UI ${locale} ${width} ${theme}: locale, cooldown, keyboard, safe errors, invalid callback, width/CSP`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error('Auth UI check failed:', error.message); process.exitCode = 1; });
