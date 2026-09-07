const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const nextConfig = require(path.join(projectRoot, 'next.config.js'));
const i18nConfig = require(path.join(projectRoot, 'next-i18next.config.js'));

test('serverless traces include next-i18next runtime assets', () => {
  const includes = nextConfig.outputFileTracingIncludes?.['/*'];

  assert.ok(Array.isArray(includes), 'Global outputFileTracingIncludes must be configured');
  assert.ok(
    includes.includes('./next-i18next.config.js'),
    'next-i18next.config.js must be included in server traces',
  );
  assert.ok(
    includes.includes('./public/locales/**/*.json'),
    'Locale JSON files must be included in server traces',
  );
});

test('i18n config and supported locale files are present', () => {
  assert.equal(i18nConfig.i18n.defaultLocale, 'en');
  assert.deepEqual([...i18nConfig.i18n.locales], ['en', 'sv']);
  assert.equal(i18nConfig.defaultNS, 'common');

  for (const locale of i18nConfig.i18n.locales) {
    const localeFile = path.join(projectRoot, 'public', 'locales', locale, 'common.json');
    assert.ok(fs.existsSync(localeFile), `Missing locale file: ${localeFile}`);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(localeFile, 'utf8')));
  }
});
