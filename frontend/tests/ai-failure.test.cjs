const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const loaded={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/aiFailure.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:loaded,exports:loaded.exports});
const {aiFailureCode}=loaded.exports;
test('letter errors distinguish configuration, quota and consent with both response shapes',()=>{
 assert.equal(aiFailureCode({error:'configuration'},502),'configuration');
 assert.equal(aiFailureCode([{error:'quota'}],200),'quota');
 assert.equal(aiFailureCode({error:'consentOrQuota'},429),'consentOrQuota');
 assert.equal(aiFailureCode(null,401),'authentication');
 assert.equal(aiFailureCode(null,429),'quota');
 assert.equal(aiFailureCode(null,504),'timeout');
});
test('arbitrary upstream error text is never used as a message or translation key',()=>{
 for(const body of [null,{},[],{error:'PRIVATE KEY'},[{error:'<script>secret</script>'}]]) assert.equal(aiFailureCode(body,502),'provider');
 for(const lang of ['en','sv']) {
  const messages=JSON.parse(fs.readFileSync(path.join(__dirname,`../public/locales/${lang}/common.json`),'utf8')).consent.errors;
  for(const code of ['configuration','authentication','quota','consentOrQuota','timeout','invalidOutput','provider']) assert.ok(messages[code]);
 }
});
