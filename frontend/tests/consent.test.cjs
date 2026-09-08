const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
function load(file,mocks={},extra={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??require(n),URL,console,AbortController,...extra});return module.exports;}
test('consent API rejects cross-site/invalid/anonymous writes and assigns identity through user session',async()=>{
 let user={id:'owner'};const writes=[];const query={select(){return this;},eq(_key,owner){assert.equal(owner,'owner');return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
 const handler=load('pages/api/account/consent.ts',{
  '../../../lib/apiSecurity':load('lib/apiSecurity.ts'),
  '../../../lib/serverSupabase':{serverSupabase:()=>({auth:{getUser:async()=>({data:{user}})},from:()=>query,rpc:async(name,body)=>{writes.push({name,body});return {};}})},
 }).default;
 async function call(body,headers={'content-type':'application/json'},method='PUT'){
  const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;}};await handler({body,headers,method},res);return res;
 }
 assert.equal((await call({provider:'gemini',version:'v1',granted:true,user_id:'victim'})).code,200);
 assert.deepEqual(Object.keys(writes[0].body).sort(),['p_granted','p_provider','p_version']);
 assert.equal((await call({provider:'gemini',version:'',granted:false})).code,200);
 assert.equal((await call({provider:'gemini',version:'v1',granted:'true'})).code,400);
 assert.equal((await call({}, {'content-type':'application/json','sec-fetch-site':'cross-site'})).code,403);
 user=null;assert.equal((await call({})).code,401);assert.equal(writes.length,2);
 assert.equal((await call({}, {},'DELETE')).code,405);
});
test('consent UI starts unchecked, preserves choices on failure, and withdraws explicitly',async()=>{
 const t=key=>key;let granted=false;let fail=false;const requests=[];
 const payload=()=>({notices:[{provider:'gemini',version:'v1',enabled:true,notice_en:'Reviewed notice',notice_sv:'Granskad text'}],consents:granted?[{provider:'gemini',notice_version:'v1',granted:true}]:[]});
 const Component=load('components/AiConsent.tsx',{'next-i18next':{useTranslation:()=>({t})},'next/router':{useRouter:()=>({locale:'en'})},'next/link':({children})=>React.createElement('a',null,children)}, {
  fetch:async(_url,options={})=>{if(options.method==='PUT'){requests.push(JSON.parse(options.body));if(fail)return {ok:false};granted=JSON.parse(options.body).granted;}return {ok:true,json:async()=>payload()};},
 }).default;
 let view;await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('input')[0].props.checked,false);
 fail=true;await act(async()=>view.root.findAllByType('input')[0].props.onChange({target:{checked:true}}));
 assert.equal(view.root.findAllByType('input')[0].props.checked,false);
 fail=false;await act(async()=>view.root.findAllByType('input')[0].props.onChange({target:{checked:true}}));
 assert.equal(view.root.findAllByType('input')[0].props.checked,true);
 await act(async()=>view.root.findByType('button').props.onClick());
 assert.equal(requests.at(-1).granted,false);assert.equal(view.root.findAllByType('input')[0].props.checked,false);
 await act(async()=>view.unmount());
});
test('production CSP allows only nonce-authorized scripts and configured connections',()=>{
 const {contentSecurityPolicy}=load('lib/contentSecurityPolicy.ts');const csp=contentSecurityPolicy('random',true,'https://example.supabase.co/path','https://backend.example.test');
 const script=csp.split(';').find(x=>x.trim().startsWith('script-src'));
 assert.match(script,/'nonce-random'/);assert.doesNotMatch(script,/unsafe-inline|unsafe-eval/);assert.match(csp,/connect-src 'self' https:\/\/example.supabase.co https:\/\/backend.example.test/);
});
