const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const base=require('node:path').join(__dirname,'../');
const PDFLib=require(base+'node_modules/pdf-lib'),fontkit=require(base+'assets/vendor/fontkit-1.1.1.umd.min.js'),core=require(base+'vso-word-core.js');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(base+'vso-variants.js','utf8'),ctx);const api=ctx.window.VSO_VARIANTS;
(async()=>{
 const assets={PDFLib,fontkit,templateBytes:fs.readFileSync(base+'assets/vso-word/template.pdf'),fontBytes:Object.fromEntries([['serif','DroidSerif-Regular.ttf'],['sans','IBMPlexSans-Regular.ttf'],['open','OpenSans-Regular.ttf']].map(([k,f])=>[k,fs.readFileSync(base+'assets/vso-word/'+f)]))};
 for(const v of api.list){
 for(const loan of [v.baseOtr*.8,v.baseOtr*.9,Math.round((v.baseOtr*.9+.01)*100)/100,v.baseOtr]){
 const calc=api.calculate(loan,'AUTO',v.id),original=api.present(calc),alt=api.present(calc,'ACCESSORIES');
 assert.equal(original.net,calc.net);assert.equal(original.accessoriesExcess,0);assert.equal(alt.otr,calc.otr);assert.equal(alt.loan,calc.loan);assert.equal(alt.feeTotal,calc.feeTotal);
 assert.equal(Math.round((alt.net+alt.accessoriesExcess+alt.feeTotal)*100),Math.round(calc.otr*100));assert.equal(alt.net,Math.round((v.baseOtr-api.charges(v))*100)/100);
 for(const mode of [original,alt]){
 const built=await core.buildPdf({...assets,data:{...mode,customer:'TEST ACCESSORIES',year:'2026',color:'Silver',period:9,model:v.model,fees:v.fees}});
 const painted=Object.fromEntries(built.painted.map(x=>[x.key,x.text]));const money=n=>n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
 assert.equal(painted.net,money(mode.net));assert.equal(painted.otr,money(calc.otr));assert.equal(painted.inclusive,mode.accessoriesExcess>0?money(mode.accessoriesExcess):undefined);
 assert.equal(painted.accessory,v.fees.accessory==null?undefined:money(v.fees.accessory));
 if(mode.accessoriesExcess>0)assert.equal(painted.gst,undefined);

 }
 assert.equal(api.present(calc,'NET').net,calc.net);
 }
 }
 const example=api.present(api.calculate(72800),'ACCESSORIES');assert.equal(example.otr,80888.89);assert.equal(example.net,72092);assert.equal(example.accessoriesExcess,5088.89);
 console.log('PASS: 56 PDFs, 7 variants, both modes, below/at/above threshold, same OTR/loan/fees, exact totals, separate Accessory Package, default and toggle-back preserved');
})().catch(e=>{console.error(e);process.exit(1)});
