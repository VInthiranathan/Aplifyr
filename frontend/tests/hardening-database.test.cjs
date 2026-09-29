const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const dir = path.join(__dirname, '../../supabase/migrations');
const sql = file => fs.readFileSync(path.join(dir, file), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('hardening upgrade enforces direct-write quota, least privilege, actual CV revisions and versioned consent', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated,service_role;`);
    for (const file of ['001_create_profiles_table.sql','002_add_location_preferences_to_profiles.sql',
      '003_add_private_cv_columns.sql','004_create_profile_career_entries.sql','005_remove_cv_feature.sql',
      '006_secure_profiles.sql','007_personal_data_limits.sql','008_privacy_consent_and_limits.sql','009_generated_cvs.sql']) await db.exec(sql(file));
    await db.exec(sql('20260918164504_prepared_jobs_and_generated_document_retention.sql').split('create extension if not exists pg_cron')[0]+'commit;');
    await db.exec(sql('20260921184722_add_profile_contact_details.sql'));
    await db.exec(sql('20260923122723_job_application_tracker.sql'));
    await db.exec(`insert into auth.users values('${owner}','synthetic-a@example.test','{}'),('${other}','synthetic-b@example.test','{}');
      grant truncate,references,trigger on profiles,profile_career_entries to authenticated;
      insert into job_applications(user_id,job_id,job_context) select '${other}','legacy-'||i,jsonb_build_object('id','legacy-'||i,'title','Synthetic') from generate_series(1,1001) i;`);
    await db.exec(sql('20260926051754_security_hardening_and_document_revisions.sql'));
    assert.equal((await db.query("select has_table_privilege('authenticated','profiles','TRUNCATE') ok")).rows[0].ok,false);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false)`);
    await assert.rejects(db.exec('select * from aplifyr_application_counts'),/permission denied/);
    await assert.rejects(db.exec(`select save_generated_cv_v3('${owner}','job','{}','{}','{}')`),/permission denied/);
    await assert.rejects(db.exec(`select reserve_ai_call_v2('${owner}','gemini','2026-09-documents-v2')`),/permission denied/);
    await db.exec(`insert into job_applications(user_id,job_id,job_context) select '${owner}','job-'||i,jsonb_build_object('id','job-'||i,'title','Synthetic') from generate_series(1,1000) i;`);
    await assert.rejects(db.exec(`insert into job_applications(user_id,job_id,job_context) values('${owner}','over','{"id":"over","title":"Synthetic"}')`),/quota/);
    // An idempotent POST must not charge the counter again.
    await db.exec(`insert into job_applications(user_id,job_id,job_context) values('${owner}','job-1','{"id":"job-1","title":"Synthetic"}') on conflict do nothing;`);
    await db.exec("delete from job_applications where job_id='job-1'");
    await db.exec(`insert into job_applications(user_id,job_id,job_context) values('${owner}','replacement','{"id":"replacement","title":"Synthetic"}')`);
    await assert.rejects(db.exec("update job_applications set job_id='changed',job_context='{"+'"id":"changed","title":"Synthetic"'+"}' where job_id='job-2'"),/identity/);
    assert.equal((await db.query('select count(*)::int n from job_applications')).rows[0].n,1000);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    await db.exec("update job_applications set notes='Preserved legacy row' where job_id='legacy-1'");
    assert.equal((await db.query('select count(*)::int n from job_applications')).rows[0].n,1001);

    await db.exec('reset role;set role service_role');
    const saved=(await db.query('select save_generated_cv_v3($1,$2,$3,$4,$5) row',
      [owner,'cv-job',{schemaVersion:1},{id:'cv-job',title:'Synthetic'},{}])).rows[0].row;
    const edit=await db.query(`update generated_cvs set content='{"schemaVersion":1,"userEdited":true}',updated_at=clock_timestamp()
      where user_id=$1 and job_id='cv-job' and updated_at=$2 returning expires_at::text`,[owner,saved.updated_at]);
    assert.equal(edit.rows.length,1,'generation revision immediately supports editing');
    assert.equal(new Date(edit.rows[0].expires_at).getTime(),new Date(saved.expires_at).getTime());
    assert.equal((await db.query("update generated_cvs set content=content where user_id=$1 and updated_at=$2 returning job_id",[owner,saved.updated_at])).rows.length,0);

    await db.exec("reset role;update ai_privacy_notices set notice_sv='Old',notice_en='Old',enabled=true where provider='gemini' and version='2026-09-v1';");
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);select set_ai_consent('gemini','2026-09-v1',true);reset role;set role service_role;`);
    const reserve=async()=> (await db.query('select reserve_ai_call_v2($1,$2,$3) ticket',[owner,'gemini','2026-09-documents-v2'])).rows[0].ticket;
    assert.equal(await reserve(),null,'old notice cannot authorize stored-document processing');
    await db.exec("reset role;update ai_privacy_notices set enabled=false where provider='gemini';update ai_privacy_notices set enabled=true where provider='gemini' and version='2026-09-documents-v2';");
    await db.exec(`set role authenticated;select set_ai_consent('gemini','2026-09-documents-v2',true);reset role;set role service_role;`);
    const ticket=await reserve();assert.ok(ticket);
    await db.query('select release_ai_call($1,$2)',[owner,ticket]);
    await db.exec("reset role;set role authenticated;select set_ai_consent('gemini','',false);reset role;set role service_role;");
    assert.equal(await reserve(),null,'withdrawal blocks subsequent calls');
    await db.exec(`reset role;delete from auth.users where id='${owner}'`);
    assert.equal((await db.query('select count(*)::int n from aplifyr_application_counts where user_id=$1',[owner])).rows[0].n,0);
  } finally { await db.close(); }
});
