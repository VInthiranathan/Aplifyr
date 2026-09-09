const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');
test('database rejects oversized direct writes while preserving preexisting data',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated;create role service_role;
      create table profiles(id int primary key,full_name text,title text,location text,bio text,tech_stack text[],roles text[],location_preferences text[]);
      create table profile_career_entries(id int primary key,skills text[]);
      insert into profiles(id,bio) values (1,repeat('x',5001));
      grant select,insert,update on profiles,profile_career_entries to authenticated;`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations/007_personal_data_limits.sql'),'utf8'));
    assert.equal((await db.query('select length(bio) as n from profiles')).rows[0].n,5001);
    await db.exec('set role authenticated');
    await assert.rejects(db.exec("insert into profiles(id,bio) values(2,repeat('x',5001))"),/profiles_personal_data_limits/);
    await assert.rejects(db.exec("insert into profiles(id,tech_stack) values(2,array[repeat('x',101)])"),/profiles_personal_data_limits/);
    await assert.rejects(db.exec("insert into profile_career_entries values(1,array[repeat('x',101)])"),/career_skill_item_limits/);
    await assert.rejects(db.exec("insert into profile_career_entries values(1,array[null]::text[])"),/career_skill_item_limits/);
    await db.exec("insert into profiles(id,bio,tech_stack) values(2,'valid',array['SQL']);insert into profile_career_entries values(1,array['SQL'])");
  } finally {await db.close();}
});
