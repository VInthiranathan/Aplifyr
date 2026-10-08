const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const dir = path.join(__dirname, '../../supabase/migrations');
const tables = ['profiles', 'profile_career_entries', 'ai_consents', 'ai_consent_receipts', 'ai_usage',
  'generated_cvs', 'generated_cover_letters', 'prepared_jobs', 'job_applications', 'job_notes',
  'aplifyr_career_counts', 'aplifyr_application_counts', 'aplifyr_note_counts'];
const sql = name => fs.readFileSync(path.join(dir, name), 'utf8');
const count = async (db, table, user) => (await db.query(`select count(*)::int n from ${table} where ${table === 'profiles' ? 'id' : 'user_id'}=$1`, [user])).rows[0].n;

test('synthetic account deletion cascades all owned data; an older local backup needs deletion replay before use', async () => {
  const db = new PGlite();
  let restored;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;`);
    for (const file of ['001_create_profiles_table.sql','002_add_location_preferences_to_profiles.sql',
      '003_add_private_cv_columns.sql','004_create_profile_career_entries.sql','005_remove_cv_feature.sql',
      '006_secure_profiles.sql','007_personal_data_limits.sql','008_privacy_consent_and_limits.sql','009_generated_cvs.sql']) await db.exec(sql(file));
    // This local engine has no pg_cron. Hosted cron/storage/Auth are separate checks.
    await db.exec(sql('20260918164504_prepared_jobs_and_generated_document_retention.sql').split('create extension if not exists pg_cron')[0] + 'commit;');
    for (const file of ['20260921184722_add_profile_contact_details.sql','20260923122723_job_application_tracker.sql',
      '20260926051754_security_hardening_and_document_revisions.sql','20261002075427_application_workspace.sql']) await db.exec(sql(file));
    await db.exec(`insert into auth.users values('${owner}','synthetic-a@example.invalid','{}'),('${other}','synthetic-b@example.invalid','{}');
      update ai_privacy_notices set enabled=true where provider='gemini' and version='2026-10-documents-v3';`);
    for (const user of [owner, other]) {
      await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);
        insert into profile_career_entries(user_id,kind,title,organization,start_month,is_current)
        values('${user}','work','Synthetic tester','Synthetic employer','2025-01',true);
        insert into job_applications(user_id,job_id,job_context) values('${user}','synthetic-job','{"id":"synthetic-job","title":"Synthetic"}');
        insert into job_notes(user_id,job_id,notes) values('${user}','synthetic-job','Synthetic note');
        select set_ai_consent('gemini','2026-10-documents-v3',true);reset role;set role service_role;`);
      await db.query('select save_generated_cv_v3($1,$2,$3,$4,$5)', [user, 'synthetic-job', { schemaVersion: 1 }, { id: 'synthetic-job', title: 'Synthetic' }, {}]);
      await db.query('select save_generated_cover_letter($1,$2,$3,$4,$5)', [user, 'synthetic-job', 'Synthetic letter', { id: 'synthetic-job', title: 'Synthetic' }, { provider: 'gemini' }]);
      assert.ok((await db.query("select reserve_ai_call_v2($1,'gemini','2026-10-documents-v3') ticket", [user])).rows[0].ticket);
      await db.exec('reset role');
    }
    for (const table of tables) assert.equal(await count(db, table, owner), 1, `${table} fixture populated`);
    const snapshot = await db.dumpDataDir();
    await db.query('delete from auth.users where id=$1', [owner]);
    for (const table of tables) {
      assert.equal(await count(db, table, owner), 0, `${table} deleted`);
      assert.equal(await count(db, table, other), 1, `${table} other account preserved`);
    }
    restored = new PGlite({ loadDataDir: snapshot });
    for (const table of tables) assert.equal(await count(restored, table, owner), 1, `${table} older backup reintroduces deleted data`);
    // Synthetic deletion ledger is separate from the snapshot. Replay while offline.
    await restored.query('delete from auth.users where id=$1', [owner]);
    await restored.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
    for (const table of ['profiles','profile_career_entries','ai_consents','ai_consent_receipts','generated_cvs','generated_cover_letters','prepared_jobs','job_applications','job_notes']) {
      assert.equal((await restored.query(`select count(*)::int n from ${table}`)).rows[0].n, 0, `${table} stale identity cannot read rows`);
    }
    await restored.exec('reset role');
    for (const table of tables) {
      assert.equal(await count(restored, table, owner), 0, `${table} replayed deletion`);
      assert.equal(await count(restored, table, other), 1, `${table} unaffected account restored`);
    }
  } finally { if (restored) await restored.close(); await db.close(); }
});
