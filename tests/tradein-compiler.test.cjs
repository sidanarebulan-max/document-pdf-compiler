const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),PDFLib=require('pdf-lib');
(async()=>{
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,textContent:'',style:{},scrollHeight:0});return nodes.get(id)};
const alerts=[],processed=[],ctx={window:{PDFLib:{...PDFLib,PDFDocument:{...PDFLib.PDFDocument,async create(){const doc=await PDFLib.PDFDocument.create(),addPage=doc.addPage.bind(doc);doc.addPage=size=>{const page=addPage(Array.isArray(size)?Array.from(size):size),drawLine=page.drawLine.bind(page);page.drawLine=o=>drawLine({...o,start:{...o.start},end:{...o.end}});return page};return doc}}},FARIS_GENERATED:{clear(){},publish(){}}},pdfjsLib:{GlobalWorkerOptions:{}},document:{querySelector:node},console,Blob,URL,Date,setTimeout,alert:s=>alerts.push(s)};
ctx.window.testLoad=PDFLib.PDFDocument.load.bind(PDFLib.PDFDocument);vm.createContext(ctx);vm.runInContext(fs.readFileSync('app1.js','utf8'),ctx);
const a2=fs.readFileSync('app2.js','utf8');vm.runInContext(a2.slice(a2.indexOf('  function classifyRebateItem('),a2.indexOf('  async function analyzeItem('))+a2.slice(a2.indexOf('  function sortedPartyItems('),a2.indexOf('  function sortParty(')),ctx);
const a4=fs.readFileSync('app4.js','utf8');vm.runInContext(a4.slice(0,a4.indexOf('  async function renderPreviewPage('))+a4.slice(a4.indexOf('  function cleanOutputName('),a4.indexOf("  document.querySelectorAll('.party-tab')")),ctx);
ctx.record=x=>processed.push(x);
vm.runInContext(`
 renderFinalPreview=async()=>1;
 appendItem=async(item,doc)=>{record(item.party+':'+item.category);const src=await window.testLoad(item.bytes);const pages=await doc.copyPages(src,src.getPageIndices());pages.forEach(p=>doc.addPage(p))};
 globalThis.testApi={categories:categoriesFor('TRADEIN'),selectedParties,classifyTradeinItem,sort:()=>sortedPartyItems('TRADEIN'),generate,filename:safeFilename,setItems:x=>items=x,getBlob:()=>finalBlob};
`,ctx);
const api=ctx.testApi;
assert.deepEqual(Array.from(api.categories,c=>c.id),['IC','LESEN','EAUTO','GERAN','SIJIL_LAHIR','SIJIL_NIKAH','OTHER']);assert.ok(api.categories.every(c=>c.info));
for(const [name,expected] of [['e-auto.pdf','EAUTO'],['geran kereta.pdf','GERAN'],['VOC.pdf','GERAN'],['sijil lahir adik.pdf','SIJIL_LAHIR'],['sijil nikah.pdf','SIJIL_NIKAH'],['lesen.pdf','LESEN'],['IC depan.jpg','IC'],['tambahan.txt','OTHER']])assert.equal(api.classifyTradeinItem(name,'').category,expected);
assert.deepEqual(Array.from(api.selectedParties('ALL')),['HIRER','GUARANTOR','REBATE','TRADEIN']);assert.deepEqual(Array.from(api.selectedParties('TRADEIN_ONLY')),['TRADEIN']);
const source=await PDFLib.PDFDocument.create();source.addPage().drawText('TEST TRADE IN');const bytes=await source.save();
const item=(party,category,order=0)=>({id:party+category,file:{name:category+'.pdf'},bytes,party,category,order,pages:1});
node('#compileScope').value='TRADEIN_ONLY';
for(const cat of api.categories){processed.length=0;api.setItems([item('TRADEIN',cat.id)]);await api.generate();assert.deepEqual(processed,['TRADEIN:'+cat.id]);assert.equal((await PDFLib.PDFDocument.load(await api.getBlob().arrayBuffer())).getPageCount(),1)}
processed.length=0;api.setItems(api.categories.map((c,i)=>item('TRADEIN',c.id,6-i)));await api.generate();assert.deepEqual(processed,Array.from(api.categories,c=>'TRADEIN:'+c.id));
const all=[item('HIRER','IC'),item('GUARANTOR','IC'),item('REBATE','SIJIL_NIKAH'),item('TRADEIN','GERAN')];api.setItems(all);
for(const [scope,expected,pages] of [['ALL',['HIRER:IC','GUARANTOR:IC','REBATE:SIJIL_NIKAH','TRADEIN:GERAN'],7],['STANDARD',['HIRER:IC','GUARANTOR:IC'],3],['REBATE_ONLY',['REBATE:SIJIL_NIKAH'],1],['TRADEIN_ONLY',['TRADEIN:GERAN'],1]]){
node('#compileScope').value=scope;processed.length=0;await api.generate();assert.deepEqual(processed,expected);assert.equal((await PDFLib.PDFDocument.load(await api.getBlob().arrayBuffer())).getPageCount(),pages);
}
assert.equal(api.filename('TRADEIN_ONLY'),'Trade in.pdf');assert.equal(alerts.length,0,alerts.join('\n'));
console.log('PASS Trade in: every category exports alone, all optional, classification, sorting, four scopes, combined cover pages and filename');
})().catch(e=>{console.error(e);process.exitCode=1});
