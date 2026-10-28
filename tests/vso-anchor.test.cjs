const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),PDFLib=require('pdf-lib');
(async()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('vso-variants.js','utf8'),ctx);const api=ctx.window.VSO_VARIANTS;
 for(const kind of ['AUTO','PLAIN','MARKUP'])for(const [loan,otr] of [[60000,75800],[68220,75800],[68220.01,75800.01],[72800,80888.89],[75800,84222.22]]){
  const r=api.calculate(loan,kind);assert.equal(r.otr,otr);assert.equal(r.loanLimit,68220);assert.equal(r.anchorPrice,75800);assert.equal(r.net,Math.round((otr-3708)*100)/100);assert.equal(r.adjusted,loan>68220);
 }
 for(const v of api.list){
  const limit=v.baseOtr*.9;for(const loan of [0,Math.round((limit-1)*100)/100,Math.round(limit*100)/100,Math.round((limit+.01)*100)/100,limit+10000]){
   const r=api.calculate(loan,'AUTO',v.id);assert.ok(r.otr>=v.baseOtr);assert.equal(r.otr,loan<=limit?v.baseOtr:Math.round(loan/.9*100)/100);assert.equal(r.feeTotal,api.charges(v));
  }
 }
 for(const input of [NaN,Infinity,-1,1e20])assert.ok(Number.isNaN(api.calculate(input).otr));
 const bot=fs.readFileSync('supabase/functions/lead-hub-telegram/index.ts','utf8'),texts=[];
 const context={...PDFLib,console,Number,VARIANTS:Object.fromEntries(api.list.map(v=>[v.id,{label:v.model,base:v.baseOtr,fees:api.charges(v)}])),PDFDocument:{async create(){
  const doc=await PDFLib.PDFDocument.create(),addPage=doc.addPage.bind(doc);doc.addPage=(size)=>{const p=addPage(Array.from(size)),draw=p.drawText.bind(p);p.drawText=(text,options)=>{texts.push(text);return draw(text,options)};const line=p.drawLine.bind(p);p.drawLine=o=>line({...o,start:{...o.start},end:{...o.end}});return p};return doc;
 }}};vm.createContext(context);
 const functions=bot.slice(bot.indexOf('function safePdfText('),bot.indexOf('async function cover('))+bot.slice(bot.indexOf('async function makeVSO('),bot.indexOf('const vsoSteps='));vm.runInContext(stripTypeScriptTypes(functions),context);
 for(const kind of ['AUTO','PLAIN','MARKUP'])for(const loan of [60000,68220,72800,80000]){
  texts.length=0;const bytes=await context.makeVSO({name:'Customer Test',ic:'000101010001',phone:'0100000001',variant:'EMAS5_PREMIUM_2026',year:'2026',color:'Hijau',loan,address:'Jalan Ujian',mode:kind},'Test Advisor');assert.ok(bytes.length>1000);
  const expected=api.calculate(loan,kind),money=n=>'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
  for(const [label,value] of [['Harga OTR (anggaran)',expected.otr],['Harga Bersih (anggaran)',expected.net],['Anchor Price (100%)',75800],['Had Loan (90%)',68220]])assert.equal(texts[texts.indexOf(label)+1],money(value));
 }
 console.log('PASS anchor 90%: user examples, exact boundary/+1 sen, all 5 variants, cent rounding, fixed fees, invalid inputs and real Telegram PDFs in AUTO/legacy modes');
})().catch(e=>{console.error(e);process.exitCode=1});
