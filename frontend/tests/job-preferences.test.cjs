const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
function load(relative, mocks = {}, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => mocks[name] ?? require(name), console, ...extra });
  return module.exports;
}
const validation = load('lib/jobPreferences.ts');
const profile = { id:'owner', roles:['Developer'], location:'Stockholm', locationPreferences:['region'], updatedAt:'2026-01-01T00:00:00Z' };
const prefs = { roles:[' Developer ', 'developer', ''], location:' Stockholm ', locationPreferences:['region'], updatedAt:profile.updatedAt };
const plain = value => JSON.parse(JSON.stringify(value));
test('preference validation normalizes values, rejects malformed lists and strips unrelated fields', () => {
  assert.deepEqual(plain(validation.validateJobPreferences({...prefs, id:'other', bio:'overwrite'})), {roles:['Developer'], location:'Stockholm', locationPreferences:['region']});
  for (const input of [null, [], {}, {...prefs, roles:[12]}, {...prefs, roles:Array(21).fill('x')}, {...prefs, locationPreferences:['unknown']}, {...prefs, location:'x'.repeat(201)}]) {
    assert.equal(validation.validateJobPreferences(input), null);
  }
});
function api({user={id:'owner'}, data={id:'owner'}, error=null} = {}) {
  const calls=[];
  const query={};
  for (const method of ['from','insert','update','upsert','eq','select']) query[method]=(...args)=>{calls.push([method,...args]); return query;};
  query.maybeSingle = query.single = async()=>({data,error});
  const handler=load('pages/api/profile.ts', {
    '../../lib/apiSecurity':load('lib/apiSecurity.ts'),
    '../../lib/jobPreferences':validation,
    '@supabase/auth-helpers-nextjs':{createServerClient:()=>({...query,auth:{getUser:async()=>({data:{user}})}}), parseCookieHeader:()=>[], serializeCookieHeader:()=>''},
  }, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}}}).default;
  return {calls, invoke:async(body=prefs, method='PATCH', headers={})=>{
    const res={headers:{}, setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(body){this.body=body;}};
    await handler({method,body,headers:{'content-type':'application/json',...headers}},res); return res;
  }};
}
test('preference writes use session ownership and optimistic version, never whole-profile upsert', async()=>{
  const app=api();const res=await app.invoke({...prefs,id:'other',bio:'overwrite'});
  assert.equal(res.code,200);
  assert.ok(app.calls.some(c=>c[0]==='eq' && c[1]==='id' && c[2]==='owner'));
  assert.ok(app.calls.some(c=>c[0]==='eq' && c[1]==='updated_at' && c[2]===profile.updatedAt));
  assert.deepEqual(plain(app.calls.find(c=>c[0]==='update')[1]),{roles:['Developer'],location:'Stockholm',location_preferences:['region']});
  assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('preference writes reject unauthenticated, invalid, stale and cross-site requests', async()=>{
  assert.equal((await api({user:null}).invoke()).code,401);
  assert.equal((await api().invoke({...prefs,roles:[12]})).code,400);
  assert.equal((await api().invoke({...prefs,updatedAt:undefined})).code,400);
  assert.equal((await api().invoke(prefs,'PATCH',{'sec-fetch-site':'cross-site'})).code,403);
  assert.equal((await api({data:null}).invoke()).code,409);
  assert.equal((await api({error:{code:'23505'}}).invoke({...prefs,updatedAt:null})).code,409);
  const unavailable=await api({error:{message:'private details'}}).invoke();
  assert.equal(unavailable.code,503);assert.ok(!JSON.stringify(unavailable.body).includes('private details'));
});
test('editing only a bio preserves preference fields',async()=>{
  const app=api();assert.equal((await app.invoke({bio:'New bio',updatedAt:profile.updatedAt},'PUT')).code,200);
  assert.deepEqual(plain(app.calls.find(c=>c[0]==='update')[1]),{bio:'New bio'});
  assert.ok(app.calls.some(c=>c[0]==='eq' && c[1]==='id' && c[2]==='owner'));
  assert.ok(app.calls.some(c=>c[0]==='eq' && c[1]==='updated_at' && c[2]===profile.updatedAt));
  assert.equal((await api({data:null}).invoke({bio:'New bio',updatedAt:profile.updatedAt},'PUT')).code,409);
  assert.equal((await api().invoke({bio:'New bio'},'PUT')).code,400);
});
function editor(fetch, initial=profile) {
  const Component=load('components/JobPreferences.tsx',{
    '../lib/jobPreferences':validation,
    'next-i18next':{useTranslation:()=>({t:key=>key})},
    './ui/button':{Button:({variant,...props})=>React.createElement('button',props)},
  },{fetch,window:{addEventListener(){},removeEventListener(){}}}).default;
  const updates=[];
  const render=p=>React.createElement(Component,{profile:p,onSaved:p=>updates.push(p)});
  return {render,updates};
}
test('editor retains failed drafts, retries and prevents duplicate in-flight submissions',async()=>{
  let resolve;const calls=[];
  const app=editor((_url,options)=>{calls.push(options);return new Promise(r=>resolve=r);});
  let view;await act(async()=>{view=create(app.render(profile));});
  act(()=>view.root.findByProps({id:'preferred-roles'}).props.onChange({target:{value:'Backend developer'}}));
  let pending;
  act(()=>{pending=view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  await act(async()=>view.root.findByType('form').props.onSubmit({preventDefault(){}}));
  assert.equal(calls.length,1);
  await act(async()=>{resolve({ok:false,status:503});await pending;});
  assert.equal(view.root.findByProps({id:'preferred-roles'}).props.value,'Backend developer');
  assert.equal(view.root.findByProps({role:'alert'}).props.children,'preferences.error');
  act(()=>{pending=view.root.findByType('form').props.onSubmit({preventDefault(){}});});
  await act(async()=>{resolve({ok:true,json:async()=>({profile:{id:'owner',roles:['Backend developer'],location:'Stockholm',location_preferences:['region']}})});await pending;});
  assert.equal(app.updates.length,1);
  assert.equal(JSON.parse(calls[1].body).updatedAt,profile.updatedAt);
  await act(async()=>view.unmount());
});
test('editor loads late profile data and preserves a draft across prop updates',async()=>{
  const app=editor(async()=>({ok:false}));let view;
  await act(async()=>{view=create(app.render(undefined));});
  assert.equal(view.root.findAllByType('form').length,0);
  await act(async()=>view.update(app.render(profile)));
  assert.equal(view.root.findByProps({id:'preferred-roles'}).props.value,'Developer');
  act(()=>view.root.findByProps({id:'preferred-roles'}).props.onChange({target:{value:'My draft'}}));
  await act(async()=>view.update(app.render({...profile,updatedAt:'2026-01-02T00:00:00Z'})));
  assert.equal(view.root.findByProps({id:'preferred-roles'}).props.value,'My draft');
  await act(async()=>view.unmount());
});
test('matching merges explicit career skills, deduplicates and invalidates on profile changes',()=>{
  const matching=load('lib/matchProfile.ts');
  assert.deepEqual(plain(matching.collectMatchSkills(['SQL'],[{skills:[' sql ','C++']},{skills:['project management',null]}])),['SQL','C++','project management']);
  assert.notEqual(matching.matchProfileKey({roles:['A']}),matching.matchProfileKey({roles:['B']}));
  assert.equal(matching.matchProfileKey({tags:['A','B']}),matching.matchProfileKey({tags:['B','A']}));
});
test('preference translations are complete in Swedish and English',()=>{
  const sv=require('../public/locales/sv/common.json');const en=require('../public/locales/en/common.json');
  assert.deepEqual(Object.keys(sv.preferences),Object.keys(en.preferences));
  assert.equal(sv.career.tabs.preferences,'Jobbpreferenser');
});
function home(fetch) {
  let poll; let session={matched:[],matchReqHash:''};
  const Component=load('pages/index.tsx',{
    '../lib/matchProfile':load('lib/matchProfile.ts'),
    '../lib/backendUrl':{getPublicBackendUrl:()=>''},
    '../lib/supabaseClient':{isSupabaseConfigured:false},
    '../lib/useFavorites':{useFavorites:()=>({toggleFavorite(){},isFavorite:()=>false})},
    '../lib/utils':{formatLocation:()=>''},
    '../lib/matchSessionContext':{useMatchSession:()=>({getSession:()=>session,updateSession:patch=>session={...session,...patch}})},
    '../components/JobListCard':({title})=>React.createElement('article',null,title),
    'next/link':({children,href})=>React.createElement('a',{href},children),
    'next-i18next':{useTranslation:()=>({t:key=>key})},
    'next-i18next/serverSideTranslations':{serverSideTranslations:async()=>({})},
    '@supabase/auth-helpers-nextjs':{},
  },{fetch,AbortController,process:{env:{}},setInterval:fn=>{poll=fn;return 1;},clearInterval(){},document:{visibilityState:'visible',addEventListener(){},removeEventListener(){}}}).default;
  return {Component,tick:()=>poll(),session:()=>session};
}
const homeProps=roles=>({profileId:'owner',matchReq:{roles},showDebug:false,progression:{applied:0,readyToApply:0,readyToGenerate:0}});
const matchResponse=(name,complete=false)=>({ok:true,json:async()=>({matched:Array.from({length:30},(_,i)=>({id:String(i),headline:name+i,matchGrade:'B',matchDebug:{totalScore:2,scoreBreakdown:'',locationTier:'no_preference'}})),stats:{fetchComplete:complete},profileUsed:{desiredRolesSource:'roles'}})});
test('home replaces matches after profile changes and refreshes a full page when polling adds jobs',async()=>{
  const requests=[];let revision=0;
  const app=home(async(url,options)=>{
    requests.push({url,options});
    if(url.endsWith('/continue')){revision++;return {ok:true,json:async()=>({fetchComplete:false,addedCount:1})};}
    return matchResponse(JSON.parse(options.body).roles[0]+revision);
  });let view;
  await act(async()=>{view=create(React.createElement(app.Component,homeProps(['Developer'])));});
  assert.equal(view.root.findAllByType('article').length,30);
  await act(async()=>app.tick());
  assert.ok(JSON.stringify(view.toJSON()).includes('Developer10'));
  await act(async()=>view.update(React.createElement(app.Component,homeProps(['Teacher']))));
  assert.ok(JSON.stringify(view.toJSON()).includes('Teacher10'));
  assert.ok(!JSON.stringify(view.toJSON()).includes('Developer10'));
  await act(async()=>view.unmount());
});
test('home exposes a retry after failed matching and recovers',async()=>{
  let fail=true;const app=home(async()=>fail?{ok:false,status:502}:matchResponse('Recovered',true));let view;
  await act(async()=>{view=create(React.createElement(app.Component,homeProps(['Developer'])));});
  assert.equal(view.root.findAllByProps({role:'alert'}).length,1);
  fail=false;
  await act(async()=>view.root.findAllByType('button').find(b=>b.props.children==='career.retry').props.onClick());
  assert.equal(view.root.findAllByProps({role:'alert'}).length,0);
  assert.equal(view.root.findAllByType('article').length,30);
  await act(async()=>view.unmount());
});
