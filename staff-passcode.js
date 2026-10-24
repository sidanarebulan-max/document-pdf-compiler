(()=>{
"use strict";
const API="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub";
const SESSION_KEY="faris_lead_hub_session_v2";
const $=id=>document.getElementById(id);
const STATUSES={new:"Belum diambil",claimed:"Sudah diambil",contacted:"Dihubungi",follow_up:"Follow-up",interested:"Berminat",booked:"Booking",not_interested:"Tidak berminat"};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizePhone=value=>{
 let p=String(value??"").trim().replace(/[^\d+]/g,"").replace(/^\+/,"");
 if(p.startsWith("0"))p="6"+p;else if(p.startsWith("1"))p="60"+p;
 return /^601\d{8,9}$/.test(p)?p:null;
};
let token=localStorage.getItem(SESSION_KEY)||"",user=null,leads=[],staff=[],busy=false;
function notice(id,text,error=false){
 const el=$(id);el.textContent=text;el.classList.remove("hide");el.classList.toggle("error",error);
}
function viewAuth(){
 $("authSection").classList.remove("hide");$("appSection").classList.add("hide");$("signoutBtn").classList.add("hide");
}
function credentials(id,passcode){
 $("createdStaffId").textContent=id;
 $("createdPass").textContent=passcode;
 $("newCredential").classList.remove("hide");
 $("newCredential").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function call(action,payload={},requiresSession=true){
 let response;
 try{
  response=await fetch(API,{method:"POST",mode:"cors",headers:{
   "Content-Type":"application/json",
   ...(requiresSession&&token?{"Authorization":"Bearer "+token}:{})
  },body:JSON.stringify({action,...payload}),cache:"no-store"});
 }catch(_){throw new Error("Tidak dapat sambung ke server. Semak internet atau cuba muat semula.");}
 let result;
 try{result=await response.json()}catch{throw new Error("Respons server tidak sah ("+response.status+")");}
 if(!response.ok||!result.ok){
  if(response.status===401&&requiresSession){
    token="";user=null;localStorage.removeItem(SESSION_KEY);viewAuth();
    notice("authNotice","Sesi sudah tamat. Masukkan ID dan passcode semula.",true);
  }
  throw new Error(result.error||"Ralat "+response.status);
 }
 return result;
}
async function login(e){
 e.preventDefault();const btn=$("loginBtn");btn.disabled=true;$("authNotice").classList.add("hide");
 try{
  const id=$("loginId").value.trim().toUpperCase();
  const passcode=$("loginPass").value.trim();
  const r=await call("login",{id,passcode},false);
  token=r.token;localStorage.setItem(SESSION_KEY,token);user=r.user;
  $("loginPass").value="";await showApp();
 }catch(e){notice("authNotice",e.message,true)}
 finally{btn.disabled=false;}
}
async function showApp(){
 if(!user)return viewAuth();
 $("authSection").classList.add("hide");$("appSection").classList.remove("hide");
 $("signoutBtn").classList.remove("hide");
 $("currentName").textContent=user.display_name;
 $("currentRole").textContent=user.role==="admin"?"ADMIN":"STAF";
 $("currentCode").textContent=user.staff_code;
 $("adminPanel").classList.toggle("hide",user.role!=="admin");
 $("claimBtn").classList.toggle("hide",user.role==="admin");
 await reload();
}
async function logout(){
 try{await call("logout")}catch(e){console.warn("Server logout:",e.message)}
 token="";user=null;localStorage.removeItem(SESSION_KEY);viewAuth();
}
async function reload(){
 if(busy)return;busy=true;$("refreshBtn").disabled=true;
 $("listMessage").textContent="Memuatkan lead...";
 try{
  const r=await call("list");
  leads=r.leads||[];staff=r.staff||[];
  metrics();renderLeads();renderRoster();
 }catch(e){$("listMessage").textContent="Gagal memuatkan senarai: "+e.message;notice("appNotice",e.message,true)}
 finally{busy=false;$("refreshBtn").disabled=false}
}
function metrics(){
 $("metricTotal").textContent=leads.length.toLocaleString("ms-MY");
 $("metricNew").textContent=leads.filter(l=>["new","claimed"].includes(l.stage)).length;
 $("metricFollow").textContent=leads.filter(l=>l.stage==="follow_up").length;
 $("metricBooked").textContent=leads.filter(l=>l.stage==="booked").length;
}
function textMessage(lead){
 const name=lead.customer_name||"tuan/puan";
 const advisor=user.display_name;
 const model=lead.model&&lead.model!=="Belum pasti"?lead.model:"kereta Proton";
 switch($("messageTemplate").value){
  case "follow":return `Assalamualaikum ${name}, saya ${advisor} daripada Proton. 😊\n\nSaya nak buat susulan mengenai ${model}.\n\nTuan/puan masih berminat untuk saya bantu semak pilihan yang sesuai?`;
  case "price":return `Assalamualaikum ${name}, saya ${advisor} daripada Proton. 😊\n\nSaya boleh bantu sediakan maklumat harga dan anggaran ansuran untuk ${model}.\n\nBoleh saya tahu anggaran deposit dan tempoh pinjaman yang tuan/puan mahukan?`;
  default:return `Assalamualaikum ${name}, selamat pagi! 😊\n\nSaya ${advisor} daripada Proton. Saya ingin berkongsi maklumat tentang ${model}.\n\nBoleh saya tahu, tuan/puan mencari kereta untuk kegunaan sendiri atau keluarga?`;
 }
}
function waUrl(lead){
 return "https://wa.me/"+lead.phone_e164+"?text="+encodeURIComponent(textMessage(lead));
}
function renderLeads(){
 const search=$("leadSearch").value.trim().toLowerCase(),filter=$("stageFilter").value;
 const filtered=leads.filter(l=>(!filter||l.stage===filter)&&(!search||
  [l.customer_name,l.phone_e164,l.model,l.notes].some(x=>String(x||"").toLowerCase().includes(search))));
 $("listMessage").textContent=`Memaparkan ${filtered.length} daripada ${leads.length} lead yang dibenarkan.`;
 if(!filtered.length){
  $("leadList").innerHTML='<div class="empty">'+(user.role==="staff"?'Belum ada pelanggan ditugaskan. Tekan “Ambil nombor” untuk mula.':'Belum ada pelanggan. Masukkan nombor melalui kawasan Admin dahulu.')+'</div>';
  return;
 }
 $("leadList").innerHTML=filtered.map(l=>{
  const options=Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${k===l.stage?"selected":""}>${esc(v)}</option>`).join("");
  const assigned=staff.find(s=>s.id===l.assigned_id);
  const assigns=user.role==="admin"?`<div class="adminassign"><label>Agihkan kepada staf<select data-assignee="${l.id}">
   <option value="">Belum diagih</option>
   ${staff.filter(s=>s.active&&s.role==="staff").map(s=>`<option value="${esc(s.id)}" ${s.id===l.assigned_id?"selected":""}>${esc(s.display_name)} (${esc(s.staff_code)})</option>`).join("")}
   </select></label></div>`:"";
  return `<article class="lead" data-id="${esc(l.id)}">
   <div class="leadtop"><div><h3>${esc(l.customer_name)}</h3><div class="number">+${esc(l.phone_e164)}</div></div><span class="status">${esc(STATUSES[l.stage]||l.stage)}</span></div>
   <div class="leadmodel">🚘 ${esc(l.model||"Belum pasti")} · ${esc(l.source||"Manual")}</div>
   <div class="subtle">${assigned?"Staf: "+esc(assigned.display_name):user.role==="admin"?"Belum diagih":"Diberikan kepada anda"} · ${esc(new Date(l.created_at).toLocaleDateString("ms-MY"))}</div>
   <div class="leadcontrols"><label>Status<select data-stage>${options}</select></label><label>Tarikh susulan<input data-follow type="date" value="${esc(l.follow_up_at||"")}"></label></div>
   <textarea data-notes class="notes" placeholder="Catatan selepas hubungi pelanggan...">${esc(l.notes||"")}</textarea>
   <div class="leadbottom">${l.consent_confirmed?`<a class="wa" data-open="${esc(l.id)}" href="${esc(waUrl(l))}" target="_blank" rel="noopener noreferrer">✆ Buka WhatsApp ↗</a>`:'<span class="small attention">Belum disahkan boleh dihubungi</span>'}
    <button class="secondary" data-save="${esc(l.id)}" type="button">Simpan status</button></div>
   ${assigns}
  </article>`;
 }).join("");
}
function renderRoster(){
 if(!user||user.role!=="admin")return;
 const list=staff.filter(s=>s.role==="staff");
 $("staffRoster").innerHTML=list.length?list.map(s=>`<div class="staffrow" data-staff-id="${esc(s.id)}">
  <div><b>${esc(s.display_name)}</b> <span class="status">${s.active?"Aktif":"Tidak aktif"}</span></div>
  <small>ID: ${esc(s.staff_code)}</small>
  <div class="rowactions"><button class="secondary" type="button" data-reset="${esc(s.id)}">↻ Reset Passcode</button>
    <button class="secondary" type="button" data-toggle="${esc(s.id)}" data-active="${s.active?"0":"1"}">${s.active?"Nyahaktif":"Aktifkan"}</button></div>
 </div>`).join(""):'<p class="muted small">Tiada staf lagi. Isi nama di ruang Cipta ID & Passcode.</p>';
}
async function claim(){
 const button=$("claimBtn");button.disabled=true;
 try{
  const r=await call("claim");
  notice("appNotice",r.lead_id?"Nombor sudah diambil dan dikunci kepada ID staf anda.":"Tiada lead baharu belum diagihkan.");
  await reload();
 }catch(e){notice("appNotice",e.message,true)}
 finally{button.disabled=false}
}
async function save(card,id){
 const button=card.querySelector("[data-save]");button.disabled=true;
 try{
  await call("save_lead",{lead_id:id,stage:card.querySelector("[data-stage]").value,
   follow_up_at:card.querySelector("[data-follow]").value||null,
   notes:card.querySelector("[data-notes]").value.slice(0,3000)});
  notice("appNotice","Status pelanggan berjaya disimpan.");await reload();
 }catch(e){notice("appNotice",e.message,true)}
 finally{button.disabled=false}
}
async function assign(id,staffId){
 try{await call("assign",{lead_id:id,staff_id:staffId||null});
  notice("appNotice","Agihan nombor berjaya dikemas kini.");await reload();
 }catch(e){notice("appNotice",e.message,true);await reload()}
}
async function createStaff(e){
 e.preventDefault();const button=$("createStaffBtn");button.disabled=true;
 try{
  const r=await call("create_staff",{name:$("staffName").value.trim()});
  credentials(r.staff.staff_code,r.passcode);
  $("createStaffForm").reset();notice("appNotice","ID staf berjaya dijana. Salin dan berikan ID serta passcode kepada staf.");
  await reload();
 }catch(e){notice("appNotice",e.message,true)}
 finally{button.disabled=false}
}
async function resetStaff(id){
 if(!confirm("Passcode lama staf akan dibatalkan. Mahu jana passcode baharu?"))return;
 try{
  const r=await call("reset_passcode",{staff_id:id});
  const who=staff.find(s=>s.id===id);
  credentials(who?.staff_code||"STAF",r.passcode);
  notice("appNotice","Passcode baharu sudah dijana. Staf perlu log masuk semula.");
 }catch(e){notice("appNotice",e.message,true)}
}
async function toggleStaff(id,active){
 const who=staff.find(s=>s.id===id);
 if(!confirm((active?"Aktifkan":"Nyahaktifkan")+" akaun "+(who?.display_name||"staf")+"?"))return;
 try{await call("set_staff_active",{staff_id:id,active});notice("appNotice","Status akaun staf dikemas kini.");await reload()}
 catch(e){notice("appNotice",e.message,true)}
}
async function addLead(e){
 e.preventDefault();const p=normalizePhone($("addPhone").value);
 if(!p){notice("appNotice","Nombor tidak sah. Contoh: 0123456789",true);return}
 const button=$("addLeadBtn");button.disabled=true;
 try{
  const r=await call("import",{consent_confirmed:$("addConsent").checked,leads:[{
   customer_name:$("addName").value.trim(),phone_e164:p,model:$("addModel").value,source:"Manual Admin"}]});
  notice("appNotice",r.inserted?"Nombor pelanggan berjaya dimasukkan.":"Nombor sudah wujud dalam sistem.");
  $("addLeadForm").reset();await reload();
 }catch(e){notice("appNotice",e.message,true)}
 finally{button.disabled=false}
}
function fromSheet(wb){
 const sheet=wb.Sheets[wb.SheetNames[0]];
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:false});
 if(!rows.length)return [];
 const headings=rows[0].map(c=>String(c).toLowerCase().trim());
 const find=(words)=>headings.findIndex(h=>words.some(w=>h.includes(w)));
 let pc=find(["whatsapp","telefon","phone","nombor","mobile","tel","no hp"]);
 let nc=find(["nama","name","customer","pelanggan"]);let mc=find(["model","kereta","vehicle"]);
 const hasHeader=pc>=0||nc>=0||mc>=0;
 if(pc<0)pc=rows[0].length===1?0:1;
 if(!hasHeader){nc=rows[0].length>1?0:-1;mc=rows[0].length>2?2:-1}
 return rows.slice(hasHeader?1:0).map((r,i)=>({customer_name:nc>=0?r[nc]:"Pelanggan "+(i+1),phone_e164:r[pc],model:mc>=0?r[mc]:"Belum pasti",source:"Import Excel"}));
}
function fromText(text){
 return text.split(/\r?\n/).map((row,i)=>{
  if(!row.trim())return null;
  const cells=row.includes("\t")?row.split("\t"):row.split(",");
  return cells.length===1?{customer_name:"Pelanggan "+(i+1),phone_e164:cells[0],model:"Belum pasti",source:"Tampal Senarai"}:
   {customer_name:cells[0],phone_e164:cells[1],model:cells.slice(2).join(",")||"Belum pasti",source:"Tampal Senarai"};
 }).filter(Boolean);
}
async function importLeads(){
 const button=$("importBtn");button.disabled=true;$("importResult").textContent="Membaca senarai...";
 try{
  if(!$("importConsent").checked)throw new Error("Sila sahkan kebenaran menghubungi pelanggan.");
  const file=$("importFile").files[0];
  if(file?.size>5*1024*1024)throw new Error("Saiz maksimum fail 5MB.");
  const source=file?fromSheet(XLSX.read(await file.arrayBuffer(),{type:"array"})):fromText($("importText").value);
  if(!source.length)throw new Error("Tiada nombor dalam senarai.");
  if(source.length>3000)throw new Error("Maksimum 3,000 nombor sekali import.");
  const unique=new Map();let bad=0;
  source.forEach((row,i)=>{
   const p=normalizePhone(row.phone_e164);
   if(!p){bad++;return}
   if(unique.has(p))return;
   unique.set(p,{phone_e164:p,customer_name:String(row.customer_name||"Pelanggan "+(i+1)).trim().slice(0,120)||"Pelanggan",
    model:String(row.model||"Belum pasti").trim().slice(0,100),source:row.source});
  });
  const clean=[...unique.values()];
  if(!clean.length)throw new Error("Tiada nombor WhatsApp Malaysia yang sah.");
  let inserted=0,duplicates=0;
  for(let i=0;i<clean.length;i+=100){
   const batch=clean.slice(i,i+100);
   $("importResult").textContent=`Sedang import ${Math.min(i+100,clean.length)}/${clean.length}...`;
   const r=await call("import",{consent_confirmed:true,leads:batch});
   inserted+=r.inserted;duplicates+=r.duplicates;
  }
  $("importResult").textContent=`Selesai: ${inserted} baharu · ${duplicates} pendua · ${bad} tidak sah.`;
  notice("appNotice","Import selesai. "+$("importResult").textContent);
  $("importFile").value="";$("importText").value="";$("importConsent").checked=false;
  await reload();
 }catch(e){$("importResult").textContent=e.message;notice("appNotice","Import gagal: "+e.message,true)}
 finally{button.disabled=false}
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);notice("appNotice","Berjaya disalin.")}
 catch{window.prompt("Salin maklumat:",text)}
}
function wireEvents(){
 $("loginForm").addEventListener("submit",login);
 $("signoutBtn").addEventListener("click",logout);
 $("refreshBtn").addEventListener("click",reload);
 $("claimBtn").addEventListener("click",claim);
 $("createStaffForm").addEventListener("submit",createStaff);
 $("addLeadForm").addEventListener("submit",addLead);
 $("importBtn").addEventListener("click",importLeads);
 ["leadSearch","stageFilter","messageTemplate"].forEach(id=>$(id).addEventListener(id==="leadSearch"?"input":"change",renderLeads));
 $("copyStaffId").addEventListener("click",()=>copy($("createdStaffId").textContent));
 $("copyStaffPass").addEventListener("click",()=>copy($("createdPass").textContent));
 $("copyCredential").addEventListener("click",()=>copy(`ID: ${$("createdStaffId").textContent}\nPasscode: ${$("createdPass").textContent}\nWebsite: https://document-pdf-compiler.vercel.app/staff.html`));
 $("staffRoster").addEventListener("click",e=>{
  const reset=e.target.closest("[data-reset]");if(reset){resetStaff(reset.dataset.reset);return}
  const toggle=e.target.closest("[data-toggle]");if(toggle)toggleStaff(toggle.dataset.toggle,toggle.dataset.active==="1");
 });
 $("leadList").addEventListener("click",e=>{
  const saveBtn=e.target.closest("[data-save]");
  if(saveBtn){save(saveBtn.closest("[data-id]"),saveBtn.dataset.save);return}
  const wa=e.target.closest("[data-open]");
  if(wa){call("opened",{lead_id:wa.dataset.open}).catch(err=>console.warn("Tidak dapat simpan opened:",err.message))}
 });
 $("leadList").addEventListener("change",e=>{
  const dropdown=e.target.closest("[data-assignee]");
  if(dropdown)assign(dropdown.dataset.assignee,dropdown.value);
 });
}
async function init(){
 wireEvents();
 if(!token){viewAuth();return}
 try{
  const r=await call("me");user=r.user;await showApp();
 }catch(e){console.warn("Sesi:",e.message);viewAuth();}
}
document.addEventListener("DOMContentLoaded",init);
})();