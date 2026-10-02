const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
function load(file,mocks={},extras={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>mocks[n]??require(n),Date,TextEncoder,AbortController,Error,setInterval,clearInterval,...extras});return module.exports;}
const {activePreparation,jobStage,needsFollowUp}=load('lib/jobProgress.ts');
test('preparation respects independent expiry; application status wins; follow-up uses calendar dates',()=>{
 const now=Date.parse('2026-10-02T12:00:00Z');
 const p=activePreparation({has_cv:true,cv_expires_at:'2026-10-02T12:00:00Z',has_cover_letter:true,cover_letter_expires_at:'2026-10-03T12:00:00Z'},now);
 assert.equal(p.hasCv,false);assert.equal(p.hasLetter,true);assert.equal(jobStage(p),'preparing');assert.equal(jobStage({...p,status:'interview'}),'interview');
 assert.equal(jobStage({hasCv:true,hasLetter:true}),'ready');assert.equal(jobStage({hasCv:false,hasLetter:false,hasNotes:true}),'preparing');
 assert.equal(needsFollowUp('interview','2026-10-02','2026-10-02'),true);assert.equal(needsFollowUp('rejected','2026-10-01','2026-10-02'),false);assert.equal(needsFollowUp('applied','2026-10-03','2026-10-02'),false);
});
test('prepared and note reads continue after short hosted pages and fail on incomplete reads',async()=>{
 for(const [file,name] of [['lib/readPreparedJobs.ts','readPreparedJobs'],['lib/readJobNotes.ts','readJobNotes']]){
  const reader=load(file)[name];const calls=[];let pages=[[{job_id:'a'}],[{job_id:'b'}],[]];const q={};for(const op of ['select','eq','order','limit','gt'])q[op]=(...args)=>{calls.push([op,...args]);return q;};q.then=resolve=>Promise.resolve({data:pages.shift(),error:null}).then(resolve);
  assert.equal((await reader({from:()=>q},'owner')).length,2);assert.equal(calls.filter(c=>c[0]==='eq'&&c[2]==='owner').length,3);
  pages=[[{job_id:'a'}],[{job_id:'a'}]];await assert.rejects(reader({from:()=>q},'owner'),/bounds/);
 }
});
test('AI suggestion requires consent, preserves the original, and only changes a statement on explicit acceptance',async()=>{
 const requests=[];const accepted=[];let result='Suggested wording';
 const Component=load('components/RewriteSuggestion.tsx',{'next-i18next':{useTranslation:()=>({t:k=>k})},'./ui/button':{Button:p=>React.createElement('button',p)},'./AiGenerationConsent':({onConfirm,onClose})=>React.createElement('section',{role:'dialog'},React.createElement('button',{onClick:onConfirm},'consent'),React.createElement('button',{onClick:onClose},'cancel')),'../lib/backendUrl':{getPublicBackendUrl:()=>''},'../lib/supabaseClient':{getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}})}},{fetch:async(url,opts)=>{requests.push([url,JSON.parse(opts.body)]);return {ok:true,json:async()=>({text:result,original:'Original',updatedAt:'revision'})};}}).default;
 const props={jobId:'job',revision:'revision',text:'Original',target:{kind:'cv',section:'professionalSummary',entry:0,index:0},onAccept:text=>accepted.push(text)};let view;await act(async()=>{view=create(React.createElement(Component,props));});
 const button=text=>view.root.findAllByType('button').find(b=>b.children.includes(text));
 await act(async()=>button('workspace.rewrite.suggest').props.onClick());assert.equal(requests.length,0);
 await act(async()=>button('consent').props.onClick());assert.equal(requests.length,1);assert.equal(accepted.length,0);assert.equal(requests[0][1].text,'Original');
 await act(async()=>button('workspace.rewrite.discard').props.onClick());assert.equal(accepted.length,0);
 await act(async()=>button('workspace.rewrite.suggest').props.onClick());await act(async()=>button('consent').props.onClick());await act(async()=>button('workspace.rewrite.accept').props.onClick());assert.deepEqual(accepted,['Suggested wording']);
 await act(async()=>{view.update(React.createElement(Component,{...props,text:'Unsaved draft',disabled:true}));});assert.equal(button('workspace.rewrite.suggest').props.disabled,true);await act(async()=>view.unmount());
});
test('note API verifies identity, owner predicates, creation conflicts and stale edits',async()=>{
 let owner={id:'owner'};let row={job_id:'job',notes:'Private',updated_at:'2026-10-02T00:00:00Z'};let conflict=false;let dbError=null;const calls=[];const q={};for(const op of ['select','eq','insert','update','delete'])q[op]=(...a)=>{calls.push([op,...a]);return q;};q.maybeSingle=async()=>({data:conflict?null:row,error:dbError});
 const handler=load('pages/api/job-notes.ts',{'../../lib/serverSupabase':{serverSupabase:()=>({auth:{getUser:async()=>({data:{user:owner}})},from:()=>q})},'../../lib/apiSecurity':{isSafeMutation:req=>req.headers['sec-fetch-site']!=='cross-site'},'../../lib/applicationValidation':{isJobId:s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s)}}).default;
 async function invoke(method,body={},headers={}){const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};await handler({method,body,headers,query:{jobId:'job'}},res);return res;}
 assert.equal((await invoke('GET')).code,200);assert.equal((await invoke('PUT',{jobId:'job',notes:'Change',updatedAt:row.updated_at,user_id:'victim'})).code,200);assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner'));assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='updated_at'));
 conflict=true;assert.equal((await invoke('PUT',{jobId:'job',notes:'Draft',updatedAt:row.updated_at})).code,409);conflict=false;dbError={code:'23505'};assert.equal((await invoke('PUT',{jobId:'job',notes:'Draft',updatedAt:null})).code,409);
 assert.equal((await invoke('PUT',{jobId:'job',notes:'Draft',updatedAt:null},{'sec-fetch-site':'cross-site'})).code,403);owner=null;assert.equal((await invoke('GET')).code,401);
});
