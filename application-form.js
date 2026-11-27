(()=>{
'use strict';
const core=window.FARIS_APPLICATION_CORE,$=id=>document.getElementById(id);
const host=document.createElement('section');host.id='applicationWorkspace';host.hidden=true;
host.innerHTML=`<header class="afIntro"><div class="afEyebrow">APPLICATION FORM</div><h1>Application Form Generator</h1><p>Paste maklumat daripada Word atau WhatsApp. Semak medan yang dikesan sebelum jana PDF.</p></header>
 <section class="afPanel afPaste"><h2>1. Paste maklumat pelanggan</h2><label class="afField" for="applicationPaste">Teks borang customer</label><textarea id="applicationPaste" rows="9" maxlength="30000" placeholder="Nama penuh: Nor Farah&#10;No. IC: ...&#10;Nombor telefon: ..."></textarea><p class="afHint">Gunakan tajuk bahagian atau label seperti Nama pasangan dan Telefon rujukan untuk bezakan maklumat setiap orang.</p><div class="afActions"><button class="vsoPrimary" id="applicationRead" type="button">Baca Maklumat</button><button class="vsoSecondary" id="applicationClear" type="button">Kosongkan Borang</button></div><p id="applicationReadStatus" class="afStatus" role="status" aria-live="polite"></p><details id="applicationIssues" class="afIssues" hidden><summary>Maklumat yang perlu disemak</summary><ul id="applicationIssueList"></ul></details></section>
 <div class="afLayout"><section class="afPanel"><h2>2. Semak &amp; edit maklumat</h2><p class="afHint">Nama pemohon diperlukan. Medan lain boleh dikosongkan jika belum tersedia.</p><div id="applicationFields"></div><div class="afFilename"><label class="afField" for="applicationOutputName">Nama fail output (optional)<input id="applicationOutputName" maxlength="120" placeholder="Nor Farah - Application Form"></label><p class="afHint" id="applicationFilename"></p></div><div class="afActions"><button type="button" class="vsoPrimary" id="applicationToVso">Jana PDF &amp; Teruskan ke VSO →</button><button type="button" class="vsoSecondary" id="applicationGenerate">Jana Pratonton PDF</button></div><p class="afStatus" id="applicationStatus" role="status" aria-live="polite"></p></section>
 <section class="afPanel afPreviewPanel"><h2>3. Pratonton Application Form</h2><p class="afHint">Saiz A4 dan susunan mengikut contoh asal. Teks panjang dibalut; halaman sambungan ditambah jika ruang tidak mencukupi.</p><div id="applicationPreview" class="afPreview"><div class="afPlaceholder">Paste dan semak maklumat dahulu.<br>Tekan Jana Pratonton PDF untuk melihat hasil.</div></div><div class="afActions"><button type="button" class="vsoPrimary" id="applicationPreviewToVso" disabled>Teruskan ke VSO →</button><button type="button" class="vsoSecondary" id="applicationDownload" disabled>Download PDF</button><button type="button" class="vsoSecondary" id="applicationToCompiler" disabled>Hantar terus ke Compiler</button></div></section></div>`;
document.querySelector('.app').insertAdjacentElement('beforebegin',host);
for(const s of core.sections){
 const group=document.createElement('details');group.className='afGroup';group.open=s.id==='applicant';const summary=document.createElement('summary');summary.textContent=s.title;group.append(summary);
 const grid=document.createElement('div');grid.className='afFields';for(const f of core.fields.filter(f=>f.section===s.id)){
  const label=document.createElement('label');label.className='afField';label.htmlFor='application_'+f.id;const caption=document.createElement('span');caption.textContent=f.label.replace(/\s*:\s*$/,'');
  const multiline=/address|scope/.test(f.id),input=document.createElement(multiline?'textarea':'input');input.id='application_'+f.id;input.dataset.applicationField=f.id;input.maxLength=multiline?2000:300;
 if(multiline)input.rows=3;else input.type='text';if(f.id.endsWith('_phone'))input.inputMode='tel';if(f.id.endsWith('_nric'))input.inputMode='numeric';input.autocomplete='off';label.append(caption,input);grid.append(label);
 }group.append(grid);$('applicationFields').append(group);
}
let result=null,busy=false,assetsPromise=null,epoch=0,previewDoc=null,pasteDirty=false,carryToVso=false;
function values(){return Object.fromEntries(core.fields.map(f=>[f.id,$('application_'+f.id).value.trim()]))}
function stamp(){return JSON.stringify([values(),$('applicationOutputName').value])}
function filename(){const custom=cleanOutputName($('applicationOutputName').value);return (custom||((cleanOutputName($('application_applicant_name').value)||'Customer')+' - Application Form'))+'.pdf'}
function status(message,error=false){$('applicationStatus').textContent=message;$('applicationStatus').classList.toggle('error',error)}
function currentPdf(){return !pasteDirty&&result?.stamp===stamp()?result:null}
function controls(){const ready=currentPdf()&&!busy;for(const id of ['applicationDownload','applicationToCompiler','applicationPreviewToVso'])$(id).disabled=!ready;for(const id of ['applicationGenerate','applicationToVso'])$(id).disabled=busy||pasteDirty;$('applicationRead').disabled=busy;$('applicationClear').disabled=busy}
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
async function generate(showPreview=true){
 if(busy||pasteDirty)return;
 const workspace=window.FARIS_WORKSPACE_PROFILE;
 busy=true;controls();status('Menjana Application Form…');
 try{
  await workspace?.flush();
  if(pasteDirty)return;
  const data=values();if(!data.applicant_name){status('Isi nama pemohon dahulu.',true);$('application_applicant_name').focus();return}
  invalidate();const snapshot=stamp(),generation=epoch,name=filename();
  const assets=await loadAssets(),built=await core.buildPdf({PDFLib:window.PDFLib,...assets,values:data});
  if(snapshot!==stamp()||generation!==epoch){status('Maklumat berubah semasa menjana. Jana PDF semula.',true);return}
  const blob=new Blob([built.bytes],{type:'application/pdf'});result={blob,name,data,stamp:snapshot,url:URL.createObjectURL(blob)};
  window.FARIS_GENERATED?.publish('application',{blob,name,party:'HIRER',category:'OTHER',valid:()=>!pasteDirty&&snapshot===stamp()});
  if(showPreview){
   try{await preview(blob,generation)}catch(e){if(generation===epoch){$('applicationPreview').innerHTML='<div class="afPlaceholder">PDF siap. Pratonton tidak dapat dimuatkan.<br>Download PDF untuk semak.</div>'}}
  }else $('applicationPreview').innerHTML='<div class="afPlaceholder">PDF siap. Tekan Jana Pratonton PDF untuk melihatnya.</div>';
  if(generation===epoch)status('✓ Application Form siap · '+built.pages+' halaman · '+name+
   (workspace&&!workspace.active?' · Pautkan profil pelanggan untuk simpan secara automatik.':''));
  return currentPdf();
 }catch(e){status(e.status===403?'Akses profil berubah. Semak agihan pelanggan dengan admin sebelum menyimpan semula.':e.message||'Borang tidak dapat dijana.',true)}finally{busy=false;controls()}
}
function sameApplicant(vso,app){
 const name=value=>value.trim().toLowerCase().replace(/\s+/g,' ');
 const matches=(a,b,normalize)=>!a||!b||(normalize(a)||a)===(normalize(b)||b);
 return name(vso.customer)===name(app.applicant_name)&&matches(vso.nric,app.applicant_nric,core.nricValue)&&
  matches(vso.phone,app.applicant_phone,core.phoneValue);
}
async function compilerEntry(pdf){
 return window.FARIS_GENERATED.compilerEntry('application',pdf.blob,{customer_name:pdf.data.applicant_name,customer_phone:pdf.data.applicant_phone});
}
function checkCarry(vso){
 if(!carryToVso)return false;
 if(pasteDirty)throw Error('Kembali ke Application Form dan tekan Baca Maklumat dahulu.');
 if(!sameApplicant(vso,values()))throw Error('Maklumat pemohon pada VSO dan Application Form berbeza. Semak nama, IC dan telefon sebelum teruskan.');
 return true;
}
async function carriedEntry(vso){
 if(!checkCarry(vso))return null;
 const pdf=currentPdf()||await generate(false);
 if(!pdf)throw Error('Kembali ke Application Form dan jana PDF semula.');
 if(!sameApplicant(vso,pdf.data))throw Error('Maklumat pemohon berubah. Semak Application Form dan VSO sekali lagi.');
 return compilerEntry(pdf);
}
function showIssues(issues){
 const list=$('applicationIssueList'),panel=$('applicationIssues');
 list.replaceChildren();for(const text of issues){const li=document.createElement('li');li.textContent=text;list.append(li)}
 panel.hidden=!issues.length;panel.open=!!issues.length;
}
$('applicationRead').addEventListener('click',()=>{
 const readStatus=$('applicationReadStatus');
 if(!$('applicationPaste').value.trim()){readStatus.textContent='Paste maklumat pelanggan dahulu.';return}
 const workflow=window.FARIS_WORKSPACE_PROFILE;
 if(workflow?.loading){readStatus.textContent='Tunggu profil pelanggan selesai dimuatkan, kemudian tekan Baca Maklumat semula.';return}
 const parsed=core.parse($('applicationPaste').value);
 const issues=[...parsed.conflicts.map(id=>'Dua nilai berbeza untuk '+core.fields.find(f=>f.id===id).label.trim().replace(/:$/,'')+'. Semak teks sumber.'),...parsed.unparsed.map(line=>'Belum dipadankan: '+line)];
 showIssues(issues);
 if(!parsed.count){
  readStatus.textContent='Tiada medan dikesan. Cuba letak label seperti Nama, No. IC atau Nombor telefon.';
  return;
 }
 const phone=parsed.values.applicant_phone;
 if(parsed.conflicts.includes('applicant_phone')){
  readStatus.textContent='Ada lebih daripada satu nombor telefon pemohon. Semak nombor sebelum teruskan.';
  return;
 }
 if(workflow?.active&&phone&&!core.phoneValue(phone)){
  readStatus.textContent='Format nombor telefon pemohon tidak dapat dibaca. Semak dan cuba lagi.';
  return;
 }
 if(workflow&&!workflow.samePhone(phone)){
  readStatus.textContent='Nombor dalam teks berbeza daripada profil yang sedang dibuka.';
  return;
 }
 const pastedIc=core.nricValue(parsed.values.applicant_nric||'');
 const profileIc=core.nricValue($('application_applicant_nric').value.trim());
 if(workflow?.active&&pastedIc&&profileIc&&pastedIc!==profileIc){
  readStatus.textContent='Nombor IC berbeza daripada profil yang sedang dibuka. Semak pelanggan atau betulkan IC pada medan borang.';
  return;
 }
 pasteDirty=false;invalidate();
 const cleanFields=Object.fromEntries(Object.entries(parsed.values).filter(([id])=>!parsed.conflicts.includes(id)));
 if(workflow?.active)workflow.applyApplication(cleanFields);
 else {
  for(const f of core.fields)$('application_'+f.id).value=cleanFields[f.id]||'';
  if(core.phoneValue(phone))$('application_applicant_phone').dispatchEvent(new Event('change',{bubbles:true}));
 }
 const count=Object.values(cleanFields).filter(Boolean).length;
 readStatus.textContent=count+' daripada '+core.fields.length+' medan dibaca. Semak nama, nombor dan alamat sebelum jana.';
 for(const group of $('applicationFields').querySelectorAll('details'))group.open=true;
 $('applicationFilename').textContent='Nama fail: '+filename();status('Maklumat telah dimasukkan. Semak dan edit medan di bawah.');
});
$('applicationClear').addEventListener('click',()=>{
 const linked=window.FARIS_WORKSPACE_PROFILE?.active;
 if(!confirm(linked?'Kosongkan teks yang dipaste dan nama fail?':'Kosongkan semua maklumat Application Form ini?'))return;
 pasteDirty=false;invalidate();if(!linked){carryToVso=false;for(const f of core.fields)$('application_'+f.id).value='';}$('applicationPaste').value='';$('applicationOutputName').value='';$('applicationReadStatus').textContent='';showIssues([]);status(linked?'Teks yang dipaste dan nama fail dikosongkan.':'Borang dikosongkan.');$('applicationFilename').textContent='Nama fail: '+filename();
});
host.addEventListener('input',e=>{if(e.target.matches('[data-application-field],#applicationOutputName'))invalidate()});
$('applicationPaste').addEventListener('input',()=>{pasteDirty=!!$('applicationPaste').value.trim();invalidate();if(pasteDirty)status('Teks sumber berubah. Tekan Baca Maklumat dahulu untuk mengisi borang terkini.')});
$('applicationGenerate').addEventListener('click',()=>generate());
async function toVso(){
 if(busy||pasteDirty)return;
 const pdf=currentPdf()||await generate();
 if(!pdf)return;
 const workspace=window.FARIS_WORKSPACE_PROFILE;
 const message=workspace?.active?'Maklumat profil sudah diisi. Application Form akan ikut ke Compiler.':window.VSO_CENTER.prefillApplication(pdf.data);
 carryToVso=true;
 window.VSO_CENTER.openVso();
 $('vsoFlowStatus').textContent=message;
}
$('applicationToVso').addEventListener('click',toVso);
$('applicationPreviewToVso').addEventListener('click',toVso);
$('applicationDownload').addEventListener('click',()=>{if(!result||result.stamp!==stamp())return;const a=document.createElement('a');a.href=result.url;a.download=result.name;document.body.append(a);a.click();a.remove()});
$('applicationToCompiler').addEventListener('click',async()=>{
 const pdf=currentPdf();if(!pdf||busy)return;busy=true;controls();
 try{await window.FARIS_COMPILER.importInbox([await compilerEntry(pdf)]);
 window.VSO_CENTER.openCompiler('Application Form tersedia di bahagian Peminjam.');status('Application Form telah dimasukkan ke Compiler.')}catch(e){status(e.message,true)}finally{busy=false;controls()}
});
window.FARIS_APPLICATION={carriedEntry,checkCarry,sameApplicant,onShow(){},prefill(lead){for(const [id,v] of Object.entries({applicant_name:lead.name,applicant_phone:lead.phone,financing_model:lead.model}))if(v)$('application_'+id).value=v;invalidate()}};
$('applicationFilename').textContent='Nama fail: '+filename();
})();
