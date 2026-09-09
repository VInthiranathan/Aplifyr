const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('profiles reject cross-user CRUD and anonymous reads even with a preexisting permissive policy', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;`);
    await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/001_create_profiles_table.sql'), 'utf8'));
    await db.exec(`grant all on profiles to anon, authenticated;
      create policy legacy_public_policy on profiles for all to public using (true) with check (true);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111', 'one@example.test', '{}'), ('22222222-2222-4222-8222-222222222222', 'two@example.test', '{}');`);
    const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/006_secure_profiles.sql'), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec("set role anon");
    await assert.rejects(db.query('select * from profiles'), /permission denied/);
    await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false)");
    assert.equal((await db.query('select * from profiles')).rows.length, 1);
    await db.exec("update profiles set bio='mine' where id='11111111-1111-4111-8111-111111111111'");
    assert.equal((await db.query("update profiles set bio='attack' where id='22222222-2222-4222-8222-222222222222' returning id")).rows.length, 0);
    assert.equal((await db.query("delete from profiles where id='22222222-2222-4222-8222-222222222222' returning id")).rows.length, 0);
    await assert.rejects(db.exec("update profiles set id='33333333-3333-4333-8333-333333333333'"), /row-level security/);
    await assert.rejects(db.exec("insert into profiles(id) values ('33333333-3333-4333-8333-333333333333')"), /row-level security/);
    await db.exec('reset role');
    // Hardened signup trigger still creates a profile.
    await db.exec("insert into auth.users values ('33333333-3333-4333-8333-333333333333','three@example.test','{}')");
    assert.equal((await db.query('select * from profiles')).rows.length, 3);
  } finally { await db.close(); }
});
