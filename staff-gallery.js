(()=>{
"use strict";
const ROOT="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-gallery";
const SESSION="faris_lead_hub_session_v2";
const MODELS={emas7_phev:"e.MAS 7 PHEV",emas7_ev:"e.MAS 7 EV",emas5:"e.MAS 5",poster_posting:"Poster Posting"};
const VARIANTS={
 emas7_phev:{prime:"PHEV Prime",premium:"PHEV Premium",premium_plus:"PHEV Premium Plus"},
 emas7_ev:{premium:"Premium",premium_plus:"Premium Plus"},
 emas5:{prime:"Prime",premium:"Premium"}
};
const COLOURS={
 white:["Putih","#f4f5f7"],black:["Hitam","#20242a"],silver:["Perak","#b6bec8"],
 grey:["Kelabu","#697581"],pink:["Pink","#ed9abf"],blue:["Biru","#4682c9"],
 green:["Hijau","#4a876b"],red:["Merah","#cc4854"],brown:["Coklat","#926649"],
 yellow:["Kuning","#e7b847"],purple:["Ungu","#9873b8"],two_tone:["Dua tona","linear-gradient(135deg,#eef2f7 50%,#263348 50%)"]
};
const VIEWS={front:"Depan",rear:"Belakang",side:"Sisi",exterior:"Luaran",interior:"Dalaman",dashboard:"Papan pemuka",seats:"Tempat duduk",boot:"Ruang but",wheels:"Rim & tayar",charging:"Pengecasan",brochure:"Brosur",other:"Lain-lain"};
const POSTER_TYPES={car:"Poster Kereta",general:"Poster Biasa"};
const TAG_FIELDS=["variant","colour","view","poster_type"];
const COLOUR_LABELS=Object.fromEntries(Object.entries(COLOURS).map(([key,[label]])=>[key,label]));
const LAYOUTS=["grid","horizontal","list","focus"];
const LAYOUT_KEY="faris_gallery_layout_v2:";
const $=id=>document.getElementById(id);
const pretty=s=>String(s??"").replace(/_/g," ").replace(/\s+/g," ").trim();
const filesCache=new Map();
const hide=(id,value)=>{$(id).hidden=value;$(id).classList.toggle("hide",value)};
function savedLayout(){try{const value=localStorage.getItem(LAYOUT_KEY+user.id);return LAYOUTS.includes(value)?value:"grid"}catch{return "grid"}}
function setLayout(value){if(!user||!LAYOUTS.includes(value))return;layout=value;try{localStorage.setItem(LAYOUT_KEY+user.id,value)}catch{}render()}

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user=null,rows=[],counts={},model="",search="",next=null,version=0,requestId=0,busy=false,total=0,loading=false,layout="grid";
let filters={};
let previewId=null,previewVersion=0,prepared=null,objectUrl=null,editingId=null;
function notice(text,error=false){$("galleryNotice").textContent=text;$("galleryNotice").classList.remove("hide");$("galleryNotice").classList.toggle("error",error)}
async function api(action,payload={},file=null,retried=false){
 const token=localStorage.getItem(SESSION);if(!token)throw Error("Log masuk dahulu untuk menggunakan Gallery.");
 const headers={Authorization:"Bearer "+token};let body;
 if(file){
  body=new FormData();body.append("file",file,file.name);
  for(const key of ["model","title",...TAG_FIELDS])body.append(key,payload[key]||"");
 }
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
 $("galleryUploadTags").querySelectorAll("select").forEach(select=>{select.disabled=busy});
}
function choices(options,emptyLabel){
 const empty=emptyLabel?'<option value="">'+esc(emptyLabel)+'</option>':"";
 return empty+Object.entries(options).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join("");
}
function configureTags(kind,values={}){
 const selectedModel=$("gallery"+kind+"Model").value;
 const group=$("gallery"+kind+"Tags");
 const fields=selectedModel==="poster_posting"
  ?[["poster_type","Jenis poster",POSTER_TYPES,null]]
  :[["variant","Varian",VARIANTS[selectedModel]||{},"Belum ditag"],["colour","Warna",COLOUR_LABELS,"Belum ditag"],["view","Bahagian gambar",VIEWS,"Belum ditag"]];
 group.innerHTML=fields.map(([key,label,options,empty])=>
  '<label>'+label+'<select name="'+key+'">'+choices(options,empty)+'</select></label>'
 ).join("");
 for(const [key,,,empty] of fields)group.querySelector('[name="'+key+'"]').value=values[key]||(empty?"":"general");
}
function formTags(kind){
 const group=$("gallery"+kind+"Tags");
 return Object.fromEntries(TAG_FIELDS.map(key=>[key,group.querySelector('[name="'+key+'"]')?.value||""]));
}
function albumFilters(tags={}){
 if(model==="poster_posting")return {poster_type:tags.poster_type||"general"};
 return {variant:tags.variant||"",colour:tags.colour||"",view:tags.view||""};
}
function filterButton(field,key,label,swatch=""){
 return '<button class="gallery-filter-button" type="button" data-gallery-filter="'+field+'" value="'+key+'" aria-pressed="false">'+
  (swatch?'<span class="gallery-swatch" style="--swatch:'+swatch+'" aria-hidden="true"></span>':"")+esc(label)+'</button>';
}
function renderCatalogue(){
 const root=$("galleryCatalogue");
 if(root.dataset.model!==model){
  root.dataset.model=model;
  if(model==="poster_posting"){
   root.innerHTML='<div class="gallery-filter-options" role="group" aria-label="Jenis poster">'+
    Object.entries(POSTER_TYPES).map(([key,label])=>filterButton("poster_type",key,label)).join("")+'</div>';
  }else{
   const variants=Object.entries(VARIANTS[model]||{}).map(([key,label])=>filterButton("variant",key,label)).join("");
   const colours=Object.entries(COLOURS).map(([key,[label,swatch]])=>filterButton("colour",key,label,swatch)).join("");
   root.innerHTML='<fieldset><legend>Varian</legend><div class="gallery-filter-options">'+filterButton("variant","","Semua varian")+variants+'</div></fieldset>'+
    '<fieldset class="gallery-colour-filter"><legend>Warna</legend><div class="gallery-filter-options">'+filterButton("colour","","Semua warna")+colours+'</div></fieldset>'+
    '<div class="gallery-filter-footer"><label>Bahagian gambar<select id="galleryView">'+choices(VIEWS,"Semua bahagian")+'</select></label>'+
    '<button type="button" id="galleryClearFilters" class="secondary">Reset penapis</button></div>';
  }
 }
 root.querySelectorAll("[data-gallery-filter]").forEach(button=>{
  button.setAttribute("aria-pressed",String((filters[button.dataset.galleryFilter]||"")===button.value));
 });
 const view=$("galleryView");if(view)view.value=filters.view||"";
}
function imageTags(file){
 if(file.model==="poster_posting")return POSTER_TYPES[file.poster_type||"general"]||"";
 return [VARIANTS[file.model]?.[file.variant],COLOUR_LABELS[file.colour],VIEWS[file.view]].filter(Boolean).join(" · ");
}
function imageCard(f){
 const title=pretty(f.title),tags=imageTags(f);
 return `<article class="gallery-card" data-gallery-file="${esc(f.id)}">
  <button type="button" class="gallery-image-button" data-gallery-preview="${esc(f.id)}" aria-label="Pratonton ${esc(title)}"><img src="${esc(f.url)}" alt="${esc(title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></button>
  <div class="gallery-card-body"><h4 title="${esc(title)}">${esc(title)}</h4>${tags?'<small class="gallery-image-tags">'+esc(tags)+'</small>':""}<small class="gallery-meta">${esc(new Date(f.created_at).toLocaleDateString("ms-MY",{day:"numeric",month:"short",year:"numeric"}))} · ${(f.byte_size/1048576).toFixed(2)} MB</small>
   <div class="gallery-card-actions"><button type="button" class="primary gallery-status-button" data-gallery-share="${esc(f.id)}" aria-label="Kongsi ${esc(title)} ke Status">↗ Status</button><button type="button" class="secondary" data-gallery-download="${esc(f.id)}">↓ Download</button></div>
   ${user?.role==="admin"?`<div class="gallery-admin-actions"><button type="button" class="secondary" data-gallery-edit="${esc(f.id)}">Edit</button><button type="button" class="secondary gallery-delete" data-gallery-delete="${esc(f.id)}">Padam</button></div>`:""}
  </div></article>`;
}
function updateRail(){
 const rail=$("galleryColumns");
 $("galleryPrevious").disabled=rail.scrollLeft<=2;
 $("galleryNext").disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;
}
function render(){
 const all=Object.values(counts).reduce((n,x)=>n+(Number(x)||0),0);
 $("galleryCountAll").textContent=all;
 const home=!model;
 hide("galleryAlbums",!home);hide("galleryBrowser",home);
 hide("galleryLoadMore",home||next===null);
 $("gallerySearch").placeholder=home?"Cari tajuk album…":"Cari tajuk gambar…";
 $("gallerySearch").setAttribute("aria-label",home?"Cari tajuk album":"Cari tajuk gambar");
 if(home){
  const entries=Object.entries(MODELS).filter(([,label])=>label.toLocaleLowerCase("ms").includes(search.toLocaleLowerCase("ms")));
  $("galleryAlbums").innerHTML=entries.length?entries.map(([key,label])=>`<button type="button" class="gallery-album" data-gallery-model="${key}" aria-label="Buka album ${label}"><span class="gallery-album-top"><span class="gallery-folder" aria-hidden="true">▱</span><span class="gallery-album-count">${Number(counts[key])||0} gambar</span></span><strong>${label}</strong><span class="gallery-album-description">${key==="poster_posting"?"Poster, tips dan bahan untuk posting harian.":"Brosur, warna dan bahan jualan model ini."}</span><span class="gallery-album-open">Buka album <span aria-hidden="true">→</span></span></button>`).join(""):"<p class=\"gallery-empty\">Tiada tajuk album sepadan.</p>";
  $("galleryColumns").innerHTML="";
  $("gallerySummary").textContent=loading?"Memuatkan album…":entries.length+" album · "+all+" gambar. Pilih tajuk untuk membuka album.";
 }else{
  $("galleryAlbumTitle").textContent=MODELS[model];
  $("galleryAlbumCount").textContent=(Number(counts[model])||0)+" gambar dalam album";
  renderCatalogue();
  $("galleryColumns").className="gallery-columns gallery-layout-"+layout;
  const hasFilters=!!(search||filters.variant||filters.colour||filters.view);
  const empty=hasFilters?"Tiada gambar sepadan dengan penapis.":model==="poster_posting"?"Belum ada gambar dalam "+POSTER_TYPES[filters.poster_type]+".":"Album ini belum mempunyai gambar.";
  $("galleryColumns").innerHTML=rows.length?rows.map(imageCard).join(""):`<div class="gallery-empty">${loading?"Memuatkan gambar…":empty}${!loading&&!hasFilters&&user?.role==="admin"?"<br>Tekan Upload Gambar untuk menambah bahan.":""}</div>`;
  $("gallerySummary").textContent=loading?"Memuatkan gambar…":rows.length+" daripada "+total+" gambar"+(search?' untuk “'+search+'”':"")+" · Terbaharu dahulu";
  $("galleryLayout").value=layout;
  hide("galleryRailControls",layout!=="horizontal"||!rows.length);
  requestAnimationFrame(updateRail);
  // Prepare only two small files; a later Status tap can call native share in its user gesture.
  if(typeof navigator.share==="function"&&typeof navigator.canShare==="function")rows.slice(0,2).filter(f=>f.byte_size<=5*1048576).forEach(f=>fetchFile(f.id).catch(()=>{}));
 }
}
async function refresh(append=false){
 if(!user)return;const generation=version,id=++requestId;
 $("galleryColumns").setAttribute("aria-busy","true");$("galleryRefresh").disabled=true;$("galleryLoadMore").disabled=true;
 if(!append){rows=[];next=null;total=0;loading=true;render()}
 try{
  const d=await api("list",{model,search:model?search:"",...(model?filters:{}),offset:append?next||0:0});
  if(generation!==version||id!==requestId)return;
  rows=append?[...new Map([...rows,...d.files].map(f=>[f.id,f])).values()]:d.files;counts=d.counts||{};next=d.next_offset;total=d.total||0;loading=false;
  render();
 }catch(e){if(generation===version&&id===requestId){loading=false;render();notice(e.message,true);$("gallerySummary").textContent="Gallery belum dapat dimuatkan. Tekan Refresh untuk cuba lagi."}}
 finally{if(generation===version&&id===requestId){$("galleryColumns").setAttribute("aria-busy","false");$("galleryRefresh").disabled=false;$("galleryLoadMore").disabled=false}}
}
async function openAlbum(key){
 if(!user||!Object.hasOwn(MODELS,key))return;
 model=key;filters=albumFilters();search="";$("gallerySearch").value="";$("galleryNotice").classList.add("hide");
 const generation=version;await refresh();
 if(generation===version&&model===key){$("galleryAlbumTitle").focus({preventScroll:true});$("galleryBrowser").scrollIntoView({block:"start",behavior:"smooth"})}
}
async function albums(){
 if(!user)return;const old=model;model="";filters={};search="";$("gallerySearch").value="";$("galleryNotice").classList.add("hide");
 await refresh();if(!model)document.querySelector('[data-gallery-model="'+old+'"]')?.focus({preventScroll:true});
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
 const generation=version,originModel=model;
 const payload={model:$("galleryUploadModel").value,title:$("galleryUploadTitleInput").value.trim(),...formTags("Upload")};
 let saved=0,skipped=0,processed=0;
 busy=true;controls();
 try{
  for(const file of files){
   if(generation!==version)return;
   notice("Menyemak "+(processed+1)+" / "+files.length+": "+file.name);
   await validateImage(file);if(generation!==version)return;
   const result=await api("upload",payload,file);if(result.duplicate)skipped++;else saved++;processed++;
  }
  if(generation===version){notice(saved+" gambar baharu disimpan."+(skipped?" "+skipped+" gambar pendua dilangkau; salinan asal dikekalkan.":" Semua staff boleh lihat dalam Gallery."));$("galleryUploadFiles").value="";$("galleryUploadTitleInput").value="";if(saved&&model===originModel){model=payload.model;filters=albumFilters(payload);search="";$("gallerySearch").value=""}}
 }catch(e){if(generation===version){
  // Remove successful files from the selection so retry cannot silently duplicate them.
  try{const remaining=new DataTransfer();for(const file of files.slice(processed))remaining.items.add(file);$("galleryUploadFiles").files=remaining.files}catch{$("galleryUploadFiles").value=""}
  notice(saved+" gambar disimpan, "+skipped+" pendua dilangkau. "+e.message,true);
 }}finally{if(generation===version){busy=false;controls();await refresh()}}
}
function clearPreview(){previewVersion++;previewId=null;prepared=null;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$("galleryPreviewImage").removeAttribute("src");$("galleryPreviewImage").alt="";$("galleryPreviewTitle").textContent=""}
function canShareFile(file){try{return !!file&&typeof navigator.share==="function"&&!!navigator.canShare?.({files:[file]})}catch{return false}}
function canShare(){return canShareFile(prepared)}
function fetchFile(id){
 const cached=filesCache.get(id);if(cached&&Date.now()-cached.created<300000)return cached.promise;
 filesCache.delete(id);while(filesCache.size>=3)filesCache.delete(filesCache.keys().next().value);
 const generation=version,entry={created:Date.now(),file:null,promise:null};
 entry.promise=(async()=>{const d=await api("download",{id});const r=await fetch(d.url,{cache:"no-store"});if(!r.ok)throw Error("Gambar tidak dapat dimuat turun. Refresh dan cuba lagi.");const file=new File([await r.blob()],d.file.original_name,{type:d.file.mime_type});if(generation!==version)throw Error("Akaun telah berubah. Buka Gallery semula.");entry.file=file;return file})().catch(e=>{if(filesCache.get(id)===entry)filesCache.delete(id);throw e});
 filesCache.set(id,entry);return entry.promise;
}
async function shareFile(file,button,status){
 const generation=version;button.disabled=true;
 try{
  // Invoke before the first await; the native picker requires this tap's activation.
  const sharing=navigator.share({files:[file]});await sharing;
  if(generation===version)status("Menu kongsi telah ditutup. Semak Status Saya dalam WhatsApp.");
 }catch(e){if(generation===version&&e.name!=="AbortError")status("Menu kongsi tidak dapat dibuka. Tekan sekali lagi atau download gambar untuk dimasukkan melalui WhatsApp.")}
 finally{if(generation===version)button.disabled=false}
}
function shareCard(id,button){
 const cached=filesCache.get(id),file=cached&&Date.now()-cached.created<300000?cached.file:null;
 if(canShareFile(file))return shareFile(file,button,text=>notice(text));
 openPreview(id,true);
}
async function openPreview(id,wantsShare=false){
 const row=rows.find(f=>f.id===id);if(!row||!user)return;
 clearPreview();previewId=id;const pv=previewVersion,generation=version;
 $("galleryPreviewTitle").textContent=pretty(row.title);$("galleryPreviewModel").textContent=MODELS[row.model];$("galleryPreviewImage").src=row.url;$("galleryPreviewImage").alt=pretty(row.title);
 $("galleryPreviewStatus").textContent="Menyediakan gambar asal…";hide("galleryPreviewFallback",true);$("galleryPreviewShare").disabled=true;$("galleryPreviewDownload").disabled=true;
 if(!$("galleryPreview").open)$("galleryPreview").showModal();
 try{
  const file=await fetchFile(id);if(generation!==version||pv!==previewVersion)return;
  prepared=file;objectUrl=URL.createObjectURL(file);$("galleryPreviewImage").src=objectUrl;
  $("galleryPreviewShare").disabled=!canShare();$("galleryPreviewDownload").disabled=false;hide("galleryPreviewFallback",canShare());
  $("galleryPreviewStatus").textContent=canShare()?"Gambar asal sedia. Tekan Kongsi Status, kemudian pilih WhatsApp dan Status Saya jika tersedia.":"Download gambar dahulu. Dalam WhatsApp, buka Status Saya dan pilih gambar yang disimpan.";
  if(wantsShare&&canShare())$("galleryPreviewShare").focus();
 }catch(e){if(generation===version&&pv===previewVersion)$("galleryPreviewStatus").textContent=e.message}
}
function saveFile(file){const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function download(id,button){
 const generation=version;button.disabled=true;
 try{const file=await fetchFile(id);if(generation!==version)return;saveFile(file);notice("Download dimulakan: "+file.name)}catch(e){if(generation===version)notice(e.message,true)}finally{button.disabled=false}
}
function sharePrepared(){
 if(!prepared||!canShare())return;
 const pv=previewVersion;shareFile(prepared,$("galleryPreviewShare"),text=>{if(pv===previewVersion)$("galleryPreviewStatus").textContent=text});
}
function edit(id){
 const row=rows.find(f=>f.id===id);if(!row||user?.role!=="admin")return;
 editingId=id;$("galleryEditName").value=row.title;$("galleryEditModel").value=row.model;
 configureTags("Edit",row);
 $("galleryEditStatus").textContent="";$("galleryEditSave").disabled=false;$("galleryEdit").showModal();
}
async function saveEdit(e){
 e.preventDefault();if(!editingId||user?.role!=="admin"||$("galleryEditSave").disabled)return;
 const generation=version,id=editingId;$("galleryEditSave").disabled=true;
 try{await api("edit",{id,title:$("galleryEditName").value.trim(),model:$("galleryEditModel").value,...formTags("Edit")});if(generation!==version)return;$("galleryEdit").close();filesCache.delete(id);notice("Maklumat gambar dikemas kini.");await refresh()}
 catch(e){if(generation===version)$("galleryEditStatus").textContent=e.message}
 finally{if(generation===version)$("galleryEditSave").disabled=false}
}
async function remove(id,button){
 const row=rows.find(f=>f.id===id);if(!row||user?.role!=="admin"||!confirm('Padam gambar “'+row.title+'” daripada Gallery semua staff?'))return;
 const generation=version;button.disabled=true;
 try{await api("delete",{id,confirmed:true});if(generation!==version)return;filesCache.delete(id);notice("Gambar telah dipadam daripada Gallery.");await refresh()}
 catch(e){if(generation===version)notice(e.message,true)}finally{button.disabled=false}
}
function reset(){
 version++;requestId++;user=null;rows=[];counts={};model="";filters={};search="";next=null;busy=false;editingId=null;total=0;loading=false;layout="grid";filesCache.clear();
 for(const id of ["galleryPreview","galleryEdit"])if($(id).open)$(id).close();clearPreview();
 $("galleryColumns").innerHTML="";$("galleryAlbums").innerHTML="";hide("galleryBrowser",true);hide("galleryAlbums",false);hide("galleryLoadMore",true);$("galleryUploadPanel").classList.add("hide");$("galleryUploadToggle").classList.add("hide");$("galleryUploadToggle").setAttribute("aria-expanded","false");
 $("galleryNotice").classList.add("hide");$("gallerySearch").value="";$("galleryUploadForm").reset();$("galleryEditForm").reset();$("galleryRefresh").disabled=false;controls();
}
window.FARIS_GALLERY={onLogin(account){reset();user=account;layout=savedLayout();$("galleryUploadToggle").classList.toggle("hide",user.role!=="admin");render()},onLogout:reset,onShow(){refresh()}};
document.addEventListener("DOMContentLoaded",()=>{
 $("galleryRefresh").addEventListener("click",()=>refresh());$("galleryLoadMore").addEventListener("click",()=>refresh(true));
 $("galleryUploadToggle").addEventListener("click",()=>{
  const open=!$("galleryUploadPanel").classList.toggle("hide");
  $("galleryUploadToggle").setAttribute("aria-expanded",String(open));
  if(open){
   if(model)$("galleryUploadModel").value=model;
   configureTags("Upload",model?filters:{});
   $("galleryUploadModel").focus();
  }
 });
 for(const kind of ["Upload","Edit"])$("gallery"+kind+"Model").addEventListener("change",()=>configureTags(kind));
 $("galleryUploadForm").addEventListener("submit",upload);
 $("gallerySearchForm").addEventListener("submit",e=>{e.preventDefault();search=$("gallerySearch").value.trim();if(model)refresh();else render()});
 $("gallerySearch").addEventListener("search",()=>{if(!$("gallerySearch").value){search="";if(model)refresh();else render()}});
 $("galleryAlbums").addEventListener("click",e=>{const b=e.target.closest("[data-gallery-model]");if(b)openAlbum(b.dataset.galleryModel)});
 $("galleryBack").addEventListener("click",albums);
 $("galleryLayout").addEventListener("change",e=>setLayout(e.target.value));
 $("galleryCatalogue").addEventListener("click",e=>{
  const button=e.target.closest("[data-gallery-filter]");
  if(button){filters[button.dataset.galleryFilter]=button.value;refresh()}
  if(e.target.closest("#galleryClearFilters")){filters=albumFilters();refresh()}
 });
 $("galleryCatalogue").addEventListener("change",e=>{
  if(e.target.id==="galleryView"){filters.view=e.target.value;refresh()}
 });
 $("galleryPrevious").addEventListener("click",()=>$("galleryColumns").scrollBy({left:-Math.max(240,$("galleryColumns").clientWidth*.8),behavior:"smooth"}));
 $("galleryNext").addEventListener("click",()=>$("galleryColumns").scrollBy({left:Math.max(240,$("galleryColumns").clientWidth*.8),behavior:"smooth"}));
 $("galleryColumns").addEventListener("scroll",updateRail,{passive:true});
 window.addEventListener("resize",()=>{if(model&&layout==="horizontal")updateRail()});
 for(const event of ["pointerover","focusin"])$("galleryColumns").addEventListener(event,e=>{const b=e.target.closest("[data-gallery-share]");if(b&&typeof navigator.share==="function")fetchFile(b.dataset.galleryShare).catch(()=>{})});
 $("galleryColumns").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.galleryPreview)openPreview(b.dataset.galleryPreview);
  else if(b.dataset.galleryShare)shareCard(b.dataset.galleryShare,b);
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
