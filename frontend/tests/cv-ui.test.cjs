const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
const templatesModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/cvTemplates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:templatesModule,exports:templatesModule.exports});
function setup(fetch){
 const mocks={
 '../../../lib/cvTemplates':templatesModule.exports,
 'next/router':{useRouter:()=>({query:{id:'123'},isReady:true})},
 'next-i18next':{useTranslation:()=>({t:k=>k})},'next-i18next/serverSideTranslations':{},
 'next/link':({href,children})=>React.createElement('a',{href},children),
 '../../../components/ui/button':{Button:props=>React.createElement('button',props)},
 '../../../components/CvTemplateThumbnail':({template,name})=>React.createElement('div',{'data-thumbnail':template},name),
 '../../../components/AiGenerationConsent':({onConfirm,onClose})=>React.createElement('section',{role:'dialog'},React.createElement('button',{onClick:onConfirm},'confirm'),React.createElement('button',{onClick:onClose},'cancel')),'../../../components/CvPreview':({content,template})=>React.createElement('article',{'data-template':template},content.name),
 '../../../lib/backendUrl':{getPublicBackendUrl:()=>''},
 '../../../lib/supabaseClient':{getSupabaseBrowserClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token',user:{id:'owner'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
 '../../../lib/matchSessionContext':{useMatchSession:()=>({getSession:()=>({matched:[]})})},
 };
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../pages/jobs/[id]/cv.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??require(n),fetch,AbortController,Error,console});return module.exports.default;
}
test('saved CV returns after remount; consent precedes generation and failures preserve preview',async()=>{
 const calls=[];let attempts=0;const job={id:'123',title:'Developer',company:'Company'};
 const saved={job_id:'123',content:{name:'Jonas Axelsson',omittedUnsupportedContent:true},metadata:{},expires_at:'2026-09-25T12:00:00Z'};
 const Component=setup(async(url,options)=>{calls.push([url,options.method]);const generate=options.method==='POST';if(generate)attempts++;return {ok:!generate||attempts===1,status:502,json:async()=>!generate?{job,cv:attempts?saved:null}:attempts===1?{job,cv:saved}:{error:'provider'}};});
 let view;await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('article').length,0);
 const generate=()=>view.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&['cv.generate','cv.regenerate'].includes(c)));
 await act(async()=>generate().props.onClick());assert.equal(calls.length,1);
 await act(async()=>view.root.findByProps({role:'dialog'}).findAllByType('button')[0].props.onClick());
 const requestsBeforeStyle=calls.length;
 assert.equal(view.root.findAllByProps({type:'radio'}).length,4);
 assert.ok(view.root.findByProps({'data-testid':'cv-template-gallery'}).props.className.includes('overflow-x-auto'));
 for(const style of ['nordic','professional','accent','elegant']){
  await act(async()=>view.root.findByProps({type:'radio',value:style}).props.onChange());
  assert.equal(view.root.findByType('article').props['data-template'],style);
  assert.equal(calls.length,requestsBeforeStyle);
 }
 assert.deepEqual(view.root.findAll(node=>node.props['data-template-card']).map(node=>node.props['data-template-card']),['elegant','nordic','professional','accent']);
 assert.equal(view.root.findByType('article').children[0],'Jonas Axelsson');assert.equal(view.root.findByProps({'data-testid':'cv-omissions'}).children[0],'cv.omissions');
 await act(async()=>generate().props.onClick());
 await act(async()=>view.root.findByProps({role:'dialog'}).findAllByType('button')[0].props.onClick());
 assert.equal(view.root.findByType('article').children[0],'Jonas Axelsson');assert.ok(view.root.findByProps({role:'alert'}));
 await act(async()=>view.unmount());await act(async()=>{view=create(React.createElement(Component));});
 assert.equal(view.root.findAllByType('article').length,1);assert.equal(calls.at(-1)[1],'GET');await act(async()=>view.unmount());
});
test('a mismatched job response cannot populate the CV preview',async()=>{
 const Component=setup(async()=>({ok:true,json:async()=>({job:{id:'victim'},cv:null})}));let view;
 await act(async()=>{view=create(React.createElement(Component));});assert.equal(view.root.findAllByType('article').length,0);assert.ok(view.root.findByProps({role:'alert'}));await act(async()=>view.unmount());
});
