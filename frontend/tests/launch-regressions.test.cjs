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
  function load(file) {
    const filename = path.resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText, {
      module, exports: module.exports, AbortController, Error, Date, URL, console, setTimeout, clearTimeout,
      require: name => {
        const key = name.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), name)).replace(/\.js$/, '') : name;
        if (key in mocks) return mocks[key];
        if (name === 'next-i18next') return { useTranslation: () => ({ t, i18n: { language: 'sv' } }) };
        if (name === 'next/router') return { events: undefined };
        if (key === 'lib/backendUrl') return { getPublicBackendUrl: () => '' };
        if (name.startsWith('.')) return load(['.ts', '.tsx'].map(ext => key + ext).find(p => fs.existsSync(path.join(root, p))));
        return require(name);
      }, ...globals,
    });
    return module.exports;
  }
  return load;
}
const reply = body => ({ ok: true, json: async () => body });
const session = { user: { id: 'synthetic-owner' }, access_token: 'synthetic-token' };
const auth = { getSupabaseBrowserClient: () => ({ auth: {
  getSession: async () => ({ data: { session } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} }) };
const findButton = (view, text) => view.root.findAllByType('button').find(button => button.children.includes(text));
async function mountHook(hook) {
  let model;
  function Probe() { model = hook(); return null; }
  let view; await act(async () => { view = create(React.createElement(Probe)); });
  return { get model() { return model; }, view, rerender: () => act(async () => view.update(React.createElement(Probe))) };
}

test('job detail ignores forged query data and rejects another job in an upstream fallback', async () => {
  const router = { isReady: true, query: { id: 'real', data: JSON.stringify({ id: 'forged', headline: 'Forged ad' }) } };
  const requests = [];
  let response = { id: 'real', headline: 'Canonical ad' };
  const load = loader({ 'next/router': { useRouter: () => router } }, { fetch: async url => { requests.push(url); return reply(response); } });
  const { useJobDetails } = load('features/jobs/useJobDetails.ts');
  const probe = await mountHook(useJobDetails);
  assert.deepEqual(requests, ['/api/externaljobs/real']);
  assert.equal(probe.model.job.headline, 'Canonical ad');
  router.query = { id: 'gone' }; response = { hits: [{ id: 'unrelated', headline: 'Wrong job' }] };
  await probe.rerender();
  assert.equal(probe.model.job, null);
  assert.equal(probe.model.fetchError, 'jobDetail.notFound');
  assert.equal(probe.model.fetching, false);
  await act(async () => probe.view.unmount());
});

test('job detail cancels old requests, clears HTML and ignores late responses after navigation', async () => {
  const router = { isReady: true, query: { id: 'first' } }, requests = [];
  const load = loader({ 'next/router': { useRouter: () => router } }, { fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
  const probe = await mountHook(load('features/jobs/useJobDetails.ts').useJobDetails);
  router.query = { id: 'second' }; await probe.rerender();
  assert.equal(requests[0].options.signal.aborted, true);
  await act(async () => requests[1].resolve(reply({ html: '<p>Second ad</p>' })));
  await act(async () => requests[0].resolve(reply({ id: 'first', headline: 'Too late' })));
  assert.equal(probe.model.job, null); assert.equal(probe.model.jobHtml, '<p>Second ad</p>');
  router.query = { id: 'third' }; await probe.rerender();
  assert.equal(probe.model.jobHtml, null);
  await act(async () => requests[2].resolve(reply({ id: 'third', headline: 'Third ad' })));
  assert.equal(probe.model.job.id, 'third');
  router.query = { id: ['invalid', 'route'] }; await probe.rerender();
  assert.equal(requests.length, 3); assert.equal(probe.model.job, null);
  await act(async () => probe.view.unmount());
});

test('malformed or empty job responses remain explicit errors', async () => {
  const router = { isReady: true, query: { id: 'job' } };
  for (const response of [null, 'not JSON data', { hits: [] }, { cause: { code: '404' } }, { error: 'unavailable' }]) {
    const load = loader({ 'next/router': { useRouter: () => router } }, { fetch: async () => reply(response) });
    const probe = await mountHook(load('features/jobs/useJobDetails.ts').useJobDetails);
    assert.equal(probe.model.job, null); assert.ok(probe.model.fetchError);
    await act(async () => probe.view.unmount());
  }
});

test('a null qualification field from JobTech does not crash the ad', () => {
  const load = loader();
  const { renderQualifications } = load('components/JobAdContent.tsx');
  assert.equal(renderQualifications({ qualifications: null }, t), null);
});

test('saved-letter read failure blocks replacement and retry restores the saved revision', async () => {
  const router = { isReady: true, query: { id: 'job' } }; let failed = true, writes = 0;
  const load = loader({ 'next/router': { useRouter: () => router }, 'lib/supabaseClient': auth,
    'lib/JobProgressContext': { notifyWorkspace() {} }, 'lib/generationAccess': { generationDestination: async () => null },
  }, { fetch: async (_url, options) => {
    if (options?.method && options.method !== 'GET') writes++;
    return failed ? { ok: false, status: 503 } : reply({ letter: { content: 'Saved private draft', updated_at: 'revision', expires_at: '2026-10-10T12:00:00Z' } });
  } });
  const { useCoverLetter } = load('features/jobs/useCoverLetter.ts');
  const probe = await mountHook(() => useCoverLetter({ id: 'job' }, () => {}));
  assert.equal(probe.model.letterLoadError, true);
  await act(async () => { await probe.model.requestGeneration(); await probe.model.generate(); });
  assert.equal(probe.model.consentOpen, false); assert.equal(writes, 0);
  failed = false; await act(async () => probe.model.retryLetter());
  assert.equal(probe.model.letterLoadError, false); assert.equal(probe.model.letterRevision, 'revision');
  assert.equal(probe.model.letter, 'Saved private draft');
  await act(async () => probe.view.unmount());
});

test('application read failure blocks marking applied and retry restores the existing application', async () => {
  const router = { isReady: true, query: { id: 'job' } }; let failed = true, writes = 0;
  const load = loader({ 'next/router': { useRouter: () => router }, 'lib/JobProgressContext': { notifyWorkspace() {} } }, {
    fetch: async (_url, options) => {
      if (options?.method === 'POST') writes++;
      return failed ? { ok: false, status: 503 } : reply({ application: { job_id: 'job', status: 'interview' } });
    },
  });
  const { useJobApplication } = load('features/jobs/useJobApplication.ts');
  const probe = await mountHook(() => useJobApplication({ id: 'job' }, () => {}));
  assert.equal(probe.model.applicationLoadError, true);
  await act(async () => probe.model.markAsApplied()); assert.equal(writes, 0);
  failed = false; await act(async () => probe.model.retryApplication());
  assert.equal(probe.model.applicationLoadError, false); assert.equal(probe.model.application.status, 'interview');
  await act(async () => probe.view.unmount());
});

test('unsaved changes guard cancels route and unload, permits confirmed navigation and removes listeners', async () => {
  let dirty = true, accept = false, confirmations = 0;
  const listeners = new Map(), emitted = [];
  const events = { on: (name, fn) => listeners.set(name, fn), off: name => listeners.delete(name), emit: (...args) => emitted.push(args) };
  const browser = new EventTarget(); browser.confirm = () => { confirmations++; return accept; };
  const load = loader({ 'next/router': { events } }, { window: browser });
  const probe = await mountHook(() => load('lib/useUnsavedChanges.ts').useUnsavedChanges(dirty));
  const event = new Event('beforeunload', { cancelable: true }); browser.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.throws(() => listeners.get('routeChangeStart')('/jobs', { shallow: false }), error => error.cancelled === true);
  assert.equal(emitted[0][0], 'routeChangeError');
  accept = true; assert.doesNotThrow(() => listeners.get('routeChangeStart')('/jobs', { shallow: false }));
  dirty = false; await probe.rerender();
  const clean = new Event('beforeunload', { cancelable: true }); browser.dispatchEvent(clean);
  assert.equal(clean.defaultPrevented, false);
  assert.equal(probe.model(), true); assert.equal(confirmations, 2);
  await act(async () => probe.view.unmount()); assert.equal(listeners.size, 0);
  const after = new Event('beforeunload', { cancelable: true }); browser.dispatchEvent(after);
  assert.equal(after.defaultPrevented, false);
});

test('profile clears SSR personal data and pending career/profile reads when the owner changes or signs out', async () => {
  let owner = 'one'; const requests = [];
  const load = loader({
    'lib/AuthSessionContext': { useAuthSession: () => ({ userId: owner, loading: false }) },
    'lib/supabaseClient': { isSupabaseConfigured: true },
    'lib/matchSessionContext': { useMatchSession: () => ({ clearSession() {} }) },
    'lib/useDialogFocus': { useDialogFocus: () => null },
    'lib/CareerEntriesContext': { CareerEntriesProvider: ({ children }) => children },
    'components/ProfileReadiness': () => null, 'components/CareerHistory': () => null,
    'components/CareerOverview': () => null, 'components/JobPreferences': () => null,
    'next/link': props => React.createElement('a', props),
    'next-i18next/serverSideTranslations': {},
    'next/router': { useRouter: () => ({ query: {} }) },
    'components/ui/button': { Button: props => React.createElement('button', props) },
  }, { fetch: (_url, options) => new Promise(resolve => requests.push({ options, resolve })) });
  const Page = load('pages/user/index.tsx').default;
  const user = { id: 'one', name: 'Private first owner', tags: [], roles: [], locationPreferences: [], avatarInitials: 'PF' };
  let view; await act(async () => { view = create(React.createElement(Page, { user })); });
  assert.match(JSON.stringify(view.toJSON()), /Private first owner/);
  owner = 'two'; await act(async () => view.update(React.createElement(Page, { user })));
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /Private first owner/);
  assert.equal(requests.length, 1);
  owner = null; await act(async () => view.update(React.createElement(Page, { user })));
  assert.equal(requests[0].options.signal.aborted, true);
  await act(async () => requests[0].resolve(reply({ userId: 'two', profile: { id: 'two', full_name: 'Late private second owner' } })));
  assert.doesNotMatch(JSON.stringify(view.toJSON()), /Private first owner|Late private second owner/);
  assert.equal(view.root.findAllByType('textarea').length, 0);
  await act(async () => view.unmount());
});

test('CV rejects a late session belonging to the previous owner before sending document requests', async () => {
  let resolveSession, listener; const requests = [];
  const load = loader({
    'lib/supabaseClient': { getSupabaseBrowserClient: () => ({ auth: {
      getSession: () => new Promise(resolve => { resolveSession = resolve; }),
      onAuthStateChange: callback => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    } }) },
    'lib/matchSessionContext': { useMatchSession: () => ({ getSession: () => ({ matched: [] }) }) },
    'lib/JobProgressContext': { notifyWorkspace() {} },
    'features/jobs/WorkspaceNav': { WorkspaceNav: () => null },
    'components/CvEditor': () => null, 'components/CvPreview': () => null,
    'components/CvTemplateThumbnail': () => null, 'components/AiGenerationConsent': () => null,
    'next/link': props => React.createElement('a', props),
    'next-i18next/serverSideTranslations': {},
    'next/router': { useRouter: () => ({ isReady: true, query: { id: 'job' } }) },
    'components/ui/button': { Button: props => React.createElement('button', props) },
  }, { fetch: async (...args) => { requests.push(args); return reply({}); } });
  const Page = load('pages/jobs/[id]/cv.tsx').default;
  let view; await act(async () => { view = create(React.createElement(Page)); });
  await act(async () => listener('SIGNED_IN', { user: { id: 'next-owner' } }));
  await act(async () => resolveSession({ data: { session } }));
  assert.equal(requests.length, 0);
  assert.equal(view.root.findByProps({ role: 'alert' }).children[0], 'cv.errors.authentication');
  await act(async () => view.unmount());
});

test('closing an inline letter asks once and rejected navigation retains its draft', async () => {
  const listeners = new Map(); let confirmations = 0, accept = false, navigations = 0;
  const events = { on: (name, fn) => listeners.set(name, fn), off: name => listeners.delete(name), emit() {} };
  const browser = new EventTarget(); browser.confirm = () => { confirmations++; return accept; };
  const load = loader({
    'next/router': { events }, 'lib/useDialogFocus': { useDialogFocus: () => null }, 'components/RewriteSuggestion': () => null,
    'components/ui/button': { Button: props => React.createElement('button', props) },
  }, { window: browser });
  const Modal = load('components/CoverLetterModal.tsx').default;
  let view;
  await act(async () => { view = create(React.createElement(Modal, {
    inline: true, isOpen: true, letter: 'Saved original', jobTitle: 'Synthetic vacancy', company: '', expiresAt: null,
    onDelete() {}, onRegenerate() {}, onClose() {
      try { listeners.get('routeChangeStart')('/jobs/job', { shallow: false }); }
      catch (error) { if (error.cancelled) return; throw error; }
      navigations++;
    },
  })); });
  await act(async () => findButton(view, 'coverLetter.edit').props.onClick());
  await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: 'Keep this draft' } }));
  const close = () => view.root.findByProps({ 'aria-label': 'privacy.close' }).props.onClick();
  await act(async () => close());
  assert.equal(confirmations, 1); assert.equal(navigations, 0);
  assert.equal(view.root.findByType('textarea').props.value, 'Keep this draft');
  accept = true; await act(async () => close());
  assert.equal(confirmations, 2); assert.equal(navigations, 1);
  await act(async () => view.unmount());
});

test('failed job-note reads can be retried and failed saves retain the draft', async () => {
  let failRead = true, failWrite = true; const methods = [];
  const load = loader({
    'lib/JobProgressContext': { notifyWorkspace() {} },
    'components/ui/button': { Button: props => React.createElement('button', props) },
  }, { fetch: async (_url, options = {}) => {
    const method = options.method ?? 'GET'; methods.push(method);
    if ((method === 'GET' && failRead) || (method === 'PUT' && failWrite)) return { ok: false, status: 503, json: async () => ({}) };
    return reply({ note: { job_id: 'job', notes: 'Saved synthetic note', updated_at: 'revision' } });
  } });
  const Notes = load('features/jobs/JobNotes.tsx').JobNotes;
  let view; await act(async () => { view = create(React.createElement(Notes, { jobId: 'job' })); });
  assert.equal(view.root.findByType('textarea').props.disabled, true);
  assert.equal(findButton(view, 'applications.save').props.disabled, true);
  failRead = false; await act(async () => findButton(view, 'workspace.retry').props.onClick());
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.equal(view.root.findByType('textarea').props.value, 'Saved synthetic note');
  await act(async () => view.root.findByType('textarea').props.onChange({ target: { value: 'Keep the failed save draft' } }));
  await act(async () => findButton(view, 'applications.save').props.onClick());
  assert.equal(view.root.findByType('textarea').props.value, 'Keep the failed save draft');
  assert.equal(view.root.findByProps({ role: 'alert' }).children[0], 'applications.saveError');
  assert.deepEqual(methods, ['GET', 'GET', 'PUT']);
  await act(async () => view.unmount());
});

test('a failed saved-revision read after generation is explicit and retry makes no further AI call', async () => {
  const router = { isReady: true, query: { id: 'job' } }; let reads = 0, generations = 0;
  const load = loader({
    'next/router': { useRouter: () => router }, 'lib/supabaseClient': auth,
    'lib/JobProgressContext': { notifyWorkspace() {}, useJobProgress: () => ({}), useJobProgressReady: () => true },
    'lib/generationAccess': { generationDestination: async () => null },
    'next/link': props => React.createElement('a', props), 'components/RewriteSuggestion': () => null,
    'lib/useDialogFocus': { useDialogFocus: () => null },
    'components/ui/button': { Button: props => React.createElement('button', props) },
  }, { fetch: async (url, options = {}) => {
    if (url === '/api/profile') return reply({ profile: { full_name: 'Synthetic applicant', bio: 'Synthetic source facts' } });
    if (options.method === 'POST') { generations++; return reply([{ coverLetter: 'Generated synthetic text', expiresAt: '2026-10-14T12:00:00Z' }]); }
    reads++;
    if (reads === 1) return reply({ letter: null });
    if (reads === 2) return { ok: false, status: 503 };
    return reply({ letter: { content: 'Persisted synthetic text', updated_at: 'persisted-revision', expires_at: '2026-10-14T12:00:00Z' } });
  } });
  const { useCoverLetter } = load('features/jobs/useCoverLetter.ts');
  const probe = await mountHook(() => useCoverLetter({ id: 'job' }, () => {}));
  await act(async () => probe.model.generate());
  assert.equal(probe.model.letterLoadError, true); assert.equal(probe.model.generating, false);
  assert.equal(probe.model.letter, 'Generated synthetic text'); assert.equal(probe.model.letterRevision, '');
  const Workspace = load('features/jobs/JobWorkspace.tsx').JobWorkspace;
  const props = () => ({ jobId: 'job', active: 'letter', userId: 'synthetic-owner', job: { title: 'Synthetic vacancy' }, letterModel: probe.model, applicationModel: {} });
  let view; await act(async () => { view = create(React.createElement(Workspace, props())); });
  assert.equal(findButton(view, 'coverLetter.edit').props.disabled, true);
  assert.equal(findButton(view, 'coverLetter.regenerate').props.disabled, true);
  await act(async () => findButton(view, 'workspace.retry').props.onClick());
  await act(async () => view.update(React.createElement(Workspace, props())));
  assert.equal(probe.model.letterLoadError, false); assert.equal(probe.model.letterRevision, 'persisted-revision');
  assert.equal(findButton(view, 'coverLetter.edit').props.disabled, false);
  assert.equal(generations, 1); assert.equal(reads, 3);
  await act(async () => view.unmount());
  await act(async () => probe.view.unmount());
});
