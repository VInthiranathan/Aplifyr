const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const moduleValue={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/readApplications.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleValue,exports:moduleValue.exports,TextEncoder,Error});
const {readApplications,readApplicationStatuses}=moduleValue.exports;
function client(rows,{repeat=false,fail=false}={}) {
 const seen=[];let cursor='';const q={select(){return this;},eq(k,v){seen.push([k,v]);return this;},order(){return this;},limit(){return this;},gt(_k,v){cursor=v;return this;},then(resolve){
  return Promise.resolve({data:repeat?rows.slice(0,3):rows.filter(r=>r.job_id>cursor).slice(0,3),error:fail?{}:null}).then(resolve);
 }};return {from:()=>q,seen};
}
test('all 601 applications and statuses survive a hosted three-row page size',async()=>{
 const rows=Array.from({length:601},(_,i)=>({job_id:String(i).padStart(5,'0'),status:'applied',updated_at:'2026-09-26T00:00:00Z'}));
 for(const reader of [readApplications,readApplicationStatuses]) {const c=client(rows);const result=await reader(c,'owner');assert.equal(result.length,601);assert.ok(c.seen.every(([k,v])=>k==='user_id'&&v==='owner'));}
});
test('pagination fails explicitly on repeated cursors or database failure',async()=>{
 await assert.rejects(readApplications(client([{job_id:'job',updated_at:''}],{repeat:true}),'owner'),/cursor/);
 await assert.rejects(readApplications(client([],{fail:true}),'owner'),/unavailable/);
});

test('account export includes 601 applications using verified owner despite a supplied victim id',async()=>{
 const rows=Array.from({length:601},(_,i)=>({job_id:String(i).padStart(5,'0'),status:'applied',updated_at:'2026-09-26T00:00:00Z'}));
 const c=client(rows);const from=c.from;
 c.auth={getUser:async()=>({data:{user:{id:'owner',email:'synthetic@example.test'}},error:null})};
 c.rpc=async()=>({data:{},error:null});
 c.from=table=>table==='profiles'?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'owner'},error:null})}:from(table);
 const value={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../pages/api/account/export.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  module:value,exports:value.exports,Date,Error,require(name){
   if(name.endsWith('/serverSupabase'))return {serverSupabase:()=>c};
   if(name.endsWith('/readApplications'))return {readApplications};
   if(name.endsWith('/readCareerEntries'))return {readCareerEntries:async()=>[]};
   if(name.endsWith('/readGeneratedCvs'))return {readGeneratedCvs:async()=>[]};
   if(name.endsWith('/readGeneratedCoverLetters'))return {readGeneratedCoverLetters:async()=>[]};
   throw Error(name);
  },
 });
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;}};
 await value.exports.default({method:'GET',query:{id:'victim'}},res);
 assert.equal(res.code,200);assert.equal(res.body.jobApplications.length,601);
 assert.equal(res.body.account.id,'owner');assert.ok(c.seen.every(([k,v])=>k==='user_id'&&v==='owner'));
 assert.equal(res.headers['Cache-Control'],'private, no-store');
});
