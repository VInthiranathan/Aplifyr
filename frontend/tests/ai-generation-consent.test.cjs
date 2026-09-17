const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
const t=k=>k;
function load(file,mocks,fetch){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n]??require(n),fetch,AbortController});return module.exports.default;}
async function setup(data,writeOk=true){
 const requests=[];let confirms=0,closes=0;
 const mocks={'next-i18next':{useTranslation:()=>({t})},'next/router':{useRouter:()=>({locale:'en'})},'next/link':({children,...props})=>React.createElement('a',props,children),'./ui/button':{Button:props=>React.createElement('button',props)},'../lib/useDialogFocus':{useDialogFocus:()=>({current:null})}};
 const request=async(url,options)=>{requests.push(options?.method??'GET');if(options?.method==='PUT'&&writeOk){const body=JSON.parse(options.body);data={...data,consents:[{provider:body.provider,notice_version:body.version,granted:body.granted}]};}return {ok:options?.method!=='PUT'||writeOk,json:async()=>data};};
 const Consent=load('AiConsent.tsx',mocks,request);
 const Dialog=load('AiGenerationConsent.tsx',{...mocks,'./AiConsent':Consent},request);let view;
 await act(async()=>{view=create(React.createElement(Dialog,{onConfirm:()=>confirms++,onClose:()=>closes++}));});
 return {view,requests,confirmed:()=>confirms,closed:()=>closes,continue:()=>view.root.findAllByType('button').find(b=>b.children.includes('consent.continueGeneration'))};
}
const notice={provider:'gemini',version:'v2',enabled:true,notice_en:'Reviewed notice',notice_sv:'Granskad text'};
test('generation requires saved consent and explicit continue; double click submits once',async()=>{
 const s=await setup({notices:[notice],consents:[]});assert.equal(s.continue().props.disabled,true);assert.equal(s.confirmed(),0);
 await act(async()=>s.view.root.findByType('input').props.onChange({target:{checked:true}}));assert.equal(s.continue().props.disabled,false);assert.equal(s.confirmed(),0);
 await act(async()=>{s.continue().props.onClick();s.continue().props.onClick();});assert.equal(s.confirmed(),1);assert.deepEqual(s.requests,['GET','PUT']);await act(async()=>s.view.unmount());
});
test('current saved consent starts generation without reopening the dialog',async()=>{
 const s=await setup({notices:[notice],consents:[{provider:'gemini',notice_version:'v2',granted:true}]});
 assert.equal(s.confirmed(),1);assert.equal(s.view.root.findAllByProps({role:'dialog'}).length,0);assert.deepEqual(s.requests,['GET']);
 await act(async()=>s.view.unmount());
});
test('disabled notice, stale consent and failed write never authorize generation',async()=>{
 for(const [data,writeOk,toggle] of [
 [{notices:[{...notice,enabled:false}],consents:[]},true,null],
 [{notices:[notice],consents:[{provider:'gemini',notice_version:'v1',granted:true}]},true,null],
 [{notices:[notice],consents:[]},false,true],
 ]){const s=await setup(data,writeOk);if(toggle!==null)await act(async()=>s.view.root.findByType('input').props.onChange({target:{checked:toggle}}));assert.equal(s.continue().props.disabled,true);await act(async()=>s.continue().props.onClick());assert.equal(s.confirmed(),0);await act(async()=>s.view.unmount());}
});
test('cancel never grants consent or starts generation',async()=>{const s=await setup({notices:[notice],consents:[]});await act(async()=>s.view.root.findAllByType('button')[0].props.onClick());assert.equal(s.closed(),1);assert.equal(s.confirmed(),0);assert.deepEqual(s.requests,['GET']);await act(async()=>s.view.unmount());});
