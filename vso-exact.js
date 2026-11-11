(function installWordVso(){
'use strict';
const host=document.getElementById('vsoWorkspace'),viewport=document.getElementById('vsoPreviewViewport');
const E=id=>document.getElementById(id),core=window.FARIS_VSO_WORD;
if(!host||!viewport||!core)return;
const controlledFields=['vsoCustomer','vsoNric','vsoAddress','vsoPhone','vsoEmail','vsoModel','vsoYear','vsoColor','vsoLoan','vsoPeriod','vsoAccessoriesMode'];
const VERSION='word-vector-v49-accessories-20261029';
let assetsPromise=null,result=null,building=null,buildBusy=false,previewDoc=null,renderTask=null,drawSeq=0,resizeSeq=0,timer=null;
let downloadUrl=null,downloadStamp=null;
const prep=document.createElement('div');prep.className='vsoExactPanel vso-template-loaded';
prep.innerHTML=`<div class="vsoExactHeader"><strong>Format VSO Mengikut Word</strong><span class="vsoExactPill">TEMPLAT WORD</span></div>
<p id="vsoTemplateHelp">Susun atur, font, kotak dan border mengikut fail Word yang ditetapkan. Isi maklumat pelanggan, kenderaan dan pinjaman untuk melihat hasil.</p>
<a class="vsoExactWord" href="assets/vso-word/template.docx?v=${VERSION}" download="VSO_Template_Word.docx">Download templat Word</a>
<div id="vsoExactStatus" role="status" aria-live="polite">Memuatkan templat Word...</div>
<small>Maklumat pelanggan diproses dalam pelayar. Dokumen kekal DRAF sehingga disahkan pengedar.</small>`;
host.querySelector('.vsoModeGrid')?.insertAdjacentElement('afterend',prep);
const status=E('vsoExactStatus');
const blankHint=document.createElement('div');blankHint.id='vsoExactPlaceholder';blankHint.textContent='Memuatkan pratonton format Word...';viewport.appendChild(blankHint);
E('vsoSheetFrame').style.display='none';
const canvas=document.createElement('canvas');canvas.id='vsoExactCanvas';canvas.hidden=true;canvas.setAttribute('aria-label','Pratonton VSO mengikut templat Word');viewport.appendChild(canvas);
const showStatus=(message,ok=false)=>{status.textContent=message;status.className=ok?'vsoExactOk':'vsoExactWait'};
const exportFeedback=[
 ['vsoDownload','.vsoActions'],
 ['vsoDownloadBottom','.vsoPreviewFooter']
].map(([id,selector])=>{
 const panel=document.createElement('div');
 panel.className='vsoExportFeedback';
 panel.hidden=true;
 panel.innerHTML='<p role="status" aria-live="polite"></p><div class="vsoExportLinks" hidden><a class="vsoSecondary" download>Muat turun PDF</a><a class="vsoSecondary" target="_blank" rel="noopener">Buka PDF</a></div>';
 E(id).closest(selector).insertAdjacentElement('afterend',panel);
 const [download,open]=panel.querySelectorAll('a');
 return {id,panel,message:panel.querySelector('p'),links:panel.querySelector('.vsoExportLinks'),download,open};
});
function exportMessage(message,error=false){
 for(const entry of exportFeedback){
  entry.panel.hidden=!message&&!downloadUrl;
  entry.panel.classList.toggle('vsoExportError',error);
  entry.message.textContent=message;
 }
}
function exportError(message){
 showStatus(message);
 exportMessage(message,true);
 return null;
}
function clearDownload(){
 if(downloadUrl)URL.revokeObjectURL(downloadUrl);
 downloadUrl=null;
 downloadStamp=null;
 for(const entry of exportFeedback){
  entry.links.hidden=true;
  entry.download.removeAttribute('href');
  entry.open.removeAttribute('href');
 }
 exportMessage('');
}
function prepareDownload(out){
 if(downloadStamp!==out.stamp){
  clearDownload();
  downloadUrl=URL.createObjectURL(out.blob);
  downloadStamp=out.stamp;
 }
 for(const entry of exportFeedback){
  entry.download.href=downloadUrl;
  entry.download.download=out.fname;
  entry.open.href=downloadUrl;
  entry.links.hidden=false;
 }
}
function data(){
 const value=id=>E(id)?.value?.trim()||'';
 const loan=Number(value('vsoLoan')),variant=window.VSO_VARIANTS.get(value('vsoModel')),placement=E('vsoAccessoriesMode')?.checked?'ACCESSORIES':'NET',r=window.VSO_VARIANTS.present(window.VSO_VARIANTS.calculate(loan,'AUTO',variant.id),placement);
 return {customer:value('vsoCustomer'),nric:value('vsoNric'),address:value('vsoAddress'),phone:value('vsoPhone'),email:value('vsoEmail'),year:value('vsoYear'),color:value('vsoColor'),period:value('vsoPeriod'),model:variant.model,fees:variant.fees,loan,otr:r.otr,net:r.net,placement,accessoriesExcess:r.accessoriesExcess,date:core.dateInMalaysia()};
}
const stamp=d=>JSON.stringify(d);
async function assets(){
 if(!assetsPromise)assetsPromise=(async()=>{
  async function bytes(path){const response=await fetch(path+'?v='+VERSION,{cache:'force-cache'});if(!response.ok)throw Error('Templat Word gagal dimuatkan. Segar semula dan cuba lagi.');return new Uint8Array(await response.arrayBuffer())}
  const [templateBytes,serif,sans,open]=await Promise.all(['template.pdf','DroidSerif-Regular.ttf','IBMPlexSans-Regular.ttf','OpenSans-Regular.ttf'].map(f=>bytes('assets/vso-word/'+f)));
  if(!window.fontkit)throw Error('Font PDF belum sedia. Segar semula halaman.');
  return {PDFLib:window.PDFLib,fontkit:window.fontkit,templateBytes,fontBytes:{serif,sans,open}};
 })().catch(e=>{assetsPromise=null;throw e});
 return assetsPromise;
}
function invalidate(){result=null;clearDownload();window.FARIS_GENERATED?.clear('vso');drawSeq++;if(timer)clearTimeout(timer);timer=setTimeout(drawPreview,160)}
async function generate(d,preview=false){
 const key=stamp(d);if(!preview&&result?.stamp===key)return result;
 if(preview){
  const built=await core.buildPdf({...await assets(),data:d,preview:true});
  return {bytes:built.bytes};
 }
 if(building?.stamp===key)return building.promise;
 const operation={stamp:key};operation.promise=(async()=>{
  const built=await core.buildPdf({...await assets(),data:d});
  const next={stamp:key,bytes:built.bytes,blob:new Blob([built.bytes],{type:'application/pdf'}),fname:(cleanOutputName(d.customer)||'Customer')+' - VSO DRAF.pdf'};
  if(stamp(data())===key)result=next;
  return next;
 })();building=operation;
 try{return await operation.promise}finally{if(building===operation)building=null}
}
async function renderDocument(pdf,seq){
 const resize=++resizeSeq;if(renderTask){renderTask.cancel();try{await renderTask.promise}catch(e){if(e.name!=='RenderingCancelledException')throw e}}
 const page=await pdf.getPage(1);if(seq!==drawSeq||resize!==resizeSeq)return;
 const view=page.getViewport({scale:1}),width=Math.min(820,Math.max(220,viewport.clientWidth-24));
 // Preview at device density; downloaded PDF always uses the original vector page.
 const density=Math.max(2,Math.min(window.devicePixelRatio||1,3)),scale=width/view.width*density,renderView=page.getViewport({scale});
 canvas.width=Math.ceil(renderView.width);canvas.height=Math.ceil(renderView.height);canvas.style.width=width+'px';canvas.style.height=width*view.height/view.width+'px';
 renderTask=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:renderView,background:'rgb(255,255,255)'});
 try{await renderTask.promise}catch(e){if(e.name==='RenderingCancelledException')return;throw e}
 if(seq!==drawSeq||resize!==resizeSeq)return;
 canvas.hidden=false;blankHint.hidden=true;
}
async function showPdf(bytes,seq){
 const next=await window.pdfjsLib.getDocument({data:bytes.slice()}).promise;
 if(seq!==drawSeq){await next.destroy();return}
 if(renderTask){renderTask.cancel();try{await renderTask.promise}catch(e){if(e.name!=='RenderingCancelledException')throw e}}
 const previous=previewDoc;previewDoc=next;
 if(previous)await previous.destroy();
 await renderDocument(next,seq);
}
async function drawPreview(){
 const seq=++drawSeq,d=data();
 try{
  await assets();if(seq!==drawSeq)return;
  const next=await generate(d,true);if(seq!==drawSeq)return;
  await showPdf(next.bytes,seq);if(seq===drawSeq)showStatus('✓ Pratonton dikemas kini semasa anda menaip. Lengkapkan maklumat sebelum muat turun PDF.',true);
 }catch(error){
  if(seq!==drawSeq||error.name==='RenderingCancelledException')return;
  canvas.hidden=true;blankHint.hidden=false;blankHint.textContent='Pratonton belum tersedia. '+error.message;showStatus(error.message);
 }
}
async function createExact(){
 if(buildBusy)return null;
 const d=data();
 if(!d.customer)return exportError('Sila isi nama penuh pelanggan.');
 if(!window.VSO_VARIANTS.list.some(variant=>variant.id===E('vsoModel').value))return exportError('Pilih model dan varian kereta.');
 if(!Number.isFinite(d.loan)||d.loan<=0)return exportError('Loan Amount mesti lebih daripada RM0.');
 if(!d.color||!/^\d{4}$/.test(d.year))return exportError('Lengkapkan warna dan tahun pembuatan.');
 exportMessage('Sedang menjana PDF…');
 buildBusy=true;const buttons=['vsoDownload','vsoDownloadBottom','vsoToCompiler'].map(E);buttons.forEach(b=>b.disabled=true);
 try{
  const next=await generate(d);
  if(stamp(data())!==next.stamp)return exportError('Maklumat berubah semasa PDF dijana. Tekan jana semula.');
  window.FARIS_GENERATED?.publish('vso',{blob:next.blob,name:next.fname,party:'HIRER',category:'VSO',valid:()=>next.stamp===stamp(data())});
  showStatus('✓ PDF VSO DRAF siap mengikut templat Word.',true);return next;
 }catch(error){return exportError('Gagal menjana PDF: '+error.message)}
 finally{buildBusy=false;buttons.forEach(b=>b.disabled=false)}
}
async function download(event){
 const entry=exportFeedback.find(item=>item.id===event.currentTarget.id);
 const out=result?.stamp===stamp(data())?result:await createExact();
 if(!out)return;
 prepareDownload(out);
 const canStartDownload=navigator.userActivation?.isActive!==false;
 exportMessage(canStartDownload
  ?'PDF sedia. Jika fail belum muncul, tekan Muat turun PDF atau Buka PDF.'
  :'PDF sedia. Tekan Muat turun PDF untuk simpan fail.');
 if(canStartDownload)entry.download.click();
}
async function toCompiler(){
 const out=await createExact();if(!out)return;
 try{if(typeof addFiles!=='function'||typeof switchParty!=='function')throw Error('Modul Compiler belum sedia.');switchParty('HIRER');await addFiles([new File([out.blob],out.fname,{type:'application/pdf'})]);window.VSO_CENTER.openCompiler();showStatus('✓ VSO sudah dihantar ke Compiler.',true);exportMessage('VSO sudah dihantar ke Compiler.')}
 catch(error){exportError('Tidak berjaya hantar ke Compiler: '+error.message)}
}
window.FARIS_VSO_GENERATOR={create:createExact};
E('vsoDownload').onclick=download;E('vsoDownloadBottom').onclick=download;E('vsoToCompiler').onclick=toCompiler;
controlledFields.forEach(id=>{E(id)?.addEventListener('input',invalidate);E(id)?.addEventListener('change',invalidate)});
let resizeTimer=null;const fit=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(previewDoc)renderDocument(previewDoc,drawSeq).catch(e=>{if(e.name!=='RenderingCancelledException')showStatus('Pratonton: '+e.message)})},120)};
window.addEventListener('resize',fit);if(typeof ResizeObserver!=='undefined')new ResizeObserver(fit).observe(viewport);
drawPreview();
})();
