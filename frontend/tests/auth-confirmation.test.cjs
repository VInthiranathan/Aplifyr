const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const root = path.resolve(__dirname, '..');
const t = key => key;
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      module, exports: module.exports, URL, AbortSignal, Date, setInterval, clearInterval,
      window: { location: { origin: 'https://app.example.test' } },
      require(name) {
        const key = name.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), name)) : name;
        if (key in mocks) return mocks[key];
        if (name.startsWith('.')) return load(['.ts', '.tsx'].map(ext => key + ext).find(p => fs.existsSync(path.join(root, p))));
        return require(name);
      }, ...globals,
    });
    return module.exports;
  }
  return load;
}
function ui(auth, router, globals) {
  return loader({
    'next/link': props => React.createElement('a', props),
    'components/AuthShell': props => React.createElement('section', null, props.title, props.children, props.footer),
    'components/ui/button': { Button: props => React.createElement('button', props) },
    'framer-motion': { motion: { form: props => React.createElement('form', props) }, AnimatePresence: props => props.children },
    'next-i18next': { useTranslation: () => ({ t }) },
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
    'next/router': { useRouter: () => router },
    'next-themes': { useTheme: () => ({ setTheme() {}, resolvedTheme: 'light' }) },
    'lib/supabaseClient': { isSupabaseConfigured: true, getSupabaseBrowserClient: () => ({ auth }) },
  }, globals);
}
const button = (view, label) => view.root.findAllByType('button').find(b => b.children.includes(label));
const text = view => JSON.stringify(view.toJSON());
const router = replace => ({ query: { returnTo: '/jobs/123/cv' }, locale: 'sv', asPath: '/auth', replace: replace ?? (async () => true), push: async () => true });
async function render(Page) { let view; await act(async () => { view = create(React.createElement(Page)); }); return view; }
async function credentials(view, registration = false) {
  if (registration) await act(async () => button(view, 'auth.signUp').props.onClick());
  await act(async () => {
    view.root.findAllByType('input').filter(f => f.props.type === 'email').forEach(f => f.props.onChange({ target: { value: ' synthetic@example.invalid ' } }));
    view.root.findAllByType('input').filter(f => f.props.type === 'password').forEach(f => f.props.onChange({ target: { value: 'synthetic-password' } }));
  });
}
async function submit(view) { await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} })); }
function context(query, locale = 'sv') {
  const headers = {};
  return { query, locale, req: { headers: {} }, res: { setHeader: (key, value) => headers[key] = value }, headers };
}

test('registration, email confirmation, then password login preserve the job destination', async () => {
  let registered = false, confirmed = false, signupOptions, destination;
  const auth = {
    signUp: async options => { registered = true; signupOptions = options; return { data: { user: { identities: [{}] }, session: null }, error: null }; },
    signInWithPassword: async () => confirmed
      ? { data: { session: { user: { id: 'synthetic-owner' } } }, error: null }
      : { data: { session: null }, error: { code: 'email_not_confirmed' } },
  };
  const load = ui(auth, router(async value => { destination = value; return true; }));
  const view = await render(load('pages/auth/index.tsx').default);
  await credentials(view, true); await submit(view);
  assert.equal(registered, true);
  assert.equal(signupOptions.email, 'synthetic@example.invalid');
  assert.equal(signupOptions.options.emailRedirectTo, 'https://app.example.test/sv/auth/confirm?returnTo=%2Fjobs%2F123%2Fcv');
  assert.equal(destination, '/auth/verify-email?returnTo=%2Fjobs%2F123%2Fcv');
  assert.equal(view.root.findAllByType('input').filter(f => f.props.type === 'password').every(f => f.props.value === ''), true);
  await act(async () => button(view, 'auth.signIn').props.onClick());
  await credentials(view); await submit(view);
  assert.ok(text(view).includes('auth.errors.emailNotConfirmed'));
  assert.equal(button(view, 'auth.signIn').props.disabled, false);
  const ctx = context({ code: 'synthetic-code', returnTo: '/jobs/123/cv' });
  const callback = loader({ 'lib/serverSupabase': { serverSupabase: (_req, res) => ({ auth: {
    exchangeCodeForSession: async code => {
      assert.equal(code, 'synthetic-code'); confirmed = true;
      res.setHeader('Set-Cookie', ['synthetic-session=confirmed']);
      return { data: { user: { email_confirmed_at: '2026-10-06' }, session: {} }, error: null };
    },
  } }) } })('pages/auth/confirm.tsx');
  const result = await callback.getServerSideProps(ctx);
  assert.equal(result.redirect.destination, '/sv/auth/verify-email?result=confirmed&returnTo=%2Fjobs%2F123%2Fcv#');
  assert.ok(ctx.headers['Set-Cookie']);
  assert.equal(ctx.headers['Cache-Control'], 'private, no-store');
  await submit(view); assert.equal(destination, '/jobs/123/cv');
  await act(async () => view.unmount());
});

for (const navigation of [async () => { throw Error('private server error'); }, async () => false]) {
  test('successful signup survives failed navigation and prevents duplicate registration', async () => {
    let calls = 0;
    const view = await render(ui({ signUp: async () => { calls++; return { data: { user: { identities: [{}] }, session: null }, error: null }; } }, router(navigation))('pages/auth/index.tsx').default);
    await credentials(view, true); await submit(view); await submit(view);
    assert.equal(calls, 1);
    assert.ok(text(view).includes('auth.checkEmail'));
    assert.ok(view.root.findAllByType('a').some(a => a.props.href === '/auth/verify-email?returnTo=%2Fjobs%2F123%2Fcv'));
    assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
    await act(async () => view.unmount());
  });
}

test('successful login survives failed navigation and provides a safe continuation link', async () => {
  const view = await render(ui({ signInWithPassword: async () => ({ data: { session: {} }, error: null }) }, router(async () => { throw Error('private'); }))('pages/auth/index.tsx').default);
  await credentials(view); await submit(view);
  assert.ok(text(view).includes('auth.signedInContinue'));
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.ok(view.root.findAllByType('a').some(a => a.props.href === '/jobs/123/cv'));
  await act(async () => view.unmount());
});

test('uncertain registration displays recovery instructions without exposing provider data', async () => {
  const view = await render(ui({ signUp: async () => { throw Error('synthetic private email or token'); } }, router())('pages/auth/index.tsx').default);
  await credentials(view, true); await submit(view);
  assert.ok(text(view).includes('auth.errors.signupUnavailable'));
  assert.ok(!text(view).includes('synthetic private'));
  await act(async () => view.unmount());
});

test('duplicate submits during pending signup result in one Auth call', async () => {
  let resolve, calls = 0;
  const pending = new Promise(r => resolve = r);
  const view = await render(ui({ signUp: () => { calls++; return pending; } }, router())('pages/auth/index.tsx').default);
  await credentials(view, true);
  await act(async () => { const form = view.root.findByType('form'); form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} }); });
  assert.equal(calls, 1);
  await act(async () => resolve({ data: { user: { identities: [{}] }, session: null }, error: null }));
  await act(async () => view.unmount());
});

for (const [error, outcome] of [
  [{ code: 'pkce_code_verifier_not_found', status: 400 }, 'sign-in'],
  [{ code: 'flow_state_expired', status: 400 }, 'invalid'],
  [{ code: 'flow_state_not_found', status: 400 }, 'invalid'],
  [{ name: 'AuthRetryableFetchError', status: 0 }, 'unavailable'],
  [{ status: 503 }, 'unavailable'],
]) {
  test(`confirmation handles ${error.code ?? error.name ?? error.status} without claiming success`, async () => {
    const ctx = context({ code: 'synthetic-code', returnTo: '//evil.example', sb_flow_id: 'a'.repeat(32) });
    const page = loader({ 'lib/serverSupabase': { serverSupabase: () => ({ auth: {
      exchangeCodeForSession: async (_code, options) => { assert.equal(options.flowId, 'a'.repeat(32)); return { data: { session: null }, error }; },
    } }) } })('pages/auth/confirm.tsx');
    const result = await page.getServerSideProps(ctx);
    assert.equal(result.redirect.destination, `/sv/auth/verify-email?result=${outcome}&returnTo=%2F#`);
    assert.equal(result.props, undefined);
    assert.ok(!JSON.stringify(result).includes('synthetic-code'));
  });
}

test('invalid callback parameters never initiate an exchange or echo credentials', async () => {
  let calls = 0;
  const page = loader({ 'lib/serverSupabase': { serverSupabase: () => { calls++; throw Error('unexpected'); } } })('pages/auth/confirm.tsx');
  for (const query of [{}, { code: ['one', 'two'] }, { code: 'x'.repeat(4097) }, { code: 'code', sb_flow_id: ['array'] }, { code: 'code', sb_flow_id: 'bad' }, { code: 'code', error: 'access_denied', error_description: 'private' }]) {
    const result = await page.getServerSideProps(context(query));
    assert.equal(result.redirect.destination, '/sv/auth/verify-email?result=invalid&returnTo=%2F#');
  }
  assert.equal(calls, 0);
});

test('resend uses signup only, preserves locale/job context and enforces a cooldown', async () => {
  let calls = 0, sent;
  const view = await render(ui({ resend: async input => { calls++; sent = input; return { error: null }; } }, router())('pages/auth/verify-email.tsx').default);
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: ' synthetic@example.invalid ' } }));
  await submit(view); await submit(view);
  assert.equal(calls, 1); assert.equal(sent.type, 'signup');
  assert.equal(sent.email, 'synthetic@example.invalid');
  assert.equal(sent.options.emailRedirectTo, 'https://app.example.test/sv/auth/confirm?returnTo=%2Fjobs%2F123%2Fcv');
  assert.ok(text(view).includes('auth.resendSent'));
  assert.equal(view.root.findAllByType('button').find(b => b.props.type === 'submit').props.disabled, true);
  await act(async () => view.unmount());
});

test('resend failures stay localized and do not claim mail was sent', async () => {
  const view = await render(ui({ resend: async () => ({ error: { status: 429, message: 'private' } }) }, router())('pages/auth/verify-email.tsx').default);
  await act(async () => view.root.findByType('input').props.onChange({ target: { value: 'synthetic@example.invalid' } }));
  await submit(view);
  assert.ok(text(view).includes('auth.errors.rateLimited'));
  assert.ok(!text(view).includes('auth.resendSent'));
  assert.ok(!text(view).includes('private'));
  await act(async () => view.unmount());
});

test('all new auth errors and outcomes exist in both locales', () => {
  const flow = loader()('lib/authFlow.ts');
  for (const locale of ['en', 'sv']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, `public/locales/${locale}/common.json`))).auth;
    for (const operation of ['signup', 'login', 'resend']) for (const error of [null, { status: 429 }, ...['user_already_exists','email_not_confirmed','invalid_credentials','weak_password','validation_failed','unknown'].map(code => ({ code }))]) {
      assert.ok(messages.errors[flow.authErrorKey(error, operation).split('.').at(-1)]);
    }
    for (const outcome of ['sign-in', 'invalid', 'unavailable']) assert.ok(messages.confirmation[outcome]);
  }
});

test('real Supabase SDK exchanges the signup verifier and persists session cookies through the server callback', async () => {
  const cookies = new Map(), requests = [];
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'synthetic@example.invalid', identities: [{}] };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode('synthetic')}`;
  let expectedVerifier;
  const transport = async (input, init) => {
    const url = new URL(String(input)), body = JSON.parse(init.body); requests.push(url.pathname);
    if (url.pathname === '/auth/v1/signup') {
      assert.ok(body.code_challenge); assert.equal(body.code_challenge_method, 's256');
      return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    assert.equal(url.pathname, '/auth/v1/token');
    assert.equal(url.searchParams.get('grant_type'), 'pkce');
    assert.equal(body.auth_code, 'synthetic-code');
    assert.ok(body.code_verifier);
    expectedVerifier = body.code_verifier;
    return new Response(JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user: { ...user, email_confirmed_at: '2026-10-06T00:00:00Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const { createServerClient, parseCookieHeader } = require('@supabase/ssr');
  const signup = createServerClient('https://fixture.supabase.co', 'synthetic-publishable-key', {
    global: { fetch: transport }, cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: values => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  const registered = await signup.auth.signUp({ email: user.email, password: 'synthetic-password', options: { emailRedirectTo: 'https://app.example.test/auth/confirm' } });
  assert.equal(registered.error, null); assert.equal(registered.data.session, null);
  assert.ok([...cookies.keys()].some(key => key.includes('code-verifier')));
  const headers = { 'Set-Cookie': ['unrelated=preserved'] };
  const req = { headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } };
  const res = { setHeader: (key, value) => headers[key] = value, getHeader: key => headers[key] };
  const callback = loader({}, { fetch: transport, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-publishable-key' } } })('pages/auth/confirm.tsx');
  const result = await callback.getServerSideProps({ req, res, query: { code: 'synthetic-code' }, locale: 'en' });
  assert.equal(result.redirect.destination, '/auth/verify-email?result=confirmed&returnTo=%2F#');
  assert.ok(expectedVerifier);
  assert.deepEqual(requests, ['/auth/v1/signup', '/auth/v1/token']);
  assert.equal(headers['Set-Cookie'][0], 'unrelated=preserved');
  const written = headers['Set-Cookie'].slice(1).flatMap(header => parseCookieHeader(header.split(';')[0]));
  assert.ok(written.some(cookie => cookie.name === 'sb-fixture-auth-token' && cookie.value));
  assert.ok(written.some(cookie => cookie.name.includes('code-verifier') && !cookie.value));
});
