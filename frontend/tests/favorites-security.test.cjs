const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
test('favorites isolate account changes and ignore late identity responses and corrupted storage', async () => {
  const store = new Map([['applifyr_favorites', JSON.stringify([{ id: 9, title: 'Legacy', savedAt: 1 }])],
    ['aplifyr_favorites:A', JSON.stringify([{ id: 1, title: 'A private job', savedAt: 1 }])], ['aplifyr_favorites:B', '{corrupt']]);
  const listeners = new Map();
  let authChange, finishUser, state;
  const supabase = { auth: { onAuthStateChange(fn) { authChange = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    getUser: () => new Promise(resolve => { finishUser = resolve; }) } };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../lib/useFavorites.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === './supabaseClient' ? { getSupabaseBrowserClient: () => supabase, isSupabaseConfigured: true } : require(name),
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) },
    window: { addEventListener: (k,f) => listeners.set(k,f), removeEventListener: k => listeners.delete(k), dispatchEvent: e => listeners.get(e.type)?.() }, Event, Date });
  function App() { state = module.exports.useFavorites(); return null; }
  let view; await act(async () => { view = create(React.createElement(App)); });
  await act(async () => authChange('SIGNED_IN', { user: { id: 'A' } }));
  assert.equal(state.favorites[0].title, 'A private job');
  await act(async () => authChange('SIGNED_IN', { user: { id: 'B' } }));
  assert.equal(state.favorites.length, 0);
  await act(async () => finishUser({ data: { user: { id: 'A' } }, error: null }));
  assert.equal(state.favorites.length, 0);
  await act(async () => state.addFavorite({ id: 2, title: 'B job', company: '', location: '' }));
  assert.equal(JSON.parse(store.get('aplifyr_favorites:B'))[0].title, 'B job');
  assert.equal(JSON.parse(store.get('aplifyr_favorites:A'))[0].title, 'A private job');
  assert.equal(store.has('applifyr_favorites'), false);
  await act(async () => authChange('SIGNED_OUT', null));
  assert.equal(state.favorites.length, 0);
  await act(async () => state.addFavorite({ id: 3, title: 'signed out' }));
  assert.equal(state.favorites.length, 0);
  await act(async () => view.unmount());
});
