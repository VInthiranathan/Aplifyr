const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const mod = {exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../lib/', file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module:mod,exports:mod.exports,require:name=>dependencies[name],...globals});
  return mod.exports;
}
const access = load('guestAccess.ts');
test('return destinations reject external URLs, nested queries and encoded bypasses', () => {
  for (const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/auth','/api/profile','/jobs/123?returnTo=//evil.test',['/jobs'],null])
    assert.equal(access.safeReturnTo(value), '/');
  assert.equal(access.safeReturnTo('/jobs/123/cv'), '/jobs/123/cv');
  assert.equal(access.safeReturnTo('/sv/jobs/123'), '/jobs/123');
});
test('readiness requires a name and real background, allowing beginners without employment', () => {
  assert.equal(access.hasGenerationProfile(null, []), false);
  assert.equal(access.hasGenerationProfile({full_name:'Ada'}, []), false);
  assert.equal(access.hasGenerationProfile({full_name:' ',bio:'Background'}, []), false);
  assert.equal(access.hasGenerationProfile({full_name:'Ada',tech_stack:[' ']}, []), false);
  for (const profile of [{full_name:'Ada',bio:'Background'}, {full_name:'Ada',tech_stack:['C#']}])
    assert.equal(access.hasGenerationProfile(profile, []), true);
  assert.equal(access.hasGenerationProfile({full_name:'Ada'}, [{title:'Education'}]), true);
});
test('generation preflight routes guests and incomplete profiles before AI consent', async () => {
  let session = null, profile = {}, calls = 0, status = 200;
  const {generationDestination} = load('generationAccess.ts', {
    './guestAccess':access,
    './supabaseClient':{getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session}})}})},
  }, {fetch:async url=>{calls++;return {ok:status===200,status,json:async()=>url==='/api/profile'?{profile}:{entries:[]}}}});
  assert.equal(await generationDestination('/jobs/123/cv'), '/auth?returnTo=%2Fjobs%2F123%2Fcv');
  assert.equal(calls,0);
  session = {user:{id:'owner'}};
  assert.equal(await generationDestination('/jobs/123/cv'), '/user?returnTo=%2Fjobs%2F123%2Fcv');
  profile = {full_name:'Ada',bio:'Background'};
  assert.equal(await generationDestination('/jobs/123'), null);
  status = 503;
  await assert.rejects(generationDestination('/jobs/123'), /profileUnavailable/);
  status = 401;
  assert.equal(await generationDestination('/jobs/123'), '/auth?returnTo=%2Fjobs%2F123');
});
