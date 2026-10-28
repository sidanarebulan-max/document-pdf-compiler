const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module'),PDFLib=require('pdf-lib');
(async()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('vso-variants.js','utf8'),ctx);const api=ctx.window.VSO_VARIANTS;
 assert.equal(api.list.length,7);
 for(const [id,anchor,net,fees,insurance] of [['EMAS7_PHEV_PRIME_2026',113611,109430,4181,3811],['EMAS7_PHEV_PREMIUM_2026',127995,123430,4565,4195]]){
  const v=api.get(id);assert.equal(v.id,id);assert.equal(v.baseOtr,anchor);assert.equal(v.baseNet,net);assert.equal(api.charges(v),fees);assert.equal(v.fees.insurance,insurance);assert.equal(v.fees.handling,null);assert.equal(api.calculate(80000,'AUTO',id).net,net);
 }
 const handoff=fs.readFileSync('staff-handoff.js','utf8'),match=vm.runInNewContext(handoff.slice(handoff.indexOf('function variantId('),handoff.indexOf('function warn('))+';variantId');
 for(const v of api.list)assert.equal(match(v.display),v.id);
 assert.equal(match('e.MAS 7 PHEV'),null);assert.equal(match('e.MAS 7 PHEV Premium Plus'),'EMAS7_PHEV_PREMIUM_PLUS_2026');
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
 const context={...PDFLib,console,Number,PDFDocument:{async create(){
  const doc=await PDFLib.PDFDocument.create(),addPage=doc.addPage.bind(doc);doc.addPage=(size)=>{const p=addPage(Array.from(size)),draw=p.drawText.bind(p);p.drawText=(text,options)=>{texts.push(text);return draw(text,options)};const line=p.drawLine.bind(p);p.drawLine=o=>line({...o,start:{...o.start},end:{...o.end}});return p};return doc;
 }}};vm.createContext(context);
 const functions=bot.slice(bot.indexOf('const VARIANTS:'),bot.indexOf('function categoryByName('))+bot.slice(bot.indexOf('function safePdfText('),bot.indexOf('async function cover('))+bot.slice(bot.indexOf('async function makeVSO('),bot.indexOf('const vsoSteps='))+';globalThis.telegramVariants=VARIANTS';vm.runInContext(stripTypeScriptTypes(functions),context);
 assert.equal(Object.keys(context.telegramVariants).length,api.list.length);for(const v of api.list){assert.equal(context.telegramVariants[v.id].base,v.baseOtr);assert.equal(context.telegramVariants[v.id].fees,api.charges(v))}
 for(const kind of ['AUTO','PLAIN','MARKUP'])for(const loan of [60000,68220,72800,80000]){
  texts.length=0;const bytes=await context.makeVSO({name:'Customer Test',ic:'000101010001',phone:'0100000001',variant:'EMAS5_PREMIUM_2026',year:'2026',color:'Hijau',loan,address:'Jalan Ujian',mode:kind},'Test Advisor');assert.ok(bytes.length>1000);
  const expected=api.calculate(loan,kind),money=n=>'RM '+n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
  for(const [label,value] of [['Harga OTR (anggaran)',expected.otr],['Harga Bersih (anggaran)',expected.net],['Anchor Price (100%)',75800],['Had Loan (90%)',68220]])assert.equal(texts[texts.indexOf(label)+1],money(value));
 }
 for(const v of api.list.filter(v=>v.id.includes('PHEV'))){
  const loan=120000,expected=api.calculate(loan,'AUTO',v.id);texts.length=0;await context.makeVSO({name:'Customer Test',ic:'000101010001',phone:'0100000001',variant:v.id,year:'2026',color:'Silver',loan,address:'Jalan Ujian',mode:'AUTO'},'Test Advisor');assert.equal(texts[texts.indexOf('Harga OTR (anggaran)')+1],'RM '+expected.otr.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}));
 }
 console.log('PASS anchor 90%: 7 variants, new PHEV PDF reference prices/fees, exact lead-to-variant matching, boundary rounding, website/Telegram table parity and real Telegram PDFs');
})().catch(e=>{console.error(e);process.exitCode=1});
