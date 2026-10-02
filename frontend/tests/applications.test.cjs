const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('application tracking is authenticated, conflict-aware and exported', () => {
  const api = read('pages/api/applications.ts');
  const page = read('pages/applications.tsx');
  const detail = read('pages/jobs/[id].tsx');
  const jobs = read('pages/jobs/index.tsx');
  const home = read('features/home/MatchedJobs.tsx');
  const statusHook = read('lib/useApplicationStatuses.ts');
  const accountExport = read('pages/api/account/export.ts');
  assert.match(api, /auth\.getUser\(\)/);
  assert.match(api, /isSafeMutation/);
  assert.match(api, /\.eq\("user_id", user\.id\)/);
  assert.match(api, /\.eq\("updated_at", update\.updatedAt\)/);
  assert.match(page, /getServerSideProps/);
  assert.match(page, /applications\.status/);
  assert.match(detail, /markAsApplied/);
  assert.match(api, /readApplicationStatuses/);
  assert.doesNotMatch(api, /\.limit\(500\)/);
  assert.match(statusHook, /fetch\("\/api\/applications"/);
  assert.match(statusHook, /addEventListener\("pageshow", refresh\)/);
  assert.match(jobs, /jobId=\{String\(job.id\)\}/);
  assert.match(home, /jobId=\{String\(job.id\)\}/);
  assert.match(read('components/JobListCard.tsx'),/useJobProgress/);
  assert.match(read('components/JobProgressBadge.tsx'),/applications.status/);
  assert.match(read('lib/JobProgressContext.tsx'),/addEventListener\(["\']pageshow["\'],\s*refresh\)/);
  assert.match(accountExport, /jobApplications/);
});

test('application labels exist in every supported language', () => {
  for (const locale of ['sv', 'en']) {
    const messages = JSON.parse(read(`public/locales/${locale}/common.json`));
    assert.equal(typeof messages.nav.applications, 'string');
    assert.equal(typeof messages.jobs.applied, 'string');
    assert.equal(typeof messages.jobs.appliedWithStatus, 'string');
    for (const key of ['applied', 'screening', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn']) {
      assert.equal(typeof messages.applications.status[key], 'string');
    }
  }
});
