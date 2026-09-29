const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const templatesModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/cvTemplates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:templatesModule,exports:templatesModule.exports});
const moduleUnderTest={exports:{}};
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/downloadCv.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const languageModule={exports:{}};
const languageCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/cvDocumentLanguage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
vm.runInNewContext(languageCode,{module:languageModule,exports:languageModule.exports,require:n=>require(path.resolve(__dirname,'../lib',n))});
const pdfText=[];
const realJsPDF=require('jspdf').jsPDF;
const pdfModule={jsPDF:class {constructor(options){const pdf=new realJsPDF(options);const original=pdf.text.bind(pdf);pdf.text=(value,...args)=>{pdfText.push(value);return original(value,...args);};return pdf;}}};
vm.runInNewContext(code,{module:moduleUnderTest,exports:moduleUnderTest.exports,require:n=>n==='./cvTemplates'?templatesModule.exports:n==='./cvDocumentLanguage'?languageModule.exports:n==='jspdf'?pdfModule:require(n),Uint8Array,btoa,fetch});
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

test('CV preview and PDF include optional contact details as readable ATS text',async()=>{
 const React=require('react');const {create,act}=require('react-test-renderer');
 const previewModule={exports:{}};
 const previewCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/CvPreview.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(previewCode,{module:previewModule,exports:previewModule.exports,require:n=>n==='../lib/cvTemplates'?templatesModule.exports:n==='../lib/cvDocumentLanguage'?languageModule.exports:n==='next-i18next'?{useTranslation:()=>({t:k=>k})}:require(n)});
 const content={name:'Applicant',title:'Developer',location:'Malmö',contact:{email:'cv@example.com',phone:'+46 70 123 45 67',website:'https://portfolio.example',linkedin:'https://www.linkedin.com/in/applicant'},professionalSummary:[],skills:[],experience:[],education:[]};
 let view;await act(async()=>{view=create(React.createElement(previewModule.exports.default,{content}));});
 const links=view.root.findAllByType('a');assert.deepEqual(links.map(link=>link.children[0]),['cv@example.com','+46 70 123 45 67','https://portfolio.example','https://www.linkedin.com/in/applicant']);
 assert.equal(links[0].props.href,'mailto:cv@example.com');assert.equal(links[2].props.href,'https://portfolio.example');await act(async()=>view.unmount());
 const font=fs.readFileSync(path.join(__dirname,'../public/fonts/DejaVuSans.ttf')).toString('base64');pdfText.length=0;
 const pdf=buildCvPdf(content,font,k=>k);assert.ok(pdfText.some(value=>typeof value==='string'&&value.includes('cv@example.com')&&value.includes('linkedin.com')));assert.ok(pdf.output().startsWith('%PDF-'));
});

test('CV contact details are attached after generation and excluded from Gemini input',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../../backend/Cv/CvApplicationService.cs'),'utf8');
 const payload=controller.slice(controller.indexOf('var data = JsonSerializer.Serialize'),controller.indexOf('if (data.Length > 90000)'));
 assert.ok(payload.length > 100);
 assert.doesNotMatch(payload,/contact_email|phone|website_url|linkedin_url/);
 const content=fs.readFileSync(path.join(__dirname,'../../backend/Cv/CvContent.cs'),'utf8');
 for(const field of ['contact_email','phone','website_url','linkedin_url'])assert.match(content,new RegExp(`Text\\(profile, "${field}"\\)`));
});

test('CV headings and current-date labels use the ad language despite the opposite UI language',()=>{
 for(const language of ['en','sv']){
  const target=require('../public/locales/'+language+'/common.json').cv;
  const other=require('../public/locales/'+(language==='en'?'sv':'en')+'/common.json').cv;
  const t=languageModule.exports.cvDocumentT({language},k=>other[k.slice(3)]);
  for(const key of ['summary','skills','experience','education','present','preview'])assert.equal(t('cv.'+key),target[key]);
 }
 assert.equal(languageModule.exports.cvDocumentT({},k=>'legacy:'+k)('cv.summary'),'legacy:cv.summary');
});
test('PDF and preview consume the document language with an opposite UI locale',async()=>{
 const React=require('react');const {create,act}=require('react-test-renderer');
 const previewModule={exports:{}};
 const previewCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/CvPreview.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const language of ['en','sv']){
  const target=require('../public/locales/'+language+'/common.json').cv;
  const other=require('../public/locales/'+(language==='en'?'sv':'en')+'/common.json').cv;
  const uiT=k=>other[k.slice(3)]||k;
  vm.runInNewContext(previewCode,{module:previewModule,exports:previewModule.exports,require:n=>n==='../lib/cvTemplates'?templatesModule.exports:n==='../lib/cvDocumentLanguage'?languageModule.exports:n==='next-i18next'?{useTranslation:()=>({t:uiT})}:require(n)});
  const content={language,name:'Applicant',title:'Developer',location:'Malmö',professionalSummary:[{text:'Summary',sourceFactId:'p'}],skills:['C#'],experience:[{sourceId:'w',title:'Developer',organization:'Sigma',qualification:'',startMonth:'2024-01',endMonth:'',isCurrent:true,bullets:[]}],education:[]};
  let view;await act(async()=>{view=create(React.createElement(previewModule.exports.default,{content}));});
  assert.equal(view.root.findByType('article').props.lang,language);
  assert.deepEqual(view.root.findAllByType('h2').map(h=>h.children[0]),[target.summary,target.skills,target.experience]);
  assert.ok(JSON.stringify(view.toJSON()).includes(target.present));await act(async()=>view.unmount());
  const font=fs.readFileSync(path.join(__dirname,'../public/fonts/DejaVuSans.ttf')).toString('base64');
  pdfText.length=0;
  const pdf=buildCvPdf(content,font,uiT);
  for(const key of ['summary','skills','experience'])assert.ok(pdfText.includes(target[key]));
  assert.ok(pdfText.some(value=>typeof value==='string'&&value.includes(target.present)));
  assert.ok(!pdfText.includes(other.summary));
  assert.ok(pdf.output().startsWith('%PDF-'));
 }
});

test('all CV templates preserve text order, paginate long entries and retain final content',()=>{
 const font=fs.readFileSync(path.join(__dirname,'../public/fonts/DejaVuSans.ttf')).toString('base64');
 const content={language:'en',name:'Åsa Öberg',title:'Developer',location:'Malmö',professionalSummary:[{text:'Built reliable services.'}],skills:['C#','SQL'],experience:[{title:'Developer',organization:'Sigma',qualification:'',startMonth:'2024-01',endMonth:'',isCurrent:true,bullets:Array.from({length:80},(_,i)=>({text:'Task '+i+': Developed and tested services with colleagues. Documented systems for long-term maintenance.'}))}],education:[{title:'Software development',organization:'School',qualification:'Diploma',startMonth:'2020-01',endMonth:'2023-01',isCurrent:false,bullets:[{text:'FINAL EDUCATION DETAIL'}]}]};
 const before=JSON.stringify(content);const documents=[];
 for(const template of templatesModule.exports.cvTemplateIds){
  pdfText.length=0;const pdf=buildCvPdf(content,font,k=>k,template);
  assert.ok(pdf.getNumberOfPages()>1);assert.ok(pdfText.some(text=>typeof text==='string' && text.includes('FINAL EDUCATION DETAIL')));
  assert.ok(pdfText.indexOf('Work experience')<pdfText.indexOf('Education'));
  assert.equal(pdfText[0],content.name);assert.equal(JSON.stringify(content),before);
  documents.push(pdf.output());
 }
 assert.equal(documents.length,4);assert.equal(new Set(documents).size,4);
});

test('cover-letter PDF retains Swedish text, paragraph order and the final line over multiple pages',()=>{
 const letterModule={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/downloadCoverLetter.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(code,{module:letterModule,exports:letterModule.exports,require:n=>n==='jspdf'?pdfModule:n==='./downloadCv'?moduleUnderTest.exports:require(n)});
 const font=fs.readFileSync(path.join(__dirname,'../public/fonts/DejaVuSans.ttf')).toString('base64');
 pdfText.length=0;
 const letter=Array.from({length:90},(_,i)=>`Stycke ${i}: Jag utvecklade tjänster i Göteborg och lärde mig SQL.`).join('\n\n')+'\nSISTA RADEN ÅÄÖ';
 const pdf=letterModule.exports.buildCoverLetterPdf(letter,'Utvecklare','Företag',font);
 assert.ok(pdf.getNumberOfPages()>1);assert.equal(pdfText[0],'Utvecklare');
 assert.ok(pdfText.includes('SISTA RADEN ÅÄÖ'));assert.ok(pdf.output().startsWith('%PDF-'));
});
