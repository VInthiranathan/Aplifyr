const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('registration routes pending email confirmations to the dedicated page', () => {
  const auth = read('pages/auth/index.tsx');
  const verify = read('pages/auth/verify-email.tsx');

  assert.match(auth, /if \(!data\.session\)[\s\S]*router\.replace\("\/auth\/verify-email"\)/);
  assert.match(verify, /auth\.verifyEmailInstructions/);
  assert.match(verify, /router\.push\("\/auth"\)/);
  assert.match(auth, /data\.user\.identities/);
  assert.match(auth, /user_already_exists/);
  assert.match(auth, /auth\.errors\.emailAlreadyRegistered/);
});

test('animation is refined without changing the auth form shell', () => {
  const animation = read('components/AnimatedBackground.tsx');
  const shell = read('components/AuthShell.tsx');

  assert.match(animation, /useReducedMotion/);
  assert.match(animation, /from "next\/image"/);
  assert.match(animation, /backgroundSize: "56px 56px"/);
  assert.doesNotMatch(animation, /blur\(8px\)/);
  assert.match(shell, /sm:w-\[30vw\]/);
  assert.match(shell, /sm:min-w-\[360px\]/);
});

test('auth and profile labels are localized in every supported language', () => {
  for (const locale of ['en', 'sv']) {
    const translations = JSON.parse(read(`public/locales/${locale}/common.json`));
    assert.ok(translations.auth.verifyEmailTitle);
    assert.ok(translations.auth.verifyEmailInstructions);
    assert.ok(translations.auth.verifyEmailSpamHint);
    assert.ok(translations.auth.errors.emailAlreadyRegistered);
    assert.notEqual(translations.user.techStack.toLowerCase(), 'tech stack');
    assert.notEqual(translations.user.techStack.toLowerCase(), 'teknikstack');
  }
});
