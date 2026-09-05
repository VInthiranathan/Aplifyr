const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('migration enforces ownership, CRUD, constraints and deletion cascade in PostgreSQL', async () => {
  const db = new PGlite();
  try {
    // Local Supabase Auth contract; no remote database or credentials are used.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create function public.profiles_updated_at() returns trigger language plpgsql as
        $$ begin new.updated_at = now(); return new; end; $$;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/004_create_profile_career_entries.sql'), 'utf8'));
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    const insert = `insert into profile_career_entries (user_id,kind,title,organization,start_month,end_month)
      values ($1,'work','Developer','Example AB','2024-01','2025-01') returning *`;
    const { rows: [entry] } = await db.query(insert, [owner]);
    assert.equal(entry.kind, 'work');
    await assert.rejects(db.query(insert, [other]), /row-level security/);
    await assert.rejects(db.query('update profile_career_entries set user_id = $1 where id = $2', [other, entry.id]), /row-level security/);
    await assert.rejects(db.query("update profile_career_entries set end_month = '2023-01' where id = $1", [entry.id]), /check constraint/);
    await assert.rejects(db.query("update profile_career_entries set is_current = true where id = $1", [entry.id]), /check constraint/);
    await assert.rejects(db.query("update profile_career_entries set title = '' where id = $1", [entry.id]), /check constraint/);
    await db.query("update profile_career_entries set is_current = true, end_month = null, learned = 'SQL' where id = $1", [entry.id]);
    assert.equal((await db.query('select learned from profile_career_entries')).rows[0].learned, 'SQL');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query('select * from profile_career_entries')).rows.length, 0);
    assert.equal((await db.query("update profile_career_entries set title = 'Changed' where id = $1 returning id", [entry.id])).rows.length, 0);
    assert.equal((await db.query('delete from profile_career_entries where id = $1 returning id', [entry.id])).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
    assert.equal((await db.query('delete from profile_career_entries where id = $1 returning id', [entry.id])).rows.length, 1);
    await db.query(insert, [owner]);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from profile_career_entries'), /permission denied/);
    await db.exec('reset role');
    await db.query('delete from auth.users where id = $1', [owner]);
    assert.equal((await db.query('select * from profile_career_entries')).rows.length, 0);
  } finally { await db.close(); }
});
