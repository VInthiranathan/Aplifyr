// Authenticated encryption for an operator-created database backup bundle.
// Does not connect to a database, choose retention, or claim a complete backup.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Writable } = require('node:stream');
const magic = Buffer.from('APLBKP01');
async function protect(mode, source, destination, keyHex) {
  if (!['encrypt', 'decrypt', 'verify'].includes(mode) || !/^[0-9a-f]{64}$/i.test(keyHex ?? '')) throw Error('A 32-byte hex backup key and a valid operation are required.');
  if (mode !== 'verify' && (!destination || path.resolve(source) === path.resolve(destination))) throw Error('A new output path distinct from the input is required.');
  const key = Buffer.from(keyHex, 'hex');
  const input = await fsp.open(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let temporary;
  try {
    const stat = await input.stat();
    if (!stat.isFile() || stat.size === 0) throw Error('Backup input must be a nonempty regular file.');
    let transform, stream;
    if (mode === 'encrypt') {
      const nonce = crypto.randomBytes(12);
      const header = Buffer.concat([magic, nonce]);
      transform = crypto.createCipheriv('aes-256-gcm', key, nonce); transform.setAAD(header);
      temporary = destination + '.' + crypto.randomBytes(8).toString('hex') + '.partial';
      await fsp.writeFile(temporary, header, { flag: 'wx', mode: 0o600 });
      await pipeline(input.createReadStream(), transform, fs.createWriteStream(temporary, { flags: 'r+', start: header.length }));
      await fsp.appendFile(temporary, transform.getAuthTag());
    } else {
      if (stat.size <= magic.length + 12 + 16) throw Error('Truncated encrypted backup.');
      const header = Buffer.alloc(20), tag = Buffer.alloc(16);
      await input.read(header, 0, 20, 0); await input.read(tag, 0, 16, stat.size - 16);
      if (!header.subarray(0, 8).equals(magic)) throw Error('Unknown encrypted backup format.');
      transform = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(8));
      transform.setAAD(header); transform.setAuthTag(tag);
      stream = input.createReadStream({ start: 20, end: stat.size - 17 });
      if (mode === 'verify') {
        await pipeline(stream, transform, new Writable({ write(_chunk, _encoding, done) { done(); } }));
      } else {
        // Never expose the final plaintext path before the authentication tag passes.
        temporary = destination + '.' + crypto.randomBytes(8).toString('hex') + '.partial';
        await pipeline(stream, transform, fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      }
    }
    if (temporary) {
      const completed = await fsp.open(temporary, 'r+');
      try { await completed.sync(); } finally { await completed.close(); }
      // Hard-link publication fails atomically if the requested output exists.
      await fsp.link(temporary, destination); await fsp.unlink(temporary); temporary = undefined;
    }
  } finally {
    key.fill(0); await input.close();
    if (temporary) await fsp.unlink(temporary).catch(() => {});
  }
}
module.exports = { protect };
if (require.main === module) {
  const [mode, source, destination] = process.argv.slice(2);
  if (!source) throw Error('Usage: node scripts/protect-backup.cjs encrypt|decrypt|verify <input> [new-output]');
  protect(mode, source, destination, process.env.APLIFYR_BACKUP_KEY).then(() => console.log('Backup ' + mode + ' passed.'))
    .catch(() => { console.error('Backup operation failed; check input, key, authentication and output path.'); process.exitCode = 1; });
}
