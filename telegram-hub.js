(()=>{
"use strict";
const URL="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-telegram";
const SESSION="faris_lead_hub_session_v2";
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
  $("telegramAIStatus").textContent=r.ai_enabled?"AI Scan aktif (OpenAI; "+r.ai_model+").":"AI Scan belum aktif; klasifikasi nama fail dan semakan manual.";
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
 if(!confirm("Dokumen pelanggan akan dihantar ke OpenAI untuk pengelasan apabila AI aktif. Pastikan pelanggan telah memberikan kebenaran yang sesuai. Teruskan?"))return;
 const btn=$("telegramSaveAI");setBusy(btn,true);
 try{await api("telegram_set_ai",{api_key:key});$("telegramAPIKey").value="";notify("✅ AI Scan diaktifkan. Pengelasan AI memerlukan kredit API OpenAI.");await refresh()}
 catch(e){notify("Gagal aktifkan AI: "+e.message,true)}
 finally{setBusy(btn,false)}
}
async function disableAI(){
 if(!currentUser||currentUser.role!=="admin")return;
 if(!confirm("Matikan AI Scan untuk semua staf?"))return;
 try{await api("telegram_disable_ai");notify("AI Scan dimatikan. Bot kekal berfungsi dengan pengesanan nama fail.");await refresh()}
 catch(e){notify("Gagal matikan AI Scan: "+e.message,true)}
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
 $("telegramGenerateLink").addEventListener("click",getLinkCode);
 $("telegramUnlink").addEventListener("click",unlink);
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
  loaded=false;
 },
 onLogout(){
  currentUser=null;$("telegramSettingsBtn").classList.add("hide");
  $("telegramPanel").classList.add("hide");$("telegramLinkResult").classList.add("hide");
  $("telegramBotToken").value="";$("telegramAPIKey").value="";
 },
};
document.addEventListener("DOMContentLoaded",register);
})();