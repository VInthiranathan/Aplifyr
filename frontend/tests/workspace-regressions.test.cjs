const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
const root = path.resolve(__dirname, '..');
const t = key => key;
const button = props => React.createElement('button', props);
const shared = {
  'next-i18next': {useTranslation: () => ({t, i18n: {language: 'sv'}})},
  'next-i18next/serverSideTranslations': {},
  'next/link': props => React.createElement('a', props),
  'components/ui/button': {Button: button},
  'lib/serverSupabase': {},
  'lib/supabaseClient': {},
  'lib/backendUrl': {getPublicBackendUrl: () => ''},
  'lib/useDialogFocus': {useDialogFocus: () => null},
};
function loader(mocks = {}, extras = {}) {
  const cache = new Map();
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports: {}};
    cache.set(filename, module);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
    }).outputText, {
      module, exports: module.exports, Date, Intl, TextEncoder, AbortController, Event, console,
      setInterval, clearInterval, setTimeout, clearTimeout,
      require: name => {
        const key = name.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), name)).replace(/\.js$/, '') : name;
        if (key in mocks) return mocks[key];
        if (key in shared) return shared[key];
        if (name.startsWith('.')) {
          const source = ['.ts', '.tsx'].map(ext => key + ext).find(p => fs.existsSync(path.join(root, p)));
          if (source) return load(source);
        }
        return require(name);
      }, ...extras,
    });
    return module.exports;
  }
  return load;
}
const findButton = (view, label) => view.root.findAllByType('button').find(b => b.children.includes(label));
function browser() { const value = new EventTarget(); value.confirm = () => true; return value; }

test('missing ad keeps owner notes editable/deletable and clears them on account change', async () => {
  let owner = 'one';
  let note = {notes: 'Owner one private note', job_id: 'gone', updated_at: '2026-10-02T00:00:00Z'};
  const methods = [];
  const load = loader({
    'next/router': {useRouter: () => ({query: {id: 'gone', tab: 'notes'}, pathname: '/jobs/[id]', locale: 'sv'})},
    'lib/AuthSessionContext': {useAuthSession: () => ({userId: owner})},
    'lib/JobProgressContext': {useJobProgress: () => ({}), useJobProgressReady: () => true, notifyWorkspace() {}},
    'lib/useFavorites': {useFavorites: () => ({})},
    'features/jobs/useJobDetails': {useJobDetails: () => ({job: null, jobHtml: null, fetching: false, fetchError: '404'})},
    'features/jobs/useCoverLetter': {useCoverLetter: () => ({setShowModal() {}, letter: null})},
    'features/jobs/useJobApplication': {useJobApplication: () => ({application: null})},
  }, {window: browser(), fetch: async (url, options = {}) => {
    assert.match(url, /^\/api\/job-notes/);
    const method = options.method ?? 'GET'; methods.push(method);
    if (method === 'PUT') note = {...note, notes: JSON.parse(options.body).notes};
    if (method === 'DELETE') note = null;
    return {ok: true, json: async () => ({note})};
  }});
  const Page = load('pages/jobs/[id].tsx').default;
  let view; await act(async () => {view = create(React.createElement(Page));});
  assert.equal(view.root.findByType('textarea').props.value, 'Owner one private note');
  await act(async () => view.root.findByType('textarea').props.onChange({target: {value: 'Updated'}}));
  await act(async () => findButton(view, 'applications.save').props.onClick());
  assert.equal(note.notes, 'Updated');
  await act(async () => findButton(view, 'applications.delete').props.onClick());
  assert.equal(note, null);
  assert.deepEqual(methods, ['GET', 'PUT', 'DELETE']);
  owner = 'two'; note = {notes: 'Owner two note', job_id: 'gone', updated_at: 'revision'};
  await act(async () => view.update(React.createElement(Page)));
  assert.equal(view.root.findByType('textarea').props.value, 'Owner two note');
  owner = null;
  await act(async () => view.update(React.createElement(Page)));
  assert.equal(view.root.findAllByType('textarea').length, 0);
  await act(async () => view.unmount());
});

test('saved letter remains manually editable when ad is missing, but generation stays disabled', async () => {
  let saved;
  const load = loader({'lib/JobProgressContext': {useJobProgress: () => ({}), useJobProgressReady: () => true},
    'next/router': {useRouter: () => ({pathname: '/jobs/[id]', query: {id: 'gone'}})} });
  const Workspace = load('features/jobs/JobWorkspace.tsx').JobWorkspace;
  let view;
  await act(async () => {view = create(React.createElement(Workspace, {
    jobId: 'gone', userId: 'one', active: 'letter', jobAvailable: false, job: {title: 'Saved job'}, applicationModel: {},
    letterModel: {letter: 'Saved content', letterRevision: 'revision', setShowModal() {}, saveLetter: async text => {saved = text;}},
  }));});
  assert.equal(findButton(view, 'coverLetter.regenerate').props.disabled, true);
  await act(async () => findButton(view, 'coverLetter.edit').props.onClick());
  await act(async () => view.root.findByType('textarea').props.onChange({target: {value: 'Updated content'}}));
  await act(async () => findButton(view, 'coverLetter.save').props.onClick());
  assert.equal(saved, 'Updated content');
  await act(async () => view.unmount());
});

test('prepared read failure is not an empty queue or a zero ready count, and retry recovers', async () => {
  const events = browser(); let fails = true, requests = 0;
  const load = loader({'lib/JobProgressContext': {notifyWorkspace() {}}}, {
    window: events,
    fetch: async url => {
      assert.equal(url, '/api/prepared-jobs'); requests++;
      return {ok: !fails, json: async () => ({jobs: []})};
    },
  });
  const {usePreparedJobs} = load('features/home/PreparedJobs.tsx');
  const {WorkQueue, NextActions} = load('features/home/WorkQueue.tsx');
  const queue = {applications: [], error: false, today: '2026-10-02', retry() {}};
  function Harness() {
    const model = usePreparedJobs([], true);
    return React.createElement(React.Fragment, null,
      React.createElement(NextActions, {preparedJobs: model.preparedJobs, preparedError: !!model.preparedError, queue, matchCount: 0}),
      React.createElement(WorkQueue, {model, queue}));
  }
  let view; await act(async () => {view = create(React.createElement(Harness));});
  assert.equal(view.root.findAllByProps({role: 'alert'}).length, 1);
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /workspace.queueEmpty|workspace.readyCount/);
  await act(async () => findButton(view, 'workspace.retry').props.onClick());
  assert.equal(requests, 1);
  assert.equal(view.root.findAllByProps({role: 'alert'}).length, 1);
  fails = false;
  await act(async () => findButton(view, 'workspace.retry').props.onClick());
  assert.equal(requests, 2);
  assert.equal(view.root.findAllByProps({role: 'alert'}).length, 0);
  assert.match(JSON.stringify(view.toJSON()), /workspace.queueEmpty|workspace.readyCount/);
  await act(async () => view.unmount());
});

test('application edit and deletion refresh mounted shared badges immediately, failed writes do not', async () => {
  const events = browser(); let status = 'applied', fail = false, workspaceReads = 0;
  const application = {job_id: 'job', job_context: {title: 'Developer'}, status, applied_at: '2026-10-01', notes: '', updated_at: 'revision'};
  const load = loader({
    'lib/AuthSessionContext': {useAuthSession: () => ({userId: 'owner'})},
    'next/router': {useRouter: () => ({query: {}, locale: 'sv'})},
  }, {window: events, document: {visibilityState: 'visible'}, fetch: async (url, options = {}) => {
    if (url === '/api/workspace') {workspaceReads++; return {ok: true, json: async () => ({owner: 'owner', progress: status ? {job: {status, hasCv: false, hasLetter: false}} : {}})};}
    assert.equal(url, '/api/applications');
    if (fail) return {ok: false, status: 503};
    status = options.method === 'DELETE' ? null : JSON.parse(options.body).status;
    return {ok: true, json: async () => ({application: {...application, status}})};
  }});
  const Page = load('pages/applications.tsx').default;
  const {JobProgressProvider, useJobProgress} = load('lib/JobProgressContext.tsx');
  function Badge() {return React.createElement('output', null, useJobProgress().job?.status ?? 'new');}
  let view; await act(async () => {view = create(React.createElement(JobProgressProvider, null,
    React.createElement(Badge), React.createElement(Page, {ownerId: 'owner', applications: [application], loadError: false})));});
  assert.equal(workspaceReads, 1);
  await act(async () => findButton(view, 'applications.edit').props.onClick());
  await act(async () => view.root.findByType('form').findByType('select').props.onChange({target: {value: 'interview'}}));
  fail = true;
  await act(async () => view.root.findByType('form').props.onSubmit({preventDefault() {}}));
  assert.equal(workspaceReads, 1);
  fail = false;
  await act(async () => view.root.findByType('form').props.onSubmit({preventDefault() {}}));
  assert.equal(view.root.findByType('output').children[0], 'interview');
  assert.equal(workspaceReads, 2);
  await act(async () => view.root.findAllByType('button').find(b => b.props.title === 'applications.delete').props.onClick());
  assert.equal(view.root.findByType('output').children[0], 'new');
  assert.equal(workspaceReads, 3);
  await act(async () => view.unmount());
});
