const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const moduleUnderTest={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/downloadCv.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(code,{module:moduleUnderTest,exports:moduleUnderTest.exports,require,Uint8Array,btoa,fetch});
const {cvFilename,buildCvPdf}=moduleUnderTest.exports;
test('PDF filenames preserve full names and safely normalize company names',()=>{
 assert.equal(cvFilename('Jonas Axelsson','sigma',1),'Jonas_Axelsson_sigma_1.pdf');
 assert.equal(cvFilename('Åsa Öberg','Sigma / IT: AB',2),'Åsa_Öberg_Sigma_IT_AB_2.pdf');
 assert.equal(cvFilename('','../',0),'CV_company_1.pdf');
 assert.ok(!cvFilename('a'.repeat(200),'b'.repeat(200),1).includes('/'));
});
test('long text-based CV exports across pages with an embedded Swedish font',()=>{
 const font=fs.readFileSync(path.join(__dirname,'../public/fonts/DejaVuSans.ttf')).toString('base64');
 const content={name:'Jonas Axelsson',title:'.NET-utvecklare',location:'Göteborg',professionalSummary:[{text:'Utvecklare med erfarenhet av säkra tjänster och användarvänliga system.'}],skills:['C#','.NET','SQL'],experience:[{title:'Utvecklare',organization:'Sigma',qualification:'',startMonth:'2023-01',endMonth:'',isCurrent:true,bullets:Array.from({length:70},(_,i)=>({text:`${i+1}. Utvecklade och testade tjänster tillsammans med teamet. Dokumenterade lösningar för långsiktigt underhåll.`}))}],education:[]};
 const doc=buildCvPdf(content,font,k=>({'cv.summary':'Profil','cv.skills':'Kompetenser','cv.experience':'Arbetslivserfarenhet','cv.education':'Utbildning','cv.present':'Pågående'}[k]||k));
 assert.ok(doc.getNumberOfPages()>1);assert.ok(doc.output().startsWith('%PDF-'));
 if(process.env.CV_PDF_FIXTURE)fs.writeFileSync(process.env.CV_PDF_FIXTURE,Buffer.from(doc.output('arraybuffer')));
});
