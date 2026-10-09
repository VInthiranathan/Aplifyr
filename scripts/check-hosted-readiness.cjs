// Bounded reads using the existing dedicated test account; no signup, profile,
// consent, AI, deletion, email sending or load generation against production.
const assert = require('node:assert/strict');
const { createServerClient, serializeCookieHeader } = require('../frontend/node_modules/@supabase/ssr');
const config = {
  app: 'https://aplifyr.vercel.app', backend: 'https://aplifyr.onrender.com',
  auth: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  email: process.env.APLIFYR_TEST_EMAIL, password: process.env.APLIFYR_TEST_PASSWORD,
};
assert.equal(config.auth?.replace(/\/$/, ''), 'https://trgloqvcyzfizeycbhjx.supabase.co', 'Unexpected Auth project.');
assert.ok(config.key && config.email && config.password, 'Dedicated test credentials must be injected, never passed in command arguments.');
const cookies = new Map();
const timedFetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000), redirect: 'error' });
const client = createServerClient(config.auth, config.key, {
  global: { fetch: timedFetch }, cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => value ? cookies.set(name, value) : cookies.delete(name)),
  },
});
const report = [];
async function privateRead(route) {
  const cookie = [...cookies].map(([name, value]) => serializeCookieHeader(name, value)).join('; ');
  const response = await timedFetch(config.app + route, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200, `${route} HTTP ${response.status}`);
  assert.ok(response.headers.get('cache-control')?.includes('no-store'), 'Private response must not be cached.');
  return response.json();
}
(async () => {
  let signedIn = false;
  try {
    const health = await timedFetch(config.backend);
    assert.equal(health.status, 200); assert.equal((await health.json()).service, 'Aplifyr.Api');
    report.push('backend health');
    for (const route of ['/api/profile', '/api/account/export']) {
      const response = await timedFetch(config.app + route);
      assert.equal(response.status, 401, 'Anonymous private access must fail.');
    }
    report.push('anonymous private API denial');
    const login = await client.auth.signInWithPassword({ email: config.email, password: config.password });
    assert.ok(!login.error && login.data.session, `Auth login failed (${login.error?.code ?? 'unavailable'})`);
    signedIn = true;
    assert.ok(login.data.user.email_confirmed_at, 'Existing test email must be confirmed.');
    const owner = login.data.user.id;
    assert.equal((await privateRead('/api/profile')).userId, owner);
    for (const route of ['/api/career', '/api/applications', '/api/workspace', '/api/work-queue', '/api/prepared-jobs', '/api/account/consent']) await privateRead(route);
    const exported = await privateRead('/api/account/export');
    assert.equal(exported.account.id, owner);
    assert.ok(!JSON.stringify(exported).includes(login.data.session.access_token), 'Export contains an access token.');
    report.push('confirmed account login, server cookies and eight private reads/export');
    const otherRows = await client.from('profiles').select('id').neq('id', owner);
    assert.ok(!otherRows.error && otherRows.data.length === 0, 'Owner isolation failed on direct Data API.');
    report.push('direct profile RLS excludes other accounts');
    const refreshed = await client.auth.refreshSession();
    assert.ok(!refreshed.error && refreshed.data.session && refreshed.data.user.id === owner, 'Real session refresh failed.');
    assert.equal((await privateRead('/api/profile')).userId, owner);
    report.push('real refresh token renewal and server cookie read');
    // Local scope revokes this test session without signing out other devices.
    const token = refreshed.data.session.refresh_token;
    const logout = await client.auth.signOut({ scope: 'local' });
    assert.ok(!logout.error, 'Test session logout failed.'); signedIn = false;
    const deniedRefresh = await timedFetch(config.auth + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: config.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: token }),
    });
    assert.ok([400, 401, 403].includes(deniedRefresh.status), 'Signed-out refresh token remained usable.');
    assert.equal((await timedFetch(config.app + '/api/profile')).status, 401);
    report.push('test session logout and refresh revocation');
    console.log(JSON.stringify({ scope: 'bounded hosted checks; existing test account only', checks: report }, null, 2));
  } finally {
    if (signedIn) {
      const result = await client.auth.signOut({ scope: 'local' });
      if (result.error) throw Error('Test session cleanup failed.');
    }
  }
})().catch(error => { console.error('Hosted readiness failed:', error.name, error instanceof assert.AssertionError ? error.message : 'network/auth operation unavailable'); process.exitCode = 1; });
