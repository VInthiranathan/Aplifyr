const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
function setup(fetch){
 const mocks={
 'next/router':{useRouter:()=>({query:{id:'123'},isReady:true})},
 'next-i18next':{useTranslation:()=>({t:k=>k})},'next-i18next/serverSideTranslations':{},
 'next/link':({href,children})=>React.createElement('a',{href},children),
 '../../../components/ui/button':{Button:props=>React.createElement('button',props)},
 '../../../components/AiGenerationConsent':({onConfirm,onClose})=>React.createElement('section',{role:'dialog'},React.createElement('button',{onClick:onConfirm},'confirm'),React.createElement('button',{onClick:onClose},'cancel')),'../../../components/CvPreview':({content})=>React.createElement('article',null,content.name),
 '../../../lib/backendUrl':{getPublicBackendUrl:()=>''},
 '../../../lib/supabaseClient':{getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'owner'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
 '../../../lib/matchSessionContext':{useMatchSession:()=>({getSession:()=>({matched:[]})})},
 };
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../pages/jobs/[id]/cv.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??require(n),fetch,AbortController,Error,console});return module.exports.default;
}
test('CV stays only in the current page; consent precedes generation and failures preserve preview',async()=>{
 const calls=[];let attempts=0;const job={id:'123',title:'Developer',company:'Company'};
 const Component=setup(async(url,options)=>{calls.push([url,options.method]);const generate=options.method==='POST';if(generate)attempts++;return {ok:!generate||attempts===1,status:502,json:async()=>!generate?{job,cv:null}:attempts===1?{job,cv:{job_id:'123',content:{name:'Jonas Axelsson'},metadata:{}}}:{error:'provider'}};});
 let view;await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('article').length,0);
 const generate=()=>view.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&['cv.generate','cv.regenerate'].includes(c)));
 await act(async()=>generate().props.onClick());assert.equal(calls.length,1);
 await act(async()=>view.root.findByProps({role:'dialog'}).findAllByType('button')[0].props.onClick());
 assert.equal(view.root.findByType('article').children[0],'Jonas Axelsson');
 await act(async()=>generate().props.onClick());
 await act(async()=>view.root.findByProps({role:'dialog'}).findAllByType('button')[0].props.onClick());
 assert.equal(view.root.findByType('article').children[0],'Jonas Axelsson');assert.ok(view.root.findByProps({role:'alert'}));
 await act(async()=>view.unmount());await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('article').length,0);assert.equal(calls.at(-1)[1],'GET');await act(async()=>view.unmount());
});
test('a mismatched job response cannot populate the CV preview',async()=>{
 const Component=setup(async()=>({ok:true,json:async()=>({job:{id:'victim'},cv:null})}));let view;
 await act(async()=>{view=create(React.createElement(Component));});assert.equal(view.root.findAllByType('article').length,0);assert.ok(view.root.findByProps({role:'alert'}));await act(async()=>view.unmount());
});
