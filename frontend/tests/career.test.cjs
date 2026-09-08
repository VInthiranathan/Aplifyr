// No extra test dependency: compile isolated modules with the project's TypeScript.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, imports = {}, environment = {}) {
  const filename = path.join(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, require: name => imports[name] ?? require(name),
    process: { env: environment }, Date, Error, console,
  }, { filename });
  return module.exports;
}
const validation = load('lib/careerValidation.ts');
const valid = {
  kind: 'work', title: ' Developer ', organization: ' Example AB ', location: '',
  qualification: '', start_month: '2024-01', end_month: '2025-12', is_current: false,
  description: 'Built a scheduling tool.', achievements: '', learned: '', strengths: '',
  skills: [' C# ', 'C#', 'SQL'],
};
const invalid = (patch, code) => assert.throws(() => validation.validateCareerEntry({ ...valid, ...patch }), e => e.code === code);
test('normalizes facts and strips client-supplied ownership', () => {
  const entry = validation.validateCareerEntry({ ...valid, user_id: 'another-user', id: 'injected' });
  assert.equal(entry.title, 'Developer');
  assert.equal(JSON.stringify(entry.skills), '["C#","SQL"]');
  assert.equal(entry.user_id, undefined);
  assert.equal(entry.id, undefined);
});
test('validates required fields, payload types and length limits', () => {
  invalid({ title: '  ' }, 'required'); invalid({ organization: false }, 'invalid');
  invalid({ description: 'a'.repeat(5001) }, 'tooLong');
  invalid({ skills: ['x'.repeat(101)] }, 'invalid'); invalid({ skills: Array(51).fill('C#') }, 'invalid');
  invalid({ skills: [false] }, 'invalid'); invalid({ kind: 'unknown' }, 'invalid');
  invalid({ is_current: 'true' }, 'invalid');
  for (const value of [null, [], 'text']) assert.throws(() => validation.validateCareerEntry(value));
});
test('checks calendar months, chronology and ongoing entries', () => {
  invalid({ start_month: '2024-13' }, 'invalid');
  invalid({ start_month: '1899-12' }, 'invalid');
  invalid({ end_month: '2023-01' }, 'dateOrder');
  invalid({ start_month: '2999-01', end_month: '2999-02' }, 'futureStart');
  invalid({ end_month: '2999-02' }, 'futureEnd');
  invalid({ end_month: '' }, 'required');
  assert.equal(validation.validateCareerEntry({ ...valid, is_current: true, end_month: '2020-01' }).end_month, null);
  assert.equal(validation.validateCareerEntry({ ...valid, end_month: '2024-01' }).end_month, '2024-01');
  assert.equal(validation.validateCareerEntry({ ...valid, kind: 'education', end_month: '2999-01' }).end_month, '2999-01');
});

const id = '11111111-1111-4111-8111-111111111111';
const updated_at = '2026-01-01T12:00:00.000Z';
function api({ user = { id: 'owner' }, data = { ...valid, id, updated_at }, error = null, configured = true } = {}) {
  const calls = [];
  const query = {};
  for (const op of ['select', 'eq', 'order', 'limit', 'gt', 'insert', 'update', 'delete']) query[op] = (...args) => { calls.push([op, ...args]); return query; };
  query.then = resolve => Promise.resolve({ data, error }).then(resolve);
  query.single = query.maybeSingle = async () => ({ data, error });
  const handler = load('pages/api/career.ts', {
    '../../lib/careerValidation': validation,
    '../../lib/readCareerEntries': load('lib/readCareerEntries.ts'),
    '@supabase/auth-helpers-nextjs': {
      createServerClient: () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => query }),
      parseCookieHeader: () => [], serializeCookieHeader: () => '',
    },
  }, configured ? { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } : {}).default;
  return async (method, body = {}, headers = { 'content-type': 'application/json' }) => {
    const res = { code: 200, headers: {}, status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; }, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; } };
    await handler({ method, body, headers }, res);
    return { ...res, calls };
  };
}
test('requires authentication before reading or writing career facts', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const result = await api({ user: null })(method, valid);
    assert.equal(result.code, 401); assert.equal(result.calls.length, 0);
  }
});
test('rejects cross-site and non-JSON mutations, unsupported methods, missing configuration', async () => {
  assert.equal((await api()('POST', valid, { 'content-type': 'text/plain' })).code, 403);
  assert.equal((await api()('POST', valid, { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).code, 403);
  assert.equal((await api()('PATCH')).code, 405);
  assert.equal((await api({ configured: false })('GET')).code, 503);
});
test('reads only the authenticated user and disables response caching', async () => {
  const result = await api({ data: [] })('GET');
  assert.equal(result.code, 200);
  assert.ok(result.calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'owner'));
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
});
test('creates facts for session owner, never body owner, and rejects invalid input before insert', async () => {
  const result = await api()('POST', { ...valid, user_id: 'victim' });
  assert.equal(result.code, 201);
  assert.equal(result.calls.find(c => c[0] === 'insert')[1].user_id, 'owner');
  const bad = await api()('POST', { ...valid, title: '' });
  assert.equal(bad.code, 400); assert.equal(bad.calls.length, 0);
});
test('update and delete scope id, owner and version; stale or foreign entries are conflicts', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const result = await api()(method, { ...valid, id, updated_at });
    assert.equal(result.code, 200);
    for (const [field, value] of [['id', id], ['user_id', 'owner'], ['updated_at', updated_at]]) {
      assert.ok(result.calls.some(c => c[0] === 'eq' && c[1] === field && c[2] === value));
    }
    assert.equal((await api({ data: null })(method, { ...valid, id, updated_at })).code, 409);
    assert.equal((await api()(method, { ...valid, id: 'invalid', updated_at })).code, 400);
    assert.equal((await api()(method, { ...valid, id })).code, 400);
  }
});
test('database errors return failures without leaking database details', async () => {
  const result = await api({ error: { message: 'private SQL details' } })('POST', valid);
  assert.equal(result.code, 503);
  assert.equal(JSON.stringify(result.body), '{"code":"saveError"}');
});
test('Swedish and English career translations have matching keys', () => {
  const keys = (obj, prefix = '') => Object.entries(obj).flatMap(([key, value]) => typeof value === 'string' ? [`${prefix}${key}`] : keys(value, `${prefix}${key}.`)).sort();
  const read = lang => JSON.parse(fs.readFileSync(path.join(__dirname, `../public/locales/${lang}/common.json`))).career;
  assert.deepEqual(keys(read('sv')), keys(read('en')));
});
