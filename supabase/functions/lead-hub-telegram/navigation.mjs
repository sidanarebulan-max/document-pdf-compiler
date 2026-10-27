// FARIS Telegram navigation — pure helpers (no private data or network calls).
export const PAGE_SIZE=7;
export const CALLBACK_PREFIX="faris_nav:";
export function parseNavCallback(value){
 const v=String(value||"");
 if(v==="faris_nav:home")return {kind:"home"};
 if(v==="faris_nav:docs")return {kind:"docs"};
 if(v==="faris_nav:wa")return {kind:"wa"};
 if(v==="faris_nav:wa:add")return {kind:"wa_add"};
 if(v==="faris_nav:wa:claim")return {kind:"wa_claim"};
 const waList=v.match(/^faris_nav:wa:list:(\d{1,3})$/);
 if(waList)return {kind:"wa_list",page:Math.min(999,Number(waList[1]))};
 const waDetail=v.match(/^faris_nav:wa:open:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
 if(waDetail)return {kind:"wa_open",leadId:waDetail[1].toLowerCase()};
 if(v==="faris_nav:new")return {kind:"new"};
 const section=v.match(/^faris_nav:party:([hgr]):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
 if(section)return {kind:"party",party:({h:"HIRER",g:"GUARANTOR",r:"REBATE"})[section[1].toLowerCase()],caseId:section[2].toLowerCase()};
 const pg=v.match(/^faris_nav:resume:(\d{1,3})$/);
 if(pg){const page=Number(pg[1]);return page<=999?{kind:"resume",page}:null;}
 const item=v.match(/^faris_nav:open:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
 if(item)return {kind:"open",caseId:item[1].toLowerCase()};
 return null;
}
export function partyButtons(caseId){
 const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(caseId||""));
 if(!valid)return [];
 return [
  [{text:"👤 Dokumen Peminjam",callback_data:"faris_nav:party:h:"+caseId}],
  [{text:"➕ Add Guarantor",callback_data:"faris_nav:party:g:"+caseId}],
  [{text:"🧾 Cop Rebate",callback_data:"faris_nav:party:r:"+caseId}]
 ];
}
export function mainMenu(activeCase){
 return {
  text:"🏠 FARIS R+PROTON • MENU UTAMA\n"+
   (activeCase?"📂 Kes dokumen: "+String(activeCase.customer_name||"").slice(0,75)+"\n":"")+
   "\nPilih halaman kerja.\n"+
   "📁 Dokumen dan 📲 WhatsApp diurus dalam chat ini.\n"+
   "🖼 Gallery, 👥 Profil Pelanggan dan 📥 Fail Masuk dibuka di website FARIS. Log masuk jika diminta.",
  reply_markup:{inline_keyboard:[
   [{text:"📁 Dokumen",callback_data:"faris_nav:docs"},
    {text:"📲 WhatsApp",callback_data:"faris_nav:wa"}],
   [{text:"🖼 Gallery ↗",url:"https://document-pdf-compiler.vercel.app/staff.html#gallery"},
    {text:"👥 Profil Pelanggan ↗",url:"https://document-pdf-compiler.vercel.app/staff.html#customers"}],
   [{text:"📥 Fail Masuk ↗",url:"https://document-pdf-compiler.vercel.app/staff.html#docs"}]
  ]}
 };
}
export function documentMenu(activeCase){
 return {
  text:"📁 FARIS • DOKUMEN\n"+
   (activeCase?"👤 Kes aktif: "+String(activeCase.customer_name||"").slice(0,80)+"\n":"📂 Tiada kes aktif.\n")+
   "\nBuka pelanggan baharu atau sambung folder lama."+
   (activeCase?"\nPilih bahagian untuk fail seterusnya.":""),
  reply_markup:{inline_keyboard:[
   [{text:"🆕 New Customer",callback_data:"faris_nav:new"},
    {text:"📂 Resume Customer",callback_data:"faris_nav:resume:0"}],
   ...partyButtons(activeCase?.id),
   [{text:"🏠 Menu Utama",callback_data:"faris_nav:home"}]
  ]}
 };
}
export function whatsappMenu(){
 return {
  text:"📲 FARIS • WHATSAPP\n\nPilih tindakan.\n"+
  "➕ Tambah No Baru — daftar nama dan nombor pelanggan dengan kebenaran.\n"+
  "📇 No Tersedia — lihat lead yang dibenarkan untuk akaun kau dan buka WhatsApp terus.",
  reply_markup:{inline_keyboard:[
   [{text:"➕ Tambah No Baru",callback_data:"faris_nav:wa:add"},
    {text:"📇 No Tersedia",callback_data:"faris_nav:wa:list:0"}],
   [{text:"🏠 Menu Utama",callback_data:"faris_nav:home"}]
  ]}
 };
}
export function availableNumbersMenu(leads,page,total,admin){
 const totalPages=Math.max(1,Math.ceil(total/7));
 const current=Math.max(0,Math.min(page,totalPages-1));
 const rows=(leads||[]).map(x=>[{
  text:"📱 "+String(x.customer_name||"Pelanggan").replace(/[\r\n\t]/g," ").slice(0,32)+
   " · "+String(x.phone_e164||"").slice(-4),
  callback_data:"faris_nav:wa:open:"+x.id
 }]);
 const nav=[];
 if(current>0)nav.push({text:"⬅️",callback_data:"faris_nav:wa:list:"+(current-1)});
 if(current+1<totalPages)nav.push({text:"Seterusnya ➡️",callback_data:"faris_nav:wa:list:"+(current+1)});
 if(nav.length)rows.push(nav);
 if(!admin)rows.push([{text:"🎯 Ambil No Belum Diagih",callback_data:"faris_nav:wa:claim"}]);
 rows.push([{text:"🔄 Refresh",callback_data:"faris_nav:wa:list:"+current}]);
 rows.push([{text:"📲 Menu WhatsApp",callback_data:"faris_nav:wa"}]);
 return {
  text:"📇 NO TERSEDIA\n"+(admin?"Senarai lead FARIS":"Lead yang diagihkan kepada akaun kau")+
   "\nJumlah: "+total+" · Halaman "+(current+1)+"/"+totalPages+
   (total?"\n\nTekan nama untuk buka nombor dan mesej WhatsApp.":"\n\nTiada nombor tersedia buat masa ini."),
  reply_markup:{inline_keyboard:rows}
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
   ...partyButtons(c.id),
   [{text:"📂 Resume Pelanggan Lain",callback_data:"faris_nav:resume:0"}],
   [{text:"🏠 Menu Utama",callback_data:"faris_nav:home"}]
  ]}
 };
}
