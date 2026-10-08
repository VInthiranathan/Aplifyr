const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
const assert = require('node:assert/strict');
const target = new URL(process.env.APLIFYR_UI_TEST_BASE_URL ?? 'http://localhost:3100');
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/' || target.username || target.password || target.search || target.hash) {
  throw new Error('UI fixture checks require a loopback URL without credentials or a path.');
}
const base = target.origin;
const executablePath = process.env.APLIFYR_UI_TEST_BROWSER ?? (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const owner = '00000000-0000-4000-8000-000000000001';
const jobId = 'synthetic_job';
const expiry = new Date(Date.now() + 7 * 86400000).toISOString();
const initialLetter = { content: 'Synthetic saved letter', updated_at: '2026-10-07T13:00:00Z', expires_at: expiry };
const job = { id: jobId, headline: 'Synthetic vacancy', employer: { name: 'Example employer' }, description: { text: 'Synthetic vacancy description' }, qualifications: null, workplace_address: { municipality: 'Stockholm' } };
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' };
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 86400;
// This unsigned fixture exists only in the local browser. All private requests
// are intercepted; no server authentication boundary is bypassed or certified.
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, exp: expiresAt, aud: 'authenticated', role: 'authenticated' })}.synthetic`;
const session = { access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 86400, expires_at: expiresAt, user };

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    await context.addCookies([{ name: `sb-${ref}-auth-token`, value: `base64-${encode(session)}`, domain: target.hostname, path: '/', sameSite: 'Lax' }]);
    const unexpected = [], errors = [];
    let letter = { ...initialLetter }, failLetter = false, failNotes = true, failNoteWrite = true, generations = 0;
    let note = { job_id: jobId, notes: 'Synthetic saved note', updated_at: '2026-10-07T13:00:00Z' };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      const reply = (json, status = 200) => route.fulfill({ json, status });
      if (path.startsWith('/auth/v1/')) return reply(user);
      if (path === `/api/externaljobs/${jobId}`) return reply(job);
      if (path === '/api/workspace') return reply({ owner, progress: {} });
      if (path === '/api/applications') return reply({ application: null });
      if (path === `/api/jobinsights/${jobId}`) return reply({ matchedSkills: [], mentionedNotInProfile: [], relevantExperience: [] });
      if (path === '/api/profile') return reply({ userId: owner, profile: { id: owner, full_name: 'Synthetic applicant', bio: 'Synthetic source material', tech_stack: [] } });
      if (path === '/api/career') return reply({ entries: [] });
      if (path === '/api/account/consent') return reply({ notices: [{ provider: 'gemini', version: '2026-10-documents-v3', enabled: true, notice_sv: 'Synthetic fixture notice', notice_en: 'Synthetic fixture notice' }], consents: [{ provider: 'gemini', notice_version: '2026-10-documents-v3', granted: true }] });
      if (path === `/api/coverletters/${jobId}`) {
        if (failLetter) return reply({ error: 'storage' }, 503);
        return reply({ letter });
      }
      if (path === '/api/coverletters/generate-all') {
        assert.equal(request.method(), 'POST'); generations++;
        letter = { ...initialLetter, content: 'Synthetic generated letter', updated_at: '2026-10-07T14:00:00Z' };
        failLetter = true;
        return reply([{ coverLetter: letter.content, expiresAt: expiry }]);
      }
      if (path === '/api/job-notes') {
        if (request.method() === 'GET') return failNotes ? reply({ error: 'storage' }, 503) : reply({ note });
        assert.equal(request.method(), 'PUT');
        if (failNoteWrite) return reply({ code: 'storage' }, 503);
        note = { ...note, notes: request.postDataJSON().notes, updated_at: '2026-10-07T14:00:00Z' };
        return reply({ note });
      }
      if (url.origin === base && path.startsWith('/_next/data/') && /\/jobs\/synthetic_job\.json$/.test(path)) return route.continue();
      if (url.origin === base && path.startsWith('/_next/data/')) return reply({}, 404);
      if (url.origin === base && (/^\/(?:sv\/|en\/)?jobs\/synthetic_job$/.test(path) || path.startsWith('/_next/static/') || path.startsWith('/fonts/') || path.startsWith('/locales/') || /\.(?:png|ico|woff2?|ttf)$/.test(path))) return route.continue();
      unexpected.push(path); return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/jobs/' + jobId + '?tab=letter', { waitUntil: 'domcontentloaded' });
    for (const locale of ['en', 'sv']) {
      const t = require(path.join(root, 'public/locales', locale, 'common.json'));
      const prefix = locale === 'sv' ? '/sv' : '';
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const theme of ['light', 'dark']) {
          await page.evaluate(value => localStorage.setItem('theme', value), theme);
          letter = { ...initialLetter }; failLetter = false; failNotes = true; failNoteWrite = true;
          note = { job_id: jobId, notes: 'Synthetic saved note', updated_at: '2026-10-07T13:00:00Z' };
          const response = await page.goto(base + prefix + '/jobs/' + jobId + '?tab=letter', { waitUntil: 'domcontentloaded' });
          assert.equal(response.status(), 200);
          await page.getByText(letter.content, { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          assert.ok(response.headers()['content-security-policy'].includes('nonce-'));
          await page.getByRole('button', { name: t.jobs.addFavorite, exact: true }).click();
          await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? '[]').length === 1, 'aplifyr_favorites:' + owner);
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.getByText(letter.content, { exact: true }).waitFor();
          await page.getByRole('button', { name: t.jobs.removeFavorite, exact: true }).click();
          await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? '[]').length === 0, 'aplifyr_favorites:' + owner);
          await page.getByRole('button', { name: t.coverLetter.edit, exact: true }).click();
          await page.locator('textarea').fill('Synthetic unsaved draft');
          let dialogs = 0;
          const dismiss = async dialog => { dialogs++; await dialog.dismiss(); };
          page.on('dialog', dismiss);
          await page.getByRole('button', { name: t.privacy.close, exact: true }).click();
          assert.equal(dialogs, 1);
          assert.equal(await page.locator('textarea').inputValue(), 'Synthetic unsaved draft');
          page.off('dialog', dismiss);
          const accept = async dialog => { dialogs++; await dialog.accept(); };
          page.on('dialog', accept);
          await page.getByRole('button', { name: t.privacy.close, exact: true }).focus();
          await page.keyboard.press('Enter');
          await page.waitForURL(url => !url.search.includes('tab=letter'));
          assert.equal(dialogs, 2); page.off('dialog', accept);

          await page.getByRole('link', { name: t.workspace.tabs.notes, exact: true }).click();
          await page.getByRole('alert').filter({ hasText: t.applications.loadError }).waitFor();
          assert.equal(await page.locator('textarea').isDisabled(), true);
          failNotes = false;
          await page.getByRole('button', { name: t.workspace.retry, exact: true }).click();
          await page.waitForFunction(text => document.querySelector('textarea')?.value === text, note.notes);
          await page.locator('textarea').fill('Synthetic edited note');
          await page.getByRole('button', { name: t.applications.save, exact: true }).click();
          await page.getByRole('alert').filter({ hasText: t.applications.saveError }).waitFor();
          assert.equal(await page.locator('textarea').inputValue(), 'Synthetic edited note');
          failNoteWrite = false;
          await page.getByRole('button', { name: t.applications.save, exact: true }).click();
          await page.getByRole('status').filter({ hasText: t.workspace.saved }).waitFor();

          letter = null;
          await page.goto(base + prefix + '/jobs/' + jobId + '?tab=letter', { waitUntil: 'domcontentloaded' });
          const generate = page.getByRole('button', { name: t.jobDetail.generateCoverLetter, exact: true });
          await generate.waitFor();
          const countBefore = generations;
          await generate.click();
          await page.getByRole('alert').filter({ hasText: t.coverLetter.loadError }).waitFor();
          assert.equal(await page.getByRole('button', { name: t.coverLetter.edit, exact: true }).isDisabled(), true);
          assert.equal(await page.getByRole('button', { name: t.coverLetter.regenerate, exact: true }).isDisabled(), true);
          failLetter = false;
          await page.getByRole('button', { name: t.workspace.retry, exact: true }).click();
          await page.waitForFunction(text => Array.from(document.querySelectorAll('button')).some(b => !b.disabled && b.textContent.includes(text)), t.coverLetter.edit);
          assert.equal(generations, countBefore + 1);
          console.log('PASS local synthetic UI', locale, width, theme, 'favorites save/reload/remove / single close / notes retry / saved revision retry / keyboard / width / CSP');
        }
      }
    }
    assert.deepEqual(unexpected, []);
    assert.deepEqual(errors.filter(message => message !== 'Navigation cancelled'), []);
    console.log('PASS No unexpected requests or page errors; no real Auth/AI/database calls made');
  } catch (error) {
    console.log('LOCAL FIXTURE CHECK FAILED:', String(error.message).slice(0, 200)); process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
})();
