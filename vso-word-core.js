(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FARIS_VSO_WORD=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const money=n=>Number(n).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim();
function dateInMalaysia(now=new Date()){
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',day:'2-digit',month:'2-digit',year:'numeric'}).format(now);
}
// Coordinates and type sizes are taken from the approved editable Word page.
const fields=Object.freeze({
 date:[394.15,99.60,10,'serif',155],customer:[110.85,127.75,8.5,'serif',246],
 address1:[109.75,144.95,8.5,'serif',246],address2:[109.75,158.40,8.5,'serif',246],
 nric:[111.25,172.75,9,'serif',244],phone:[110.85,186.50,9,'serif',244],email:[109.75,199.45,9,'serif',246],
 loan:[424.75,185.10,10,'serif',125],period:[424.20,199.45,10,'serif',125],
 model:[120.45,213.35,9,'serif',133],year:[329.10,213.65,9,'sans',26,0,1.03],color:[401.75,214.30,9,'sans',147],
 net:[184.60,235.50,6,'sans',66.1,1,1.025],gst:[184.60,246.30,6,'sans',66.1,1,1.025],
 handling:[184.60,302.07,6,'sans',68.85,1,1.025],plate:[184.60,326.50,6,'sans',68.85,1,1.025],
 accessory:[184.60,336.60,6,'sans',68.85,1,1.025],registration:[184.60,448.55,6,'sans',68.85,1,1.025],
 roadTax:[184.60,459.65,6,'sans',68.85,1,1.025],claim:[184.60,470.85,6,'sans',68.85,1,1.025],
 insurance:[184.60,482.00,6,'sans',68.85,1,1.025],otr:[184.60,528.55,7.5,'open',70.9,1,1.04],
 draft:[255,101.1,9,'sans',38]
});
function addressLines(value,font,size=8.5){
 const input=tidy(value).toUpperCase();if(!input)return [];
 if(font.widthOfTextAtSize(input,size)<=246)return [input];
 const words=input.split(' ');if(words.length===1)return [input];
 let best=null;
 for(let i=1;i<words.length;i++){
  const lines=[words.slice(0,i).join(' '),words.slice(i).join(' ')];
  const cost=Math.max(...lines.map(s=>font.widthOfTextAtSize(s,size)));
  if(!best||cost<best.cost)best={cost,lines};
 }
 return best.lines;
}
async function buildPdf({PDFLib,fontkit,templateBytes,fontBytes,data,now,preview=false}){
 if(!PDFLib||!fontkit)throw Error('Enjin PDF belum sedia. Segar semula halaman.');
 const doc=await PDFLib.PDFDocument.load(templateBytes,{updateMetadata:false});
 if(doc.getPageCount()!==1)throw Error('Templat Word mesti satu halaman A4.');
 const page=doc.getPage(0),{width,height}=page.getSize();
 if(Math.abs(width-595.28)>1||Math.abs(height-841.89)>1)throw Error('Ukuran templat Word tidak sah.');
 doc.registerFontkit(fontkit);
 const fonts={};
 for(const key of ['serif','sans','open'])fonts[key]=await doc.embedFont(fontBytes[key],{subset:true});
 const supported=Object.fromEntries(Object.entries(fonts).map(([k,f])=>[k,new Set(f.getCharacterSet())]));
 const painted=[];
 function draw(key,input){
  const value=tidy(input);if(!value)return;
  const [x,baseline,originalSize,fontKey,maxWidth,right=false,referenceScale=1]=fields[key];
  const font=fonts[fontKey];
  const missing=[...new Set([...value].filter(c=>!supported[fontKey].has(c.codePointAt(0))))];
  if(missing.length)throw Error('Aksara belum disokong dalam '+key+': '+missing.join(' ')+'. Semak ejaan sebelum jana.');
  let size=originalSize,scale=referenceScale;
  let natural=font.widthOfTextAtSize(value,size);
  if(natural*scale>maxWidth)scale=maxWidth/natural;
  if(scale<.70&&size>6.5){size=Math.max(6.5,size*scale/.70);natural=font.widthOfTextAtSize(value,size);scale=Math.min(referenceScale,maxWidth/natural)}
  if(scale<.60)throw Error('Maklumat '+key+' terlalu panjang untuk ruang asal. Ringkaskan sebelum jana.');
  const actualWidth=natural*scale,left=right?x+maxWidth-actualWidth:x;
  // Text remains PDF text. A text transform fits long values without rasterizing the page.
  page.pushOperators(PDFLib.pushGraphicsState(),PDFLib.concatTransformationMatrix(scale,0,0,1,left,height-baseline));
  page.drawText(value,{x:0,y:0,size,font,color:PDFLib.rgb(0,0,0)});
  page.pushOperators(PDFLib.popGraphicsState());
  painted.push({key,text:value,x:left,baseline,size,width:actualWidth});
 }
 const d=data||{};
 const name=tidy(d.customer??d.name);
 if(!preview){
  if(!name)throw Error('Sila isi nama penuh pelanggan.');
  if(!Number.isFinite(d.loan)||d.loan<=0||!Number.isFinite(d.otr)||!Number.isFinite(d.net)||d.net<=0)throw Error('Jumlah pinjaman atau harga tidak sah.');
  if(!/^\d{4}$/.test(tidy(d.year))||!tidy(d.color))throw Error('Lengkapkan tahun pembuatan dan warna kereta.');
 }
 const addresses=addressLines(d.address,fonts.serif);
 const values={date:d.date||dateInMalaysia(now),customer:name.toUpperCase(),address1:addresses[0],address2:addresses[1],nric:d.nric,phone:d.phone,email:d.email,
  // Advisor identity belongs to the static template, never to customer input.
  loan:Number.isFinite(d.loan)&&d.loan>0?'RM '+money(d.loan):'',period:tidy(d.period)?Number(d.period)*12+' Month':'',
  model:d.model,year:d.year,color:d.color,net:Number.isFinite(d.net)?money(d.net):'',otr:Number.isFinite(d.otr)?money(d.otr):'',draft:'DRAF'};
 for(const [key,value] of Object.entries(values))draw(key,value);
 for(const key of ['gst','handling','plate','accessory','registration','roadTax','claim','insurance']){
  if(d.fees?.[key]!==null&&d.fees?.[key]!==undefined)draw(key,money(d.fees[key]));
 }
 doc.setTitle('Vehicle Sales Order DRAF');doc.setAuthor('FARIS R+PROTON');doc.setCreator('FARIS VSO Generator Word Template');
 doc.setSubject('VSO untuk semakan dan pengesahan pengedar');
 return {bytes:await doc.save({useObjectStreams:true}),pages:1,painted};
}
return {fields,dateInMalaysia,addressLines,buildPdf};
});
