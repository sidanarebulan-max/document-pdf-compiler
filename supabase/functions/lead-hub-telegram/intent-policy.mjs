// A pure allowlist. Language models can propose meaning, never directly
// call SQL/Telegram/Storage or authorize irreversible operations.
const TYPES=new Set(["IC","BANK","PAYSLIP","LESEN","SIJIL","SURAT_KERJA","VSO","OTHER"]);
const PARTIES=new Set(["HIRER","GUARANTOR","REBATE"]);
const SAFE_READ=new Set(["help","list","status","lead_new"]);
const EXPLICIT_WRITE=new Set(["category","party","vso_start","lead_claim"]);
const RISKY=new Set(["delete_request","merge_request","send_message","register_lead"]);
export function policyModelIntent(input){
 if(!input||typeof input!=="object"||Array.isArray(input))
  return {kind:"answer",reply:"Aku belum dapat fahami ayat itu dengan pasti. Boleh ulang atau beri sedikit konteks?"};
 const intent=String(input.intent||"answer").toLowerCase();
 const confidence=Number(input.confidence);
 const score=Number.isFinite(confidence)?Math.min(1,Math.max(0,confidence)):0;
 const reply=String(input.reply||"").trim().slice(0,1300);
 if(RISKY.has(intent)){
  const hints={delete_request:"Aku faham kau nak buang dokumen. Nyatakan nombor tepat, contoh 'buang fail 1 sampai 3'. Aku akan minta pengesahan sebelum padam.",
   merge_request:"Aku rasa kau nak gabungkan dokumen. Untuk sahkan, taip 'siapkan PDF'. Aku akan semak kategori dahulu.",
   send_message:"Untuk hantar mesej WhatsApp, pilih lead yang sah dalam FARIS. Aku tak hantar mesej secara automatik.",
   register_lead:"Untuk daftar pelanggan, gunakan borang atau arahan pendaftaran dengan keizinan pelanggan."};
  return {kind:"ask",reply:hints[intent]};
 }
 if(SAFE_READ.has(intent)){
  if(score>=0.75)return {kind:intent,reply,confidence:score};
  return {kind:"ask",reply:reply||"Nak aku tunjuk senarai, semak status atau cari lead baharu?"};
 }
 if(EXPLICIT_WRITE.has(intent)){
  if(score<0.94)return {kind:"ask",reply:reply||"Aku kurang pasti tindakan yang kau nak. Contohnya, 'ini bank' atau 'pilih penjamin'."};
  if(intent==="category"&&!TYPES.has(String(input.category||"").toUpperCase()))
   return {kind:"ask",reply:"Kategori belum jelas. Pilih IC, bank, gaji, lesen, sijil, kerja, VSO atau lain."};
  if(intent==="party"&&!PARTIES.has(String(input.party||"").toUpperCase()))
   return {kind:"ask",reply:"Bahagian pelanggan yang mana: peminjam, penjamin atau rebate?"};
  return {kind:intent,category:String(input.category||"").toUpperCase(),
   party:String(input.party||"").toUpperCase(),reply,confidence:score};
 }
 return {kind:"answer",reply:reply||"Aku tak pasti maksudnya. Boleh berikan sedikit lagi maklumat?"};
}