const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');

test('extracted search hook preserves filters and rejects an older response after a newer search',async()=>{
 const requests=[];let model;const module={exports:{}};const t=key=>key;
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../features/jobs/useJobSearch.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,URLSearchParams,console,Error,
  setTimeout:()=>1,clearTimeout(){},fetch:url=>url.includes('/occupations')?Promise.resolve({ok:true,json:async()=>[]}):new Promise(resolve=>requests.push({url,resolve})),
  require:name=>name==='react'?React:name==='next-i18next'?{useTranslation:()=>({t})}:name.endsWith('/backendUrl')?{getPublicBackendUrl:()=>''}:require(name),
 });
 function Probe(){model=module.exports.useJobSearch();return null;}
 let view;await act(async()=>{view=create(React.createElement(Probe));});
 assert.equal(requests.length,1);
 await act(async()=>model.update({remote:true,regions:['Skåne']}));
 assert.equal(requests.length,2);assert.match(requests[1].url,/remote=true/);assert.match(requests[1].url,/region=Sk/);
 const response=id=>({ok:true,text:async()=>JSON.stringify({hits:[{id,headline:id}],total:{value:1}})});
 await act(async()=>requests[1].resolve(response('new')));
 await act(async()=>requests[0].resolve(response('old')));
 assert.equal(model.filteredJobs[0].id,'new');assert.equal(model.loading,false);assert.equal(model.filters.remote,true);
 await act(async()=>view.unmount());
});
