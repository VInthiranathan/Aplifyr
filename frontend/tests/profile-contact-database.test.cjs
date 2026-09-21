const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('profile contact migration is repeatable and constrains direct database writes', async () => {
  const db = new PGlite();
  try {
    await db.exec('create table public.profiles(id int primary key); insert into public.profiles values (1);');
    const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260921184722_add_profile_contact_details.sql'), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec("update profiles set contact_email='cv@example.com',phone='+46 70 123 45 67',website_url='https://portfolio.example',linkedin_url='https://www.linkedin.com/in/applicant' where id=1");
    const row = (await db.query('select contact_email,phone,website_url,linkedin_url from profiles')).rows[0];
    assert.equal(row.contact_email, 'cv@example.com');
    await assert.rejects(db.exec("update profiles set contact_email='invalid' where id=1"), /profiles_contact_details_valid/);
    await assert.rejects(db.exec("update profiles set phone='call me now' where id=1"), /profiles_contact_details_valid/);
    await assert.rejects(db.exec("update profiles set website_url='http://portfolio.example' where id=1"), /profiles_contact_details_valid/);
    await assert.rejects(db.exec("update profiles set linkedin_url='https://example.com/in/applicant' where id=1"), /profiles_contact_details_valid/);
  } finally { await db.close(); }
});
