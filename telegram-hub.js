(()=>{
"use strict";
const URL="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-telegram";
const SESSION="faris_lead_hub_session_v2";
const CODEX_API="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-codex";
const $=id=>document.getElementById(id);
let currentUser=null,loaded=false,busy=false;
async function api(action,args={}){
 const token=localStorage.getItem(SESSION)||"";
 if(!token)throw Error("Sesi login sudah tamat. Log masuk semula.");
 const res=await fetch(URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},cache:"no-store",body:JSON.stringify({action,...args})});
 let value;try{value=await res.json()}catch{throw Error("Server Telegram tidak memberikan respons sah ("+res.status+")")}
 if(!res.ok||!value.ok)throw Error(value.error||"Ralat Telegram: "+res.status);
 return value;
}
async function codexApi(action,params={}){
 const session=localStorage.getItem(SESSION)||"";
 if(!session)throw Error("Login admin telah tamat.");
 const res=await fetch(CODEX_API,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session},
  body:JSON.stringify({action,...params}),cache:"no-store"});
 const j=await res.json();
 if(!res.ok||!j.ok)throw Error(j.error||"Worker API "+res.status);
 return j;
}
async function codexStatus(){
 if(currentUser?.role!=="admin")return;
 const btn=$("codexCheck");btn.disabled=true;
 try{
  const d=await codexApi("status_admin");
  $("codexEnabled").checked=d.enabled;
  const online=d.devices.filter(x=>x.online),active=d.devices.filter(x=>x.is_active);
  const chatCapable=online.filter(x=>x.supports_chat);
  $("codexWorkerStatusBadge").textContent=chatCapable.length?"AI CHAT V4 ONLINE":
   online.length?"Worker V3 (Dokumen Sahaja)":active.length?"PC Offline":"Belum Dipair";
  $("codexWorkerStatusBadge").classList.toggle("on",chatCapable.length>0);
  $("codexWorkerInfo").textContent=chatCapable.length
   ?"✅ Codex V4 boleh jawab chat dan imbas dokumen. DeepSeek menjadi sandaran jika Codex gagal. Tugasan menunggu: "+d.pending
   :online.length
    ?"⚠️ Worker masih versi lama. Untuk AI Chat melalui Codex, pasang ZIP FARIS Codex Chat V4 dan restart 04_START_WORKER.cmd. Sementara itu DeepSeek jawab soalan."
    :active.length
     ?"⚠️ Worker offline. DeepSeek menjawab chat. Buka 04_START_WORKER.cmd pada PC."
     :"Belum ada PC dipautkan. Untuk Codex, pasang worker FARIS dan jana kod pairing.";
  $("codexDeviceList").textContent=d.devices.map(x=>
   (x.online?"🟢 ":"⚪ ")+x.device_name+" — "+(x.is_active?(x.online?
     (x.supports_chat?"CHAT V4 + DOKUMEN":"DOKUMEN SAHAJA"):"OFFLINE"):"DINYAHAKTIF")
  ).join(" | ");
 }catch(e){$("codexWorkerInfo").textContent="Ralat semak worker: "+e.message}
 finally{btn.disabled=false}
}
async function createCodexPair(){
 const btn=$("codexCreatePair");btn.disabled=true;
 try{
  const x=await codexApi("generate_pair");
  $("codexPairCode").textContent=x.code;
  $("codexPairResult").classList.remove("hide");
  notify("✅ Kod pairing disediakan. Sah selama 15 minit. Masukkan dalam PowerShell FARIS Worker; ini bukan kod login ChatGPT.");
 }catch(e){notify("Tidak boleh jana pairing: "+e.message,true)}
 finally{btn.disabled=false}
}
async function codexToggle(){
 const btn=$("codexSaveEnabled");btn.disabled=true;
 try{
  await codexApi("set_codex_enabled",{enabled:$("codexEnabled").checked});
  notify("Pilihan ChatGPT Worker disimpan. Jika PC offline, sistem gunakan pilihan API atau semakan manual.");
  await codexStatus();
 }catch(e){notify("Tidak dapat ubah tetapan worker: "+e.message,true)}
 finally{btn.disabled=false}
}
function notify(message,error=false){
 const notice=$("telegramNotice");notice.classList.remove("hide");notice.textContent=message;
 notice.classList.toggle("error",!!error);
}
function setBusy(el,v){el.disabled=v}
function toggle(open){
 $("telegramPanel").classList.toggle("hide",!open);
 $("telegramSettingsBtn").setAttribute("aria-expanded",String(open));
 if(open){$("telegramPanel").scrollIntoView({behavior:"smooth",block:"start"});refresh();}
}
async function refresh(){
 if(!currentUser||busy)return;
 busy=true;setBusy($("telegramRefresh"),true);
 try{
  const r=await api("telegram_status");
  $("telegramState").textContent=r.connected?"Bot Telegram Aktif":"Bot belum disambungkan";
  $("telegramUser").textContent=r.bot_username?"@"+r.bot_username:"Admin perlu sambungkan token bot daripada BotFather.";
  $("telegramDot").classList.toggle("connected",!!r.connected);
  $("tgOpenAIStatus").textContent=r.openai_enabled?"Aktif":"Belum disambung";
  $("tgOpenAIStatus").classList.toggle("on",!!r.openai_enabled);
  $("tgDeepSeekStatus").textContent=r.deepseek_enabled?"Aktif":"Belum disambung";
  $("tgDeepSeekStatus").classList.toggle("on",!!r.deepseek_enabled);
  $("telegramAIRouting").value=r.ai_primary_provider||"auto";
  $("telegramFallback").checked=r.ai_fallback_enabled!==false;
  $("telegramAIStatus").textContent=r.ai_enabled
   ?"AI aktif: "+[r.openai_enabled?"OpenAI":"",r.deepseek_enabled?"DeepSeek Flash":""].filter(Boolean).join(" + ") +"."
   :"Tiada key AI. Dokumen dikelaskan melalui nama fail dan wajib disemak.";
  $("telegramDisableDeepSeek").disabled=!r.deepseek_enabled;
  $("telegramLinkStatus").textContent=r.telegram_linked?"✅ Akaun Telegram anda sudah dipautkan.":"Belum dipautkan dengan Telegram.";
  $("telegramGenerateLink").disabled=!r.connected;
  $("telegramDisconnect").disabled=!r.connected;
  $("telegramUnlink").disabled=!r.telegram_linked;
  $("telegramDisableAI").disabled=!r.ai_enabled;
  loaded=true;
 }catch(e){notify("Gagal semak sambungan: "+e.message,true)}
 finally{busy=false;setBusy($("telegramRefresh"),false)}
}
async function connect(event){
 event.preventDefault();
 if(!currentUser||currentUser.role!=="admin")return;
 const token=$("telegramBotToken").value.trim(),btn=$("telegramConnect");
 if(!token)return notify("Masukkan token BotFather dahulu.",true);
 setBusy(btn,true);
 try{
  const result=await api("telegram_connect",{token});
  $("telegramBotToken").value="";
  notify("✅ Bot @"+result.bot_username+" disambungkan. Staf kini boleh jana kod pautan.");
  await refresh();
 }catch(e){notify("Bot gagal disambungkan: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function disconnect(){
 if(!currentUser||currentUser.role!=="admin")return;
 if(!confirm("Putuskan webhook Telegram? Bot tidak akan terima arahan baharu sehingga disambungkan semula."))return;
 const btn=$("telegramDisconnect");setBusy(btn,true);
 try{await api("telegram_disconnect");notify("Webhook bot sudah diputuskan.");await refresh()}
 catch(e){notify("Tidak dapat putuskan bot: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function setAI(event){
 event.preventDefault();
 if(!currentUser||currentUser.role!=="admin")return;
 const key=$("telegramAPIKey").value.trim();
 if(!key)return notify("Isi OpenAI API key yang sah dahulu.",true);
 if(!confirm("Dokumen pelanggan yang dihantar kepada bot mungkin diproses oleh OpenAI. Pastikan kebenaran pelanggan dan pematuhan privasi. Sambung OpenAI?"))return;
 const btn=$("telegramSaveAI");setBusy(btn,true);
 try{await api("telegram_set_ai",{api_key:key});$("telegramAPIKey").value="";notify("✅ Key OpenAI disimpan. Ia boleh digunakan untuk PDF/imej mengikut pilihan AI.");await refresh()}
 catch(e){notify("Gagal aktifkan AI: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function disableAI(){
 if(!currentUser||currentUser.role!=="admin")return;
 if(!confirm("Padam kunci OpenAI? DeepSeek masih kekal jika telah disambung."))return;
 try{await api("telegram_disable_ai");notify("Key OpenAI dipadam. Pilihan DeepSeek tidak diubah.");await refresh()}
 catch(e){notify("Gagal matikan AI Scan: "+e.message,true)}
}
async function setDeepSeek(event){
 event.preventDefault();
 if(!currentUser||currentUser.role!=="admin")return;
 const key=$("telegramDeepSeekKey").value.trim();
 if(!key)return notify("Masukkan key DeepSeek dahulu.",true);
 if(!confirm("Dokumen imej pelanggan mungkin dihantar kepada DeepSeek untuk pengelasan. Pastikan pelanggan membenarkan pemprosesan oleh pembekal luar. Teruskan?"))return;
 const btn=$("telegramSaveDeepSeek");setBusy(btn,true);
 try{
  await api("telegram_set_deepseek",{api_key:key});
  $("telegramDeepSeekKey").value="";
  notify("✅ DeepSeek Flash disambungkan untuk imbasan gambar JPG/PNG.");
  await refresh();
 }catch(e){notify("Gagal simpan key DeepSeek: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function disableDeepSeek(){
 if(!currentUser||currentUser.role!=="admin")return;
 if(!confirm("Padam key DeepSeek? OpenAI masih kekal jika disambung."))return;
 const btn=$("telegramDisableDeepSeek");setBusy(btn,true);
 try{
  await api("telegram_disable_deepseek");
  notify("Key DeepSeek dipadam. OpenAI tidak diubah.");
  await refresh();
 }catch(e){notify("Gagal padam key DeepSeek: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function saveAIRouting(){
 if(!currentUser||currentUser.role!=="admin")return;
 const btn=$("telegramSaveRouting");setBusy(btn,true);
 try{
  const primary=$("telegramAIRouting").value,fallback_enabled=$("telegramFallback").checked;
  await api("telegram_set_ai_routing",{primary,fallback_enabled});
  notify("✅ Pilihan AI disimpan. "+(primary==="auto"?"Auto: DeepSeek untuk imej, OpenAI untuk PDF.":"AI utama: "+primary)+
   (fallback_enabled?" Sandaran diaktifkan.":" Sandaran dimatikan."));
  await refresh();
 }catch(e){notify("Tidak dapat menyimpan pilihan AI: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function getLinkCode(){
 const btn=$("telegramGenerateLink");setBusy(btn,true);
 try{
  const data=await api("telegram_link_code");
  $("telegramLinkCode").textContent=data.code;
  const link=$("telegramConnectLink");
  link.href=data.url;
  $("telegramLinkResult").classList.remove("hide");
  notify("Kod sambungan sah selama "+data.expires_in_minutes+" minit. Buka bot Telegram menggunakan pautan di bawah.");
 }catch(e){notify("Gagal jana kod: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function unlink(){
 if(!confirm("Putuskan akaun Telegram daripada ID FARIS anda?"))return;
 const btn=$("telegramUnlink");setBusy(btn,true);
 try{await api("telegram_unlink_self");$("telegramLinkResult").classList.add("hide");notify("Akaun Telegram berjaya dinyahpaut.");await refresh()}
 catch(e){notify("Gagal nyahpaut: "+e.message,true)}
 finally{setBusy(btn,false)}
}
function register(){
 $("telegramSettingsBtn").addEventListener("click",()=>toggle($("telegramPanel").classList.contains("hide")));
 $("telegramClose").addEventListener("click",()=>toggle(false));
 $("telegramRefresh").addEventListener("click",refresh);
 $("telegramConnectForm").addEventListener("submit",connect);
 $("telegramDisconnect").addEventListener("click",disconnect);
 $("telegramAIForm").addEventListener("submit",setAI);
 $("telegramDisableAI").addEventListener("click",disableAI);
 $("telegramDeepSeekForm").addEventListener("submit",setDeepSeek);
 $("telegramDisableDeepSeek").addEventListener("click",disableDeepSeek);
 $("telegramSaveRouting").addEventListener("click",saveAIRouting);
 $("codexCheck").addEventListener("click",codexStatus);
 $("codexCreatePair").addEventListener("click",createCodexPair);
 $("codexSaveEnabled").addEventListener("click",codexToggle);
 $("codexCopyPair").addEventListener("click",async()=>{
  const code=$("codexPairCode").textContent;
  try{await navigator.clipboard.writeText(code);notify("Kod pairing disalin.");}
  catch{window.prompt("Salin kod pairing:",code)}
 });
 $("telegramGenerateLink").addEventListener("click",getLinkCode);
 $("telegramSyncCommands").addEventListener("click",async()=>{
  if(!currentUser||currentUser.role!=="admin"){
   notify("Menu bot hanya boleh dikemas kini oleh admin.",true);return;
  }
  const btn=$("telegramSyncCommands");btn.disabled=true;
  try{
   const r=await api("telegram_sync_commands");
   notify("✅ "+r.commands+" arahan mudah berjaya dikemas kini dalam menu Telegram. Buka semula bot dan tekan / untuk melihat pilihan.");
  }catch(e){notify("Tidak dapat kemas kini menu bot: "+e.message,true)}
  finally{btn.disabled=false}
 });
 $("telegramUnlink").addEventListener("click",unlink);
 document.querySelectorAll("[data-cli-copy]").forEach(button=>{
  button.addEventListener("click",async()=>{
   const command=button.dataset.cliCopy==="install"?"npm install -g @openai/codex":"codex";
   try{await navigator.clipboard.writeText(command);notify("Arahan PowerShell berjaya disalin.");}
   catch{window.prompt("Salin arahan ini:",command)}
  });
 });
 $("telegramCopyCode").addEventListener("click",async()=>{
  const code=$("telegramLinkCode").textContent;
  try{await navigator.clipboard.writeText(code);notify("Kod disalin. Tampal dalam bot jika perlu.");}
  catch{prompt("Salin kod:",code)}
 });
}
window.FARIS_TG={
 onLogin(user){
  currentUser=user;
  $("telegramSettingsBtn").classList.remove("hide");
  $("telegramAdminSettings").classList.toggle("hide",user.role!=="admin");
  $("farisCodexPairing").classList.toggle("hide",user.role!=="admin");
  if(user.role==="admin")codexStatus();
  $("telegramSyncCommands").classList.toggle("hide",user.role!=="admin");
  loaded=false;
 },
 onLogout(){
  currentUser=null;$("telegramSettingsBtn").classList.add("hide");
  $("telegramPanel").classList.add("hide");$("telegramLinkResult").classList.add("hide");
  $("telegramBotToken").value="";$("telegramAPIKey").value="";$("telegramDeepSeekKey").value="";
 },
};
document.addEventListener("DOMContentLoaded",register);
})();