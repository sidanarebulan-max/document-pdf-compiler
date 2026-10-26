// Telegram FARIS PDF instructions. Intent recognition never changes customer data.
export function interpretPdfRequest(raw){
 const t=String(raw||"").normalize("NFKC").toLowerCase()
  .replace(/[!?.,]+$/g,"").replace(/\s+/g," ").trim();
 if(!t||t.length>400)return null;
 const pdf=/\b(?:pdf|dokumen|document|files?|fail|berkas|lampiran)\b/.test(t);
 const merge=/\b(?:siap(?:kan|kn)?|susun|gabung(?:kan)?|cantum(?:kan)?|merge|combine|compile|satukan|jadikan|buat)\b/.test(t);
 const goodOnly=/\b(?:boleh|ok|okay|elok|valid|sah|readable|terbuka|tak\s+lock|tidak\s+lock)\b/.test(t)&&
  /\b(?:sahaja|saja|je|dulu|only|yang)\b/.test(t);
 const skipBad=/\b(?:skip|langkau|exclude|kecuali|tanpa|abaikan|tinggal(?:kan)?|jangan\s+(?:masuk|ambil|gabung|sertakan))\b/.test(t)&&
  /\b(?:rosak|tak\s+boleh|tidak\s+boleh|lock|locked|berkunci|password|kata\s+laluan|fail|pdf|dokumen)\b/.test(t);
 if((pdf||/\b(?:yang\s+boleh|yang\s+ok|yg\s+boleh)\b/.test(t))&&
   (merge||/^(?:yang|yg)\s+boleh\b/.test(t))&&
   (goodOnly||skipBad))return {kind:"partial_merge"};
 const removePass=/(?:buang|buka|remove|unlock|hapus|hilangkan|tanggalkan|pecahkan)\s+(?:dulu\s+)?(?:kata\s+laluan|password|passcode|lock|kunci)/.test(t)||
   /(?:pdf|fail|file|dokumen)\s+(?:yang\s+)?(?:berkunci|locked|password)(?:\s+nak\s+buka)?/.test(t);
 if(removePass)return {kind:"unlock_pdf_help"};
 if(/^(?:ya|ok|okay|setuju|confirm|sahkan|teruskan)\s+(?:gabung|susun|buat|siapkan)\s+(?:yang\s+)?(?:boleh|tanpa|tanpa\s+fail)\b/.test(t))
  return {kind:"partial_merge"};
 return null;
}
export function isLikelyHumanName(text){
 const name=String(text||"").trim().replace(/\s+/g," ");
 if(name.length<2||name.length>75)return false;
 if(!/^[\p{L}][\p{L}.'’\- ]{1,74}$/u.test(name))return false;
 const banned=/\b(?:boleh|bot|ai|arahan|sistem|system|file|pdf|fail|dokumen|doc|customer|pelanggan|baru|resume|nama|faham|macam|mana|kenapa|sekarang|siapkan|buka|buang|padam|hantar|tolong|tanya|jadi|maknanya|maknya|kau|aku|saya|siapa|cara|tak|dah|sudah|telah|please)\b/i;
 if(banned.test(name))return false;
 if(/[?!]/.test(text))return false;
 return name.split(" ").length<=7;
}
