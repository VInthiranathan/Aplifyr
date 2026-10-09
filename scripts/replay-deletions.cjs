// Emits reviewable SQL; never connects to or changes a database automatically.
const fs = require('node:fs');
const { readJournal, replaySql } = require('./lib/deletion-replay.cjs');
const [file, sourceProject] = process.argv.slice(2);
if (!file || !sourceProject) throw Error('Usage: node scripts/replay-deletions.cjs <private-journal.jsonl> <source-project-ref>');
process.stdout.write(replaySql(readJournal(fs.readFileSync(file, 'utf8'), sourceProject), sourceProject));
