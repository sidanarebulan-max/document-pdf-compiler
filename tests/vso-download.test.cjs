const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const PDFLib=require('pdf-lib');
const fontkit=require('../assets/vendor/fontkit-1.1.1.umd.min.js');
const core=require('../vso-word-core');

class Element {
 constructor(){
  this.value='';
  this.style={};
  this.classList={toggle(){}};
  this.events={};
  this.clicks=0;
 }
 set innerHTML(markup){
  if(!markup.includes('vsoExportLinks'))return;
  this.message=new Element();
  this.links=new Element();
  this.links.hidden=true;
  this.anchors=[new Element(),new Element()];
 }
 closest(){return this.parent;}
 insertAdjacentElement(_,element){this.inserted=element;}
 querySelector(selector){
  if(selector==='p')return this.message;
  if(selector==='.vsoExportLinks')return this.links;
  return new Element();
 }
 querySelectorAll(){return this.anchors;}
 appendChild(){}
 setAttribute(){}
 removeAttribute(name){delete this[name];}
 addEventListener(type,listener){this.events[type]=listener;}
 click(){this.clicks++;}
}

(async()=>{
 const nodes=new Map();
 const element=id=>{
  if(!nodes.has(id))nodes.set(id,new Element());
  return nodes.get(id);
 };
 const first=element('vsoDownload'),bottom=element('vsoDownloadBottom');
 first.id='vsoDownload';
 bottom.id='vsoDownloadBottom';
 first.parent=new Element();
 bottom.parent=new Element();
 element('vsoYear').value='2026';
 element('vsoColor').value='Quartz Rose';
 element('vsoModel').value='EMAS5_PREMIUM_2026';
 element('vsoLoan').value='60800';
 element('vsoPeriod').value='9';
 const activation={isActive:true},urls=new Map();
 let published,sequence=0;
 const context={
  window:{
   FARIS_VSO_WORD:core,PDFLib,fontkit,
   FARIS_GENERATED:{publish(_,output){published=output;},clear(){published=null;}},
   pdfjsLib:{getDocument(){return {promise:new Promise(()=>{})};}},
   addEventListener(){}
  },
  document:{getElementById:element,createElement:()=>new Element()},
  fetch:async path=>new Response(fs.readFileSync(path.split('?')[0])),
  cleanOutputName:name=>name,
  navigator:{userActivation:activation},
  URL:{
   createObjectURL(blob){const url='blob:test-'+ ++sequence;urls.set(url,blob);return url;},
   revokeObjectURL(url){urls.delete(url);}
  },
  Blob,Uint8Array,setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(context);
 for(const file of ['vso-variants.js','vso-exact.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const form=first.parent.inserted,preview=bottom.parent.inserted;
 await bottom.onclick({currentTarget:bottom});
 assert.match(preview.message.textContent,/nama penuh pelanggan/);
 assert.equal(preview.links.hidden,true);
 element('vsoCustomer').value='Pelanggan Ujian';
 const generation=bottom.onclick({currentTarget:bottom});
 assert.equal(bottom.disabled,true);
 activation.isActive=false;
 await generation;
 assert.equal(bottom.disabled,false);
 assert.equal(preview.links.hidden,false);
 assert.equal(preview.anchors[0].clicks,0,'expired activation must wait for a fresh tap');
 const url=preview.anchors[0].href;
 assert.equal(form.anchors[0].href,url);
 assert.equal(preview.anchors[1].href,url);
 assert.equal(urls.get(url),published.blob);
 assert.equal((await PDFLib.PDFDocument.load(await published.blob.arrayBuffer())).getPageCount(),1);
 assert.equal(preview.anchors[0].download,'Pelanggan Ujian - VSO DRAF.pdf');
 activation.isActive=true;
 const retry=first.onclick({currentTarget:first});
 assert.equal(form.anchors[0].clicks,1,'retry uses the ready PDF in the tap handler');
 await retry;
 assert.equal(urls.size,1);
 element('vsoColor').value='Moonstone White';
 element('vsoColor').events.input();
 assert.equal(form.links.hidden,true);
 assert.equal(preview.links.hidden,true);
 assert.equal(preview.anchors[0].href,undefined);
 assert.equal(urls.has(url),false);
 assert.equal(published,null);
 console.log('PASS: real VSO PDF, expired activation fallback, retry, validation and stale-link cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
