const assert = require('node:assert/strict');
const { createClient } = require('../../frontend/node_modules/@supabase/supabase-js');
const { createServerClient } = require('../../frontend/node_modules/@supabase/ssr');

function loopbackOrigin(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash,
  'Tests require an HTTP loopback origin; hosted targets are refused.');
  return url.origin;
}
function localConfig() {
  const auth = loopbackOrigin(process.env.APLIFYR_LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:55321');
  const app = loopbackOrigin(process.env.APLIFYR_LOCAL_APP_URL ?? 'http://127.0.0.1:3200');
  const mail = loopbackOrigin(process.env.APLIFYR_LOCAL_MAIL_URL ?? 'http://127.0.0.1:55324');
  const anon = process.env.APLIFYR_LOCAL_ANON_KEY;
  const service = process.env.APLIFYR_LOCAL_SERVICE_KEY;
  assert.ok(anon && service, 'Set local-only anon and service keys from Supabase status, without printing them.');
  return { auth, app, mail, anon, service };
}
const client = (config, privileged = false) => createClient(config.auth, privileged ? config.service : config.anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) }) },
});
async function refreshBrowserSession(context, config) {
  const cookies = await context.cookies(config.app), updates = [];
  const supabase = createServerClient(config.auth, config.anon, {
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) }) },
    cookies: { getAll: () => cookies, setAll: values => updates.push(...values) },
  });
  const data = checkResult(await supabase.auth.refreshSession(), 'browser session refresh');
  assert.ok(data.session && updates.length, 'Refresh did not update browser session cookies.');
  await context.addCookies(updates.map(({ name, value, options }) => ({
    name, value, domain: new URL(config.app).hostname, path: options.path ?? '/',
    httpOnly: options.httpOnly ?? false, secure: options.secure ?? false,
    sameSite: options.sameSite === 'strict' ? 'Strict' : options.sameSite === 'none' ? 'None' : 'Lax',
    expires: options.maxAge !== undefined ? Math.floor(Date.now() / 1000) + options.maxAge : -1,
  })));
  return data;
}
function checkResult(result, label) {
  assert.ok(!result.error, `${label} failed (${result.error?.code ?? result.error?.status ?? 'unavailable'})`);
  return result.data;
}
async function api(context, config, route, method = 'GET', body) {
  const response = await context.request.fetch(config.app + route, {
    method, data: body, timeout: 15000, maxRedirects: 0,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status(), headers: response.headers(), data };
}
function sessionFromCookies(cookies) {
  const pieces = cookies.filter(c => /^sb-.*-auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => Number(a.name.split('.').at(-1)) - Number(b.name.split('.').at(-1)));
  const value = pieces.map(c => decodeURIComponent(c.value)).join('');
  assert.ok(value.startsWith('base64-'), 'Missing browser session cookies.');
  return JSON.parse(Buffer.from(value.slice(7), 'base64url').toString());
}
module.exports = { loopbackOrigin, localConfig, client, checkResult, api, sessionFromCookies, refreshBrowserSession };
