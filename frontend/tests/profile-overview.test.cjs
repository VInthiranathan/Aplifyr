const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function load(relative, mocks, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: n => mocks[n] ?? require(n),
    Date, Error, Intl, AbortController, console, ...extra });
  return module.exports;
}
const translations = require('../public/locales/sv/common.json');
const t = key => key.split('.').reduce((o, k) => o?.[k], translations) ?? key;
const entry = (id, kind, start, current = false) => ({ id, kind, title: id, organization: 'Example',
  start_month: start, end_month: current ? null : '2025-01', is_current: current,
  location: 'Stockholm', qualification: kind === 'education' ? 'Degree' : '',
  description: 'Responsibilities', achievements: 'Results', learned: 'Learning', strengths: 'Strengths', skills: ['SQL'], updated_at: '2026-01-01T00:00:00Z' });
function setup(fetch, onManage = () => {}) {
  const context = load('lib/CareerEntriesContext.tsx', {}, { fetch });
  const Overview = load('components/CareerOverview.tsx', {
    '../lib/CareerEntriesContext': context,
    'next-i18next': { useTranslation: () => ({ t, i18n: { language: 'sv' } }) },
    './ui/button': { Button: ({ variant, ...props }) => React.createElement('button', props) },
  }).default;
  let state;
  function App() { state = context.useCareerEntries(); return React.createElement(Overview, { onManage }); }
  return { render: () => React.createElement(context.CareerEntriesProvider, null, React.createElement(App)), state: () => state };
}
const response = entries => ({ ok: true, json: async () => ({ entries }) });

test('overview shows all facts, sorts ongoing first, and updates both kinds from shared saved state', async () => {
  let calls = 0;
  let managed;
  const app = setup(async () => { calls++; return response([entry('older', 'work', '2020-01'), entry('study', 'education', '2021-01'), entry('current', 'work', '2019-01', true)]); }, kind => { managed = kind; });
  let view;
  await act(async () => { view = create(app.render()); });
  const headings = () => view.root.findAllByType('h3').map(h => h.props.children);
  assert.deepEqual(headings(), ['current', 'older', 'study']);
  for (const text of ['Responsibilities', 'Results', 'Learning', 'Strengths', 'SQL', 'Degree', 'Stockholm', 'Pågående']) {
    assert.ok(JSON.stringify(view.toJSON()).includes(text), text);
  }
  await act(async () => app.state().setEntries(previous => [...previous.filter(e => e.id !== 'older'), entry('new job', 'work', '2024-01')]));
  assert.deepEqual(headings(), ['current', 'new job', 'study']);
  await act(async () => app.state().setEntries(previous => previous.filter(e => e.id !== 'study')));
  assert.ok(JSON.stringify(view.toJSON()).includes(t('career.education.empty')));
  await act(async () => view.root.findAllByType('button')[0].props.onClick());
  assert.equal(managed, 'work');
  assert.equal(calls, 1);
  await act(async () => view.unmount());
});

test('overview distinguishes loading, failure and empty data and supports retry', async () => {
  let resolve;
  let calls = 0;
  const app = setup(() => ++calls === 1 ? new Promise(r => { resolve = r; }) : Promise.resolve(response([])));
  let view;
  await act(async () => { view = create(app.render()); });
  assert.equal(view.root.findAllByProps({ role: 'status' }).length, 2);
  assert.equal(view.root.findAllByType('h3').length, 0);
  await act(async () => resolve({ ok: false, status: 503 }));
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 2);
  assert.equal(view.root.findAllByType('h3').length, 0);
  const retry = view.root.findAllByType('button').find(b => b.props.children === t('career.retry'));
  await act(async () => retry.props.onClick());
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.equal(view.root.findAllByType('h3').length, 2);
  await act(async () => view.unmount());
});

test('late responses cannot overwrite a newer retry and unmount cancels the request', async () => {
  const pending = [];
  const app = setup((_url, options) => new Promise(resolve => pending.push({ resolve, signal: options.signal })));
  let view;
  await act(async () => { view = create(app.render()); });
  let reload;
  act(() => { reload = app.state().load(); });
  assert.equal(pending[0].signal.aborted, true);
  await act(async () => { pending[1].resolve(response([entry('latest', 'work', '2024-01')])); await reload; });
  await act(async () => pending[0].resolve(response([entry('stale', 'work', '2020-01')])));
  assert.equal(app.state().entries[0].id, 'latest');
  await act(async () => view.unmount());
  assert.equal(pending[1].signal.aborted, true);
});
