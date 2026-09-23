const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
function load(file, mocks, fetch) {
 const filename=path.resolve(__dirname,'..',file), module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>{
  if(n in mocks)return mocks[n];
  if(n.startsWith('.')) {
   const base=path.resolve(path.dirname(filename),n).replace(/\.js$/,'');
   const local=['.ts','.tsx'].map(ext=>base+ext).find(p=>fs.existsSync(p));
   if(local)return load(path.relative(path.resolve(__dirname,'..'),local),mocks,fetch);
  }
  return require(n);
 },fetch,AbortController,Error,console,setTimeout,clearTimeout});
 return module.exports;
}
const auth={getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic',user:{id:'owner'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})};
const shared={'next-i18next':{useTranslation:()=>({t:k=>k,i18n:{language:'sv'}})},'next-i18next/serverSideTranslations':{},'next/link':({children,href})=>React.createElement('a',{href},children)};
const button=props=>React.createElement('button',props);
const findButton=(view,text)=>view.root.findAllByType('button').find(b=>b.children.includes(text));
const job={id:'123',title:'Developer',company:'Company'};
const saved={job_id:'123',updated_at:'2026-09-20T00:00:00Z',expires_at:'2026-09-27T00:00:00Z',metadata:{},content:{name:'Applicant',title:'Developer',location:'Lund',skills:['C#'],professionalSummary:[{text:'Original summary',sourceFactId:'p'}],experience:[{sourceId:'w',title:'Intern',organization:'Company',startMonth:'2024-01',endMonth:'2024-05',bullets:[{text:'Original work',sourceFactId:'w'}]}],education:[]}};
test('CV edits save without AI, survive reload, and conflicts retain the draft',async()=>{
 let current=structuredClone(saved), conflict=false;const calls=[];
 const fetch=async(url,options)=>{
  calls.push(options);
  if(options.method==='PATCH'){
   const payload=JSON.parse(options.body);
   assert.equal(payload.updatedAt,current.updated_at);
   assert.deepEqual(Object.keys(payload.edits).sort(),['education','experience','professionalSummary']);
   if(conflict)return {ok:false,json:async()=>({error:'editConflict'})};
   current={...current,updated_at:'2026-09-20T01:00:00Z',content:{...current.content,professionalSummary:[{text:payload.edits.professionalSummary[0]}]}};
  }
  return {ok:true,json:async()=>({job,cv:current})};
 };
 const Component=load('pages/jobs/[id]/cv.tsx',{...shared,'next/router':{useRouter:()=>({query:{id:'123'},isReady:true})},'../../../lib/supabaseClient':auth,'../../../lib/backendUrl':{getPublicBackendUrl:()=>''},'../../../lib/matchSessionContext':{useMatchSession:()=>({getSession:()=>({matched:[]})})},'../../../components/ui/button':{Button:button},'../../../components/AiGenerationConsent':()=>null},fetch).default;
 let view;await act(async()=>{view=create(React.createElement(Component));});
 await act(async()=>findButton(view,'cv.edit').props.onClick());
 await act(async()=>view.root.findAllByType('textarea')[0].props.onChange({target:{value:'Revised summary'}}));
 assert.equal(findButton(view,'cv.download').props.disabled,true);
 await act(async()=>findButton(view,'cv.saveEdits').props.onClick());
 assert.equal(current.content.professionalSummary[0].text,'Revised summary');
 assert.equal(current.expires_at,saved.expires_at);
 assert.equal(view.root.findAllByType('textarea').length,0);
 assert.equal(findButton(view,'cv.download').props.disabled,false);
 assert.ok(calls.every(c=>c.method==='GET'||c.method==='PATCH'));
 await act(async()=>view.unmount());await act(async()=>{view=create(React.createElement(Component));});
 assert.ok(JSON.stringify(view.toJSON()).includes('Revised summary'));
 await act(async()=>findButton(view,'cv.edit').props.onClick());
 await act(async()=>view.root.findAllByType('textarea')[0].props.onChange({target:{value:'Keep after conflict'}}));
 conflict=true;await act(async()=>findButton(view,'cv.saveEdits').props.onClick());
 assert.equal(view.root.findAllByType('textarea')[0].props.value,'Keep after conflict');
 assert.equal(view.root.findByProps({role:'alert'}).children[0],'cv.errors.editConflict');
 await act(async()=>findButton(view,'cv.cancelEdit').props.onClick());
 assert.ok(!JSON.stringify(view.toJSON()).includes('Keep after conflict'));
 await act(async()=>view.unmount());
});
test('letter PDF exports the edited text and a failed export preserves it',async()=>{
 const exports=[];let fail=false;
 const Component=load('components/CoverLetterModal.tsx',{...shared,'./ui/button':{Button:button},'../lib/useDialogFocus':{useDialogFocus:()=>null},'../lib/downloadCoverLetter.js':{downloadCoverLetter:async(...args)=>{exports.push(args);if(fail)throw Error('font');}}}).default;
 let view;await act(async()=>{view=create(React.createElement(Component,{isOpen:true,onClose(){},letter:'Original letter',jobTitle:'Developer',company:'Company',expiresAt:null,onDelete(){},onRegenerate(){}}));});
 await act(async()=>findButton(view,'coverLetter.edit').props.onClick());
 await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'Revised letter with åäö'}}));
 await act(async()=>findButton(view,'coverLetter.download').props.onClick());
 assert.equal(exports[0][0],'Revised letter with åäö');
 fail=true;await act(async()=>findButton(view,'coverLetter.download').props.onClick());
 assert.equal(view.root.findByType('textarea').props.value,'Revised letter with åäö');
 assert.equal(view.root.findByProps({role:'alert'}).children[0],'coverLetter.downloadError');
 await act(async()=>view.unmount());
});
test('one job action opens the saved letter without requesting generation',async()=>{
 const calls=[];
 const fetch=async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({letter:{content:'Saved letter',expires_at:'2026-09-27T00:00:00Z'}})};};
 const Component=load('pages/jobs/[id].tsx',{...shared,'next/router':{useRouter:()=>({query:{id:'123',data:JSON.stringify({...job,headline:job.title,employer:{name:'Company'}})},isReady:true})},'../../lib/supabaseClient':auth,'../../lib/backendUrl':{getPublicBackendUrl:()=>''},'../../lib/useFavorites':{useFavorites:()=>({toggleFavorite(){},isFavorite:()=>false})},'../../components/ui/button':{Button:button},'../../components/AiGenerationConsent':()=>React.createElement('div',{'data-consent':true}),'../../components/CoverLetterModal':({isOpen,letter})=>isOpen?React.createElement('article',null,letter):null},fetch).default;
 let view;await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('button').filter(b=>b.children.includes('coverLetter.openSaved')).length,1);
 assert.equal(findButton(view,'jobDetail.generateCoverLetter'),undefined);
 await act(async()=>findButton(view,'coverLetter.openSaved').props.onClick());
 assert.equal(view.root.findByType('article').children[0],'Saved letter');
 assert.equal(calls.length,2);
 assert.ok(calls.some(([url])=>url==='/api/applications?jobId=123'));
 assert.ok(calls.some(([url])=>url==='/api/coverletters/123'));
 assert.equal(view.root.findAllByProps({'data-consent':true}).length,0);
 await act(async()=>view.unmount());
});
