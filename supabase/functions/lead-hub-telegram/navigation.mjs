// FARIS Telegram navigation — pure helpers (no private data or network calls).
export const PAGE_SIZE=7;
export const CALLBACK_PREFIX="faris_nav:";
export function parseNavCallback(value){
 const v=String(value||"");
 if(v==="faris_nav:home")return {kind:"home"};
 if(v==="faris_nav:new")return {kind:"new"};
 const pg=v.match(/^faris_nav:resume:(\d{1,3})$/);
 if(pg){const page=Number(pg[1]);return page<=999?{kind:"resume",page}:null;}
 const item=v.match(/^faris_nav:open:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
 if(item)return {kind:"open",caseId:item[1].toLowerCase()};
 return null;
}
export function mainMenu(activeCase){
 const active=activeCase?"\n📂 Kes aktif: "+String(activeCase.customer_name||"").slice(0,80):"\n📂 Tiada kes aktif dipilih";
 return {
  text:"👋 FARIS R+PROTON • MENU PELANGGAN"+active+
    "\n\nApa yang kau nak buat sekarang?\n"+
    "🆕 New Customer — buka folder pelanggan baharu.\n"+
    "📂 Resume Customer — pilih pelanggan lama daripada senarai.\n\n"+
    "Pilih butang di bawah. Kes dan dokumen yang lama tidak akan dipadam.",
  reply_markup:{inline_keyboard:[
   [{text:"🆕 New Customer",callback_data:"faris_nav:new"}],
   [{text:"📂 Resume Customer",callback_data:"faris_nav:resume:0"}]
  ]}
 };
}
export function resumeMenu(cases,page,total,activeCaseId){
 const totalPages=Math.max(1,Math.ceil(total/PAGE_SIZE));
 const p=Math.max(0,Math.min(page,totalPages-1));
 const rows=(cases||[]).map(c=>{
  const selected=c.id===activeCaseId?"🟢 ":"📁 ";
  const name=String(c.customer_name||"Tidak bernama").replace(/[\n\r\t]/g," ").slice(0,42);
  const count=Number(c.file_count||0);
  return [{text:selected+name+" ("+count+" fail)",callback_data:"faris_nav:open:"+c.id}];
 });
 if(p>0||p+1<totalPages){
  const pagination=[];
  if(p>0)pagination.push({text:"⬅️ Sebelum",callback_data:"faris_nav:resume:"+(p-1)});
  if(p+1<totalPages)pagination.push({text:"Seterusnya ➡️",callback_data:"faris_nav:resume:"+(p+1)});
  rows.push(pagination);
 }
 rows.push([{text:"🆕 New Customer",callback_data:"faris_nav:new"}]);
 rows.push([{text:"🏠 Menu Utama",callback_data:"faris_nav:home"}]);
 return {
  text:"📂 RESUME CUSTOMER\n"+
   "Pilih satu folder untuk sambung kerja.\n"+
   (total?"📋 "+total+" kes belum selesai • Halaman "+(p+1)+"/"+totalPages:
    "Belum ada kes pelanggan yang belum selesai.")+
   "\n\nHanya kes dalam akaun FARIS dan chat kau dipaparkan.\n"+
   "Semua dokumen dalam folder yang dipilih kekal tersimpan.",
  reply_markup:{inline_keyboard:rows}
 };
}
export function resumedMessage(c,files){
 return {
  text:"✅ KES PELANGGAN DISAMBUNG\n"+
  "👤 "+String(c.customer_name||"").slice(0,100)+"\n"+
  "🆔 "+String(c.id||"").slice(0,8).toUpperCase()+"\n"+
  "📎 "+Math.max(0,Number(files||0))+" fail disimpan\n"+
  "📁 Bahagian: "+String(c.active_party||"HIRER")+
  "\n\nKes ini kini aktif. Hantar fail baharu, taip 'senarai' atau 'siapkan PDF'.",
  reply_markup:{inline_keyboard:[
   [{text:"📂 Resume Pelanggan Lain",callback_data:"faris_nav:resume:0"}],
   [{text:"🏠 Menu Utama",callback_data:"faris_nav:home"}]
  ]}
 };
}
