(()=>{
"use strict";
const $=id=>document.getElementById(id),api=()=>window.FARIS_INBOX_CLIENT;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let user=null,rows=[],selected=new Set(),next=null,loading=false,busy=false,generation=0;
const cats={HIRER:["AUTO","VSO","IC","LESEN","PAYSLIP","BANK","OTHER"],GUARANTOR:["AUTO","VSO","IC","LESEN","PAYSLIP","BANK","OTHER"],REBATE:["AUTO","IC_FRONT","IC_BACK","LESEN","SURAT_KERJA","SIJIL_LAHIR","SIJIL_NIKAH","OTHER"]};
function notice(message,error=false){const node=$("inboxNotice");node.textContent=message;node.classList.remove("hide");node.classList.toggle("error",error)}
function selection(){
 $("inboxSelectedCount").textContent=selected.size+" fail dipilih";
 for(const id of ["inboxSaveAssignment","inboxOpenCompiler"])$(id).disabled=busy||!selected.size;
 $("inboxSelectAll").checked=rows.length>0&&rows.every(x=>selected.has(x.id));
}
function render(){
 $("inboxList").innerHTML=rows.length?rows.map(row=>'<article class="inbox-file"><label class="inbox-file-choice"><input type="checkbox" data-inbox-id="'+esc(row.id)+'" '+(selected.has(row.id)?"checked":"")+'><span><b>'+esc(row.original_name)+'</b><small>'+esc((row.byte_size/1048576).toFixed(2)+" MB · "+new Date(row.created_at).toLocaleString("ms-MY"))+'</small><small>'+esc(row.source==="ios_shortcut"?"Dari Share iPhone":"Muat naik melalui web")+' · '+esc(row.state==="assigned"?"Sudah disusun":"Belum diagih")+'</small>'+(row.customer_name?'<small>Pelanggan: '+esc(row.customer_name)+' · '+esc(row.party)+' / '+esc(row.category)+'</small>':"")+'</span></label><button type="button" class="secondary" data-inbox-download="'+esc(row.id)+'">Muat turun</button></article>').join(""):'<div class="empty">Belum ada fail dalam paparan ini. Muat naik dokumen atau gunakan Share iPhone.</div>';
 $("inboxLoadMore").classList.toggle("hide",next===null);selection();
}
async function refresh(append=false){
 if(!user||loading)return;loading=true;$("inboxRefresh").disabled=true;
 const version=generation;
 try{
  const d=await api().request("list",{state:$("inboxState").value,search:$("inboxSearch").value,team:$("inboxTeam").checked,offset:append?next||0:0});
  if(version!==generation)return;
  if(!append){rows=[];selected.clear()}
  rows.push(...d.files);next=d.next_offset;
  $("inboxTotal").textContent=d.total+" fail · "+rows.length+" dipaparkan";
  const owner=$("inboxOwner"),previous=owner.value;
  owner.innerHTML='<option value="">Kekalkan pemilik fail</option>'+(d.staff||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.display_name+" ("+x.staff_code+")")+'</option>').join("");
  owner.value=previous;render();
 }catch(e){if(version===generation)notice(e.message,true)}finally{if(version===generation){loading=false;$("inboxRefresh").disabled=false}}
}
async function upload(){
 const files=[...$("inboxUpload").files];if(!files.length||busy)return;
 busy=true;$("inboxUploadButton").disabled=true;let saved=0;
 const version=generation;
 try{
  for(const file of files){
   if(version!==generation)throw Error("Akaun telah berubah. Penghantaran dihentikan.");
   if(file.size>20*1048576)throw Error(file.name+" melebihi 20 MB.");
   notice("Menyimpan "+(saved+1)+" / "+files.length+": "+file.name);
   await api().upload(file);saved++;
  }
  if(version!==generation)return;
  notice(saved+" fail disimpan dalam Fail Masuk. Belum diagihkan kepada pelanggan.");
 }catch(e){if(version===generation)notice(saved+" fail sudah disimpan. "+e.message,true)}
 finally{if(version===generation){busy=false;$("inboxUploadButton").disabled=false;$("inboxUpload").value="";$("inboxState").value="inbox";await refresh()}}
}
function categories(){
 $("inboxCategory").innerHTML=cats[$("inboxParty").value].map(c=>'<option value="'+c+'">'+(c==="AUTO"?"Semak kategori dalam Compiler":c.replaceAll("_"," "))+'</option>').join("");
}
async function assign(open){
 if(!selected.size||busy)return;
 if(open&&rows.filter(x=>selected.has(x.id)).reduce((n,x)=>n+x.byte_size,0)>80*1048576)return notice("Untuk buka Compiler di telefon, pilih maksimum 80 MB sekali. Fail lain kekal disimpan.",true);
 const ids=[...selected],payload={ids,customer_name:$("inboxCustomer").value.trim(),customer_phone:$("inboxPhone").value.trim(),party:$("inboxParty").value,category:$("inboxCategory").value,owner_id:$("inboxOwner").value||null};
 if(payload.customer_name.length<2)return notice("Isi nama pelanggan sebelum menyusun fail.",true);
 busy=true;selection();
 const version=generation;
 try{
  await api().request("assign",payload);
  if(version!==generation)return;
  if(open){
   sessionStorage.setItem("faris_inbox_compiler_v1",JSON.stringify({ids,account_id:user.id,created_at:Date.now()}));
   location.assign("/?tool=COMPILER&origin=staff&inbox=1");
  }else{notice("Agihan fail disimpan. Fail asal kekal dalam simpanan.");await refresh()}
 }catch(e){if(version===generation)notice(e.message,true)}finally{if(version===generation){busy=false;selection()}}
}
async function keyStatus(){
 const version=generation;
 try{const d=await api().request("key_status");if(version!==generation)return;$("inboxKeyStatus").textContent=d.key?"Kunci iPhone aktif · tamat "+new Date(d.key.expires_at).toLocaleDateString("ms-MY"):"Belum ada kunci iPhone. Jana kunci untuk akaun ini."}catch(e){if(version===generation)notice(e.message,true)}
}
function wire(){
 $("inboxUploadButton").addEventListener("click",()=>$("inboxUpload").click());
 $("inboxUpload").addEventListener("change",upload);
 $("inboxRefresh").addEventListener("click",()=>refresh());
 $("inboxLoadMore").addEventListener("click",()=>refresh(true));
 $("inboxState").addEventListener("change",()=>refresh());
 $("inboxTeam").addEventListener("change",()=>refresh());
 $("inboxSearchButton").addEventListener("click",()=>refresh());
 $("inboxSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();refresh()}});
 $("inboxParty").addEventListener("change",categories);categories();
 $("inboxSelectAll").addEventListener("change",e=>{for(const row of rows)e.target.checked?selected.add(row.id):selected.delete(row.id);render()});
 $("inboxList").addEventListener("change",e=>{const id=e.target.dataset.inboxId;if(id){e.target.checked?selected.add(id):selected.delete(id);selection()}});
 $("inboxList").addEventListener("click",async e=>{
  const button=e.target.closest("[data-inbox-download]");if(!button)return;
  button.disabled=true;
  try{const d=await api().file(button.dataset.inboxDownload),url=URL.createObjectURL(d.file),link=document.createElement("a");link.href=url;link.download=d.file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(err){notice(err.message,true)}finally{button.disabled=false}
 });
 $("inboxAssignmentForm").addEventListener("submit",e=>{e.preventDefault();assign(false)});
 $("inboxOpenCompiler").addEventListener("click",()=>assign(true));
 $("inboxIphoneGuide").addEventListener("toggle",()=>{if($("inboxIphoneGuide").open&&user)keyStatus()});
 $("inboxCreateKey").addEventListener("click",async()=>{
  const button=$("inboxCreateKey");button.disabled=true;
  const version=generation;
  try{const d=await api().request("create_key");if(version!==generation)return;$("inboxUploadKey").value=d.key;$("inboxKeyResult").classList.remove("hide");await keyStatus();notice("Kunci iPhone dijana. Salin ke Shortcut; kunci lama telah dinyahaktifkan.")}catch(e){if(version===generation)notice(e.message,true)}finally{button.disabled=false}
 });
 $("inboxRevokeKey").addEventListener("click",async()=>{
  try{await api().request("revoke_key");$("inboxUploadKey").value="";$("inboxKeyResult").classList.add("hide");await keyStatus();notice("Kunci iPhone dinyahaktifkan.")}catch(e){notice(e.message,true)}
 });
 for(const [id,read] of [["inboxCopyKey",()=>$("inboxUploadKey").value],["inboxCopyEndpoint",()=>api().endpoint],["inboxCopyOpenUrl",()=>"https://document-pdf-compiler.vercel.app/staff.html#docs"]]){
  $(id).addEventListener("click",async()=>{try{await navigator.clipboard.writeText(read());notice("Berjaya disalin.")}catch{notice("Tidak dapat salin automatik. Tekan dan tahan pada teks untuk salin.",true)}});
 }
 $("inboxEndpoint").textContent=api().endpoint;
}
window.FARIS_INBOX={
 onLogin(account){generation++;user=account;rows=[];selected.clear();loading=false;busy=false;$("inboxRefresh").disabled=false;$("inboxUploadButton").disabled=false;$("inboxTeamLabel").classList.toggle("hide",user.role!=="admin");$("inboxOwnerLabel").classList.toggle("hide",user.role!=="admin");$("inboxTeam").checked=false;render()},
 onShow(){refresh()},
 onLogout(){generation++;user=null;rows=[];selected.clear();loading=false;busy=false;$("inboxList").innerHTML="";$("inboxUploadKey").value="";$("inboxKeyResult").classList.add("hide");$("inboxIphoneGuide").open=false;for(const id of ["inboxCustomer","inboxPhone","inboxSearch"])$(id).value=""}
};
document.addEventListener("DOMContentLoaded",wire);
})();
