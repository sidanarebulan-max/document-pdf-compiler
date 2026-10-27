(()=>{
"use strict";
const ROOT="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-gallery";
const SESSION="faris_lead_hub_session_v2";
const MODELS={emas7_phev:"e.MAS 7 PHEV",emas7_ev:"e.MAS 7 EV",emas5:"e.MAS 5"};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user=null,rows=[],counts={},model="",search="",next=null,version=0,requestId=0,busy=false;
let previewId=null,previewVersion=0,prepared=null,objectUrl=null,editingId=null;
function notice(text,error=false){$("galleryNotice").textContent=text;$("galleryNotice").classList.remove("hide");$("galleryNotice").classList.toggle("error",error)}
async function api(action,payload={},file=null,retried=false){
 const token=localStorage.getItem(SESSION);if(!token)throw Error("Log masuk dahulu untuk menggunakan Gallery.");
 const headers={Authorization:"Bearer "+token};let body;
 if(file){body=new FormData();body.append("file",file,file.name);body.append("model",payload.model);body.append("title",payload.title||"")}
 else{headers["Content-Type"]="application/json";body=JSON.stringify({action,...payload})}
 const r=await fetch(ROOT+(file?"?action=upload":""),{method:"POST",headers,body,cache:"no-store"});
 if(r.status===401&&!retried){
  if(localStorage.getItem(SESSION)!==token)throw Error("Akaun telah berubah. Buka Gallery semula.");
  await window.FARIS_INBOX_CLIENT.renewSession();return api(action,payload,file,true);
 }
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error(d?.error||"Gallery tidak dapat dihubungi. Cuba lagi.");return d;
}
function controls(){
 $("galleryUploadSubmit").disabled=busy;
 $("galleryUploadToggle").disabled=busy;
 for(const id of ["galleryUploadModel","galleryUploadTitleInput","galleryUploadFiles"])$(id).disabled=busy;
}
function render(){
 const all=Object.values(counts).reduce((n,x)=>n+Number(x),0);
 for(const [id,key] of [["galleryCountPhev","emas7_phev"],["galleryCountEv","emas7_ev"],["galleryCountFive","emas5"]])$(id).textContent=counts[key]||0;
 $("galleryCountAll").textContent=all;
 $("galleryColumns").classList.toggle("gallery-filtered",!!model);
 $("galleryColumns").innerHTML=Object.entries(MODELS).filter(([key])=>!model||key===model).map(([key,label])=>{
  const files=rows.filter(f=>f.model===key);
  return '<section class="gallery-category" data-gallery-category="'+key+'" aria-labelledby="gallery-heading-'+key+'"><div class="gallery-category-heading"><span aria-hidden="true"></span><h3 id="gallery-heading-'+key+'">'+label+'</h3><small>'+files.length+' / '+(counts[key]||0)+'</small></div><div class="gallery-items">'+(files.length?files.map(f=>'<article class="gallery-card"><button type="button" class="gallery-image-button" data-gallery-preview="'+esc(f.id)+'" aria-label="Pratonton '+esc(f.title)+'"><img src="'+esc(f.url)+'" alt="'+esc(f.title)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button><div class="gallery-card-body"><h4>'+esc(f.title)+'</h4><small class="gallery-meta">'+esc(new Date(f.created_at).toLocaleDateString("ms-MY",{day:"numeric",month:"short",year:"numeric"}))+' · '+(f.byte_size/1048576).toFixed(2)+' MB</small><div class="gallery-card-actions"><button type="button" class="primary" data-gallery-share="'+esc(f.id)+'">↗ Kongsi</button><button type="button" class="secondary" data-gallery-download="'+esc(f.id)+'">↓ Download</button></div>'+(user?.role==="admin"?'<div class="gallery-admin-actions"><button type="button" class="secondary" data-gallery-edit="'+esc(f.id)+'">Edit</button><button type="button" class="secondary gallery-delete" data-gallery-delete="'+esc(f.id)+'">Padam</button></div>':"")+'</div></article>').join(""):'<div class="gallery-empty"><span aria-hidden="true">▧</span>'+(search?'Tiada gambar sepadan dengan carian.':counts[key]?'Tekan “Muat lagi gambar” untuk lihat bahan kategori ini.':'Belum ada gambar '+label+'.<br>'+(user?.role==="admin"?'Upload gambar untuk dikongsi dengan pasukan.':'Gambar akan muncul selepas admin upload.'))+'</div>')+'</div></section>';
 }).join("");
 $("galleryLoadMore").classList.toggle("hide",next===null);
 document.querySelectorAll("[data-gallery-model]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.galleryModel===model)));
}
async function refresh(append=false){
 if(!user)return;const generation=version,id=++requestId;
 $("galleryColumns").setAttribute("aria-busy","true");$("galleryRefresh").disabled=true;$("galleryLoadMore").disabled=true;
 if(!append){rows=[];next=null;render();$("gallerySummary").textContent="Memuatkan Gallery…"}
 try{
  const d=await api("list",{model,search,offset:append?next||0:0});
  if(generation!==version||id!==requestId)return;
  rows=append?[...new Map([...rows,...d.files].map(f=>[f.id,f])).values()]:d.files;counts=d.counts||{};next=d.next_offset;
  render();$("gallerySummary").textContent=rows.length+" daripada "+d.total+" gambar"+(search?' untuk “'+search+'”':"")+" · Terbaharu dahulu";
 }catch(e){if(generation===version&&id===requestId){notice(e.message,true);$("gallerySummary").textContent="Gallery belum dapat dimuatkan. Tekan Refresh untuk cuba lagi."}}
 finally{if(generation===version&&id===requestId){$("galleryColumns").setAttribute("aria-busy","false");$("galleryRefresh").disabled=false;$("galleryLoadMore").disabled=false}}
}
async function validateImage(file){
 if(!file.size||file.size>20*1048576)throw Error(file.name+": gambar mesti antara 1 bait dan 20 MB.");
 if(!/\.(jpe?g|png|webp)$/i.test(file.name))throw Error(file.name+": gunakan JPG, PNG atau WebP.");
 // Decode before upload so truncated or corrupt images cannot be published accidentally.
 const url=URL.createObjectURL(file);
 try{await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth&&image.naturalHeight?resolve():reject(Error("Gambar kosong."));image.onerror=()=>reject(Error(file.name+": gambar tidak dapat dibaca."));image.src=url})}finally{URL.revokeObjectURL(url)}
}
async function upload(e){
 e.preventDefault();if(busy||user?.role!=="admin")return;
 const files=[...$("galleryUploadFiles").files];if(!files.length)return;
 const generation=version,payload={model:$("galleryUploadModel").value,title:$("galleryUploadTitleInput").value.trim()};let saved=0;
 busy=true;controls();
 try{
  for(const file of files){
   if(generation!==version)return;
   notice("Menyimpan "+(saved+1)+" / "+files.length+": "+file.name);
   await validateImage(file);if(generation!==version)return;
   await api("upload",payload,file);saved++;
  }
  if(generation===version){notice(saved+" gambar disimpan. Semua staff boleh lihat dalam Gallery.");$("galleryUploadFiles").value="";$("galleryUploadTitleInput").value=""}
 }catch(e){if(generation===version){
  // Remove successful files from the selection so retry cannot silently duplicate them.
  try{const remaining=new DataTransfer();for(const file of files.slice(saved))remaining.items.add(file);$("galleryUploadFiles").files=remaining.files}catch{$("galleryUploadFiles").value=""}
  notice(saved+" gambar telah disimpan. "+e.message,true);
 }}finally{if(generation===version){busy=false;controls();await refresh()}}
}
function clearPreview(){previewVersion++;previewId=null;prepared=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$("galleryPreviewImage").removeAttribute("src");$("galleryPreviewImage").alt="";$("galleryPreviewTitle").textContent=""}
function canShare(){try{return !!prepared&&!!navigator.share&&!!navigator.canShare?.({files:[prepared]})}catch{return false}}
async function fetchFile(id){const d=await api("download",{id});const r=await fetch(d.url,{cache:"no-store"});if(!r.ok)throw Error("Gambar tidak dapat dimuat turun. Refresh dan cuba lagi.");return new File([await r.blob()],d.file.original_name,{type:d.file.mime_type})}
async function openPreview(id,wantsShare=false){
 const row=rows.find(f=>f.id===id);if(!row||!user)return;
 clearPreview();previewId=id;const pv=previewVersion,generation=version;
 $("galleryPreviewTitle").textContent=row.title;$("galleryPreviewModel").textContent=MODELS[row.model];$("galleryPreviewImage").src=row.url;$("galleryPreviewImage").alt=row.title;
 $("galleryPreviewStatus").textContent="Menyediakan gambar asal…";$("galleryPreviewShare").disabled=true;$("galleryPreviewDownload").disabled=true;
 if(!$("galleryPreview").open)$("galleryPreview").showModal();
 try{
  const file=await fetchFile(id);if(generation!==version||pv!==previewVersion)return;
  prepared=file;objectUrl=URL.createObjectURL(file);$("galleryPreviewImage").src=objectUrl;
  $("galleryPreviewShare").disabled=!canShare();$("galleryPreviewDownload").disabled=false;
  $("galleryPreviewStatus").textContent=canShare()?(wantsShare?"Gambar sedia. Tekan Kongsi Gambar untuk pilih WhatsApp atau aplikasi lain.":"Gambar asal sedia untuk kongsi atau download."):"Download gambar dahulu, kemudian lampirkan dalam WhatsApp. Peranti ini tidak menyediakan pilihan kongsi fail.";
  if(wantsShare&&canShare())$("galleryPreviewShare").focus();
 }catch(e){if(generation===version&&pv===previewVersion)$("galleryPreviewStatus").textContent=e.message}
}
function saveFile(file){const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function download(id,button){
 const generation=version;button.disabled=true;
 try{const file=await fetchFile(id);if(generation!==version)return;saveFile(file);notice("Download dimulakan: "+file.name)}catch(e){if(generation===version)notice(e.message,true)}finally{button.disabled=false}
}
async function sharePrepared(){
 if(!prepared||!canShare())return;
 const pv=previewVersion,generation=version;const button=$("galleryPreviewShare");button.disabled=true;
 try{await navigator.share({files:[prepared]});if(generation===version&&pv===previewVersion)$("galleryPreviewStatus").textContent="Pilihan kongsi telah ditutup."}
 catch(e){if(generation===version&&pv===previewVersion&&e.name!=="AbortError")$("galleryPreviewStatus").textContent="Tidak dapat buka pilihan kongsi. Cuba lagi atau download gambar dahulu."}
 finally{if(generation===version&&pv===previewVersion)button.disabled=false}
}
function edit(id){
 const row=rows.find(f=>f.id===id);if(!row||user?.role!=="admin")return;
 editingId=id;$("galleryEditName").value=row.title;$("galleryEditModel").value=row.model;$("galleryEditStatus").textContent="";$("galleryEditSave").disabled=false;$("galleryEdit").showModal();
}
async function saveEdit(e){
 e.preventDefault();if(!editingId||user?.role!=="admin"||$("galleryEditSave").disabled)return;
 const generation=version,id=editingId;$("galleryEditSave").disabled=true;
 try{await api("edit",{id,title:$("galleryEditName").value.trim(),model:$("galleryEditModel").value});if(generation!==version)return;$("galleryEdit").close();notice("Tajuk dan kategori gambar dikemas kini.");await refresh()}
 catch(e){if(generation===version)$("galleryEditStatus").textContent=e.message}
 finally{if(generation===version)$("galleryEditSave").disabled=false}
}
async function remove(id,button){
 const row=rows.find(f=>f.id===id);if(!row||user?.role!=="admin"||!confirm('Padam gambar “'+row.title+'” daripada Gallery semua staff?'))return;
 const generation=version;button.disabled=true;
 try{await api("delete",{id,confirmed:true});if(generation!==version)return;notice("Gambar telah dipadam daripada Gallery.");await refresh()}
 catch(e){if(generation===version)notice(e.message,true)}finally{button.disabled=false}
}
function reset(){
 version++;requestId++;user=null;rows=[];counts={};model="";search="";next=null;busy=false;editingId=null;
 for(const id of ["galleryPreview","galleryEdit"])if($(id).open)$(id).close();clearPreview();
 $("galleryColumns").innerHTML="";$("galleryUploadPanel").classList.add("hide");$("galleryUploadToggle").classList.add("hide");$("galleryUploadToggle").setAttribute("aria-expanded","false");
 $("galleryNotice").classList.add("hide");$("gallerySearch").value="";$("galleryUploadForm").reset();$("galleryEditForm").reset();$("galleryRefresh").disabled=false;controls();
}
window.FARIS_GALLERY={onLogin(account){reset();user=account;$("galleryUploadToggle").classList.toggle("hide",user.role!=="admin");render()},onLogout:reset,onShow(){refresh()}};
document.addEventListener("DOMContentLoaded",()=>{
 $("galleryRefresh").addEventListener("click",()=>refresh());$("galleryLoadMore").addEventListener("click",()=>refresh(true));
 $("galleryUploadToggle").addEventListener("click",()=>{const open=$("galleryUploadPanel").classList.toggle("hide")===false;$("galleryUploadToggle").setAttribute("aria-expanded",String(open));if(open)$("galleryUploadModel").focus()});
 $("galleryUploadForm").addEventListener("submit",upload);
 $("gallerySearchForm").addEventListener("submit",e=>{e.preventDefault();search=$("gallerySearch").value.trim();refresh()});
 $("gallerySearch").addEventListener("search",()=>{if(!$("gallerySearch").value){search="";refresh()}});
 document.querySelectorAll("[data-gallery-model]").forEach(b=>b.addEventListener("click",()=>{model=b.dataset.galleryModel;refresh()}));
 $("galleryColumns").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.galleryPreview)openPreview(b.dataset.galleryPreview);
  else if(b.dataset.galleryShare)openPreview(b.dataset.galleryShare,true);
  else if(b.dataset.galleryDownload)download(b.dataset.galleryDownload,b);
  else if(b.dataset.galleryEdit)edit(b.dataset.galleryEdit);
  else if(b.dataset.galleryDelete)remove(b.dataset.galleryDelete,b);
 });
 $("galleryPreviewClose").addEventListener("click",()=>$("galleryPreview").close());$("galleryPreview").addEventListener("close",clearPreview);
 $("galleryPreviewShare").addEventListener("click",sharePrepared);
 $("galleryPreviewDownload").addEventListener("click",()=>{if(prepared&&user)saveFile(prepared)});
 $("galleryEditClose").addEventListener("click",()=>$("galleryEdit").close());$("galleryEdit").addEventListener("close",()=>{editingId=null});$("galleryEditForm").addEventListener("submit",saveEdit);
});
})();
