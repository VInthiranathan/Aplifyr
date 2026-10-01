const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const { NextRequest, NextResponse } = require('next/server');

function load(claims) {
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../proxy.ts'), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Headers, Uint8Array, crypto: webcrypto, btoa, console,
    process: {env: {NODE_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://auth.example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic'}},
    require(name) {
      if (name === './lib/guestAccess') {
        const helper = {exports: {}};
        vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/guestAccess.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {module:helper,exports:helper.exports});
        return helper.exports;
      }
      if (name === 'next/server') return {NextResponse};
      if (name === './lib/contentSecurityPolicy') return {contentSecurityPolicy: nonce => `script-src 'nonce-${nonce}'`};
      if (name === '@supabase/ssr') return {createServerClient: (url, key, {cookies}) => ({auth: {
        getClaims: async () => {
          cookies.setAll([{name: 'sb-session', value: 'refreshed', options: {httpOnly: true, secure: true, path: '/'}}]);
          cookies.setAll([{name: 'sb-old', value: '', options: {maxAge: 0, path: '/'}}]);
          return claims;
        },
      }})};
      throw Error(`Unexpected import: ${name}`);
    },
  });
  return module.exports.proxy;
}

test('token refresh forwards current cookies and preserves CSP nonce and all response cookies', async () => {
  const req = new NextRequest('https://app.example.test/user', {headers: {cookie: 'sb-session=expired; sb-old=old'}});
  const response = await load({data: {claims: {sub: 'owner'}}, error: null})(req);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-middleware-request-cookie'), /sb-session=refreshed/);
  assert.doesNotMatch(response.headers.get('x-middleware-request-cookie'), /expired/);
  const nonce = response.headers.get('x-middleware-request-x-csp-nonce');
  assert.ok(nonce);
  assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${nonce}'`));
  assert.equal(response.cookies.get('sb-session').value, 'refreshed');
  assert.equal(response.cookies.get('sb-session').httpOnly, true);
  assert.equal(response.cookies.get('sb-old').value, '');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('failed claims redirect retains refresh/expiry cookies and private caching', async () => {
  const req = new NextRequest('https://app.example.test/user?private=query');
  const response = await load({data: null, error: {message: 'invalid'}})(req);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://app.example.test/auth?returnTo=%2Fuser');
  assert.equal(response.cookies.get('sb-session').value, 'refreshed');
  assert.equal(response.cookies.get('sb-old').value, '');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

for (const path of ['/', '/jobs', '/jobs/123', '/sv/jobs/123', '/support']) {
  test(`guest can open ${path} without contacting Auth`, async () => {
    const response = await load(null)(new NextRequest(`https://app.example.test${path}`));
    assert.equal(response.status, 200);
    assert.equal(response.cookies.get('sb-session'), undefined);
    assert.ok(response.headers.get('content-security-policy'));
  });
}
for (const path of ['/jobs/123/cv', '/applications', '/favorites', '/user']) {
  test(`guest cannot open private page ${path}`, async () => {
    const response = await load({data:null,error:{}})(new NextRequest(`https://app.example.test${path}`));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location')).searchParams.get('returnTo'), path);
  });
}
