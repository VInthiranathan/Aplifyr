const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
function setup(fetch){
 const mocks={
 'next/router':{useRouter:()=>({query:{id:'123'},isReady:true})},
 'next-i18next':{useTranslation:()=>({t:k=>k})},'next-i18next/serverSideTranslations':{},
 'next/link':({href,children})=>React.createElement('a',{href},children),
 '../../../components/ui/button':{Button:props=>React.createElement('button',props)},
 '../../../components/AiConsent':()=>null,'../../../components/CvPreview':({content})=>React.createElement('article',null,content.name),
 '../../../lib/backendUrl':{getPublicBackendUrl:()=>''},
 '../../../lib/supabaseClient':{getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'owner'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
 '../../../lib/matchSessionContext':{useMatchSession:()=>({getSession:()=>({matched:[]})})},
 };
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../pages/jobs/[id]/cv.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??require(n),fetch,AbortController,Error,console});return module.exports.default;
}
test('stable job URL loads saved preview on refresh and regeneration failure preserves it',async()=>{
 const calls=[];const payload={job:{id:'123',title:'Developer',company:'Company'},cv:{job_id:'123',content:{name:'Applicant'},metadata:{}}};
 const Component=setup(async(url,options)=>{calls.push([url,options.method]);return {ok:options.method==='GET',status:options.method==='GET'?200:502,json:async()=>options.method==='GET'?payload:{error:'provider'}};});
 let view;await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findByType('article').children[0],'Applicant');
 assert.ok(view.root.findAllByType('a').some(a=>a.props.href==='/jobs/123'));
 await act(async()=>view.root.findByType('button').props.onClick());
 assert.equal(view.root.findByType('article').children[0],'Applicant');assert.ok(view.root.findByProps({role:'alert'}));
 assert.deepEqual(calls,[['/api/cvs/123','GET'],['/api/cvs/123/generate','POST']]);
 await act(async()=>view.unmount());await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(calls.at(-1)[0],'/api/cvs/123');assert.equal(view.root.findByType('article').children[0],'Applicant');
 await act(async()=>view.unmount());
});
test('a mismatched job response cannot populate the CV preview',async()=>{
 const Component=setup(async()=>({ok:true,json:async()=>({job:{id:'victim'},cv:null})}));let view;
 await act(async()=>{view=create(React.createElement(Component));});assert.equal(view.root.findAllByType('article').length,0);assert.ok(view.root.findByProps({role:'alert'}));await act(async()=>view.unmount());
});
