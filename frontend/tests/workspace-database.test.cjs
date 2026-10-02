const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
const dir=path.join(__dirname,'../../supabase/migrations');const sql=file=>fs.readFileSync(path.join(dir,file),'utf8');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('workspace migration: notes protect ownership, revisions, direct quotas, deletion and new consent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;`);
 for(const file of ['001_create_profiles_table.sql','002_add_location_preferences_to_profiles.sql','003_add_private_cv_columns.sql','004_create_profile_career_entries.sql','005_remove_cv_feature.sql','006_secure_profiles.sql','007_personal_data_limits.sql','008_privacy_consent_and_limits.sql','009_generated_cvs.sql'])await db.exec(sql(file));
 await db.exec(sql('20260918164504_prepared_jobs_and_generated_document_retention.sql').split('create extension if not exists pg_cron')[0]+'commit;');
 for(const file of ['20260921184722_add_profile_contact_details.sql','20260923122723_job_application_tracker.sql','20260926051754_security_hardening_and_document_revisions.sql','20261002075427_application_workspace.sql'])await db.exec(sql(file));
 await db.exec(`insert into auth.users values('${owner}','owner@example.test','{}'),('${other}','other@example.test','{}');`);
 const notice=(await db.query("select enabled,notice_sv,notice_en from ai_privacy_notices where provider='gemini' and version='2026-10-documents-v3'")).rows[0];
 assert.equal(notice.enabled,false);assert.match(notice.notice_sv,/formuleringsförslag/);assert.match(notice.notice_en,/wording suggestions/);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`);
 await db.query('insert into job_notes(user_id,job_id,notes) values($1,$2,$3)',[owner,'job','Call recruiter']);
 const revision=(await db.query("select updated_at::text from job_notes where job_id='job'")).rows[0].updated_at;
 await db.query("update job_notes set notes='Updated' where user_id=$1 and job_id='job' and updated_at=$2",[owner,revision]);
 assert.equal((await db.query("update job_notes set notes='Stale' where user_id=$1 and job_id='job' and updated_at=$2 returning job_id",[owner,revision])).rows.length,0);
 await assert.rejects(db.query('insert into job_notes(user_id,job_id,notes) values($1,$2,$3)',[other,'victim','Tamper']),/row-level security/);
 await assert.rejects(db.query("update job_notes set user_id=$1",[other]),/row-level security|identity/);
 await assert.rejects(db.exec("update job_notes set job_id='different'"),/identity/);
 await assert.rejects(db.exec("insert into job_notes(user_id,job_id,notes) values('"+owner+"','oversize',repeat('a',5001))"),/check/);
 await db.exec(`insert into job_notes(user_id,job_id,notes) select '${owner}','note-'||i,'Synthetic' from generate_series(1,999)i;`);
 await assert.rejects(db.exec(`insert into job_notes(user_id,job_id,notes) values('${owner}','over','Synthetic')`),/quota/);
 await db.exec(`insert into job_notes(user_id,job_id,notes) values('${owner}','job','Duplicate') on conflict do nothing;`);
 await db.exec("delete from job_notes where job_id='note-1'");
 await db.exec(`insert into job_notes(user_id,job_id,notes) values('${owner}','replacement','Synthetic')`);
 await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
 assert.equal((await db.query('select count(*)::int n from job_notes')).rows[0].n,0);
 assert.equal((await db.query("update job_notes set notes='Tamper' returning job_id")).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.exec('select * from job_notes'),/permission denied/);
 await db.exec('reset role');await db.query('delete from auth.users where id=$1',[owner]);
 assert.equal((await db.query('select count(*)::int n from job_notes')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from aplifyr_note_counts')).rows[0].n,0);
 }finally{await db.close();}
});
