const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('application shell uses dynamic viewport and device safe areas', () => {
  const layout = read('components/Layout.tsx');
  const topNav = read('components/TopNav.tsx');
  const bottomNav = read('components/BottomNav.tsx');
  const document = read('pages/_document.tsx');

  assert.match(layout, /h-\[100dvh\]/);
  assert.match(layout, /env\(safe-area-inset-top\)/);
  assert.match(layout, /env\(safe-area-inset-bottom\)/);
  assert.match(topNav, /safe-area-inset-top/);
  assert.match(bottomNav, /safe-area-inset-bottom/);
  assert.match(document, /viewport-fit=cover/);
  assert.doesNotMatch(layout, /h-screen/);
});

test('mobile navigation keeps four primary destinations and moves support into settings', () => {
  const bottomNav = read('components/BottomNav.tsx');
  const drawer = read('components/SettingsDrawer.tsx');
  const tabDefinitions = bottomNav.split('const tabs = [')[1].split('];')[0].match(/key: "nav\./g) ?? [];

  assert.equal(tabDefinitions.length, 4);
  assert.doesNotMatch(bottomNav, /nav\.support/);
  assert.match(drawer, /href="\/support"/);
  assert.match(bottomNav, /nav\.applications/);
  assert.match(drawer, /href="\/favorites"/);
  assert.match(bottomNav, /pathname\.startsWith/);
});

test('high-risk mobile surfaces avoid desktop-only widths', () => {
  const jobs = read('pages/jobs/index.tsx');
  const profile = read('pages/user/index.tsx');
  const coverLetter = read('components/CoverLetterModal.tsx');

  assert.doesNotMatch(jobs, /w-\[640px\]|min-w-\[300px\]|min-w-\[220px\]/);
  assert.match(jobs, /fixed inset-x-3/);
  assert.match(jobs, /grid-cols-1/);
  assert.match(profile, /grid grid-cols-2/);
  assert.match(profile, /max-h-\[92dvh\]/);
  assert.match(coverLetter, /items-end sm:items-center/);
  assert.match(coverLetter, /safe-area-inset-bottom/);
});
