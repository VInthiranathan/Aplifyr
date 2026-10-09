// The deletion journal is independent of backups and contains no email or prose.
const fs = require('node:fs');
const path = require('node:path');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const project = /^[a-z0-9][a-z0-9-]{1,63}$/;
function validate(record, expectedProject) {
  if (!project.test(expectedProject) || record.version !== 1 || record.projectRef !== expectedProject ||
    !uuid.test(record.userId) || typeof record.requestedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.requestedAt)) ||
    Object.keys(record).some(k => !['version', 'projectRef', 'userId', 'requestedAt'].includes(k))) {
    throw Error('Invalid deletion journal or wrong source project.');
  }
  return record;
}
function readJournal(text, expectedProject) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length || lines.length > 100000) throw Error('Missing or oversized deletion journal.');
  return lines.map(line => validate(JSON.parse(line), expectedProject));
}
function appendIntent(file, record) {
  validate(record, record.projectRef);
  // Synchronous append + fsync before any account deletion. Failed deletions stay
  // in the suppression journal and must be resolved by the operator.
  const handle = fs.openSync(file, fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const stat = fs.fstatSync(handle);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw Error('Deletion journal must be a private regular file.');
    fs.writeFileSync(handle, JSON.stringify(record) + '\n'); fs.fsyncSync(handle);
  }
  finally { fs.closeSync(handle); }
  const parent = fs.openSync(path.dirname(path.resolve(file)), fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function replaySql(records, expectedProject) {
  const ids = [...new Set(records.map(r => validate(r, expectedProject).userId.toLowerCase()))];
  if (!ids.length) throw Error('Refusing an empty deletion replay.');
  const array = `array[${ids.map(id => `'${id}'`).join(',')}]::uuid[]`;
  return `-- Source project: ${expectedProject}. Run only in a quarantined restore.
begin;
set local session_replication_role = origin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $replay$
declare deleted_ids uuid[] := ${array}; r record; remaining bigint;
begin
  -- Storage objects must be removed using the Storage API, never SQL metadata deletion.
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where owner_id = any($1::text[])'
      into remaining using deleted_ids;
    if remaining > 0 then raise exception 'Legacy Storage objects require Storage API cleanup first'; end if;
  end if;
  delete from auth.users where id = any(deleted_ids);
  -- Verify every direct account FK, including counters; broken cascades fail closed.
  for r in select ns.nspname, c.relname, a.attname
    from pg_constraint fk join pg_class c on c.oid=fk.conrelid
    join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum=fk.conkey[1]
    where fk.contype='f' and fk.confrelid='auth.users'::regclass and cardinality(fk.conkey)=1
  loop
    execute format('select count(*) from %I.%I where %I = any($1)', r.nspname,r.relname,r.attname)
      into remaining using deleted_ids;
    if remaining <> 0 then raise exception 'Deletion replay left owned rows'; end if;
  end loop;
  -- Never revive browser sessions from an older operational backup.
  if to_regclass('auth.sessions') is not null then delete from auth.sessions; end if;
  if to_regclass('auth.refresh_tokens') is not null then delete from auth.refresh_tokens; end if;
  if exists(select 1 from auth.users where id=any(deleted_ids)) then
    raise exception 'Deletion replay did not remove restored accounts';
  end if;
end $replay$;
commit;
`;
}
module.exports = { readJournal, appendIntent, replaySql };
