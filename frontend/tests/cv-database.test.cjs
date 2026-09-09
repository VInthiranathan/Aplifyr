const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('CV PostgreSQL ownership, server-only writes, same-job regeneration, constraints and deletion cascade', async () => {
 const db = new PGlite();
 const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated, service_role;
   insert into auth.users values('${a}'),('${b}');`);
  await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/009_generated_cvs.sql'),'utf8'));
  const save=()=>db.query('select save_generated_cv($1,$2,$3,$4,$5)',[a,'123',{schemaVersion:1,skills:['C#']},{id:'123',title:'Developer'},{}]);
  await db.exec('set role service_role'); await save();
  const first=(await db.query('select * from generated_cvs')).rows[0];
  await save();assert.equal((await db.query('select * from generated_cvs')).rows.length,1);
  assert.deepEqual((await db.query('select created_at from generated_cvs')).rows[0].created_at,first.created_at);
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  assert.equal((await db.query('select * from generated_cvs')).rows.length,1);
  await assert.rejects(save(),/permission denied/);
  await assert.rejects(db.query('update generated_cvs set user_id=$1',[b]),/permission denied/);
  await assert.rejects(db.query("insert into generated_cvs values($1,'evil','{}','{}','{}',now(),now())",[a]),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
  assert.equal((await db.query('select * from generated_cvs')).rows.length,0);
  assert.equal((await db.query('delete from generated_cvs returning *')).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from generated_cvs'),/permission denied/);
  await db.exec('reset role;set role service_role');
  await assert.rejects(db.query('select save_generated_cv($1,$2,$3,$4,$5)',[a,'123',{schemaVersion:1},{id:'different'},{}]),/check constraint/);
  await assert.rejects(db.query('select save_generated_cv($1,$2,$3,$4,$5)',[a,'123',{}, {id:'123'},{}]),/check constraint/);
  await db.query(`insert into generated_cvs(user_id,job_id,content,job_context,metadata)
    select $1,'job-'||n,'{"schemaVersion":1}'::jsonb,jsonb_build_object('id','job-'||n),'{}'::jsonb from generate_series(1,99) n`,[a]);
  await save(); // Existing CV can still regenerate at capacity.
  await assert.rejects(db.query('select save_generated_cv($1,$2,$3,$4,$5)',[a,'overflow',{schemaVersion:1},{id:'overflow'},{}]),/capacity/);
  await db.query('select save_generated_cv($1,$2,$3,$4,$5)',[b,'123',{schemaVersion:1},{id:'123'},{}]);
  await db.exec('reset role;set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
  assert.equal((await db.query('select * from generated_cvs')).rows.length,1);
  await db.query('delete from generated_cvs');
  await db.exec('reset role'); await db.query('delete from auth.users where id=$1',[a]);
  assert.equal((await db.query('select * from generated_cvs')).rows.length,0);
 } finally { await db.close(); }
});
