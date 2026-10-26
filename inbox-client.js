(()=>{
"use strict";
const ROOT="https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/";
const SESSION="faris_lead_hub_session_v2",DEVICE="faris_lead_hub_trusted_browser_v1";
let renewing=null;
async function renew(){
 if(renewing)return renewing;
 renewing=(async()=>{
  const device=localStorage.getItem(DEVICE);if(!device)throw Error("Log masuk semula untuk mengakses Fail Masuk.");
  const r=await fetch(ROOT+"lead-hub",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"resume_device",device_token:device})});
  const d=await r.json();if(!r.ok||!d.ok)throw Error("Sesi tamat. Log masuk semula.");
  if(localStorage.getItem(DEVICE)!==device)throw Error("Akaun telah berubah. Buka Fail Masuk semula.");
  localStorage.setItem(SESSION,d.token);
  window.dispatchEvent(new CustomEvent("faris-session-renewed",{detail:{token:d.token}}));
 })();
 try{await renewing}finally{renewing=null}
}
async function send(action,payload={},file=null,retried=false){
 const token=localStorage.getItem(SESSION);if(!token)throw Error("Log masuk dahulu untuk menggunakan Fail Masuk.");
 const headers={Authorization:"Bearer "+token};
 let body;
 if(file){body=new FormData();body.append("file",file,file.name)}
 else{headers["Content-Type"]="application/json";body=JSON.stringify({action,...payload})}
 const r=await fetch(ROOT+"lead-hub-inbox"+(file?"?action=receive":""),{method:"POST",headers,body,cache:"no-store"});
 if(r.status===401&&!retried){
  if(localStorage.getItem(SESSION)!==token)throw Error("Sesi telah berubah. Refresh Fail Masuk.");
  await renew();return send(action,payload,file,true);
 }
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok)throw Error(d?.error||"Fail Masuk tidak dapat dihubungi. Cuba lagi.");
 return d;
}
window.FARIS_INBOX_CLIENT={request:send,upload:file=>send("receive",{},file),
 async file(id){
  const d=await send("download",{id});
  const r=await fetch(d.url,{cache:"no-store"});
  if(!r.ok)throw Error("Fail tidak dapat dimuat turun. Refresh dan cuba lagi.");
  return {metadata:d.file,file:new File([await r.blob()],d.file.original_name,{type:d.file.mime_type})};
 },endpoint:ROOT+"lead-hub-inbox?action=receive"};
})();
