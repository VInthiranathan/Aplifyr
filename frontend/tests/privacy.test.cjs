const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name] ?? require(name),Date,Error});
  return module.exports;
}
const {readCareerEntries} = load('lib/readCareerEntries.ts');
test('career pagination continues below hosted row limit and always scopes owner', async()=>{
  const calls=[]; const pages=[[{id:'a'}],[{id:'b'}],[]];
  const query={};
  for(const op of ['select','eq','order','limit','gt']) query[op]=(...args)=>{calls.push([op,...args]);return query;};
  query.then=resolve=>Promise.resolve({data:pages.shift(),error:null}).then(resolve);
  const rows=await readCareerEntries({from:()=>query},'owner','id');
  assert.equal(rows.length,2);
  assert.equal(calls.filter(c=>c[0]==='eq' && c[1]==='user_id' && c[2]==='owner').length,3);
  assert.deepEqual(calls.filter(c=>c[0]==='gt'),[['gt','id','a'],['gt','id','b']]);
});
test('career pagination fails explicitly on repeated cursor or database error',async()=>{
  const query={};for(const op of ['select','eq','order','limit','gt'])query[op]=()=>query;
  query.then=resolve=>Promise.resolve({data:[{id:'a'}]}).then(resolve);
  await assert.rejects(readCareerEntries({from:()=>query},'owner','id'),/cursor/);
  query.then=resolve=>Promise.resolve({data:null,error:{message:'private'}}).then(resolve);
  await assert.rejects(readCareerEntries({from:()=>query},'owner','id'),/unavailable/);
});
test('export verifies identity, ignores supplied owner, omits auth secrets and fails closed',async()=>{
  let user={id:'owner',email:'owner@example.test',created_at:'date',app_metadata:{secret:'SECRET'}};
  let fail=false;const calls=[];
  const query={select:s=>{calls.push(['select',s]);return query;},eq:(...a)=>{calls.push(['eq',...a]);return query;},maybeSingle:async()=>({data:{id:'owner'},error:fail?{}:null})};
  const handler=load('pages/api/account/export.ts',{
    '../../../lib/serverSupabase':{serverSupabase:()=>({auth:{getUser:async()=>({data:{user}})},from:()=>query,rpc:async()=>({data:{current:[],receipts:[]}})})},
    '../../../lib/readGeneratedCvs':{readGeneratedCvs:async(_client,owner)=>{assert.equal(owner,'owner');return [];}},
    '../../../lib/readCareerEntries':{readCareerEntries:async(_client,owner)=>{assert.equal(owner,'owner');return [];}}
  }).default;
  async function invoke(method='GET'){
    const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
    await handler({method,query:{id:'victim'},headers:{}},res);return res;
  }
  let res=await invoke();assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'private, no-store');
  assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='id'&&c[2]==='owner'));
  assert.doesNotMatch(JSON.stringify(res.body),/SECRET|metadata|token/);
  fail=true;assert.equal((await invoke()).code,503);
  user=null;calls.length=0;assert.equal((await invoke()).code,401);assert.equal(calls.length,0);
  assert.equal((await invoke('POST')).code,405);
});
test('privacy translations match and remote employer images are not loaded',()=>{
  assert.deepEqual(Object.keys(require('../public/locales/en/common.json').privacy),Object.keys(require('../public/locales/sv/common.json').privacy));
  for(const page of ['index.tsx','jobs/index.tsx','jobs/[id].tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../pages',page),'utf8'),/src=\{(?:safeExternalUrl\()?job\.logo_url/);
  }
});
