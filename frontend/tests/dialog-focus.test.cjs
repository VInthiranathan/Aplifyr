const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');const React=require('react');const {create,act}=require('react-test-renderer');
test('dialogs trap Tab in both directions, handle Escape and restore focus',async()=>{
 const listeners={};const doc={activeElement:null,addEventListener(k,fn){listeners[k]=fn;},removeEventListener(k){delete listeners[k];}};
 const node=()=>({isConnected:true,focus(){doc.activeElement=this;},getClientRects:()=>[{}]});
 const previous=node(),first=node(),last=node();doc.activeElement=previous;
 const panel={...node(),querySelectorAll:()=>[first,last],contains:n=>[panel,first,last].includes(n)};
 const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/useDialogFocus.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require,document:doc});let closed=0;
 function App({open}){const ref=module.exports.useDialogFocus(open,()=>closed++);return React.createElement('div',{ref});}
 let view;await act(async()=>{view=create(React.createElement(App,{open:true}),{createNodeMock:()=>panel});});assert.equal(doc.activeElement,first);
 listeners.keydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(doc.activeElement,last);
 listeners.keydown({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(doc.activeElement,first);
 listeners.focusin({target:previous});assert.equal(doc.activeElement,first);
 listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(closed,1);
 await act(async()=>view.update(React.createElement(App,{open:false})));assert.equal(doc.activeElement,previous);assert.equal(Object.keys(listeners).length,0);
 await act(async()=>view.unmount());
});
