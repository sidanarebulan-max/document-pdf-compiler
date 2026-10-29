(()=>{
'use strict';
const SESSION='faris_lead_hub_session_v2',API='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-customers';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const results=new Map();let current=null,identity=null,rows=[],next=null,seq=0,epoch=0,busy=false;
const buttons={compiler:'compilerSaveProfile',vso:'vsoSaveProfile',application:'applicationSaveProfile'};
const dialog=document.createElement('dialog');dialog.id='generatedProfileDialog';dialog.className='generated-profile-dialog';dialog.setAttribute('aria-labelledby','generatedProfileTitle');
dialog.innerHTML='<div class="generated-profile-head"><h2 id="generatedProfileTitle">Simpan ke Profil Pelanggan</h2><button type="button" class="btn" id="generatedProfileClose" aria-label="Tutup pemilih customer">✕</button></div><div id="generatedProfileFile" class="generated-profile-file"></div><p class="generated-profile-hint">Cari customer, kemudian tekan “Simpan ke Profil Ini”. Fail asal yang dijana akan disimpan dalam Dokumen customer tersebut.</p><form id="generatedProfileSearchForm" class="generated-profile-search"><input type="search" id="generatedProfileSearch" maxlength="100" placeholder="Cari nama atau nombor telefon…" aria-label="Cari customer"><button class="btn primary" type="submit">Cari</button></form><p id="generatedProfileStatus" role="status" aria-live="polite"></p><div id="generatedProfileList"></div><button type="button" class="btn" id="generatedProfileMore" hidden>Muat lagi customer</button><a id="generatedProfileOpen" hidden>Buka Profil Pelanggan →</a>';
document.body.append(dialog);
function status(text,error=false){$('generatedProfileStatus').textContent=text;$('generatedProfileStatus').classList.toggle('error',error)}
function controls(){
 for(const [source,id] of Object.entries(buttons)){const b=$(id),r=results.get(source);if(b)b.disabled=!r||!r.valid()||busy}
 $('generatedProfileClose').disabled=busy;$('generatedProfileSearch').disabled=busy;$('generatedProfileSearchForm').querySelector('button').disabled=busy;$('generatedProfileMore').disabled=busy;
 dialog.querySelectorAll('[data-generated-target]').forEach(b=>b.disabled=busy);
}
window.FARIS_GENERATED={
 publish(source,data){if(!buttons[source]||!(data.blob instanceof Blob)||data.blob.type!=='application/pdf')return;results.set(source,{...data,source,valid:data.valid||(()=>true),uploaded:null,saved:null,operation:null,target:null});controls()},
 clear(source){results.delete(source);controls()}
};
async function api(action,payload={},retried=false){
 const token=localStorage.getItem(SESSION);if(!token)throw Error('Log masuk ke Lead Hub dahulu, kemudian buka semula pemilih profil.');
 const r=await fetch(API,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
 if(r.status===401&&!retried){if(localStorage.getItem(SESSION)!==token)throw Error('Akaun telah berubah. Buka pemilih profil semula.');await window.FARIS_INBOX_CLIENT.renewSession();return api(action,payload,true)}
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error(d?.error||'Profil tidak dapat dihubungi. Cuba lagi.');return d;
}
function render(){
 $('generatedProfileList').innerHTML=rows.length?rows.map(r=>'<article class="generated-customer"><div><b>'+esc(r.customer_name)+'</b><small>'+esc(r.phone_e164)+' · '+esc(r.model||'Model belum dipilih')+'</small><small>Staff: '+esc(r.staff_name||'Belum diagih')+'</small></div><button type="button" class="btn primary" data-generated-target="'+esc(r.id)+'">Simpan ke Profil Ini</button></article>').join(''):'<div class="generated-profile-empty">Tiada customer sepadan. Semak carian atau agihan customer dalam Lead Hub.</div>';
 $('generatedProfileMore').hidden=next===null;controls();
}
async function load(append=false){
 if(!identity||!current||busy)return;const generation=epoch,id=++seq;$('generatedProfileMore').disabled=true;
 if(!append){rows=[];next=null;$('generatedProfileList').innerHTML=''}status('Memuatkan senarai customer…');
 try{const d=await api('list',{search:$('generatedProfileSearch').value,offset:append?next||0:0});if(generation!==epoch||id!==seq)return;rows=append?[...new Map([...rows,...d.customers].map(r=>[r.id,r])).values()]:d.customers;next=d.next_offset;render();status(rows.length+' daripada '+d.total+' customer · Pilih profil yang betul untuk fail ini.')}
 catch(e){if(generation===epoch&&id===seq)status(e.message,true)}finally{if(generation===epoch&&id===seq)$('generatedProfileMore').disabled=false}
}
async function open(source){
 const r=results.get(source);if(!r||busy)return;
 if(!r.valid()){results.delete(source);controls();alert('Maklumat atau dokumen telah berubah. Jana PDF semula sebelum simpan ke profil.');return}
 current=r;identity=null;rows=[];next=null;epoch++;seq++;const generation=epoch;
 $('generatedProfileFile').textContent=r.name+' · '+(r.blob.size/1048576).toFixed(2)+' MB\n'+(r.source==='application'?'Application Form · Pemohon / Lain-lain':r.source==='vso'?'VSO DRAF · Pemohon / VSO':r.party==='REBATE'?'PDF gabungan · Corp & Gov Rebate / Lain-lain':r.party==='GUARANTOR'?'Dokumen lengkap · Penjamin':'Dokumen lengkap · Pemohon (termasuk bahagian penjamin jika digabung)');
 $('generatedProfileSearch').value='';$('generatedProfileList').innerHTML='';$('generatedProfileMore').hidden=true;$('generatedProfileOpen').hidden=true;$('generatedProfileOpen').removeAttribute('href');status('Menyemak akaun…');dialog.showModal();
 if(r.blob.size>20*1048576){status('PDF ini melebihi had simpanan 20 MB. Kecilkan PDF atau jana dalam beberapa bahagian sebelum simpan.',true);return}
 try{
  const me=await window.FARIS_INBOX_CLIENT.request('me');if(generation!==epoch)return;identity=me.user;
  if(r.saved&&r.saved.account_id===identity.id){showSaved(r.saved);return}
  if(r.uploaded&&r.uploaded.account_id!==identity.id){status('Fail ini telah dihantar menggunakan akaun lain. Gunakan akaun asal untuk menyambung simpanan.',true);return}
  await load();
 }catch(e){if(generation===epoch)status(e.message,true)}
}
function showSaved(saved){
 $('generatedProfileList').innerHTML='';$('generatedProfileMore').hidden=true;status('✓ '+current.name+' sudah disimpan dalam Dokumen '+saved.name+'.');
 $('generatedProfileOpen').href='/staff.html?customer='+encodeURIComponent(saved.id)+'&customer_tab=documents#customers';$('generatedProfileOpen').hidden=false;
}
async function sameAccount(expected){const me=await window.FARIS_INBOX_CLIENT.request('me');if(me.user.id!==expected)throw Error('Akaun telah berubah. Fail yang sudah diupload kekal dalam Fail Masuk akaun asal.');return me.user}
async function save(target){
 if(busy||!current||!identity)return;const row=rows.find(r=>r.id===target);if(!row)return;
 const snapshot=current,account=identity.id,generation=epoch;busy=true;controls();status('Menyimpan PDF ke profil '+row.customer_name+'…');
 try{
  await sameAccount(account);if(generation!==epoch)return;
  if(!snapshot.uploaded){const file=new File([snapshot.blob],snapshot.name,{type:'application/pdf'});const d=await window.FARIS_INBOX_CLIENT.upload(file);snapshot.uploaded={id:d.files[0].id,account_id:account}}
  if(generation!==epoch)return;await sameAccount(account);if(generation!==epoch)return;
  if(snapshot.target!==target){snapshot.target=target;snapshot.operation=crypto.randomUUID()}
  await api('link_files',{lead_id:target,operation_id:snapshot.operation,data:{ids:[snapshot.uploaded.id],party:snapshot.party,category:snapshot.category}});
  if(generation!==epoch)return;snapshot.saved={id:target,name:row.customer_name,account_id:account};showSaved(snapshot.saved);
 }catch(e){if(generation===epoch)status(e.message+(snapshot.uploaded?' PDF yang sudah diupload kekal disimpan; tekan profil yang sama untuk cuba pautkan semula.':''),true)}
 finally{busy=false;controls()}
}
function addButton(source,anchor,label){if(!anchor)return;const b=document.createElement('button');b.type='button';b.className=source==='compiler'?'btn good':'vsoSecondary';b.id=buttons[source];b.textContent=label;b.disabled=true;b.addEventListener('click',()=>open(source));anchor.insertAdjacentElement('afterend',b)}
addButton('compiler',$('downloadBtn'),'Simpan ke Profil Pelanggan');addButton('vso',$('vsoToCompiler'),'Simpan VSO ke Profil Pelanggan');
addButton('application',$('applicationToCompiler'),'Simpan ke Profil Pelanggan');
$('generatedProfileClose').addEventListener('click',()=>dialog.close());dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault()});dialog.addEventListener('close',()=>{epoch++;seq++;current=null;identity=null;rows=[];$('generatedProfileList').innerHTML='';$('generatedProfileFile').textContent='';$('generatedProfileSearch').value='';$('generatedProfileOpen').hidden=true;$('generatedProfileOpen').removeAttribute('href')});
$('generatedProfileSearchForm').addEventListener('submit',e=>{e.preventDefault();load()});$('generatedProfileMore').addEventListener('click',()=>load(true));$('generatedProfileList').addEventListener('click',e=>{const b=e.target.closest('[data-generated-target]');if(b)save(b.dataset.generatedTarget)});
// Update availability when source forms change; the frozen PDF remains tied to its generation inputs.
document.addEventListener('input',controls);document.addEventListener('change',controls);
window.addEventListener('storage',e=>{if(e.key===SESSION){epoch++;seq++;if(dialog.open)dialog.close();identity=null;controls()}});
})();
