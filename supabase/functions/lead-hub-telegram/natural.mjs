// Pure Malay/English natural-language router for FARIS Telegram.
// Never executes actions by itself; all database mutations remain on the authenticated server.
const WORD_NUMBERS={satu:1,dua:2,tiga:3,empat:4,lima:5,enam:6,tujuh:7,lapan:8,sembilan:9,sepuluh:10};
function numberValue(v){
 const k=String(v||"").toLowerCase().trim();
 return /^\d+$/.test(k)?Number(k):WORD_NUMBERS[k]||0;
}
export function parseNatural(raw){
 const original=String(raw||"").trim();
 if(!original||original.length>1200)return {kind:"chat"};
 // Preserve explicit slash commands, apart from common misspellings.
 if(original.startsWith("/")){
  const fixed=original.replace(/^\/(?:ketegori|kategory|kategeri)\b/i,"/kategori");
  return fixed!==original?{kind:"route",command:fixed}:{kind:"legacy"};
 }
 const t=original.toLowerCase().replace(/[?!.,]+$/g,"").replace(/\s+/g," ").trim();
 // Questions about *how* to delete should not start a destructive flow.
 if(/^(?:macam mana|bagaimana|how to|boleh ke|bolehkah|cara)\b/i.test(t) && /\b(buang|padam|delete)\b/i.test(t))return {kind:"chat"};
 const m=t.match(/(?:^|\s)(?:no|nombor|fail|file|dokumen)\s*(?:ke[-\s]*)?(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)\s*(?:hingga|sampai|ke|dan|-)\s*(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)/);
 const deleteAction=/\b(buang|padam|delete|remove)\b/.test(t);
 if(deleteAction&&m){
  const a=numberValue(m[1]),b=numberValue(m[2]);
  if(a>=1&&b>=a&&b<=50&&b-a<20)return {kind:"remove_files",numbers:Array.from({length:b-a+1},(_,i)=>a+i)};
  return {kind:"ask",reply:"Aku boleh buang sehingga 20 fail dalam satu arahan. Beritahu nombor yang tepat ikut senarai semasa."};
 }
 // Forwarded list example: "empat document ini buang 1. ⚠️ [HIRER]... 2. ⚠️..."
 // Only numbered list items are used, never numbers embedded in bank filenames.
 if(deleteAction && /\b(?:dokumen|document|fail|file)\b/.test(t)){
  const matches=[...t.matchAll(/(?:^|\s)(\d{1,2})\s*\.\s*(?:✅|⚠️|\[)/g)]
    .map(m=>Number(m[1])).filter(x=>x>=1&&x<=50);
  const numbers=[...new Set(matches)].sort((a,b)=>a-b);
  if(numbers.length>=2&&numbers.length<=20)return {kind:"remove_files",numbers};
  if(/\b(?:beberapa|empat|semua)\s+(?:dokumen|document|fail|file)/.test(t))
   return {kind:"ask",reply:"Aku boleh buang fail yang dipilih. Beritahu nombornya, contoh 'buang fail 1 sampai 4', atau hantar senarai bernombor."};
 }
 const one=t.match(/(?:^|\s)(?:no|nombor|fail|file|dokumen)\s*(?:ke[-\s]*)?(\d{1,2}|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh)\b/);
 if(deleteAction&&one){
  const n=numberValue(one[1]);
  if(n>=1&&n<=50)return {kind:"remove_files",numbers:[n]};
 }
 if(/^(?:ya\s+buang|ya\s+padam|sahkan\s+buang|sahkan\s+padam|confirm\s+delete)$/i.test(t))return {kind:"confirm_delete"};
 if(/^(?:batal\s+buang|jangan\s+buang|tak\s+jadi\s+buang|cancel\s+delete)$/i.test(t))return {kind:"cancel_delete"};
 if(/^(?:padam|buang)\s+(?:kes|folder|semua\s+fail|semua\s+dokumen)\s*(?:ini|sekarang)?$/.test(t))return {kind:"delete_case"};
 if(/^(?:hi|hello|hai|helo|assalamualaikum|salam|selamat pagi|selamat petang|selamat malam|terima kasih|thanks|tq)$/i.test(t))return {kind:"greeting"};
 if(/^(?:menu|help|bantuan|tolong|cara guna|apa fungsi bot|macam mana guna|apa yang bot boleh buat)$/i.test(t))return {kind:"route",command:"/menu"};
 if(/^(?:batal vso|cancel vso|stop vso)$/i.test(t))return {kind:"route",command:"/batal"};
 if(/^(?:buat|jana|generate|sediakan|tulis|create|nak buat|saya nak buat|boleh buat)\s+(?:satu\s+)?vso(?:\s+baru)?$/i.test(t))return {kind:"route",command:"/buatvso"};
 const newCase=t.match(/^(?:(?:buka|buat|mula|create|set)\s+(?:kes|folder|fail)\s+(?:pelanggan\s+)?(?:nama\s+|untuk\s+|atas\s+nama\s+)?|(?:pelanggan|nama pelanggan|kes baru|folder baru)\s+)(.+)$/i);
 if(newCase){
  const name=original.slice(original.length-newCase[1].length).trim();
  if(name.length>=2&&name.length<=120&&!/[|\/]/.test(name)&&!/\d{5,}/.test(name))
   return {kind:"route",command:"/pelanggan "+name};
 }
 const parts={
  "/peminjam":/^(?:peminjam|hirer|bahagian peminjam|pilih peminjam|untuk peminjam|dokumen peminjam)$/,
  "/penjamin":/^(?:penjamin|guarantor|bahagian penjamin|pilih penjamin|untuk penjamin|dokumen penjamin)$/,
  "/rebate":/^(?:rebate|cop rebate|bahagian rebate|pilih rebate|untuk rebate|dokumen rebate)$/
 };
 for(const [cmd,rx] of Object.entries(parts))if(rx.test(t))return {kind:"route",command:cmd};
 const prefixes=/^(?:ini|saya nak(?: masuk| masukkan| hantar)?|aku nak(?: masuk| masukkan| hantar)?|nak(?: masuk| masukkan| hantar)?|pilih|kategori|set|tukar kategori ke|tukar ke|masuk|masukkan|hantar|saya hantar|semua|dokumen|fail|untuk|letak dalam|tolong set(?: ke)?)\s+/;
 const catText=t.replace(prefixes,"").replace(/^(?:dokumen|fail|kategori|untuk)\s+/,"").replace(/\s+(?:semua|ini|ni|ye|ya|sahaja|saja|dulu)$/,"").trim();
 const cats=[
  ["/ic",/^(?:ic|mykad|kad pengenalan|identity card|kad ic)$/],
  ["/bank",/^(?:bank|bank statement|statement bank|penyata bank|penyata akaun)$/],
  ["/gaji",/^(?:gaji|slip gaji|payslip|salary slip)$/],
  ["/lesen",/^(?:lesen|lesen memandu|driving licence|driving license)$/],
  ["/sijil",/^(?:sijil|sijil nikah|sijil lahir|birth certificate|marriage certificate)$/],
  ["/kerja",/^(?:surat kerja|kerja|surat pengesahan kerja|employment letter)$/],
  ["/vso",/^(?:vso|fail vso|dokumen vso)$/],
  ["/lain",/^(?:lain|lain lain|dokumen lain|other|miscellaneous)$/]
 ];
 for(const [cmd,rx] of cats)if(rx.test(catText))return {kind:"route",command:cmd};
 if(/^(?:senarai|list|tunjuk senarai|bagi senarai|semak dokumen|check dokumen|list dokumen|apa dokumen yang ada|dokumen apa dah masuk|apa fail dah masuk|senarai fail)$/i.test(t))
  return {kind:"route",command:"/senarai"};
 if(/^(?:status|status kes|status dokumen|berapa (?:fail|dokumen|file)(?: (?:dah|sudah|telah) (?:masuk|diterima))?|jumlah fail|jumlah dokumen|berapa dah masuk|dah dapat berapa dokumen|dah dapat berapa fail|apa kategori aktif|sekarang bahagian apa)$/i.test(t))
  return {kind:"status"};
 if(/\b(?:siapkan|satukan|gabungkan|gabung|jadikan|merge|compile|combine)\b/.test(t)&&
   /\b(?:baki|selebihnya|yang tinggal|pdf|dokumen|document|fail|file|satu (?:file|fail|pdf)|1 (?:file|fail|pdf))\b/.test(t)&&
   !/^(?:macam mana|bagaimana|cara|boleh ke|bolehkah|jangan|tak payah|tidak perlu)\b/.test(t))
   return {kind:"route",command:"/siap"};
 if(/^(?:siap|siapkan|gabung|gabungkan|merge|compile|jadikan)\s*(?:semua)?\s*(?:dokumen|fail|pdf)?\s*(?:sekarang|ni|ini|semua)?$/i.test(t)||
    /^(?:buat|generate|jana|hantar|bagi)\s+(?:pdf lengkap|pdf gabungan|pdf siap|dokumen lengkap)$/i.test(t))
  return {kind:"route",command:"/siap"};
 if(/^(?:ada|dah ada|check|semak|tengok|tunjuk|bagi)\s+(?:tak\s+)?(?:no|nombor|number|lead|customer)\s+(?:baru|terbaru)(?:\s+tak)?$/i.test(t)||
    /^(?:lead|nombor|no)\s+baru(?:\s+ada)?$/i.test(t))
  return {kind:"route",command:"/baru"};
 if(/^(?:ambil|claim|nak ambil|saya nak ambil|boleh ambil|beri|bagi)\s+(?:satu\s+)?(?:no|nombor|lead)(?:\s+baru)?$/i.test(t))
  return {kind:"route",command:"/ambil"};
 const script=t.match(/^(?:guna|pakai|pilih|set|tukar|saya nak)\s+(?:mesej|skrip|template)\s+(pengenalan|intro|follow up|follow|susulan|harga|price|pinjaman)$/);
 if(script)return {kind:"route",command:"/skrip "+({"pengenalan":"intro","susulan":"follow","follow up":"follow","harga":"price","pinjaman":"price"}[script[1]]||script[1])};
 const compactFix=t.match(/^(?:(?:fail|file|no|nombor|dokumen)\s+)(\d{1,2})\s+(ic|bank|gaji|lesen|sijil|kerja|vso|lain)$/);
 if(compactFix){
  const code={ic:"IC",bank:"BANK",gaji:"PAYSLIP",lesen:"LESEN",sijil:"SIJIL",kerja:"SURAT_KERJA",vso:"VSO",lain:"OTHER"};
  return {kind:"route",command:"/kategori "+compactFix[1]+" "+code[compactFix[2]]};
 }
 const fileFix=t.match(/^(?:betulkan|ubah|set|tukar)\s+(?:kategori\s+)?(?:fail|file|no|nombor)\s+(\d{1,2})\s+(?:kepada|jadi|ke|sebagai)\s+(ic|bank|gaji|payslip|lesen|sijil|kerja|vso|lain)$/i);
 if(fileFix){const code={ic:"IC",bank:"BANK",gaji:"PAYSLIP",payslip:"PAYSLIP",lesen:"LESEN",sijil:"SIJIL",kerja:"SURAT_KERJA",vso:"VSO",lain:"OTHER"};return {kind:"route",command:"/kategori "+fileFix[1]+" "+code[fileFix[2]]};}
 return {kind:"chat"};
}
