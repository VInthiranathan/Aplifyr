const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(relative, mocks = {}, env = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] ?? require(name), process: { env }, URL, console, Date });
  return module.exports;
}
const safety = load('lib/apiSecurity.ts');
const html = load('lib/safeHtml.ts');
test('untrusted job HTML drops script, handlers, SVG, embeds and tracking images while preserving formatting', () => {
  const dirty = '<p>Job <strong>Developer</strong></p><script>alert(1)</script><img src="https://tracker.test" onerror="alert(1)"><svg><a xlink:href="javascript:alert(1)">x</a></svg><iframe src="https://evil.test"></iframe><a href="jav&#x61;script:alert(1)" onclick="alert(1)">Click</a><div style="background:url(https://tracker.test)">Text</div>';
  const clean = html.safeHtml(dirty);
  assert.ok(clean.includes('<strong>Developer</strong>'));
  assert.doesNotMatch(clean, /script|onerror|onclick|<svg|iframe|<img|style=|tracker/);
  assert.equal(html.safeHtml(null), '');
});
test('application URLs reject script, data, relative URLs and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', '/foo', 'https://user:pass@example.com', null]) assert.equal(html.safeExternalUrl(url), undefined);
  assert.equal(html.safeExternalUrl('https://example.com/apply'), 'https://example.com/apply');
});
test('JSON mutation guard rejects cross-origin browser traffic and simple form submissions', () => {
  for (const site of ['same-site', 'cross-site']) assert.equal(safety.isSafeMutation({ headers: { 'sec-fetch-site': site, 'content-type': 'application/json' } }), false);
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'application/json-evil']) assert.equal(safety.isSafeMutation({ headers: { 'content-type': type } }), false);
  assert.equal(safety.isSafeMutation({ headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json; charset=utf-8' } }), true);
});
const response = () => ({ code: 200, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader(k,v) { this.headers[k]=v; }, getHeader(k) { return this.headers[k]; } });
test('debug session never discloses cookie or user data', () => {
  const handler = load('pages/api/debug/session.ts').default;
  const res = response(); handler({ headers: { cookie: 'token=SECRET' } }, res);
  assert.equal(res.code, 404); assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.doesNotMatch(JSON.stringify(res.body), /SECRET|token|user/);
});
test('profile rejects malformed or oversized inputs before database access; never uses supplied id', async () => {
  const writes = [];
  const query = { upsert(value) { writes.push(value); return this; }, select() { return this; }, single: async () => ({ data: {}, error: null }) };
  const handler = load('pages/api/profile.ts', {
    '../../lib/jobPreferences': load('lib/jobPreferences.ts'),
    '../../lib/apiSecurity': safety,
    '@supabase/auth-helpers-nextjs': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, from: () => query }), parseCookieHeader: () => [] },
  }, { NEXT_PUBLIC_SUPABASE_URL: 'https://example.com', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' }).default;
  for (const body of [null, [], 'abc', { name: {} }, { bio: 'a'.repeat(5001) }, { tags: [1] }, { roles: Array(51).fill('x') }]) {
    const res = response(); await handler({ method: 'PUT', headers: { 'content-type': 'application/json' }, body }, res); assert.equal(res.code, 400);
  }
  assert.equal(writes.length, 0);
  const res = response(); await handler({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: { id: 'victim', name: 'Test', tags: ['C#'] } }, res);
  assert.equal(res.code, 200); assert.equal(writes[0].id, 'owner'); assert.equal(res.headers['Cache-Control'], 'private, no-store');
});
test('logout rejects GET and cross-site POST without touching auth', async () => {
  let calls = 0;
  const handler = load('pages/api/auth/signout.ts', {
    '../../../lib/apiSecurity': safety,
    '@supabase/auth-helpers-nextjs': { createServerClient: () => { calls++; throw Error('must not call auth'); } },
  }).default;
  for (const [method, headers, expected] of [['GET', {}, 405], ['POST', { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, 403]]) {
    const res = response(); await handler({ method, headers }, res); assert.equal(res.code, expected);
  }
  assert.equal(calls, 0);
});
