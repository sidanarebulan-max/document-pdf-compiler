(()=>{
"use strict";
const params=new URLSearchParams(location.search);
if(params.get("inbox")!=="1"||params.get("tool")!=="COMPILER")return;
const key="faris_inbox_compiler_v1",box=document.createElement("aside");
box.id="compilerInboxStatus";box.setAttribute("role","status");
box.style.cssText="padding:16px;margin:14px;border:1px solid #4374a9;border-radius:12px;background:#10233d;color:#e7f0ff;font:14px/1.6 system-ui;overflow-wrap:anywhere";
box.textContent="Memuatkan fail daripada Fail Masuk...";
document.body.insertBefore(box,document.body.firstChild);
(async()=>{
 let selection;try{selection=JSON.parse(sessionStorage.getItem(key)||"null")}catch{}
 if(!selection||!Array.isArray(selection.ids)||!selection.ids.length||selection.ids.length>30||Date.now()-selection.created_at>10*60*1000||selection.created_at>Date.now())throw Error("Pilihan fail telah tamat. Kembali ke Dokumen → Fail Masuk dan pilih semula.");
 const client=window.FARIS_INBOX_CLIENT,identity=await client.request("me");
 if(identity.user.id!==selection.account_id)throw Error("Pilihan ini daripada akaun lain. Kembali ke Fail Masuk untuk pilih semula.");
 const loaded=[];
 for(const [i,id] of selection.ids.entries()){
  box.textContent="Memuatkan fail "+(i+1)+" / "+selection.ids.length+"...";
  loaded.push(await client.file(id));
 }
 if(!window.FARIS_COMPILER)throw Error("Compiler belum tersedia. Refresh halaman dan cuba lagi.");
 await window.FARIS_COMPILER.importInbox(loaded);
 sessionStorage.removeItem(key);
 box.textContent=loaded.length+" fail dari Fail Masuk sudah berada dalam Compiler. Semak kategori dan susunan sebelum menjana PDF. Fail asal kekal disimpan.";
 const detail=document.querySelector("#staffContextBanner span");
 if(detail)detail.textContent="Pelanggan: "+(loaded[0]?.metadata.customer_name||"Belum ditetapkan")+" · Dari Fail Masuk";
 const link=document.createElement("a");link.href="/staff.html#docs";link.textContent=" ← Kembali ke Fail Masuk";link.style.color="#a8d8ff";box.append(link);
})().catch(e=>{
 box.textContent=e.message+" Fail asal kekal disimpan. ";
 const link=document.createElement("a");link.href="/staff.html#docs";link.textContent="Buka Fail Masuk";link.style.color="#a8d8ff";box.append(link);
});
})();
