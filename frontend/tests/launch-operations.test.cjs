const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { readJournal, appendIntent, replaySql } = require('../../scripts/lib/deletion-replay.cjs');
const { protect } = require('../../scripts/protect-backup.cjs');
const { loopbackOrigin, refreshBrowserSession, sessionFromCookies } = require('../../scripts/lib/local-launch.cjs');
const record = { version: 1, projectRef: 'aplifyr-test', userId: '11111111-1111-4111-8111-111111111111', requestedAt: '2026-10-08T00:00:00Z' };
test('replay rejects wrong scope, malformed/truncated journals, SQL injection and extra personal data', () => {
  for (const value of ['', '{', JSON.stringify({ ...record, userId: "'; delete from auth.users;--" }), JSON.stringify({ ...record, email: 'unnecessary@example.test' }), JSON.stringify({ ...record, requestedAt: null })]) {
    assert.throws(() => readJournal(value, 'aplifyr-test'));
  }
  assert.throws(() => readJournal(JSON.stringify(record), 'another-project'));
  assert.throws(() => replaySql([], 'aplifyr-test'));
  assert.throws(() => replaySql([record], "project';--"));
});
test('local flow tools refuse hosted targets, embedded credentials and altered origins', () => {
  for (const value of ['https://aplifyr.vercel.app', 'http://127.0.0.1.evil.test', 'http://user:secret@localhost', 'http://localhost/path', 'http://localhost?x=1']) assert.throws(() => loopbackOrigin(value));
  assert.equal(loopbackOrigin('http://127.0.0.1:3200'), 'http://127.0.0.1:3200');
});
test('real SDK refresh updates the browser cookie jar before subsequent private requests', async () => {
  const now = Math.floor(Date.now() / 1000);
  const access = refresh => [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: record.userId, exp: now + 3600, iat: now, refresh })).toString('base64url'), 'synthetic-signature'].join('.');
  const oldSession = { access_token: access(false), refresh_token: 'synthetic-old-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user: { id: record.userId } };
  const renewed = { ...oldSession, access_token: access(true), refresh_token: 'synthetic-new-refresh' };
  const jar = new Map([['sb-127-auth-token', { name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(oldSession)).toString('base64url') }]]);
  const context = {
    cookies: async () => [...jar.values()],
    addCookies: async values => values.forEach(cookie => cookie.expires <= now && cookie.expires !== -1 ? jar.delete(cookie.name) : jar.set(cookie.name, cookie)),
  };
  const previousFetch = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(new URL(url).origin, 'http://127.0.0.1:55321');
      assert.equal(new URL(url).pathname, '/auth/v1/token');
      assert.equal(JSON.parse(options.body).refresh_token, oldSession.refresh_token);
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(renewed), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const result = await refreshBrowserSession(context, { app: 'http://127.0.0.1:3200', auth: 'http://127.0.0.1:55321', anon: 'synthetic-anon' });
    assert.equal(result.user.id, record.userId);
    const session = sessionFromCookies(await context.cookies());
    assert.equal(session.refresh_token, renewed.refresh_token);
    assert.equal(session.access_token, renewed.access_token);
    assert.equal(jar.get('sb-127-auth-token').domain, '127.0.0.1');
    assert.equal(jar.get('sb-127-auth-token').sameSite, 'Lax');
  } finally { global.fetch = previousFetch; }
});
test('private deletion journal persists intent and rejects symlink/public-file writes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aplifyr-journal-'));
  try {
    const file = path.join(dir, 'journal.jsonl'); appendIntent(file, record);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal(readJournal(await fs.readFile(file, 'utf8'), 'aplifyr-test').length, 1);
    const linked = path.join(dir, 'linked'); await fs.symlink(file, linked);
    assert.throws(() => appendIntent(linked, record));
    await fs.chmod(file, 0o644); assert.throws(() => appendIntent(file, record));
    assert.equal(readJournal(await fs.readFile(file, 'utf8'), 'aplifyr-test').length, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('backup encryption authenticates contents, rejects corruption/wrong keys and never overwrites outputs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aplifyr-backup-'));
  try {
    const input = path.join(dir, 'input'), encrypted = path.join(dir, 'encrypted'), decrypted = path.join(dir, 'decrypted');
    const content = crypto.randomBytes(128 * 1024), key = crypto.randomBytes(32).toString('hex');
    await fs.writeFile(input, content, { mode: 0o600 });
    await protect('encrypt', input, encrypted, key); await protect('verify', encrypted, undefined, key);
    await protect('decrypt', encrypted, decrypted, key);
    assert.deepEqual(await fs.readFile(decrypted), content);
    assert.equal((await fs.stat(decrypted)).mode & 0o777, 0o600);
    await assert.rejects(protect('decrypt', encrypted, decrypted, key));
    const bad = path.join(dir, 'bad');
    await assert.rejects(protect('decrypt', encrypted, bad, crypto.randomBytes(32).toString('hex')));
    await assert.rejects(fs.stat(bad));
    const damaged = await fs.readFile(encrypted); damaged[30] ^= 1;
    await fs.writeFile(encrypted, damaged);
    await assert.rejects(protect('verify', encrypted, undefined, key));
    await assert.rejects(protect('decrypt', encrypted, bad, key));
    assert.ok(!(await fs.readdir(dir)).some(name => name.endsWith('.partial')));
    assert.deepEqual(await fs.readFile(decrypted), content);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
