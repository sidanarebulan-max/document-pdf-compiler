const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),os=require('node:os'),path=require('node:path');
const PDFLib=require('pdf-lib'),fontkit=require('../assets/vendor/fontkit-1.1.1.umd.min.js'),core=require('../vso-word-core');
(async()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync('vso-variants.js','utf8'),context);const variants=context.window.VSO_VARIANTS;
 const assets={PDFLib,fontkit,templateBytes:fs.readFileSync('assets/vso-word/template.pdf'),fontBytes:{serif:fs.readFileSync('assets/vso-word/DroidSerif-Regular.ttf'),sans:fs.readFileSync('assets/vso-word/IBMPlexSans-Regular.ttf'),open:fs.readFileSync('assets/vso-word/OpenSans-Regular.ttf')}};
 const baseline={customer:'PELANGGAN UJIAN',nric:'000101010001',phone:'0100000001',email:'ujian@example.test',address:'NO 12 JALAN UJIAN TAMAN CONTOH 42300 PUNCAK ALAM SELANGOR',year:'2026',color:'Mercury Silver',period:9};
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'faris-vso-word-'));let builds=0;
 function input(variant,loan,extra={}){const price=variants.calculate(loan,'AUTO',variant.id);return {...baseline,model:variant.model,fees:variant.fees,loan,otr:price.otr,net:price.net,...extra}}
 for(const variant of variants.list){
  for(const loan of [80000,Math.round((variant.baseOtr*.9+.01)*100)/100]){
   const data=input(variant,loan),built=await core.buildPdf({...assets,data,now:new Date('2026-10-28T16:10:00Z')});
   const doc=await PDFLib.PDFDocument.load(built.bytes);assert.equal(doc.getPageCount(),1);
   assert.ok(Math.abs(doc.getPage(0).getWidth()-595.28)<.1);assert.ok(Math.abs(doc.getPage(0).getHeight()-841.89)<.1);
   const text=Object.fromEntries(built.painted.map(x=>[x.key,x.text]));assert.equal(text.date,'29/10/2026');assert.equal(text.period,'108 Month');assert.equal(text.draft,'DRAF');
   const money=n=>n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
   assert.equal(text.net,money(data.net));assert.equal(text.otr,money(data.otr));assert.equal(text.loan,'RM '+money(loan));
   for(const fee of ['gst','handling','plate','accessory','registration','roadTax','claim','insurance']){
    if(variant.fees[fee]===null||variant.fees[fee]===undefined)assert.equal(text[fee],undefined);else assert.equal(text[fee],money(variant.fees[fee]));
   }
   for(const field of built.painted){const spec=core.fields[field.key];assert.ok(field.width<=spec[4]+.001,field.key+' fits its Word field');assert.ok(field.x+field.width<=552,field.key+' stays in form')}
   const streams=doc.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFLib.PDFRawStream).map(([,o])=>o);
   const content=streams.filter(o=>!o.dict.get(PDFLib.PDFName.of('Subtype'))&&!o.dict.get(PDFLib.PDFName.of('Length1'))).map(o=>{try{return PDFLib.decodePDFRawStream(o).decode()}catch{return new Uint8Array()}}).map(b=>Buffer.from(b).toString('latin1')).join('\n');
   assert.ok(content.includes('BT')&&content.includes('Tj'),'download has native selectable text');
   const images=streams.filter(o=>String(o.dict.get(PDFLib.PDFName.of('Subtype')))==='/Image');
   assert.ok(images.every(o=>Number(String(o.dict.get(PDFLib.PDFName.of('Height'))))<200),'no full-page raster image');
   const filename=variant.id+(loan===80000?'':'-above-limit')+'.pdf';fs.writeFileSync(path.join(out,filename),built.bytes);builds++;
  }
 }
 const variant=variants.list[0];
 const long=input(variant,80000,{customer:'PELANGGAN NAMA PANJANG BIN CONTOH UJIAN A/L CONTOH',address:'BLOK A-12-08 KONDOMINIUM TAMAN CONTOH JALAN PERSIARAN PUNCAK ALAM 6 SEKSYEN 2 42300 PUNCAK ALAM SELANGOR DARUL EHSAN',email:'pelanggan.ujian.panjang@example.test'});
 const built=await core.buildPdf({...assets,data:long});const address=built.painted.filter(v=>/^address/.test(v.key)).map(v=>v.text).join(' ');assert.equal(address,long.address);assert.equal(built.painted.find(v=>v.key==='customer').text,long.customer);
 fs.writeFileSync(path.join(out,'long-fields.pdf'),built.bytes);
 await assert.rejects(()=>core.buildPdf({...assets,data:input(variant,80000,{customer:''})}),/nama penuh/);
 await assert.rejects(()=>core.buildPdf({...assets,data:input(variant,80000,{customer:'Ujian 😀'})}),/Aksara/);
 await assert.rejects(()=>core.buildPdf({...assets,data:input(variant,80000,{address:'ALAMAT SANGAT PANJANG '.repeat(200)})}),/terlalu panjang/);
 assert.equal(core.dateInMalaysia(new Date('2026-10-28T23:59:59Z')),'29/10/2026');
 assert.doesNotMatch(fs.readFileSync('vso-exact.js','utf8'),/toDataURL|embedJpg|embedPng|indexedDB|vso-master-variants-blank/);
 assert.doesNotMatch(fs.readFileSync('vso.js','utf8'),/toDataURL|embedJpg/);
 console.log('PASS Word VSO: '+builds+' real PDFs; 7 variants + 90% price boundary, native text, no page raster, exact A4, bounded fields, complete long address, dates and validation.');console.log('QA PDFs: '+out);
})().catch(e=>{console.error(e);process.exitCode=1});
