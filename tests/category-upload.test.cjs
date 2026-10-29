const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
(async()=>{
const nodes=new Map(),created=[];const node=s=>{if(!nodes.has(s))nodes.set(s,{value:'',textContent:'',style:{},checked:true,accept:'.pdf,.txt',scrollHeight:0});return nodes.get(s)};
const ctx={window:{PDFLib:{}},pdfjsLib:{GlobalWorkerOptions:{}},document:{querySelector:node,body:{appendChild(){}},createElement(type){const el={type,setAttribute(){},remove(){this.removed=true},click(){this.clicked=true}};created.push(el);return el}},console,Date,crypto,Promise,Array};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('app1.js','utf8'),ctx);
const source=fs.readFileSync('app2.js','utf8');const start=source.indexOf('  function classifyRebateItem('),end=source.indexOf('  // Pratonton fail asal');vm.runInContext(source.slice(start,end)+source.slice(source.indexOf('  function chooseCategoryFiles('),source.indexOf('  function render(){')),ctx);
vm.runInContext(`render=()=>{};makeSourceThumbnail=()=>{};globalThis.testApi={addFiles,analyzeAll,changeCat,chooseCategoryFiles,setParty:p=>activeParty=p,getItems:()=>items,categoriesFor};`,ctx);
const api=ctx.testApi,file=(name,text='')=>({name,size:10,text:async()=>text});
for(const party of ['HIRER','GUARANTOR','REBATE','TRADEIN'])for(const cat of api.categoriesFor(party)){
const added=await api.addFiles([file('bank statement.txt','bank statement account number')],{party,category:cat.id});assert.equal(added[0].party,party);assert.equal(added[0].category,cat.id);assert.equal(added[0].manualCategory,true);await api.analyzeAll(true,party);assert.equal(added[0].category,cat.id,'force analysis preserves explicit category');
}
api.setParty('HIRER');const regular=await api.addFiles([file('bank statement.txt')]);assert.equal(regular[0].category,'BANK');assert.equal(regular[0].manualCategory,false);api.changeCat(regular[0].id,'IC');await api.analyzeAll(true,'HIRER');assert.equal(regular[0].category,'IC');
const count=api.getItems().length;api.chooseCategoryFiles('TRADEIN','GERAN');const chooser=created.at(-1);assert.ok(chooser.clicked);assert.ok(chooser.multiple);chooser.files=[file('chosen-payslip.txt')];api.setParty('GUARANTOR');chooser.onchange();await new Promise(r=>setTimeout(r,20));const chosen=api.getItems().find(x=>x.file.name==='chosen-payslip.txt');assert.equal(chosen.party,'TRADEIN');assert.equal(chosen.category,'GERAN');assert.equal(api.getItems().length,count+1);assert.ok(chooser.removed);
api.chooseCategoryFiles('REBATE','SIJIL_LAHIR');created.at(-1).oncancel();assert.ok(created.at(-1).removed);assert.equal(api.getItems().length,count+1);
const rejected=await api.addFiles([file('bad.exe')],{party:'TRADEIN',category:'IC'});assert.equal(rejected.length,0);
console.log('PASS direct uploads: all categories and four sections, forced analysis respects selection, generic classification retained, manual recategorization, chooser snapshot, cancel and rejected formats');
})().catch(e=>{console.error(e);process.exitCode=1});
