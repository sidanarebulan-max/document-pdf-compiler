(()=>{
"use strict";
const API="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub";
const SESSION_KEY="faris_lead_hub_session_v2";
const DEVICE_KEY="faris_lead_hub_trusted_browser_v1";
const $=id=>document.getElementById(id);
const STATUSES={new:"Belum diambil",claimed:"Sudah diambil",contacted:"Dihubungi",follow_up:"Follow-up",interested:"Berminat",booked:"Booking",not_interested:"Tidak berminat"};
const DEFAULT_MESSAGES=Object.freeze({
 intro:"Assalamualaikum {nama}, selamat pagi! 😊\n\nSaya {staff} daripada Proton. Saya ingin berkongsi maklumat tentang {model}.\n\nBoleh saya tahu, tuan/puan mencari kereta untuk kegunaan sendiri atau keluarga?",
 follow:"Assalamualaikum {nama}, saya {staff} daripada Proton. 😊\n\nSaya nak buat susulan mengenai {model}.\n\nTuan/puan masih berminat untuk saya bantu semak pilihan yang sesuai?",
 price:"Assalamualaikum {nama}, saya {staff} daripada Proton. 😊\n\nSaya boleh bantu sediakan maklumat harga dan anggaran ansuran untuk {model}.\n\nBoleh saya tahu anggaran deposit dan tempoh pinjaman yang tuan/puan mahukan?"
});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizePhone=value=>{
 let p=String(value??"").trim().replace(/[^\d+]/g,"").replace(/^\+/,"");
 if(p.startsWith("0"))p="6"+p;else if(p.startsWith("1"))p="60"+p;
 return /^601\d{8,9}$/.test(p)?p:null;
};
let token=localStorage.getItem(SESSION_KEY)||"",deviceToken=localStorage.getItem(DEVICE_KEY)||"",user=null,leads=[],staff=[],busy=false,availableCount=0,expandedLeadId=null,history=[],assignmentHistory=[],myPm=[],activePmTab="pending";
let renewalPromise=null;
let messageTemplates={team:{},personal:{}},editorDirty=false;
function notice(id,text,error=false){
 const el=$(id);el.textContent=text;el.classList.remove("hide");el.classList.toggle("error",error);
}
function viewAuth(){
 $("authSection").classList.remove("hide");$("appSection").classList.add("hide");$("signoutBtn").classList.add("hide");
 $("messageSettingsBtn").classList.add("hide");$("messageSettingsPanel").classList.add("hide");
 $("adminCredentialsShortcut").classList.add("hide");
 window.FARIS_NAV?.onLogout?.();
 window.FARIS_INBOX?.onLogout?.();
 window.FARIS_GALLERY?.onLogout?.();
 window.FARIS_TG?.onLogout?.();
}
function credentials(id,passcode){
 window.FARIS_NAV?.show?.("settings",{scroll:false});
 $("createdStaffId").textContent=id;
 $("createdPass").textContent=passcode;
 $("newCredential").classList.remove("hide");
 $("newCredential").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function renewTrustedBrowser(){
 if(!deviceToken)return false;
 if(renewalPromise)return renewalPromise;
 renewalPromise=(async()=>{
  let response;
  try{
   response=await fetch(API,{method:"POST",mode:"cors",
    headers:{"Content-Type":"application/json"},cache:"no-store",
    body:JSON.stringify({action:"resume_device",device_token:deviceToken})});
  }catch{
   // Do not wipe the device trust credential during a temporary outage.
   throw Error("Tidak dapat semak peranti. Cuba lagi selepas internet pulih.");
  }
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok){
   if(response.status===401||response.status===403){
    deviceToken="";localStorage.removeItem(DEVICE_KEY);
    token="";localStorage.removeItem(SESSION_KEY);
   }
   throw Error(data?.error||"Tidak dapat sambung semula sesi peranti");
  }
  token=data.token;user=data.user;localStorage.setItem(SESSION_KEY,token);
  return true;
 })();
 try{return await renewalPromise}finally{renewalPromise=null}
}
async function call(action,payload={},requiresSession=true,retried=false){
 let response;
 try{
  response=await fetch(API,{method:"POST",mode:"cors",headers:{
   "Content-Type":"application/json",
   ...(requiresSession&&token?{"Authorization":"Bearer "+token}:{})
  },body:JSON.stringify({action,...payload}),cache:"no-store",keepalive:["open_shared","opened"].includes(action)});
 }catch(_){throw new Error("Tidak dapat sambung ke server. Semak internet atau cuba muat semula.");}
 const result=await response.json().catch(()=>null);
 if(!result)throw new Error("Respons server tidak sah ("+response.status+")");
 if(!response.ok||!result.ok){
  if(response.status===401&&requiresSession&&!retried&&action!=="logout"&&deviceToken){
   try{
    if(await renewTrustedBrowser())return call(action,payload,requiresSession,true);
   }catch(e){console.warn("Trusted browser renewal:",e.message)}
  }
  if(response.status===401&&requiresSession){
   token="";user=null;localStorage.removeItem(SESSION_KEY);viewAuth();
   notice("authNotice","Sesi peranti telah tamat atau dibatalkan. Masukkan ID dan passcode sekali lagi.",true);
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
  const r=await call("login",{id,passcode,previous_device_token:deviceToken},false);
  token=r.token;localStorage.setItem(SESSION_KEY,token);user=r.user;
  if(r.device_token){deviceToken=r.device_token;localStorage.setItem(DEVICE_KEY,deviceToken);}
  $("loginPass").value="";await showApp();
 }catch(e){notice("authNotice",e.message,true)}
 finally{btn.disabled=false;}
}
async function showApp(){
 if(!user)return viewAuth();
 $("authSection").classList.add("hide");$("appSection").classList.remove("hide");
 $("signoutBtn").classList.remove("hide");
 $("messageSettingsBtn").classList.remove("hide");
 $("adminCredentialsShortcut").classList.toggle("hide",user.role!=="admin");
 if(user.role==="admin")$("newAdminId").value=user.staff_code;
 $("adminMessageScope").classList.toggle("hide",user.role!=="admin");
 $("messageScope").value=user.role==="admin"?"team":"personal";
 $("currentName").textContent=user.display_name;
 $("currentRole").textContent=user.role==="admin"?"ADMIN":"STAF";
 $("currentCode").textContent=user.staff_code;
 $("adminPanel").classList.toggle("hide",user.role!=="admin");
 $("claimBtn").classList.toggle("hide",user.role==="admin");
 window.FARIS_TG?.onLogin?.(user);
 window.FARIS_INBOX?.onLogin?.(user);
 window.FARIS_GALLERY?.onLogin?.(user);
 window.FARIS_NAV?.onLogin?.(user);
 await reload();
}
async function logout(){
 try{await call("logout",{device_token:deviceToken})}catch(e){console.warn("Server logout:",e.message)}
 token="";deviceToken="";user=null;
 localStorage.removeItem(SESSION_KEY);localStorage.removeItem(DEVICE_KEY);viewAuth();
}
async function reload(){
 if(busy)return;busy=true;$("refreshBtn").disabled=true;
 $("listMessage").textContent="Memuatkan lead...";
 try{
  const r=await call("list");
  // Muat semula skrip rasmi admin setiap kali staf tekan Refresh.
  try{
   const templates=await call("get_message_templates");
   messageTemplates={team:templates.team||{},personal:templates.personal||{}};
  }catch(e){console.warn("Tetapan mesej tidak dapat dikemas kini:",e.message)}
  leads=r.leads||[];history=r.activity_log||r.history||[];myPm=r.my_pm||[];assignmentHistory=r.assignment_history||[];staff=r.staff||[];availableCount=Number(r.available_count)||0;
  metrics();renderLeads();renderRoster();
  if(!editorDirty)syncMessageEditor();
  $("lastRefresh").textContent="Dikemas kini: "+new Date().toLocaleTimeString("ms-MY",{hour:"2-digit",minute:"2-digit"});
  $("queueCount").textContent=user.role==="staff"?(availableCount?availableCount+" nombor tambahan belum diagih. Tekan 'Ambil nombor belum diagih' untuk dapatkan satu.":"Nombor baharu yang diagihkan oleh admin akan muncul selepas Refresh."):"";
 }catch(e){$("listMessage").textContent="Gagal memuatkan senarai: "+e.message;notice("appNotice",e.message,true)}
 finally{busy=false;$("refreshBtn").disabled=false}
}
function metrics(){
 $("metricTotal").textContent=leads.length.toLocaleString("ms-MY");
 $("metricNew").textContent=leads.filter(l=>["new","claimed"].includes(l.stage)).length;
 $("metricFollow").textContent=leads.filter(l=>l.stage==="follow_up").length;
 $("metricBooked").textContent=leads.filter(l=>l.stage==="booked").length;
}
function templateFor(kind){
 const key=["intro","follow","price"].includes(kind)?kind:"intro";
 return messageTemplates.personal[key]||messageTemplates.team[key]||DEFAULT_MESSAGES[key];
}
function fillMessage(raw,lead){
 const data={
  nama:String(lead?.customer_name||"tuan/puan"),
  staff:String(user?.display_name||"staf Proton"),
  model:String(lead?.model && lead.model!=="Belum pasti"?lead.model:"kereta Proton"),
  telefon:String(lead?.phone_e164||"")
 };
 return String(raw||"").replace(/\{(nama|staff|model|telefon)\}/gi,(_,key)=>data[key.toLowerCase()]||"");
}
function textMessage(lead){
 return fillMessage(templateFor($("messageTemplate").value),lead);
}
function settingsScope(){
 return user?.role==="admin"&&$("messageScope").value==="team"?"team":"personal";
}
function editorKey(){return $("settingsTemplateKind").value;}
function editableTemplate(){
 const key=editorKey(),scope=settingsScope();
 return messageTemplates[scope][key]||(scope==="team"?DEFAULT_MESSAGES[key]:messageTemplates.team[key]||DEFAULT_MESSAGES[key]);
}
function activeTemplateSource(key,scope){
 if(messageTemplates[scope][key])return scope==="team"?"Mesej rasmi admin yang disimpan":"Mesej sendiri yang disimpan";
 return scope==="team"?"Skrip asal sistem":"Mesej rasmi admin / skrip asal sistem";
}
function syncMessageEditor(){
 if(!user||!$("settingsMessageBody"))return;
 $("settingsMessageBody").value=editableTemplate();
 editorDirty=false;
 $("settingsSaveStatus").textContent="";
 renderMessagePreview();
}
function renderMessagePreview(){
 const text=$("settingsMessageBody").value;
 $("messagePreview").textContent=fillMessage(text,{
  customer_name:"Encik Ahmad",phone_e164:"60123456789",model:"Proton e.MAS 7 PHEV"
 });
 $("settingsSourceInfo").textContent="Sumber semasa: "+activeTemplateSource(editorKey(),settingsScope());
 if(editorDirty)$("settingsSaveStatus").textContent="Belum disimpan. Tekan Simpan Mesej untuk gunakan skrip ini.";
}
function toggleMessageSettings(force){
 const box=$("messageSettingsPanel");
 const open=typeof force==="boolean"?force:box.classList.contains("hide");
 if(open)window.FARIS_NAV?.show?.("whatsapp",{scroll:false});
 box.classList.toggle("hide",!open);
 $("messageSettingsBtn").setAttribute("aria-expanded",String(open));
 if(open){
  syncMessageEditor();
  box.scrollIntoView({behavior:"smooth",block:"start"});
 }
}
async function saveMessageTemplate(){
 const btn=$("saveMessageBtn"),key=editorKey(),scope=settingsScope();
 const message=$("settingsMessageBody").value.trim();
 if(!message||message.length>2500){
  $("settingsSaveStatus").textContent="Isi mesej antara 1 hingga 2,500 aksara.";return;
 }
 btn.disabled=true;
 try{
  await call("save_message_template",{template_key:key,scope,message});
  messageTemplates[scope][key]=message;
  editorDirty=false;
  $("settingsSaveStatus").textContent=scope==="team"?"Mesej rasmi disimpan. Staf boleh tekan Refresh untuk menerima skrip terbaharu.":"Mesej sendiri berjaya disimpan.";
  renderMessagePreview();renderLeads();
 }catch(e){$("settingsSaveStatus").textContent="Gagal simpan: "+e.message}
 finally{btn.disabled=false}
}
async function resetMessageTemplate(){
 const key=editorKey(),scope=settingsScope(),btn=$("resetMessageBtn");
 if(!messageTemplates[scope][key]){
  syncMessageEditor();
  $("settingsSaveStatus").textContent="Skrip kini menggunakan tetapan asal.";
  return;
 }
 if(!confirm(scope==="team"?"Pulihkan skrip rasmi kepada mesej asal? Staf yang menggunakan mesej admin akan menerima perubahan selepas Refresh.":"Padam skrip sendiri dan gunakan mesej rasmi admin?"))return;
 btn.disabled=true;
 try{
  await call("reset_message_template",{template_key:key,scope});
  delete messageTemplates[scope][key];
  syncMessageEditor();renderLeads();
  $("settingsSaveStatus").textContent="Skrip asal telah dipulihkan.";
 }catch(e){$("settingsSaveStatus").textContent="Gagal reset: "+e.message}
 finally{btn.disabled=false}
}
function insertMessageToken(value){
 const el=$("settingsMessageBody"),start=el.selectionStart??el.value.length,end=el.selectionEnd??start;
 el.value=el.value.slice(0,start)+value+el.value.slice(end);
 el.focus();el.setSelectionRange(start+value.length,start+value.length);
 editorDirty=true;renderMessagePreview();
}
function waUrl(lead){
 return "https://wa.me/"+lead.phone_e164+"?text="+encodeURIComponent(textMessage(lead));
}
const HANDOFF_KEY="faris_lead_handoff_v1";
function openWorkspace(tool,leadId=null){
 if(!user||!token){viewAuth();notice("authNotice","Log masuk sebelum urus dokumen atau VSO.",true);return}
 // Data pelanggan tidak dihantar dalam URL; disimpan sementara pada tab semasa sahaja.
 sessionStorage.removeItem(HANDOFF_KEY);
 if(leadId){
  const lead=leads.find(x=>x.id===leadId);
  if(!lead){notice("appNotice","Lead ini tidak lagi tersedia dalam senarai anda.",true);return}
  if(!/^601\d{8,9}$/.test(String(lead.phone_e164||""))){
   notice("appNotice","Nombor pelanggan tidak sah. Semak dengan admin dahulu.",true);return;
  }
  sessionStorage.setItem(HANDOFF_KEY,JSON.stringify({
    lead_id:lead.id,customer_name:lead.customer_name,
    phone_e164:lead.phone_e164,model:lead.model,
    staff_code:user.staff_code,account_id:user.id,created_at:Date.now()
  }));
 }
 const mode=tool==="COMPILER"?"COMPILER":"VSO";
 window.location.assign("/?tool="+mode+"&origin=staff");
}
function isStaffPmView(){return Boolean(user)}
let numberCacheSource=null,numberCache=[],numberById=new Map(),pmCacheSource=null,pmById=new Map();
function personalPm(){if(pmCacheSource!==myPm){pmCacheSource=myPm;pmById=new Map(myPm.map(x=>[x.id,x]))}return pmById}
function historyNumbers(){
 if(numberCacheSource===assignmentHistory)return numberCache;
 const found=new Map();
 const records=[...assignmentHistory].sort((a,b)=>Date.parse(b.recorded_at||b.assigned_at)-Date.parse(a.recorded_at||a.assigned_at));
 for(const record of records){
  if(!record.lead)continue;
  const id=record.lead_id;
  if(!found.has(id))found.set(id,{...record.lead,id,shared_history:true,
   claim_name:record.assignee_name,claim_code:record.assignee_code,claim_search:[]});
  found.get(id).claim_search.push(record.assignee_name,record.assignee_code);
 }
 numberCacheSource=assignmentHistory;numberById=found;numberCache=[...found.values()];return numberCache;
}
function sentNumbers(){
 const result=new Map(myPm.map(x=>[x.id,{...x,shared_history:true}]));
 for(const lead of leads){if(lead.pm_confirmed_at)result.set(lead.id,lead)}
 return [...result.values()];
}
function pmEventHistory(){
 const current=new Map([...historyNumbers(),...leads].map(x=>[x.id,x]));
 const entries=history.map(e=>({...e,customer:e.lead||current.get(e.lead_id),at:e.created_at})).filter(e=>e.customer);
 for(const record of assignmentHistory){
  entries.push({...record,customer:record.lead,at:record.assigned_at,sortAt:record.assigned_at||record.recorded_at});
 }
 return entries.sort((a,b)=>Date.parse(b.sortAt||b.at)-Date.parse(a.sortAt||a.at));
}
function pmTime(value){
 if(!value)return "Masa belum diketahui";
 const d=new Date(value);
 return Number.isNaN(d.getTime())?"Masa tidak diketahui":d.toLocaleString("ms-MY",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function sharedNumberCard(number){
 historyNumbers();const claim=numberById.get(number.id)||number;
 const confirmed=personalPm().get(number.id);
 return '<article class="lead shared-number-card" data-history-number="'+esc(number.id)+'">'+
  '<div class="lead-primary"><strong class="lead-customer">'+esc(number.customer_name)+'</strong><span class="lead-phone">+'+esc(number.phone_e164)+'</span><span class="lead-secondary">'+esc(number.model||"Belum pasti")+'</span></div>'+
  '<p class="shared-claim-note">Claim / agihan terakhir: <b>'+esc(claim.claim_name||"Staf")+' ('+esc(claim.claim_code||"ID tidak tersedia")+')</b></p>'+
  (confirmed?'<p class="small muted">PM anda terakhir: '+esc(pmTime(confirmed.pm_confirmed_at))+'</p>':"")+
  (number.consent_confirmed?'<div class="shared-number-actions"><a class="wa" data-history-open="'+esc(number.id)+'" href="'+esc(waUrl(number))+'" target="_blank" rel="noopener noreferrer">✆ WhatsApp ↗</a><button type="button" class="secondary" data-history-confirm="'+esc(number.id)+'">✓ '+(confirmed?"Tandakan PM Baharu":"Tandakan Dah PM")+'</button></div>':'<p class="small attention">Kebenaran untuk menghubungi pelanggan belum disahkan.</p>')+
  '</article>';
}
function renderPmTabs(){
 const visible=isStaffPmView(),nav=$("staffPmTabs"),hint=$("pmTabHint");
 nav?.classList.toggle("pm-active",visible);hint?.classList.toggle("pm-active",visible);
 const numbers=historyNumbers(),events=pmEventHistory();
 $("pmPendingLabel").textContent=user?.role==="admin"?"Semua Nombor":"Belum PM";
 $("pmPendingCount").textContent=String(user?.role==="admin"?leads.length:leads.filter(x=>!x.pm_confirmed_at).length);
 $("pmSentCount").textContent=String(sentNumbers().length);
 $("pmHistoryCount").textContent=String(numbers.length);
 $("pmActivityCount").textContent=String(events.length);
 nav?.querySelectorAll("[data-pm-tab]").forEach(btn=>{
  const active=btn.dataset.pmTab===activePmTab;btn.setAttribute("aria-selected",String(active));btn.tabIndex=active?0:-1;
 });
 const showingHistory=visible&&activePmTab==="history",showingLog=visible&&activePmTab==="log";
 $("pmHistoryList").classList.toggle("hide",!showingHistory);
 $("pmActivityList").classList.toggle("hide",!showingLog);
 $("leadList").classList.toggle("hide",showingHistory||showingLog);
 $("stageFilter").classList.toggle("hide",showingLog);$("messageTemplate").classList.toggle("hide",showingLog);
 $("leadSearch").parentElement?.classList.toggle("log-filter",showingLog);
 $("queueCount").classList.toggle("hide",showingHistory||showingLog);
 const search=$("leadSearch").value.trim().toLowerCase(),filter=$("stageFilter").value;
 if(showingHistory){
  const shown=numbers.filter(x=>(!filter||x.stage===filter)&&(!search||[x.customer_name,x.phone_e164,x.model,...x.claim_search].some(v=>String(v||"").toLowerCase().includes(search))));
  $("listMessage").textContent=shown.length+" daripada "+numbers.length+" nombor dalam sejarah. Setiap nombor dipaparkan sekali; semua staf boleh PM nombor yang mempunyai kebenaran.";
  $("pmHistoryList").innerHTML=shown.length?shown.map(sharedNumberCard).join(""):'<div class="empty">Belum ada nombor dalam Sejarah Nombor untuk carian ini.</div>';
 }
 if(showingLog){
  const shown=events.filter(e=>!search||[e.customer?.customer_name,e.customer?.phone_e164,e.customer?.model,e.actor_name,e.actor_code,e.actor?.display_name,e.actor?.staff_code,e.assignee_name,e.assignee_code].some(v=>String(v||"").toLowerCase().includes(search)));
  const labels={whatsapp_opened:"WhatsApp dibuka — belum bermaksud mesej dihantar",pm_confirmed:"Mesej disahkan sudah PM",status_updated:"Status dikemas kini",claimed:"Nombor diambil / claim",assigned:"Nombor diagihkan",legacy_assignment:"Rekod agihan lama"};
  $("listMessage").textContent=shown.length+" rekod log terkini: claim, agihan, buka WhatsApp dan pengesahan PM. Senarai nombor berada dalam Sejarah Nombor.";
  $("pmActivityList").innerHTML=shown.length?shown.map(e=>{
   const name=e.assignee_name||e.actor_name||e.actor?.display_name||(e.actor_id===user?.id?user.display_name:"Staf"),code=e.assignee_code||e.actor_code||e.actor?.staff_code||(e.actor_id===user?.id?user.staff_code:"");
   return '<article class="pm-history-card"><div class="pm-history-icon" aria-hidden="true">'+(e.event_type==="pm_confirmed"?"✓":"↻")+'</div><div class="pm-history-content"><strong>'+esc(e.customer?.customer_name||"Pelanggan")+'</strong><p>'+esc(e.customer?.phone_e164||"")+' · '+esc(labels[e.event_type]||"Aktiviti")+'</p><p>'+(e.assignee_name?'Staf penerima: ':'Oleh: ')+'<b>'+esc(name)+(code?' ('+esc(code)+')':"")+'</b></p><time>'+esc(e.event_type==="legacy_assignment"?"Masa claim asal tidak direkodkan":pmTime(e.at))+'</time></div></article>';
  }).join(""):'<div class="empty">Belum ada log aktiviti untuk carian ini.</div>';
 }
 return showingHistory||showingLog;
}
async function confirmHistoryPm(id,button){
 const number=historyNumbers().find(x=>x.id===id)||myPm.find(x=>x.id===id);
 if(!number?.consent_confirmed)return notice("appNotice","Kebenaran pelanggan belum disahkan.",true);
 if(!window.confirm("Sahkan anda sudah menghantar mesej WhatsApp kepada "+number.customer_name+"?"))return;
 button.disabled=true;
 button.dataset.operationId||=crypto.randomUUID();
 try{
  await call("confirm_shared_pm",{lead_id:id,operation_id:button.dataset.operationId});
  notice("appNotice","PM anda disahkan dan direkodkan dalam Log Aktiviti. Claim / agihan nombor dikekalkan.");
  await reload();
 }catch(e){notice("appNotice",e.message,true)}finally{button.disabled=false}
}
async function confirmSentPm(leadId,button){
 const lead=leads.find(x=>x.id===leadId);
 if(!lead||!user)return;
 if(!lead.consent_confirmed){notice("appNotice","Tiada kebenaran pelanggan untuk dihubungi.",true);return}
 if(!window.confirm("Sahkan mesej WhatsApp kepada "+lead.customer_name+" telah BENAR-BENAR dihantar?")){
  return;
 }
 button.disabled=true;
 try{
  await call("confirm_pm",{lead_id:leadId});
  notice("appNotice","✅ PM disahkan dan direkodkan dalam Log Aktiviti.");
  activePmTab="sent";await reload();
 }catch(e){notice("appNotice","Tidak berjaya merekod PM: "+e.message,true);button.disabled=false}
}
function renderLeads(){
 const search=$("leadSearch").value.trim().toLowerCase(),filter=$("stageFilter").value;
 if(renderPmTabs())return;
 const pmView=isStaffPmView();
 const list=pmView&&activePmTab==="sent"?sentNumbers():leads;
 const filtered=list.filter(l=>
  (!pmView||(activePmTab==="sent"?Boolean(l.pm_confirmed_at):user?.role==="admin"||!l.pm_confirmed_at))&&
  (!filter||l.stage===filter)&&(!search||
  [l.customer_name,l.phone_e164,l.model,l.notes].some(x=>String(x||"").toLowerCase().includes(search))));
 $("listMessage").textContent=`Memaparkan ${filtered.length} daripada ${list.length} lead yang dibenarkan.`;
 if(!filtered.length){
  $("leadList").innerHTML='<div class="empty">'+(pmView?
   (activePmTab==="sent"?"Belum ada nombor yang disahkan sudah PM.":"Tiada nombor yang belum PM."):
    (user.role==="staff"?"Belum ada nombor ditugaskan. Tekan Refresh atau Ambil nombor belum diagih.":"Belum ada pelanggan. Tambah nombor melalui bahagian Tambah & Import Nombor di bawah."))+'</div>';
  return;
 }
 $("leadList").innerHTML=filtered.map(l=>{
  if(l.shared_history&&!leads.some(x=>x.id===l.id))return sharedNumberCard(l);
  const open=expandedLeadId===l.id;
  const options=Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${k===l.stage?"selected":""}>${esc(v)}</option>`).join("");
  const assigned=staff.find(s=>s.id===l.assigned_id);
  const assigns=user.role==="admin"?`<div class="adminassign"><label>Agihkan kepada staf<select data-assignee="${esc(l.id)}">
    <option value="">Belum diagih</option>
    ${staff.filter(s=>s.active&&s.role==="staff").map(s=>`<option value="${esc(s.id)}" ${s.id===l.assigned_id?"selected":""}>${esc(s.display_name)} (${esc(s.staff_code)})</option>`).join("")}
    </select></label></div>`:"";
  const whatsApp=l.consent_confirmed
   ?`<a class="wa lead-quick-wa" data-open="${esc(l.id)}" href="${esc(waUrl(l))}" target="_blank" rel="noopener noreferrer">✆ WhatsApp ↗</a>`
   :'<span class="small attention">Tiada izin</span>';
  return `<article class="lead" data-id="${esc(l.id)}">
    <div class="lead-compact">
      <button class="lead-identity" type="button" data-expand="${esc(l.id)}" aria-controls="lead-details-${esc(l.id)}" aria-expanded="${open}">
        <span class="lead-primary"><span class="lead-customer">${esc(l.customer_name)}</span>
          <span class="lead-phone">+${esc(l.phone_e164)}</span>
          <span class="lead-secondary">${esc(l.model||"Belum pasti")}</span></span>
        <span class="lead-chevron" aria-hidden="true">⌄</span>
      </button>
      ${whatsApp}
    </div>
    <div class="lead-expanded" id="lead-details-${esc(l.id)}" ${open?"":"hidden"}>
      <div class="lead-expanded-meta">
        <b class="status">${esc(STATUSES[l.stage]||l.stage)}</b>
        <span class="subtle">${assigned?"Staf: "+esc(assigned.display_name):user.role==="admin"?"Belum diagih":"Tugasan anda"} · ${esc(new Date(l.created_at).toLocaleDateString("ms-MY"))}</span>
      </div>
      <div class="leadcontrols">
        <label>Status<select data-stage>${options}</select></label>
        <label>Tarikh susulan<input data-follow type="date" value="${esc(l.follow_up_at||"")}"></label>
      </div>
      <label>Catatan pelanggan</label>
      <textarea data-notes class="notes" placeholder="Catatan selepas hubungi pelanggan...">${esc(l.notes||"")}</textarea>
      <button class="secondary save-details" data-save="${esc(l.id)}" type="button">Simpan status & catatan</button>
      ${l.pm_confirmed_at?
        '<p class="pm-confirmed-note">✅ Dah PM · '+esc(pmTime(l.pm_confirmed_at))+'</p>':
        '<button class="pm-confirm-button" type="button" data-confirm-pm="'+esc(l.id)+'">✓ Tandakan Dah PM</button>'}
      <div class="leadwork">
        <button class="secondary" type="button" data-workspace-doc="${esc(l.id)}">📑 Urus Dokumen</button>
        <button class="secondary" type="button" data-workspace-vso="${esc(l.id)}">🚘 Buat VSO</button>
      </div>
      ${assigns}
    </div>
  </article>`;
 }).join("");
}
function toggleLeadDetails(id){
 const card=Array.from($("leadList").querySelectorAll("[data-id]")).find(x=>x.dataset.id===id);
 if(!card)return;
 const details=card.querySelector(".lead-expanded"),button=card.querySelector("[data-expand]");
 const opening=details.hidden;
 $("leadList").querySelectorAll(".lead-expanded").forEach(el=>el.hidden=true);
 $("leadList").querySelectorAll("[data-expand]").forEach(btn=>btn.setAttribute("aria-expanded","false"));
 details.hidden=!opening;button.setAttribute("aria-expanded",String(opening));
 expandedLeadId=opening?id:null;
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
  const r=await call("create_staff",{name:$("staffName").value.trim(),
   custom_staff_id:$("customStaffId").value.trim().toUpperCase(),
   custom_passcode:$("customStaffPass").value.trim().toUpperCase()});
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
async function changeAdminPass(e){
 e.preventDefault();const button=$("changeAdminBtn");button.disabled=true;
 const status=$("adminCredentialStatus");
 status.textContent="";
 try{
  const newId=$("newAdminId").value.trim().toUpperCase();
  const oldPass=$("oldAdminPass").value.trim();
  const newPass=$("newAdminPass").value.trim();
  if(!/^[A-Z][A-Z0-9-]{3,19}$/.test(newId)){
   status.textContent="ID admin mesti 4 hingga 20 aksara dan bermula dengan huruf.";return;
  }
  if(newId===user.staff_code&&!newPass){
   status.textContent="Tukar ID atau isi passcode baharu dahulu.";return;
  }
  if(newPass&&(!/^[A-Za-z0-9-]{10,32}$/.test(newPass)||!/[A-Za-z]/.test(newPass)||!/[0-9]/.test(newPass))){
   status.textContent="Passcode baharu mesti 10–32 aksara, termasuk huruf dan nombor.";return;
  }
  const r=await call("change_my_credentials",{
   new_staff_id:newId,old_passcode:oldPass,new_passcode:newPass
  });
  user.staff_code=r.staff_code;
  if(r.device_token){
   deviceToken=r.device_token;localStorage.setItem(DEVICE_KEY,deviceToken);
  }
  $("currentCode").textContent=user.staff_code;
  if($("accessCode"))$("accessCode").textContent=user.staff_code;
  $("adminPassForm").reset();
  $("newAdminId").value=user.staff_code;
  status.textContent=(r.id_changed?"ID Admin berjaya ditukar. ":"")+
    (r.passcode_changed?"Passcode baharu berjaya disimpan. ":"")+
    "Gunakan maklumat terkini semasa login seterusnya.";
  notice("appNotice","Maklumat akaun admin berjaya dikemas kini.");
 }catch(err){
  status.textContent="Tidak berjaya: "+err.message;
  notice("appNotice","Gagal ubah ID / passcode admin: "+err.message,true);
 }finally{button.disabled=false}
}
async function addLead(e){
 e.preventDefault();const p=normalizePhone($("addPhone").value);
 if(!p){notice("appNotice","Nombor tidak sah. Contoh: 0123456789",true);return}
 const button=$("addLeadBtn");button.disabled=true;
 try{
  const r=await call("import",{consent_confirmed:$("addConsent").checked,auto_assign:$("addAutoAssign").checked,leads:[{
   customer_name:$("addName").value.trim(),phone_e164:p,model:$("addModel").value,source:"Manual Admin"}]});
  notice("appNotice",r.inserted?(r.auto_assigned?"Nombor berjaya dimasukkan dan diagih automatik kepada staf. Mereka boleh tekan Refresh.":"Nombor berjaya dimasukkan ke barisan belum diagih."):"Nombor sudah wujud dalam sistem.");
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
  let inserted=0,duplicates=0,autoAssigned=0;
  for(let i=0;i<clean.length;i+=100){
   const batch=clean.slice(i,i+100);
   $("importResult").textContent=`Sedang import ${Math.min(i+100,clean.length)}/${clean.length}...`;
   const r=await call("import",{consent_confirmed:true,auto_assign:$("importAutoAssign").checked,leads:batch});
   inserted+=r.inserted;duplicates+=r.duplicates;autoAssigned+=Number(r.auto_assigned)||0;
  }
  $("importResult").textContent=`Selesai: ${inserted} baharu · ${autoAssigned} diagih ke staf · ${inserted-autoAssigned} belum diagih · ${duplicates} pendua · ${bad} tidak sah.`;
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
 window.addEventListener("faris-session-renewed",e=>{if(e.detail?.token)token=e.detail.token});
 $("loginForm").addEventListener("submit",login);
 $("signoutBtn").addEventListener("click",logout);
 $("messageSettingsBtn").addEventListener("click",()=>toggleMessageSettings());
 $("adminCredentialsShortcut").addEventListener("click",()=>{
   if(!user||user.role!=="admin")return;
   window.FARIS_NAV?.show?.("settings",{scroll:false});
   $("adminPassForm").scrollIntoView({behavior:"smooth",block:"center"});
   $("newAdminId").focus({preventScroll:true});
 });
 $("closeMessageSettingsBtn").addEventListener("click",()=>toggleMessageSettings(false));
 $("messageScope").addEventListener("change",syncMessageEditor);
 $("settingsTemplateKind").addEventListener("change",syncMessageEditor);
 $("settingsMessageBody").addEventListener("input",()=>{editorDirty=true;renderMessagePreview()});
 $("saveMessageBtn").addEventListener("click",saveMessageTemplate);
 $("resetMessageBtn").addEventListener("click",resetMessageTemplate);
 document.querySelectorAll("[data-token]").forEach(btn=>btn.addEventListener("click",()=>insertMessageToken(btn.dataset.token)));
 $("refreshBtn").addEventListener("click",reload);
 $("staffPmTabs").addEventListener("click",e=>{
  const choice=e.target.closest("[data-pm-tab]");
  if(!choice)return;
  activePmTab=choice.dataset.pmTab;expandedLeadId=null;renderLeads();
 });
 $("staffPmTabs").addEventListener("keydown",e=>{
  const tabs=[...$("staffPmTabs").querySelectorAll("[data-pm-tab]")];
  const index=tabs.indexOf(document.activeElement);
  if(index<0||!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
  e.preventDefault();
  const next=e.key==="Home"?0:e.key==="End"?tabs.length-1:
   (index+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
  activePmTab=tabs[next].dataset.pmTab;renderLeads();tabs[next].focus();
 });
 $("claimBtn").addEventListener("click",claim);
 $("openGenericDocs").addEventListener("click",()=>openWorkspace("COMPILER"));
 $("openGenericVso").addEventListener("click",()=>openWorkspace("VSO"));
 $("createStaffForm").addEventListener("submit",createStaff);
 $("adminPassForm").addEventListener("submit",changeAdminPass);
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
 $("leadSection").addEventListener("click",e=>{
  const confirmed=e.target.closest("[data-history-confirm]");
  if(confirmed){confirmHistoryPm(confirmed.dataset.historyConfirm,confirmed);return}
  const opened=e.target.closest("[data-history-open]");
  if(opened){call("open_shared",{lead_id:opened.dataset.historyOpen,operation_id:crypto.randomUUID()}).catch(err=>notice("appNotice","Log buka WhatsApp tidak berjaya: "+err.message,true))}
 });
 $("leadList").addEventListener("click",e=>{
  const exp=e.target.closest("[data-expand]");
  if(exp){toggleLeadDetails(exp.dataset.expand);return}
  const saveBtn=e.target.closest("[data-save]");
  if(saveBtn){save(saveBtn.closest("[data-id]"),saveBtn.dataset.save);return}
  const confirmed=e.target.closest("[data-confirm-pm]");
  if(confirmed){confirmSentPm(confirmed.dataset.confirmPm,confirmed);return}
  const docs=e.target.closest("[data-workspace-doc]");
  if(docs){openWorkspace("COMPILER",docs.dataset.workspaceDoc);return}
  const vso=e.target.closest("[data-workspace-vso]");
  if(vso){openWorkspace("VSO",vso.dataset.workspaceVso);return}
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
 if(!token&&!deviceToken){viewAuth();return}
 try{
  if(!token&&deviceToken)await renewTrustedBrowser();
  const r=await call("me");user=r.user;
  if(!deviceToken){
   try{
    const remembered=await call("remember_device");
    if(remembered.device_token){
     deviceToken=remembered.device_token;localStorage.setItem(DEVICE_KEY,deviceToken);
    }
   }catch(e){console.warn("Could not remember this browser:",e.message)}
  }
  await showApp();
 }catch(e){console.warn("Sesi:",e.message);viewAuth();}
}
document.addEventListener("DOMContentLoaded",init);
})();
