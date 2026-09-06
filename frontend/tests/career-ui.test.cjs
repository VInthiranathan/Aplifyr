const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

function load(relative, mocks, extra = {}) {
  const filename = path.join(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: n => mocks[n] ?? require(n),
    Date, Error, Intl, console, setTimeout, ...extra });
  return module.exports;
}
const validation = load('lib/careerValidation.ts', {});
const translations = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/locales/sv/common.json')));
const translate = key => key.split('.').reduce((o, k) => o?.[k], translations) ?? key;
function setup(fetch) {
  return load('components/CareerHistory.tsx', {
    '../lib/careerValidation': validation,
    'next-i18next': { useTranslation: () => ({ t: translate, i18n: { language: 'sv' } }) },
    './ui/button': { Button: React.forwardRef(({ variant, ...props }, ref) => React.createElement('button', { ...props, ref })) },
  }, { fetch, window: { addEventListener() {}, removeEventListener() {} } }).default;
}
const response = (status, body) => ({ ok: status < 400, status, json: async () => body });
const button = (view, text) => view.root.findAllByType('button').find(b => b.props.children === text || (Array.isArray(b.props.children) && b.props.children.includes(text)));

test('editor preserves input on failure, retries, edits and deletes an entry', async () => {
  let fail = true;
  const requests = [];
  const Component = setup(async (_url, options) => {
    requests.push(options);
    if (!options.method) return response(200, { entries: [] });
    if (fail) return response(503, { code: 'saveError' });
    const body = JSON.parse(options.body);
    return response(200, { entry: { ...body, id: '11111111-1111-4111-8111-111111111111', updated_at: '2026-01-01T12:00:00Z' } });
  });
  let view;
  await act(async () => { view = create(React.createElement(Component, { kind: 'work' })); });
  await act(async () => button(view, 'Lägg till erfarenhet').props.onClick());
  for (const [name, value] of [['title', 'Developer'], ['organization', 'Example AB'], ['start_month', '2024-01'], ['end_month', '2025-01'], ['skills', 'C#, SQL']]) {
    await act(async () => view.root.findByProps({ name }).props.onChange({ target: { value } }));
  }
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(view.root.findByProps({ name: 'title' }).props.value, 'Developer');
  assert.equal(view.root.findByProps({ role: 'alert' }).props.children, translate('career.errors.saveError'));
  fail = false;
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(view.root.findAllByType('form').length, 0);
  assert.equal(view.root.findAllByType('article').length, 1);
  assert.equal(JSON.parse(requests.at(-1).body).skills.join(','), 'C#,SQL');
  await act(async () => button(view, 'Redigera').props.onClick());
  await act(async () => view.root.findByProps({ name: 'title' }).props.onChange({ target: { value: 'Senior developer' } }));
  await act(async () => view.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(requests.at(-1).method, 'PUT');
  assert.ok(JSON.parse(requests.at(-1).body).updated_at);
  await act(async () => button(view, 'Ta bort').props.onClick());
  assert.notEqual(requests.at(-1).method, 'DELETE');
  await act(async () => button(view, 'Ja, ta bort').props.onClick());
  assert.equal(requests.at(-1).method, 'DELETE');
  assert.equal(view.root.findAllByType('article').length, 0);
  await act(async () => view.unmount());
});
test('education captures qualification, current study and requires discard confirmation', async () => {
  const Component = setup(async () => response(200, { entries: [] }));
  let view;
  await act(async () => { view = create(React.createElement(Component, { kind: 'education' })); });
  await act(async () => button(view, 'Lägg till utbildning').props.onClick());
  assert.ok(view.root.findByProps({ name: 'qualification' }));
  await act(async () => view.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  assert.equal(view.root.findByProps({ name: 'end_month' }).props.disabled, true);
  await act(async () => button(view, 'Avbryt').props.onClick());
  assert.equal(view.root.findAllByType('form').length, 1);
  await act(async () => button(view, 'Kasta ändringar').props.onClick());
  assert.equal(view.root.findAllByType('form').length, 0);
  await act(async () => view.unmount());
});
test('loading failures disable creation and offer retry without claiming an empty history', async () => {
  const Component = setup(async () => response(401, {}));
  let view;
  await act(async () => { view = create(React.createElement(Component, { kind: 'work' })); });
  assert.equal(button(view, 'Lägg till erfarenhet').props.disabled, true);
  assert.equal(view.root.findByProps({ role: 'alert' }).props.children, translate('career.errors.unauthenticated'));
  assert.ok(button(view, 'Försök igen'));
  await act(async () => view.unmount());
});
