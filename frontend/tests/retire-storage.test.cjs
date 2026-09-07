const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/005_remove_cv_feature.sql'), 'utf8');

test('retirement drops only legacy fields, blocks old bucket permissions and preserves other storage', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table profiles (id int, bio text, cv_url text, cv_storage_path text, cv_text text);
      insert into profiles values (1, 'Keep biography', 'old', 'old', 'old');
      create table profile_career_entries (title text);
      insert into profile_career_entries values ('Keep work history');
      create schema storage;
      create table storage.buckets (id text primary key, public boolean);
      insert into storage.buckets values ('cvs', true), ('images', true);
      create table storage.objects (id int, bucket_id text);
      insert into storage.objects values (1, 'cvs'), (2, 'images');
      grant usage on schema storage to anon, authenticated;
      grant all on storage.objects to anon, authenticated;
      alter table storage.objects enable row level security;
      create policy old_custom_policy on storage.objects for all to anon, authenticated using (true) with check (true);
    `);
    await db.exec(migration);
    await db.exec(migration); // Repeat application is safe.
    assert.deepEqual((await db.query('select * from profiles')).rows, [{ id: 1, bio: 'Keep biography' }]);
    assert.equal((await db.query('select * from profile_career_entries')).rows[0].title, 'Keep work history');
    assert.equal((await db.query("select public from storage.buckets where id='cvs'")).rows[0].public, false);
    assert.equal((await db.query("select public from storage.buckets where id='images'")).rows[0].public, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      assert.deepEqual((await db.query('select id from storage.objects')).rows, [{ id: 2 }]);
      await assert.rejects(db.exec("insert into storage.objects values (3, 'cvs')"), /row-level security/);
      await assert.rejects(db.exec("update storage.objects set bucket_id='cvs' where id=2"), /row-level security/);
      assert.equal((await db.query("delete from storage.objects where bucket_id='cvs' returning id")).rows.length, 0);
      await db.exec('reset role');
    }
    assert.equal((await db.query('select * from storage.objects')).rows.length, 2);
  } finally { await db.close(); }
});

test('retirement also works when storage was never configured', async () => {
  const db = new PGlite();
  try {
    await db.exec('create table profiles (id int, bio text);');
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from profiles')).rows, []);
  } finally { await db.close(); }
});
