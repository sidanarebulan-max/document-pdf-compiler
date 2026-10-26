(()=>{
"use strict";
const key="faris_lead_handoff_v1";
const params=new URLSearchParams(location.search);
const origin=params.get("origin");
const tool=params.get("tool");
if(origin!=="staff"||!["COMPILER","VSO"].includes(tool))return;
const $=id=>document.getElementById(id);
const templateIds=()=>Array.from($("vsoModel")?.options||[]).map(o=>o.value);
const HANDOFF_TTL=10*60*1000;
let lead=null;
try{
 const raw=sessionStorage.getItem(key);
 sessionStorage.removeItem(key); // per-customer data is one-time; never placed in the URL
 if(raw){
  const data=JSON.parse(raw);
  if(Number.isFinite(data.created_at)&&Date.now()-data.created_at>=0&&Date.now()-data.created_at<HANDOFF_TTL){
   const phone=String(data.phone_e164||"");
   if(/^601\d{8,9}$/.test(phone)&&String(data.customer_name||"").trim()){
    lead={name:String(data.customer_name).trim().slice(0,120),phone,model:String(data.model||"").slice(0,120)};
   }
  }
 }
}catch(e){console.warn("Invalid staff context:",e)}
const banner=document.createElement("div");
banner.id="staffContextBanner";
banner.style.cssText="position:relative;z-index:40;background:#10223e;border:1px solid #37619d;border-radius:14px;margin:12px auto 16px;padding:13px 15px;max-width:1580px;color:#eaf3ff;font-family:system-ui,Arial,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap";
const detail=document.createElement("div");
detail.style.cssText="display:grid;gap:4px;line-height:1.45;min-width:210px";
const title=document.createElement("strong");
title.style.fontSize="14px";
title.textContent=tool==="VSO"?"🚘 Ruang Kerja Staf — Buat VSO":"📑 Ruang Kerja Staf — Urus Dokumen";
const info=document.createElement("span");
info.style.cssText="font-size:12px;color:#bdd0ed;overflow-wrap:anywhere";
info.textContent=lead?"Pelanggan: "+lead.name+" · +"+lead.phone+" · "+(lead.model||"Model belum pasti"):"Tiada pelanggan dipilih. Isi butiran pelanggan secara manual.";
detail.append(title,info);
const back=document.createElement("a");
back.href="/staff.html#docs";
back.style.cssText="display:inline-flex;border:1px solid #5275b6;background:#223b68;color:white;border-radius:10px;padding:10px 14px;text-decoration:none;font-weight:700;font-size:12px";
back.textContent="← Kembali ke Lead Hub";
banner.append(detail,back);
document.body.insertBefore(banner,document.body.firstChild);
function put(id,value){
 const node=$(id);
 if(!node||!value)return;
 node.value=value;
 node.dispatchEvent(new Event("input",{bubbles:true}));
}
function variantId(label){
 const s=String(label||"").toLowerCase().replace(/[^a-z0-9]+/g," ");
 const is5=/e\s*mas\s*5/.test(s);
 const is7=/e\s*mas\s*7/.test(s);
 if(is7&&/(phev|hybrid|plug\s*in)/.test(s)){
  return /premium\s*plus/.test(s)?"EMAS7_PHEV_PREMIUM_PLUS_2026":null;
 }
 if(is5){
  if(/\bprime\b/.test(s))return "EMAS5_PRIME_2026";
  if(/\bpremium\b/.test(s))return "EMAS5_PREMIUM_2026";
 }
 if(is7){
  if(/premium\s*plus/.test(s))return "EMAS7_PREMIUM_PLUS_2026";
  if(/\bpremium\b/.test(s))return "EMAS7_PREMIUM_2026";
 }
 return null;
}
function warn(message){
 const p=document.createElement("p");
 p.style.cssText="font-size:12px;color:#fbe2a6;margin:5px 0 0;line-height:1.55";
 p.textContent=message;
 detail.appendChild(p);
 return p;
}
function prefill(){
 if(!window.VSO_CENTER){
  warn("Modul VSO tidak dapat dimuatkan. Refresh halaman dan cuba lagi.");
  return;
 }
 if(lead){
  const localPhone=lead.phone.startsWith("60")?"0"+lead.phone.slice(2):lead.phone;
  put("customerName",lead.name);
  put("customerPhone",localPhone);
  put("vsoCustomer",lead.name);
  put("vsoPhone",localPhone);
  // Default loan/colour in original VSO are examples, never carry them to a real customer.
  $("vsoLoan").value="";
  $("vsoLoan").dispatchEvent(new Event("input",{bubbles:true}));
  $("vsoColor").value="";
  $("vsoColor").placeholder="Isi warna sebenar pelanggan";
  $("vsoColor").dispatchEvent(new Event("input",{bubbles:true}));
  const select=$("vsoModel");
  const match=variantId(lead.model);
  const ids=templateIds();
  const original=match&&ids.includes(match)?match:null;
  const buttons=["vsoDownload","vsoDownloadBottom","vsoToCompiler"].map($).filter(Boolean);
  if(original){
   select.value=original;
   select.dispatchEvent(new Event("change",{bubbles:true}));
   select.dispatchEvent(new Event("input",{bubbles:true}));
   warn("Nama dan nombor telah diisi. Sahkan varian, tahun, IC, alamat, warna dan jumlah pinjaman sebelum menjana VSO.");
  }else{
   const placeholder=document.createElement("option");
   placeholder.value="";placeholder.textContent="⚠ PILIH VARIAN KERETA SEBENAR";
   select.insertBefore(placeholder,select.firstChild);
   select.value="";
   warn("Model asal: "+(lead.model||"Belum pasti")+". Varian tepat belum dikenal pasti. Pilih varian sebenar; JANGAN guna harga varian lain.");
   select.dispatchEvent(new Event("input",{bubbles:true}));
   buttons.forEach(b=>b.disabled=true);
   const enforce=()=>{
    if(ids.includes(select.value)){
     buttons.forEach(b=>b.disabled=false);
     placeholder.remove();
     select.removeEventListener("change",enforce);
    }else buttons.forEach(b=>b.disabled=true);
   };
   select.addEventListener("change",enforce);
  }
 }
 if(tool==="COMPILER")window.VSO_CENTER.openCompiler();
 else window.VSO_CENTER.openVso();
}
prefill();
})();
