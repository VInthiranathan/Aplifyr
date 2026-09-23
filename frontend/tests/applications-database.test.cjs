const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('job applications enforce validation, ownership, updates and account deletion', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const stranger = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      insert into auth.users values('${owner}'),('${stranger}');`);
    const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260923122723_job_application_tracker.sql'), 'utf8');
    await db.exec(migration);

    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.query(`insert into job_applications(user_id,job_id,job_context,applied_at)
      values($1,'job-1',$2,'2026-09-23')`, [owner, { id: 'job-1', title: 'Developer', company: 'Example', location: 'Stockholm' }]);
    assert.equal((await db.query('select count(*)::int count from job_applications')).rows[0].count, 1);
    await assert.rejects(db.query(`insert into job_applications(user_id,job_id,job_context)
      values($1,'job-2',$2)`, [stranger, { id: 'job-2', title: 'Tester' }]), /row-level security/);
    await assert.rejects(db.query("update job_applications set status='unknown' where job_id='job-1'"), /job_applications_status_check/);
    const before = (await db.query("select updated_at::text from job_applications where job_id='job-1'")).rows[0].updated_at;
    await db.query("update job_applications set status='interview',next_step='Technical interview',next_step_at='2026-10-01' where job_id='job-1'");
    const changed = (await db.query("select status,next_step,updated_at::text from job_applications where job_id='job-1'")).rows[0];
    assert.equal(changed.status, 'interview');
    assert.equal(changed.next_step, 'Technical interview');
    assert.notEqual(changed.updated_at, before);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [stranger]);
    assert.equal((await db.query('select count(*)::int count from job_applications')).rows[0].count, 0);
    assert.equal((await db.query("update job_applications set notes='tampered'")).affectedRows, 0);

    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal((await db.query('select count(*)::int count from job_applications')).rows[0].count, 0);
  } finally { await db.close(); }
});
