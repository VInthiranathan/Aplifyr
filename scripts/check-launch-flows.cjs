// Real GoTrue/PostgREST + browser/server cookies on an isolated loopback stack.
// No Auth, API or provider responses are intercepted or fabricated.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { localConfig, client, checkResult, api, sessionFromCookies, refreshBrowserSession } = require('./lib/local-launch.cjs');
const { appendIntent } = require('./lib/deletion-replay.cjs');
const config = localConfig();
const admin = client(config, true);
const noticeVersion = '2026-10-documents-v3';
const accounts = [], contexts = [];
let savedBudget;
const runId = crypto.randomBytes(6).toString('hex');

async function mailLink(email, kind) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(config.mail + '/api/v1/messages', { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200, 'Mailpit mailbox is unavailable.');
    const messages = (await response.json()).messages ?? [];
    for (const message of messages.filter(m => m.To?.some(t => t.Address === email))) {
      const detail = await fetch(config.mail + '/api/v1/message/' + encodeURIComponent(message.ID), { signal: AbortSignal.timeout(5000) });
      assert.equal(detail.status, 200);
      const body = await detail.json();
      for (const raw of ((body.HTML ?? '') + '\n' + (body.Text ?? '')).match(/https?:\/\/[^\s"<>]+/g) ?? []) {
        const link = new URL(raw.replace(/&amp;/g, '&'));
        if (link.pathname !== '/auth/v1/verify' || link.searchParams.get('type') !== kind) continue;
        assert.equal(link.origin, config.auth, 'Email verification must stay on the local stack.');
        assert.equal(new URL(link.searchParams.get('redirect_to')).origin, config.app, 'Email callback must stay on the local app.');
        return link.href;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('No local verification email arrived within 15 seconds.');
}
async function signup(browser, index, locale) {
  const account = { email: `launch-${runId}-${index}@example.test`, password: crypto.randomBytes(24).toString('base64url'), locale };
  const context = await browser.newContext({ viewport: { width: index % 2 ? 390 : 1440, height: 1000 } });
  contexts.push(context); accounts.push(account);
  // Refuse unexpected browser destinations, including any accidentally hosted Auth config.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return [config.app, config.auth].includes(url.origin) ? route.continue() : route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const prefix = locale === 'sv' ? '/sv' : '';
  const messages = require(`../frontend/public/locales/${locale}/common.json`).auth;
  await page.goto(config.app + prefix + '/auth?returnTo=%2Fuser');
  await page.getByRole('button', { name: messages.signUp, exact: true }).click();
  await page.locator('form input[type=text]').fill('Synthetic Launch Tester');
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').nth(0).fill(account.password);
  await page.locator('input[type=password]').nth(1).fill(account.password);
  const sent = page.waitForResponse(r => new URL(r.url()).origin === config.auth && new URL(r.url()).pathname === '/auth/v1/signup');
  await page.locator('button[type=submit]').click();
  const response = await sent;
  assert.equal(response.status(), 200, 'Real signup failed.');
  const data = await response.json(); account.id = data.user?.id ?? data.id;
  assert.ok(account.id, 'Signup did not return an account ID.');
  assert.ok(!data.access_token && !data.session, 'Signup must require email confirmation.');
  await page.waitForURL(url => url.pathname.endsWith('/auth/verify-email'));
  assert.equal((await api(context, config, '/api/profile')).status, 401);
  const unconfirmed = await client(config).auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(unconfirmed.error?.code, 'email_not_confirmed');
  const link = await mailLink(account.email, 'signup');
  await page.goto(link);
  await page.waitForURL(url => url.pathname.endsWith('/auth/verify-email') && url.searchParams.get('result') === 'confirmed');
  assert.ok(!page.url().includes('code=') && !page.url().includes('token='), 'Callback URL retained credentials.');
  const profile = await api(context, config, '/api/profile');
  assert.equal(profile.status, 200); assert.equal(profile.data.userId, account.id);
  const session = sessionFromCookies(await context.cookies());
  assert.equal(session.user.id, account.id);
  account.context = context; account.page = page;
  account.client = client(config);
  checkResult(await account.client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token }), 'test session');
  console.log(`PASS real registration, confirmation email/callback and server cookies (${locale})`);
  return account;
}
async function workflow(account, iteration) {
  const jobId = `launch-${runId}-${iteration}`;
  const call = (route, method, body) => api(account.context, config, route, method, body);
  let application, note, career;
  try {
    const profile = await call('/api/profile'); assert.equal(profile.status, 200);
    const saved = await call('/api/profile', 'PUT', { name: 'Synthetic Launch Tester', bio: 'Synthetic test facts.', updatedAt: profile.data.profile?.updated_at ?? null });
    assert.equal(saved.status, 200);
    const jobHistory = await call('/api/career', 'POST', { kind: 'work', title: 'Synthetic tester', organization: 'Synthetic employer', location: '', qualification: '', start_month: '2025-01', end_month: '2025-02', is_current: false, description: 'Synthetic testing work.', achievements: '', learned: '', skills: ['Testing'], strengths: '' });
    assert.equal(jobHistory.status, 201); career = jobHistory.data.entry;
    const created = await call('/api/applications', 'POST', { jobId, appliedAt: '2026-10-08', jobContext: { id: jobId, title: 'Synthetic vacancy' } });
    assert.equal(created.status, 201); application = created.data.application;
    const original = application.updated_at;
    const edit = { jobId, updatedAt: original, appliedAt: '2026-10-08', status: 'interview', nextStep: 'Synthetic follow-up', nextStepAt: null, notes: '' };
    const changed = await call('/api/applications', 'PUT', edit);
    assert.equal(changed.status, 200); application = changed.data.application;
    assert.equal((await call('/api/applications', 'PUT', edit)).status, 409, 'Stale edit must fail.');
    const written = await call('/api/job-notes', 'PUT', { jobId, updatedAt: null, notes: 'Synthetic private note' });
    assert.equal(written.status, 200); note = written.data.note;
    const workspace = await call('/api/workspace'); assert.equal(workspace.status, 200);
    assert.equal(workspace.data.progress[jobId].hasNotes, true);
    const exported = await call('/api/account/export'); assert.equal(exported.status, 200);
    assert.equal(exported.data.account.id, account.id);
    assert.ok(exported.data.jobNotes.some(n => n.job_id === jobId));
    assert.ok(exported.data.jobApplications.some(a => a.job_id === jobId && a.status === 'interview'));
    assert.ok(exported.data.career.some(entry => entry.id === career.id));
    assert.ok(exported.headers['cache-control'].includes('no-store'));
  } finally {
    if (note) assert.equal((await call('/api/job-notes', 'DELETE', { jobId, updatedAt: note.updated_at })).status, 200);
    if (application) assert.equal((await call('/api/applications', 'DELETE', { jobId, updatedAt: application.updated_at })).status, 200);
    if (career) assert.equal((await call('/api/career', 'DELETE', { id: career.id, updated_at: career.updated_at })).status, 200);
  }
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.APLIFYR_UI_TEST_BROWSER ?? (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
  try {
    savedBudget = checkResult(await admin.from('ai_budget').select('daily_limit,per_user_limit,day,calls').eq('id', true).single(), 'local budget snapshot');
    checkResult(await admin.from('ai_budget').update({ daily_limit: 1000, per_user_limit: 20, day: new Date().toISOString().slice(0, 10), calls: 0 }).eq('id', true), 'isolated quota setup');
    const a = await signup(browser, 0, 'en'), b = await signup(browser, 1, 'sv');
    const refreshed = await refreshBrowserSession(a.context, config);
    assert.equal(refreshed.user.id, a.id);
    checkResult(await a.client.auth.setSession(refreshed.session), 'renewed owner session');
    console.log('PASS real refresh-token renewal');
    checkResult(await a.client.from('job_notes').insert({ user_id: a.id, job_id: 'isolation', notes: 'Synthetic A-only note' }), 'owner note');
    const other = checkResult(await b.client.from('job_notes').select('job_id').eq('user_id', a.id), 'other owner read');
    assert.equal(other.length, 0);
    assert.ok((await b.client.from('job_notes').insert({ user_id: a.id, job_id: 'forbidden', notes: 'Must fail' })).error, 'Cross-owner insert succeeded.');
    // Local synthetic notices only; this makes no external provider call.
    checkResult(await admin.from('ai_privacy_notices').update({ enabled: true }).eq('provider', 'gemini').eq('version', noticeVersion), 'local test notice');
    const reserve = () => admin.rpc('reserve_ai_call_v2', { p_user: a.id, p_provider: 'gemini', p_version: noticeVersion });
    assert.equal(checkResult(await reserve(), 'missing consent gate'), null);
    checkResult(await a.client.rpc('set_ai_consent', { p_provider: 'gemini', p_version: noticeVersion, p_granted: true }), 'synthetic user choice');
    const ticket = checkResult(await reserve(), 'consented reservation'); assert.ok(ticket);
    assert.equal(checkResult(await reserve(), 'in-flight gate'), null);
    checkResult(await admin.rpc('release_ai_call', { p_user: a.id, p_ticket: ticket }), 'release');
    checkResult(await a.client.rpc('set_ai_consent', { p_provider: 'gemini', p_version: '', p_granted: false }), 'withdrawal');
    assert.equal(checkResult(await reserve(), 'withdrawn consent gate'), null);
    const budget = checkResult(await admin.from('ai_budget').select('daily_limit,per_user_limit').eq('id', true).single(), 'local budget');
    try {
      checkResult(await admin.from('ai_budget').update({ per_user_limit: 2, daily_limit: 3 }).eq('id', true), 'local quota fixture');
      checkResult(await a.client.rpc('set_ai_consent', { p_provider: 'gemini', p_version: noticeVersion, p_granted: true }), 'synthetic consent renewal');
      const retryTicket = checkResult(await reserve(), 'fresh retry reservation'); assert.ok(retryTicket);
      checkResult(await admin.rpc('release_ai_call', { p_user: a.id, p_ticket: retryTicket }), 'retry release');
      assert.equal(checkResult(await reserve(), 'per-user quota'), null);
      checkResult(await b.client.rpc('set_ai_consent', { p_provider: 'gemini', p_version: noticeVersion, p_granted: true }), 'second user choice');
      const reserveB = () => admin.rpc('reserve_ai_call_v2', { p_user: b.id, p_provider: 'gemini', p_version: noticeVersion });
      const finalTicket = checkResult(await reserveB(), 'other user capacity'); assert.ok(finalTicket);
      checkResult(await admin.rpc('release_ai_call', { p_user: b.id, p_ticket: finalTicket }), 'other release');
      assert.equal(checkResult(await reserveB(), 'global quota'), null);
    } finally {
      checkResult(await admin.from('ai_budget').update(budget).eq('id', true), 'quota fixture cleanup');
      for (const account of [a, b]) checkResult(await account.client.rpc('set_ai_consent', { p_provider: 'gemini', p_version: '', p_granted: false }), 'test consent cleanup');
    }
    console.log('PASS real RLS isolation, user consent/withdrawal, fresh retry reservation and per-user/global quota gates; no AI request');
    // Finite load exercises complete private workflows through the running app.
    const samples = [];
    await Promise.all([a, b].map(async account => {
      for (let n = 0; n < 5; n++) {
        const before = performance.now(); await workflow(account, `${account.locale}-${n}`);
        samples.push(performance.now() - before);
      }
    }));
    samples.sort((x, y) => x - y);
    const p95 = samples[Math.ceil(samples.length * .95) - 1];
    assert.ok(p95 < 15000, 'Complete local workflow p95 exceeded 15 seconds.');
    console.log(JSON.stringify({ scope: 'real loopback Auth/database/app; synthetic data; no provider/search capacity claim', users: 2, workflows: samples.length, concurrency: 2, p50WorkflowMs: Math.round(samples[4]), p95WorkflowMs: Math.round(p95) }));
    // Recovery uses the real UI, SMTP capture and cookie-aware server callback.
    assert.equal((await api(a.context, config, '/api/auth/signout', 'POST', {})).status, 302);
    await a.page.goto(config.app + '/auth/forgot-password');
    await a.page.locator('input[type=email]').fill(a.email);
    await a.page.locator('button[type=submit]').click();
    await a.page.goto(await mailLink(a.email, 'recovery'));
    await a.page.waitForURL(url => url.pathname.endsWith('/auth/reset-password') && url.searchParams.get('result') === 'confirmed');
    const nextPassword = crypto.randomBytes(24).toString('base64url');
    await a.page.locator('#new-password').fill(nextPassword);
    await a.page.locator('#confirm-new-password').fill(nextPassword);
    const changedPassword = a.page.waitForResponse(r => new URL(r.url()).origin === config.auth && new URL(r.url()).pathname === '/auth/v1/user' && r.request().method() === 'PUT');
    await a.page.locator('#confirm-new-password').press('Enter');
    assert.equal((await changedPassword).status(), 200);
    assert.ok((await client(config).auth.signInWithPassword({ email: a.email, password: a.password })).error, 'Old password remained usable.');
    a.password = nextPassword;
    checkResult(await a.client.auth.signInWithPassword({ email: a.email, password: a.password }), 'new password login');
    console.log('PASS real recovery email, PKCE callback, password update and old-password rejection');
    // Account switch uses the same browser cookie jar, not separate mocked sessions.
    assert.equal((await api(a.context, config, '/api/auth/signout', 'POST', {})).status, 302);
    assert.equal((await api(a.context, config, '/api/profile')).status, 401);
    await a.page.goto(config.app + '/auth?returnTo=%2Fuser');
    await a.page.locator('input[type=email]').fill(b.email);
    await a.page.locator('input[type=password]').fill(b.password);
    await a.page.locator('button[type=submit]').click();
    await a.page.waitForURL(url => url.pathname === '/user');
    assert.equal((await api(a.context, config, '/api/profile')).data.userId, b.id);
    assert.equal((await api(a.context, config, '/api/job-notes?jobId=isolation')).data.note, null);
    assert.equal((await api(a.context, config, '/api/account/export')).data.account.id, b.id);
    console.log('PASS real logout and account switch in one browser; A note excluded from B');
    const journal = process.env.APLIFYR_LOCAL_DELETION_JOURNAL;
    assert.ok(journal, 'Set an independent private local deletion journal path.');
    appendIntent(journal, { version: 1, projectRef: 'aplifyr-launch-local', userId: a.id, requestedAt: new Date().toISOString() });
    const stale = checkResult(await a.client.auth.getSession(), 'session before deletion').session;
    checkResult(await admin.auth.admin.deleteUser(a.id), 'local account deletion');
    for (const table of ['profiles', 'profile_career_entries', 'ai_consents', 'ai_consent_receipts', 'ai_usage', 'generated_cvs', 'generated_cover_letters', 'prepared_jobs', 'job_applications', 'job_notes', 'aplifyr_career_counts', 'aplifyr_application_counts', 'aplifyr_note_counts']) {
      const rows = checkResult(await admin.from(table).select(table === 'profiles' ? 'id' : 'user_id').eq(table === 'profiles' ? 'id' : 'user_id', a.id), 'deletion cascade');
      assert.equal(rows.length, 0, 'Account deletion left rows in ' + table);
    }
    assert.ok((await client(config).auth.getUser(stale.access_token)).error, 'Deleted account retained Auth access.');
    assert.ok((await a.client.auth.refreshSession()).error, 'Deleted account retained refresh access.');
    console.log('PASS local Auth deletion, all owned-table cascades and stale-token/refresh denial; provider/hosted-backup deletion remains separate');
  } finally {
    const failures = [];
    for (const account of accounts) if (account.id) {
      const deleted = await admin.auth.admin.deleteUser(account.id);
      if (deleted.error && ![404, 'user_not_found'].includes(deleted.error.status) && deleted.error.code !== 'user_not_found') failures.push('account cleanup');
    }
    const noticeCleanup = await admin.from('ai_privacy_notices').update({ enabled: false }).eq('provider', 'gemini').eq('version', noticeVersion);
    if (noticeCleanup.error) failures.push('local notice cleanup');
    if (savedBudget && (await admin.from('ai_budget').update(savedBudget).eq('id', true)).error) failures.push('local budget cleanup');
    for (const context of contexts) await context.close();
    await browser.close();
    assert.deepEqual(failures, [], 'Local account cleanup failed.');
  }
})().catch(error => { console.error('Local launch flow failed:', error.name, error instanceof assert.AssertionError ? error.message : 'local Auth/app/mail operation failed'); process.exitCode = 1; });
