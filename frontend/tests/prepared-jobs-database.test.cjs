const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('prepared jobs follow CV and cover-letter retention, deletion and owner isolation', async () => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated, service_role;
      insert into auth.users values('${a}'),('${b}');`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/009_generated_cvs.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260918164504_prepared_jobs_and_generated_document_retention.sql'), 'utf8');
    // PGlite does not bundle Supabase's pg_cron extension; exercise all schema/RLS logic before that installation.
    await db.exec(migration.split('create extension if not exists pg_cron')[0] + 'commit;');

    await db.exec('set role service_role');
    const deadline = (await db.query('select save_generated_cv_v2($1,$2,$3,$4,$5) expires_at', [
      a, 'job-1', { schemaVersion: 1, skills: ['C#'] },
      { id: 'job-1', title: 'Developer', company: 'Example', location: 'Stockholm' }, {}
    ])).rows[0].expires_at;
    assert.ok(new Date(deadline).getTime() > Date.now() + 6.9 * 24 * 60 * 60 * 1000);
    assert.equal((await db.query('select count(*)::int count from prepared_jobs')).rows[0].count, 1);

    // The edit endpoint uses a service-role PATCH with owner, job, expiry and revision predicates.
    const beforeEdit = (await db.query("select updated_at::text, expires_at::text from generated_cvs where user_id=$1 and job_id='job-1'", [a])).rows[0];
    const edit = (owner, revision) => db.query(`update generated_cvs set content=$1, updated_at=clock_timestamp()
      where user_id=$2 and job_id='job-1' and updated_at=$3 and expires_at > now() returning *`,
      [{schemaVersion:1,userEdited:true,professionalSummary:[{text:'My revision',userEdited:true}]},owner,revision]);
    assert.equal((await edit(b, beforeEdit.updated_at)).rows.length, 0);
    assert.equal((await edit(a, beforeEdit.updated_at)).rows.length, 1);
    assert.equal((await edit(a, beforeEdit.updated_at)).rows.length, 0);
    assert.equal((await db.query("select expires_at::text from generated_cvs where user_id=$1 and job_id='job-1'", [a])).rows[0].expires_at, beforeEdit.expires_at);
    assert.deepEqual((await db.query("select cv_expires_at from prepared_jobs where user_id=$1 and job_id='job-1'", [a])).rows[0].cv_expires_at, deadline);

    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    assert.equal((await db.query('select count(*)::int count from prepared_jobs')).rows[0].count, 1);
    assert.equal((await db.query('select count(*)::int count from generated_cvs')).rows[0].count, 1);
    await assert.rejects(db.query("update generated_cvs set content=content"), /permission denied/);
    await assert.rejects(db.query("delete from generated_cvs where job_id='job-1'"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query('select count(*)::int count from prepared_jobs')).rows[0].count, 0);

    await db.exec('reset role; set role service_role');
    await db.query('select save_generated_cv($1,$2,$3,$4,$5)', [
      a, 'legacy-job', { schemaVersion: 1 },
      { id: 'legacy-job', title: 'Legacy-compatible role' }, {}
    ]);
    assert.equal((await db.query("select count(*)::int count from prepared_jobs where user_id=$1 and job_id='legacy-job' and cv_expires_at > now()", [a])).rows[0].count, 1);

    const letterDeadline = (await db.query('select save_generated_cover_letter($1,$2,$3,$4,$5) expires_at', [
      a, 'job-1', 'Dear hiring team...',
      { id: 'job-1', title: 'Developer', company: 'Example', location: 'Stockholm' },
      { provider: 'Gemini' }
    ])).rows[0].expires_at;
    assert.ok(new Date(letterDeadline).getTime() > Date.now() + 6.9 * 24 * 60 * 60 * 1000);
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
    assert.equal((await db.query('select count(*)::int count from generated_cover_letters')).rows[0].count, 1);
    await assert.rejects(db.query("delete from generated_cover_letters where job_id='job-1'"), /permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
    assert.equal((await db.query('select count(*)::int count from generated_cover_letters')).rows[0].count, 0);

    await db.exec('reset role; set role service_role');
    await db.query("delete from generated_cvs where user_id=$1 and job_id='job-1'", [a]);
    const afterCvDelete = (await db.query("select * from prepared_jobs where user_id=$1 and job_id='job-1'", [a])).rows[0];
    assert.equal(afterCvDelete.has_cv, false);
    assert.equal(afterCvDelete.has_cover_letter, true);

    await db.query('select save_generated_cv_v2($1,$2,$3,$4,$5)', [
      a, 'job-1', { schemaVersion: 1 },
      { id: 'job-1', title: 'Developer', company: 'Example' }, {}
    ]);
    await db.query("delete from generated_cover_letters where user_id=$1 and job_id='job-1'", [a]);
    const afterLetterDelete = (await db.query("select * from prepared_jobs where user_id=$1 and job_id='job-1'", [a])).rows[0];
    assert.equal(afterLetterDelete.has_cv, true);
    assert.equal(afterLetterDelete.has_cover_letter, false);

    await db.query('select save_generated_cv_v2($1,$2,$3,$4,$5)', [
      b, 'job-2', { schemaVersion: 1 }, { id: 'job-2', title: 'Tester' }, {}
    ]);
    await db.query("delete from generated_cvs where user_id=$1 and job_id='job-2'", [b]);
    assert.equal((await db.query("select count(*)::int count from prepared_jobs where user_id=$1 and job_id='job-2'", [b])).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
