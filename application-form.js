(()=>{
'use strict';
const core=window.FARIS_APPLICATION_CORE,$=id=>document.getElementById(id);
const host=document.createElement('section');host.id='applicationWorkspace';host.hidden=true;
host.innerHTML=`<header class="afIntro"><div class="afEyebrow">APPLICATION FORM</div><h1>Application Form Generator</h1><p>Copy borang yang telah diisi dari Word dan paste di bawah. Semak maklumat yang dibaca, kemudian jana PDF mengikut format dua halaman asal.</p></header>
 <section class="afPanel afPaste"><h2>1. Paste maklumat dari Word</h2><label class="afField" for="applicationPaste">Teks borang customer</label><textarea id="applicationPaste" rows="9" maxlength="30000" placeholder="MAKLUMAT PEMOHON&#10;Nama : Nor Farah&#10;I/C No : ...&#10;&#10;MAKLUMAT PEKERJAAN&#10;Nama Majikan : ..."></textarea><p class="afHint">Sertakan tajuk bahagian dan label seperti Nama, I/C No dan Alamat. Maklumat yang tiada tidak diisi secara automatik. Semak padanan sebelum jana.</p><div class="afActions"><button class="vsoPrimary" id="applicationRead" type="button">Baca Maklumat</button><button class="vsoSecondary" id="applicationClear" type="button">Kosongkan Borang</button></div><p id="applicationReadStatus" class="afStatus" role="status" aria-live="polite"></p><details id="applicationIssues" class="afIssues" hidden><summary>Maklumat yang perlu disemak</summary><ul id="applicationIssueList"></ul></details></section>
 <div class="afLayout"><section class="afPanel"><h2>2. Semak &amp; edit maklumat</h2><p class="afHint">Nama pemohon diperlukan. Medan lain boleh dikosongkan jika belum tersedia. Setiap bahagian disimpan berasingan dalam borang ini.</p><div id="applicationFields"></div><div class="afFilename"><label class="afField" for="applicationOutputName">Nama fail output (optional)<input id="applicationOutputName" maxlength="120" placeholder="Nor Farah - Application Form"></label><p class="afHint" id="applicationFilename"></p></div><div class="afActions"><button type="button" class="vsoPrimary" id="applicationGenerate">Jana Pratonton PDF</button></div><p class="afStatus" id="applicationStatus" role="status" aria-live="polite"></p></section>
 <section class="afPanel afPreviewPanel"><h2>3. Pratonton Application Form</h2><p class="afHint">Saiz A4 dan susunan mengikut contoh asal. Teks panjang dibalut; halaman sambungan ditambah jika ruang tidak mencukupi.</p><div id="applicationPreview" class="afPreview"><div class="afPlaceholder">Paste dan semak maklumat dahulu.<br>Tekan Jana Pratonton PDF untuk melihat hasil.</div></div><div class="afActions"><button type="button" class="vsoPrimary" id="applicationDownload" disabled>Download PDF</button><button type="button" class="vsoSecondary" id="applicationToCompiler" disabled>Hantar ke Compiler</button></div></section></div>`;
document.querySelector('.app').insertAdjacentElement('beforebegin',host);
for(const s of core.sections){
 const group=document.createElement('details');group.className='afGroup';group.open=s.id==='applicant';const summary=document.createElement('summary');summary.textContent=s.title;group.append(summary);
 const grid=document.createElement('div');grid.className='afFields';for(const f of core.fields.filter(f=>f.section===s.id)){
  const label=document.createElement('label');label.className='afField';label.htmlFor='application_'+f.id;const caption=document.createElement('span');caption.textContent=f.label.replace(/\s*:\s*$/,'');
  const multiline=/address|scope/.test(f.id),input=document.createElement(multiline?'textarea':'input');input.id='application_'+f.id;input.dataset.applicationField=f.id;input.maxLength=multiline?2000:300;
  if(multiline)input.rows=3;else input.type='text';input.autocomplete='off';label.append(caption,input);grid.append(label);
 }group.append(grid);$('applicationFields').append(group);
}
let result=null,busy=false,assetsPromise=null,epoch=0,previewDoc=null,pasteDirty=false;
function values(){return Object.fromEntries(core.fields.map(f=>[f.id,$('application_'+f.id).value.trim()]))}
function stamp(){return JSON.stringify([values(),$('applicationOutputName').value])}
function filename(){const custom=cleanOutputName($('applicationOutputName').value);return (custom||((cleanOutputName($('application_applicant_name').value)||'Customer')+' - Application Form'))+'.pdf'}
function status(message,error=false){$('applicationStatus').textContent=message;$('applicationStatus').classList.toggle('error',error)}
function controls(){const ready=!!result&&result.stamp===stamp()&&!busy&&!pasteDirty;for(const id of ['applicationDownload','applicationToCompiler'])$(id).disabled=!ready;$('applicationGenerate').disabled=busy||pasteDirty;$('applicationRead').disabled=busy;$('applicationClear').disabled=busy}
function invalidate(){
 if(previewDoc){previewDoc.destroy().catch(()=>{});previewDoc=null}
 epoch++;if(result){URL.revokeObjectURL(result.url);result=null;status('Maklumat berubah. Jana PDF semula untuk menggunakan maklumat terkini.');$('applicationPreview').innerHTML='<div class="afPlaceholder">Maklumat telah berubah.<br>Jana pratonton semula.</div>'}
 window.FARIS_GENERATED?.clear('application');$('applicationFilename').textContent='Nama fail: '+filename();controls();
}
function loadAssets(){
 if(assetsPromise)return assetsPromise;
 assetsPromise=(async()=>{
  const fontkit=window.fontkit||await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/assets/vendor/fontkit-1.1.1.umd.min.js';s.onload=()=>resolve(window.fontkit);s.onerror=()=>{s.remove();reject(Error('Font PDF gagal dimuatkan. Refresh dan cuba lagi.'))};document.head.append(s)});
  async function bytes(path){const r=await fetch(path,{cache:'force-cache'});if(!r.ok)throw Error('Aset borang gagal dimuatkan. Refresh dan cuba lagi.');return new Uint8Array(await r.arrayBuffer())}
  const [fontBytes,titleBytes]=await Promise.all([bytes('/assets/application-form/CanvaSans-Regular.ttf'),bytes('/assets/application-form/title.png')]);return {fontkit,fontBytes,titleBytes};
 })().catch(e=>{assetsPromise=null;throw e});return assetsPromise;
}
async function preview(blob,generation){
 if(previewDoc){await previewDoc.destroy();previewDoc=null}
 const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())}).promise;
 if(generation!==epoch){await pdf.destroy();return}previewDoc=pdf;$('applicationPreview').innerHTML='';
 for(let n=1;n<=pdf.numPages;n++){
  if(generation!==epoch)return;const page=await pdf.getPage(n),vp=page.getViewport({scale:1.5});
  const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Application Form halaman '+n);caption.textContent='Halaman '+n+' / '+pdf.numPages;figure.append(canvas,caption);$('applicationPreview').append(figure);
  await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
 }
}
async function generate(){
 if(busy||pasteDirty)return;const data=values();if(!data.applicant_name){status('Isi nama pemohon dahulu.',true);$('application_applicant_name').focus();return}
 invalidate();const snapshot=stamp(),generation=epoch,name=filename();busy=true;controls();status('Menjana Application Form…');
 try{
  const assets=await loadAssets(),built=await core.buildPdf({PDFLib:window.PDFLib,...assets,values:data});
  if(snapshot!==stamp()||generation!==epoch){status('Maklumat berubah semasa menjana. Jana PDF semula.',true);return}
  const blob=new Blob([built.bytes],{type:'application/pdf'});result={blob,name,stamp:snapshot,url:URL.createObjectURL(blob)};
  window.FARIS_GENERATED?.publish('application',{blob,name,party:'HIRER',category:'OTHER',valid:()=>!pasteDirty&&snapshot===stamp()});
  try{await preview(blob,generation)}catch(e){if(generation===epoch){$('applicationPreview').innerHTML='<div class="afPlaceholder">PDF siap. Pratonton tidak dapat dimuatkan.<br>Download PDF untuk semak.</div>'}}
  if(generation===epoch)status('✓ Application Form siap · '+built.pages+' halaman · '+name);
 }catch(e){status(e.message||'Borang tidak dapat dijana.',true)}finally{busy=false;controls()}
}
$('applicationRead').addEventListener('click',()=>{
 if(!$('applicationPaste').value.trim()){$('applicationReadStatus').textContent='Paste maklumat borang dari Word dahulu.';return}
 pasteDirty=false;invalidate();const parsed=core.parse($('applicationPaste').value);for(const f of core.fields)$('application_'+f.id).value=parsed.values[f.id]||'';
 $('applicationReadStatus').textContent=parsed.count+' daripada '+core.fields.length+' medan dibaca. Semak nama, nombor dan alamat sebelum jana.';
 const issues=[...parsed.conflicts.map(id=>'Label berulang dengan nilai berbeza: '+core.fields.find(f=>f.id===id).label+' — nilai pertama dikekalkan.'),...parsed.unparsed.map(line=>'Belum dipadankan: '+line)];
 $('applicationIssueList').replaceChildren();for(const text of issues){const li=document.createElement('li');li.textContent=text;$('applicationIssueList').append(li)}$('applicationIssues').hidden=!issues.length;
 for(const group of $('applicationFields').querySelectorAll('details'))group.open=true;
 $('applicationFilename').textContent='Nama fail: '+filename();status('Maklumat telah dimasukkan. Semak dan edit medan di bawah.');
});
$('applicationClear').addEventListener('click',()=>{
 if(!confirm('Kosongkan semua maklumat Application Form ini?'))return;
 pasteDirty=false;invalidate();for(const f of core.fields)$('application_'+f.id).value='';$('applicationPaste').value='';$('applicationOutputName').value='';$('applicationReadStatus').textContent='';$('applicationIssues').hidden=true;$('applicationIssueList').replaceChildren();status('Borang dikosongkan.');$('applicationFilename').textContent='Nama fail: '+filename();
});
host.addEventListener('input',e=>{if(e.target.matches('[data-application-field],#applicationOutputName'))invalidate()});
$('applicationPaste').addEventListener('input',()=>{pasteDirty=!!$('applicationPaste').value.trim();invalidate();if(pasteDirty)status('Teks sumber berubah. Tekan Baca Maklumat dahulu untuk mengisi borang terkini.')});
$('applicationGenerate').addEventListener('click',generate);
$('applicationDownload').addEventListener('click',()=>{if(!result||result.stamp!==stamp())return;const a=document.createElement('a');a.href=result.url;a.download=result.name;document.body.append(a);a.click();a.remove()});
$('applicationToCompiler').addEventListener('click',async()=>{
 if(!result||result.stamp!==stamp()||busy)return;const snapshot=result,data=values();busy=true;controls();
 try{await window.FARIS_COMPILER.importInbox([{file:new File([snapshot.blob],snapshot.name,{type:'application/pdf'}),metadata:{party:'HIRER',category:'OTHER',customer_name:data.applicant_name,customer_phone:data.applicant_phone}}]);window.VSO_CENTER.openCompiler();status('Application Form telah dimasukkan ke Compiler.')}catch(e){status(e.message,true)}finally{busy=false;controls()}
});
window.FARIS_APPLICATION={onShow(){},prefill(lead){for(const [id,v] of Object.entries({applicant_name:lead.name,applicant_phone:lead.phone,financing_model:lead.model}))if(v)$('application_'+id).value=v;invalidate()}};
$('applicationFilename').textContent='Nama fail: '+filename();
})();
