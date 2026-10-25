import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {PDFDocument,StandardFonts,rgb} from "npm:pdf-lib@1.17.1";

const PROJECT_URL=Deno.env.get("SUPABASE_URL")!;
const SERVER_SECRET=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
if(!SERVER_SECRET)throw Error("Service key unavailable");
const db=createClient(PROJECT_URL,SERVER_SECRET,{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET="lead-hub-telegram-private";
const encoder=new TextEncoder();
const originWhitelist=new Set(["https://document-pdf-compiler.vercel.app"]);
const bytesToHex=(bytes:Uint8Array)=>Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
const randomHex=(n:number)=>bytesToHex(crypto.getRandomValues(new Uint8Array(n)));
async function sha(value:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))))}
async function getCryptoKey(){
 const bits=await crypto.subtle.digest("SHA-256",encoder.encode("FARIS_TELEGRAM_V1:"+SERVER_SECRET));
 return crypto.subtle.importKey("raw",bits,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
function b64(bytes:Uint8Array){let txt="";for(let i=0;i<bytes.length;i+=4096)txt+=String.fromCharCode(...bytes.slice(i,i+4096));return btoa(txt)}
function unb64(x:string){return Uint8Array.from(atob(x),ch=>ch.charCodeAt(0))}
async function encrypt(plain:string){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await getCryptoKey();const data=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(plain)));return {cipher:b64(data),iv:b64(iv)}}
async function decrypt(cipher:string,iv:string){const key=await getCryptoKey();return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv)},key,unb64(cipher)))}
function out(req:Request,data:unknown,status=200){const origin=req.headers.get("origin")||"";return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json;charset=utf-8","Cache-Control":"no-store","Vary":"Origin",...(originWhitelist.has(origin)?{"Access-Control-Allow-Origin":origin}:{})}})}
function fail(req:Request,message:string,status=400){return out(req,{ok:false,error:message},status)}
function uuid(){return crypto.randomUUID()}
async function adminAccount(req:Request){
 const raw=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!/^[a-f0-9]{64}$/.test(raw))return null;
 const {data:s,error}=await db.from("lead_hub_sessions").select("account_id").eq("token_hash",await sha(raw)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!s)return null;
 const {data:account}=await db.from("lead_hub_accounts").select("id,role,display_name,staff_code,active").eq("id",s.account_id).eq("active",true).maybeSingle();
 return account||null;
}
async function config(){const {data,error}=await db.from("lead_hub_telegram_settings").select("*").eq("id",1).maybeSingle();if(error)throw error;return data}
async function telegramCall(token:string,method:string,payload:Record<string,unknown>){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const res=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
 const j=await res.json();if(!res.ok||!j.ok)throw Error(j.description||"Telegram API "+res.status);return j.result;
 }finally{clearTimeout(timeout)}
}
async function botToken(conf:any){if(!conf?.bot_token_cipher||!conf?.bot_token_iv)throw Error("Bot belum disambung");return decrypt(conf.bot_token_cipher,conf.bot_token_iv)}
async function say(token:string,chat:number|string,text:string,more:Record<string,unknown>={}){
 return telegramCall(token,"sendMessage",{chat_id:chat,text:text.slice(0,3900),link_preview_options:{is_disabled:true},...more});
}
function normalPhone(raw:any){let v=String(raw??"").replace(/[^\d+]/g,"").replace(/^\+/,"");if(v.startsWith("0"))v="6"+v;else if(v.startsWith("1"))v="60"+v;return /^601\d{8,9}$/.test(v)?v:null}
const TYPES=["VSO","IC","LESEN","PAYSLIP","BANK","OTHER"];
const REBATE_TYPES=["IC_FRONT","IC_BACK","LESEN","SURAT_KERJA","SIJIL_LAHIR","SIJIL_NIKAH","OTHER"];
const RANK:{[k:string]:number}={VSO:1,IC:2,LESEN:3,PAYSLIP:4,BANK:5,OTHER:6,IC_FRONT:1,IC_BACK:2,SURAT_KERJA:4,SIJIL_LAHIR:5,SIJIL_NIKAH:6};
const PARTY:{[k:string]:number}={HIRER:0,GUARANTOR:1,REBATE:2};
const VARIANTS:{[k:string]:{label:string;base:number;fees:number;year:string}}={
 EMAS5_PRIME_2026:{label:"e.MAS 5 Prime",base:62600,fees:3278,year:"2026"},
 EMAS5_PREMIUM_2026:{label:"e.MAS 5 Premium",base:75800,fees:3708,year:"2026"},
 EMAS7_PREMIUM_2026:{label:"e.MAS 7 Premium",base:123400,fees:4228,year:"2026"},
 EMAS7_PREMIUM_PLUS_2026:{label:"e.MAS 7 Premium Plus",base:129659,fees:4487,year:"2026"},
 EMAS7_PHEV_PREMIUM_PLUS_2026:{label:"e.MAS 7 PHEV Premium Plus",base:134159,fees:4929,year:"2026"}
};
function categoryByName(name:string,party:string){
 const v=name.toLowerCase().replace(/[_-]/g," ");
 const rebate=party==="REBATE";
 if(/\bvso\b|vehicle.sales.order/.test(v))return "VSO";
 if(rebate){
   if(/ic.front|mykad depan|ic depan|nric front/.test(v))return "IC_FRONT";
   if(/ic.back|mykad belakang|ic belakang|nric back/.test(v))return "IC_BACK";
   if(/surat.kerja|employment.letter/.test(v))return "SURAT_KERJA";
   if(/sijil.lahir|birth.cert/.test(v))return "SIJIL_LAHIR";
   if(/sijil.nikah|marriage.cert/.test(v))return "SIJIL_NIKAH";
 }
 if(/\bic\b|mykad|nric|identity.card/.test(v))return rebate?"OTHER":"IC";
 if(/lesen|licen[cs]e/.test(v))return "LESEN";
 if(/payslip|salary.slip|slip.gaji|gaji/.test(v))return rebate?"OTHER":"PAYSLIP";
 if(/bank.statement|penyata.bank|statement/.test(v))return rebate?"OTHER":"BANK";
 return "OTHER";
}
function safePdfText(t:any){return String(t??"").normalize("NFKD").replace(/[^\x20-\x7E]/g," ").slice(0,120)}
function wrapLine(t:string,max=75){const words=safePdfText(t).split(/\s+/);const lines:string[]=[];let current="";for(const word of words){if((current+" "+word).length>max){lines.push(current);current=word;}else current+=(current?" ":"")+word;}if(current)lines.push(current);return lines}
async function cover(doc:PDFDocument,heading:string,customer:string,sub:string){
 const page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.HelveticaBold),normal=await doc.embedFont(StandardFonts.Helvetica);
 page.drawRectangle({x:40,y:65,width:515,height:712,borderColor:rgb(.4,.5,.65),borderWidth:1});
 page.drawText(heading,{x:72,y:685,size:22,font,color:rgb(.1,.2,.38)});
 page.drawText(safePdfText(customer.toUpperCase()),{x:72,y:635,size:16,font});
 page.drawText(sub,{x:72,y:590,size:11,font:normal});
 page.drawText("FARIS R+PROTON - DOKUMEN DALAMAN",{x:72,y:115,size:10,font:normal});
}
async function makeMergedPdf(caseRow:any,files:any[]){
 const orderFor=(file:any)=>file.party==="REBATE"
  ?({IC_FRONT:1,IC_BACK:2,LESEN:3,SURAT_KERJA:4,SIJIL_LAHIR:5,SIJIL_NIKAH:6,OTHER:7}[file.category as "OTHER"]||99)
  :(RANK[file.category]||99);
 const sorted=[...files].sort((a,b)=>(PARTY[a.party]-PARTY[b.party])||(orderFor(a)-orderFor(b))||a.created_at.localeCompare(b.created_at));
 const pdf=await PDFDocument.create();let lastParty="",pages=0;
 for(const item of sorted){
  if(item.party!==lastParty&&(item.party==="GUARANTOR"||item.party==="REBATE")){
    await cover(pdf,item.party==="GUARANTOR"?"GUARANTOR / PENJAMIN":"COP REBATE",caseRow.customer_name,
      item.party==="GUARANTOR"?"Dokumen Penjamin":"Dokumen Rebate");pages++;
  }
  lastParty=item.party;
  const {data,error}=await db.storage.from(BUCKET).download(item.storage_path);
  if(error||!data)throw Error("Dokumen tidak dapat dibaca: "+item.original_name);
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(item.mime_type==="application/pdf"){
    try{const source=await PDFDocument.load(bytes,{updateMetadata:false});
      const copied=await pdf.copyPages(source,source.getPageIndices());for(const page of copied){pdf.addPage(page);pages++}
    }catch(e){throw Error("PDF terkunci/rosak: "+item.original_name+" - sila ganti fail tersebut")}
  }else{
    const isPng=item.mime_type==="image/png";
    const image=isPng?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
    const page=pdf.addPage([595,842]),ratio=Math.min(555/image.width,802/image.height);
    page.drawImage(image,{x:(595-image.width*ratio)/2,y:(842-image.height*ratio)/2,width:image.width*ratio,height:image.height*ratio});pages++;
  }
  if(pages>100)throw Error("Maksimum 100 muka surat setiap gabungan Telegram.");
 }
 if(!pages)throw Error("Tiada dokumen untuk dijana");
 return new Uint8Array(await pdf.save({useObjectStreams:true}));
}
async function telegramSendDocument(token:string,chat:number,bytes:Uint8Array,name:string,caption:string){
 if(bytes.byteLength>45*1024*1024)throw Error("PDF akhir melebihi 45MB, sila guna PDF Compiler web.");
 const data=new FormData();data.append("chat_id",String(chat));data.append("caption",caption.slice(0,950));
 data.append("document",new Blob([bytes],{type:"application/pdf"}),name);
 const res=await fetch("https://api.telegram.org/bot"+token+"/sendDocument",{method:"POST",body:data});
 const result=await res.json();if(!result.ok)throw Error(result.description||"Gagal hantar PDF");return result.result;
}
async function classifyWithAI(conf:any,bytes:Uint8Array,mime:string,filename:string,party:string){
 if(!conf.ai_api_key_cipher||!conf.ai_api_key_iv||bytes.length>5*1024*1024)return null;
 let key:string;try{key=await decrypt(conf.ai_api_key_cipher,conf.ai_api_key_iv)}catch{return null}
 const encoded=b64(bytes);
 const content:any[]=[{type:"input_text",text:"Classify this Malaysian vehicle financing document. Return only JSON: {\"category\": \"...\", \"confidence\": 0.0-1.0}. Party="+party+". Allowed categories for HIRER/GUARANTOR: VSO,IC,LESEN,PAYSLIP,BANK,OTHER. For REBATE: IC_FRONT,IC_BACK,LESEN,SURAT_KERJA,SIJIL_LAHIR,SIJIL_NIKAH,OTHER. Identify front/back only if distinguishable. Never guess. Confidence must reflect uncertainty. Do not transcribe sensitive personal data. Filename="+filename}];
 if(mime==="application/pdf")content.push({type:"input_file",filename:filename.endsWith(".pdf")?filename:"document.pdf",file_data:"data:application/pdf;base64,"+encoded,detail:"low"});
 else content.push({type:"input_image",image_url:"data:"+mime+";base64,"+encoded,detail:"low"});
 try{
  const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:conf.ai_model||"gpt-4.1-mini",max_output_tokens:110,input:[{role:"user",content}]})});
  const j=await res.json();if(!res.ok)throw Error("AI API "+res.status);
  const t=(j.output||[]).flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==="output_text").map((x:any)=>x.text).join("");
  const obj=JSON.parse(t.match(/\{[\s\S]*\}/)?.[0]||"{}");
  const allowed=party==="REBATE"?REBATE_TYPES:TYPES;
  if(!allowed.includes(obj.category))return null;
  return {category:obj.category,confidence:Math.max(0,Math.min(1,Number(obj.confidence)||0)),method:"AI"};
 }catch(e){console.error("AI classifier unavailable",String(e).slice(0,80));return null}
}
const defaultMessages:any={
 intro:"Assalamualaikum {nama}, selamat pagi!\n\nSaya {staff} daripada Proton. Saya ingin berkongsi maklumat tentang {model}.\n\nBoleh saya tahu, tuan/puan mencari kereta untuk kegunaan sendiri atau keluarga?",
 follow:"Assalamualaikum {nama}, saya {staff} daripada Proton.\n\nSaya nak buat susulan mengenai {model}. Tuan/puan masih berminat?",
 price:"Assalamualaikum {nama}, saya {staff} daripada Proton.\n\nSaya boleh bantu semak harga dan pinjaman untuk {model}. Berapa deposit dan tempoh pinjaman yang tuan/puan mahukan?"
};
async function messageFor(account:any,lead:any,kind:string){
 const {data}=await db.from("lead_hub_message_templates").select("scope,account_id,template_key,body")
  .eq("template_key",kind).or("scope.eq.team,account_id.eq."+account.id);
 const personal=data?.find((x:any)=>x.scope==="personal"&&x.account_id===account.id);
 const team=data?.find((x:any)=>x.scope==="team");
 const raw=personal?.body||team?.body||defaultMessages[kind]||defaultMessages.intro;
 const vars:any={nama:lead.customer_name,staff:account.display_name,model:lead.model||"kereta Proton",telefon:lead.phone_e164};
 return raw.replace(/\{(nama|staff|model|telefon)\}/gi,(_:string,key:string)=>vars[key.toLowerCase()]||"");
}
async function sendLead(token:string,chat:number,account:any,lead:any,kind:string){
 const message=await messageFor(account,lead,kind);
 const url="https://wa.me/"+lead.phone_e164+"?text="+encodeURIComponent(message);
 await say(token,chat,"🚘 "+lead.customer_name+"\n📱 +"+lead.phone_e164+"\nModel: "+lead.model+"\nStatus: "+lead.stage+"\nSkrip: "+kind,
 {reply_markup:{inline_keyboard:[[ {text:"💬 Buka WhatsApp + mesej siap",url} ]] }});
}
async function makeVSO(details:any,advisor:string){
 const required=["name","ic","phone","variant","year","color","loan","address","mode"];
 for(const field of required)if(!String(details[field]||"").trim())throw Error("Maklumat VSO belum lengkap: "+field);
 const item=VARIANTS[details.variant];if(!item)throw Error("Varian tidak dalam senarai VSO yang disokong.");
 const loan=Number(details.loan);if(!Number.isFinite(loan)||loan<=0)throw Error("Jumlah pinjaman tidak sah");
 const mode=String(details.mode).toUpperCase();
 if(!["PLAIN","MARKUP"].includes(mode))throw Error("Jenis VSO mesti PLAIN atau MARKUP");
 const otr=mode==="MARKUP"?Math.round(loan/0.9/10)*10:item.base;
 if(mode==="PLAIN"&&loan>otr)throw Error("Pinjaman melebihi harga OTR untuk mod tanpa markup");
 const net=otr-item.fees;if(net<=0)throw Error("Harga bersih tidak sah");
 const doc=await PDFDocument.create(),page=doc.addPage([595,842]);
 const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const money=(n:number)=>"RM "+n.toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
 const draw=(label:string,val:string,y:number)=>{page.drawText(label,{x:45,y,size:11,font:bold});let yy=y;for(const line of wrapLine(val,53)){page.drawText(line,{x:182,y:yy,size:10,font});yy-=15;}return Math.min(y-26,yy-12)};
 page.drawText("VEHICLE SALES ORDER - DRAF",{x:43,y:787,font:bold,size:21,color:rgb(.12,.25,.48)});
 page.drawText("FARIS R+PROTON | UNTUK SEMAKAN DALAMAN SAHAJA",{x:44,y:757,font,size:10,color:rgb(.48,.15,.2)});
 let y=715;
 for(const [label,val] of [
  ["Pelanggan",details.name],["No Kad Pengenalan",details.ic],
  ["No Telefon",details.phone],["Alamat",details.address],
  ["Sales Advisor",advisor],["Varian",item.label],
  ["Tahun",details.year],["Warna",details.color],["Jenis Pinjaman",mode==="MARKUP"?"90% MARKUP (ANGGARAN)":"TANPA MARKUP"],
  ["Jumlah Pinjaman",money(loan)],["Harga OTR (anggaran)",money(otr)],
  ["Caj rujukan VSO",money(item.fees)],["Harga Bersih (anggaran)",money(net)],
 ]){y=draw(label,safePdfText(val),y);if(y<120)throw Error("Butiran terlalu panjang untuk satu halaman VSO Telegram");}
 page.drawLine({start:{x:40,y:100},end:{x:555,y:100},thickness:1});
 page.drawText("DRAF - Tidak menggantikan templat VSO asal pengedar.",{x:45,y:79,size:9,font:bold,color:rgb(.5,.13,.18)});
 page.drawText("Semak harga, insurans, varian dan kelulusan sebelum guna rasmi.",{x:45,y:61,size:9,font});
 return new Uint8Array(await doc.save());
}
const vsoSteps=[
 {key:"name",question:"1/9 Nama penuh pelanggan (ikut IC)?"},
 {key:"ic",question:"2/9 Nombor kad pengenalan pelanggan?"},
 {key:"phone",question:"3/9 Nombor telefon pelanggan?"},
 {key:"variant",question:"4/9 Kod varian:\n"+Object.entries(VARIANTS).map(([k,v])=>k+" - "+v.label).join("\n")},
 {key:"year",question:"5/9 Tahun pembuatan kenderaan? (contoh 2026)"},
 {key:"color",question:"6/9 Warna kereta?"},
 {key:"loan",question:"7/9 Jumlah pinjaman RM? (contoh 75000)"},
 {key:"address",question:"8/9 Alamat penuh pelanggan?"},
 {key:"mode",question:"9/9 Jenis VSO: PLAIN (tanpa markup) atau MARKUP (90%)?"}
];
async function handleWizard(token:string,chat:number,telegramId:number,account:any,text:string){
 const {data:wiz}=await db.from("lead_hub_telegram_wizards").select("*").eq("telegram_user_id",telegramId).maybeSingle();
 if(!wiz)return false;
 if(text.toLowerCase()==="/batal"){await db.from("lead_hub_telegram_wizards").delete().eq("telegram_user_id",telegramId);await say(token,chat,"VSO dibatalkan.");return true}
 const step=vsoSteps[wiz.step],v=text.trim();
 if(!step)return false;
 if(step.key==="variant"&&!VARIANTS[v.toUpperCase()]){await say(token,chat,"Kod varian tidak sah.\n"+step.question);return true}
 if(step.key==="year"&&!/^20\d{2}$/.test(v)){await say(token,chat,"Tahun tidak sah. Masukkan contoh: 2026");return true}
 if(step.key==="loan"&&(!Number.isFinite(Number(v))||Number(v)<=0)){await say(token,chat,"Masukkan pinjaman positif, contoh 75000");return true}
 if(step.key==="mode"&&!["PLAIN","MARKUP"].includes(v.toUpperCase())){await say(token,chat,"Tulis PLAIN atau MARKUP");return true}
 if(step.key==="phone"&&!normalPhone(v)){await say(token,chat,"Nombor telefon tidak sah.");return true}
 const payload={...wiz.payload,[step.key]:step.key==="variant"||step.key==="mode"?v.toUpperCase():step.key==="phone"?normalPhone(v):v};
 const next=wiz.step+1;
 if(next<vsoSteps.length){
  await db.from("lead_hub_telegram_wizards").update({step:next,payload,updated_at:new Date().toISOString()}).eq("telegram_user_id",telegramId);
  await say(token,chat,vsoSteps[next].question);
 }else{
  try{
   const bytes=await makeVSO(payload,account.display_name);
   const name=safePdfText(payload.name).replace(/\s+/g,"_").slice(0,38)||"PELANGGAN";
   await telegramSendDocument(token,chat,bytes,name+"_VSO_DRAF.pdf","✅ VSO DRAF siap. Sila semak butiran, harga dan pengesahan pengedar.");
   // Attach VSO draft to the active collection so /siap can include it first.
   const activeCase=await currentCase(account.id,chat);
   const cleanName=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
   if(activeCase&&cleanName(activeCase.customer_name)===cleanName(payload.name)){
     const fileId=uuid(),path=account.id+"/"+activeCase.id+"/"+fileId+".pdf";
     const {error:storageError}=await db.storage.from(BUCKET)
       .upload(path,bytes,{contentType:"application/pdf",upsert:false});
     if(!storageError){
       const {error:insertError}=await db.from("lead_hub_telegram_files").insert({
         id:fileId,case_id:activeCase.id,storage_path:path,original_name:name+"_VSO_DRAF.pdf",
         mime_type:"application/pdf",party:"HIRER",category:"VSO",confidence:1,
         needs_review:false,classification_method:"VSO_GENERATOR"
       });
       if(insertError){await db.storage.from(BUCKET).remove([path]);}
       else await say(token,chat,"📁 VSO DRAF juga ditambah kepada kes "+activeCase.customer_name+" pada kategori VSO.");
     }
   }
   await db.from("lead_hub_telegram_wizards").delete().eq("telegram_user_id",telegramId);
  }catch(e){await say(token,chat,"VSO tidak dapat dijana: "+String(e instanceof Error?e.message:e)+"\n/batal untuk berhenti, /vso untuk mula semula.");
   await db.from("lead_hub_telegram_wizards").delete().eq("telegram_user_id",telegramId);
  }
 }return true;
}
async function currentCase(accountId:string,chat:number){
 const {data}=await db.from("lead_hub_telegram_cases").select("*").eq("account_id",accountId).eq("chat_id",chat).eq("state","collecting").order("created_at",{ascending:false}).limit(1).maybeSingle();
 return data;
}
async function handleDoc(token:string,conf:any,chat:number,account:any,message:any){
 const c=await currentCase(account.id,chat);
 if(!c){await say(token,chat,"Taip /pelanggan NAMA terlebih dahulu, kemudian hantar dokumen PDF/JPG/PNG.");return}
 const doc=message.document,photo=message.photo?.at(-1);
 const info=doc||photo;
 const fileId=info?.file_id;
 if(!fileId)return;
 const filename=String(doc?.file_name||"gambar_"+message.message_id+".jpg").slice(0,110);
 const mime=doc?.mime_type||"image/jpeg";
 if(!["application/pdf","image/png","image/jpeg"].includes(mime)){await say(token,chat,"Format tidak disokong. Gunakan PDF, PNG atau JPG sahaja. Fail DOCX/HEIC perlu ditukar dahulu.");return}
 if(Number(info.file_size||0)>18*1024*1024){await say(token,chat,"Fail melebihi 18 MB. Gunakan Document Compiler web untuk fail besar.");return}
 const {count,error:countError}=await db.from("lead_hub_telegram_files").select("id",{head:true,count:"exact"}).eq("case_id",c.id);
 if(countError)throw countError;
 if((count||0)>=15){await say(token,chat,"Maksimum 15 fail satu kes Telegram. Taip /siap dahulu.");return}
 const file=await telegramCall(token,"getFile",{file_id:fileId});
 if(!file.file_path||Number(file.file_size||0)>20*1024*1024)throw Error("Telegram tidak membenarkan fail ini dimuat turun");
 const res=await fetch("https://api.telegram.org/file/bot"+token+"/"+file.file_path);
 if(!res.ok)throw Error("Telegram file download gagal");
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.length>18*1024*1024)throw Error("Fail terlalu besar");
 const isPdf=bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70;
 const isPng=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const isJpg=bytes[0]===255&&bytes[1]===216;
 const realMime=isPdf?"application/pdf":isPng?"image/png":isJpg?"image/jpeg":null;
 if(!realMime)throw Error("Jenis fail sebenar bukan PDF/PNG/JPG");
 const id=uuid(),extension=isPdf?"pdf":isPng?"png":"jpg";
 const key=account.id+"/"+c.id+"/"+id+"."+extension;
 const {error:upError}=await db.storage.from(BUCKET).upload(key,bytes,{contentType:realMime,upsert:false});
 if(upError)throw upError;
 let cls:any=await classifyWithAI(conf,bytes,realMime,filename,c.active_party);
 if(!cls){const category=categoryByName(filename+" "+String(message.caption||""),c.active_party);cls={category,confidence:category==="OTHER"?0.15:0.7,method:"filename"}}
 if(c.active_party==="REBATE"&&!REBATE_TYPES.includes(cls.category))cls={category:"OTHER",confidence:.1,method:"fallback"};
 if(c.active_party!=="REBATE"&&!TYPES.includes(cls.category))cls={category:"OTHER",confidence:.1,method:"fallback"};
 const review=cls.confidence<.85||cls.category==="OTHER";
 const {error:ie}=await db.from("lead_hub_telegram_files").insert({
  id,case_id:c.id,storage_path:key,original_name:filename,mime_type:realMime,source_file_id:fileId,
  party:c.active_party,category:cls.category,confidence:cls.confidence,needs_review:review,classification_method:cls.method
 });
 if(ie){await db.storage.from(BUCKET).remove([key]);throw ie}
 const {count:total}=await db.from("lead_hub_telegram_files").select("id",{head:true,count:"exact"}).eq("case_id",c.id);
 await say(token,chat,"📎 Fail diterima #"+total+"\nPelanggan: "+c.customer_name+"\nBahagian: "+c.active_party+"\nKategori: "+cls.category+(review?" ⚠️ Perlu semak (/kategori "+total+" KATEGORI)":" ✅ Disahkan oleh pengelasan")+
 "\nHantar lagi fail, kemudian taip /senarai atau /siap.");
}
async function linkedTelegramAccount(id:number){
 const {data:link}=await db.from("lead_hub_telegram_links").select("*").eq("telegram_user_id",id).maybeSingle();
 if(!link)return null;
 const {data:account}=await db.from("lead_hub_accounts").select("id,role,display_name,staff_code,active").eq("id",link.account_id).eq("active",true).maybeSingle();
 return account?{link,account}:null;
}
async function handleLink(token:string,chat:number,id:number,code:string){
 if(!/^[A-Z0-9_-]{8,40}$/.test(code)){await say(token,chat,"Kod sambungan tidak sah. Jana kod baharu daripada FARIS LEAD HUB > Telegram.");return}
 const {data:link}=await db.from("lead_hub_telegram_link_codes").select("*").eq("code_hash",await sha(code)).is("used_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(!link){await say(token,chat,"Kod tamat tempoh / telah digunakan. Jana kod baharu di website.");return}
 const {data:old}=await db.from("lead_hub_telegram_links").select("account_id").eq("telegram_user_id",id).maybeSingle();
 if(old&&old.account_id!==link.account_id){await say(token,chat,"Akaun Telegram ini sudah dipaut kepada staf lain. Minta admin nyahpaut dahulu.");return}
 const {error}=await db.from("lead_hub_telegram_links").upsert({telegram_user_id:id,chat_id:chat,account_id:link.account_id,updated_at:new Date().toISOString()},{onConflict:"telegram_user_id"});
 if(error){await say(token,chat,"Gagal pautkan. Akaun FARIS mungkin telah disambung kepada Telegram lain. Admin boleh putuskan pautan lama.");return}
 await db.from("lead_hub_telegram_link_codes").update({used_at:new Date().toISOString()}).eq("code_hash",link.code_hash);
 await say(token,chat,"✅ Telegram berjaya disambung ke FARIS LEAD HUB. Taip /menu untuk semua fungsi.");
}
async function processUpdate(update:any,conf:any,token:string){
 const msg=update.message;
 if(!msg||msg.chat?.type!=="private"||!msg.from?.id)return;
 const chat=Number(msg.chat.id),id=Number(msg.from.id),txt=String(msg.text||"").trim();
 if(/^\/start(\s|$)/i.test(txt)){
  const code=txt.split(/\s+/)[1];
  if(code)await handleLink(token,chat,id,code.trim().toUpperCase());
  else await say(token,chat,"Selamat datang ke FARIS LEAD HUB Telegram. Sambung akaun melalui website > Telegram Bot > Jana Kod Pautan.");
  return;
 }
 if(/^\/sambung\s+/i.test(txt)){await handleLink(token,chat,id,txt.split(/\s+/)[1]?.toUpperCase()||"");return}
 const linked=await linkedTelegramAccount(id);
 if(!linked){await say(token,chat,"⛔ Telegram belum dipautkan. Login FARIS LEAD HUB dan jana kod sambungan. Tiada akses pelanggan sebelum pengesahan.");return}
 const {account,link}=linked;
 if(msg.document||msg.photo){await handleDoc(token,conf,chat,account,msg);return}
 if(!txt)return;
 const [cmd,...rest]=txt.split(/\s+/),arg=txt.slice(cmd.length).trim(),command=cmd.split("@")[0].toLowerCase();
 if(command==="/menu"||command==="/help"){
  await say(token,chat,"FARIS LEAD HUB 🤖\n\n📄 DOKUMEN\n/pelanggan NAMA - Buka folder kes baharu\n/peminjam /penjamin /rebate - Pilih bahagian\nHantar PDF/JPG/PNG dari telefon\n/senarai - Lihat dokumen & urutan\n/kategori NO KATEGORI - Betulkan kategori\n/siap - Susun & hantar PDF akhir\n/padam - Padam kes belum siap\n\n🚘 VSO\n/vso - Panduan 9 langkah → PDF DRAF\n/batal - Batal VSO\n\n📲 LEAD\n/daftar Nama | 01... | Model | YA\n/baru - Nombor baharu + pautan WhatsApp\n/ambil - Ambil nombor belum diagih\n/skrip intro|follow|price - Pilih mesej\n\nAkses dan template WhatsApp ikut akaun FARIS.");
  return;
 }
 if(command==="/batal"){await db.from("lead_hub_telegram_wizards").delete().eq("telegram_user_id",id);await say(token,chat,"Proses VSO dibatalkan.");return}
 if(command==="/vso"){
  await db.from("lead_hub_telegram_wizards").upsert({telegram_user_id:id,step:0,payload:{},updated_at:new Date().toISOString()},{onConflict:"telegram_user_id"});
  await say(token,chat,"🚘 VSO Generator (DRAF). Butiran akan diminta satu-persatu. Harga menggunakan data rujukan 5 varian VSO dalam website; sahkan dengan pengedar.\n\n"+vsoSteps[0].question);return;
 }
 const {data:wizard}=await db.from("lead_hub_telegram_wizards").select("step").eq("telegram_user_id",id).maybeSingle();
 if(wizard&&!txt.startsWith("/")){await handleWizard(token,chat,id,account,txt);return}
 if(command==="/pelanggan"){
  const customer=arg.trim();
  if(customer.length<2||customer.length>120){await say(token,chat,"Contoh: /pelanggan AHMAD BIN ALI (nama 2–120 aksara)");return}
  const existing=await currentCase(account.id,chat);
  if(existing){await say(token,chat,"Ada kes yang belum siap: "+existing.customer_name+". Taip /siap atau /padam sebelum buka pelanggan baharu.");return}
  const {error}=await db.from("lead_hub_telegram_cases").insert({account_id:account.id,chat_id:chat,customer_name:customer,active_party:"HIRER"});
  if(error)throw error;
  await say(token,chat,"📁 Kes pelanggan "+customer+" dibuka. Bahagian sekarang: HIRER.\nHantar PDF/JPG/PNG satu persatu daripada WhatsApp melalui Share → Telegram. Seterusnya /penjamin atau /rebate jika perlu, akhir sekali /siap.");return;
 }
 if(["/peminjam","/penjamin","/rebate"].includes(command)){
  const c=await currentCase(account.id,chat);
  if(!c){await say(token,chat,"Tiada kes aktif. Taip /pelanggan NAMA.");return}
  const party=command==="/peminjam"?"HIRER":command==="/penjamin"?"GUARANTOR":"REBATE";
  await db.from("lead_hub_telegram_cases").update({active_party:party}).eq("id",c.id);
  await say(token,chat,"Bahagian dokumen bertukar kepada "+party+". Hantar dokumen seterusnya.");return;
 }
 if(["/senarai","/kategori","/siap","/padam"].includes(command)){
  let c=await currentCase(account.id,chat);
  if(!c&&command==="/padam"){
    const {data:previous}=await db.from("lead_hub_telegram_cases")
      .select("*").eq("account_id",account.id).eq("chat_id",chat)
      .eq("state","completed").order("completed_at",{ascending:false}).limit(1).maybeSingle();
    c=previous;
  }
  if(!c){await say(token,chat,"Tiada kes aktif. Taip /pelanggan NAMA.");return}
  const {data:files,error}=await db.from("lead_hub_telegram_files").select("*").eq("case_id",c.id).order("created_at");
  if(error)throw error;
  if(command==="/padam"){
   const paths=(files||[]).map((x:any)=>x.storage_path);
   if(paths.length)await db.storage.from(BUCKET).remove(paths);
   await db.from("lead_hub_telegram_cases").delete().eq("id",c.id);
   await say(token,chat,"🗑 Kes dan semua fail pelanggan telah dipadam.");return;
  }
  if(command==="/kategori"){
   const bits=arg.split(/\s+/);const n=Number(bits[0]),cat=String(bits[1]||"").toUpperCase();
   const file=(files||[])[n-1];
   if(!file){await say(token,chat,"Cara: /kategori 2 IC (rujuk nombor dalam /senarai)");return}
   const allowed=file.party==="REBATE"?REBATE_TYPES:TYPES;
   if(!allowed.includes(cat)){await say(token,chat,"Kategori tidak sah untuk "+file.party+". Pilihan: "+allowed.join(", "));return}
   await db.from("lead_hub_telegram_files").update({category:cat,confidence:1,needs_review:false,classification_method:"manual"}).eq("id",file.id);
   await say(token,chat,"✅ Fail #"+n+" telah ditetapkan: "+cat);return;
  }
  if(command==="/senarai"){
   if(!files?.length){await say(token,chat,"Belum ada dokumen. Hantar PDF, PNG atau JPG.");return}
   await say(token,chat,"📁 "+c.customer_name+"\n"+files.map((x:any,i:number)=>(i+1)+". ["+x.party+"] "+x.category+(x.needs_review?" ⚠️ SEMAK":" ✅")+" — "+x.original_name).join("\n")+
   "\nSusunan PDF akhir: HIRER VSO→IC→LESEN→PAYSLIP→BANK→OTHER, kemudian GUARANTOR, kemudian REBATE.\nJika tidak pasti, /kategori NO KATEGORI; selepas semua lengkap /siap.");return;
  }
  if(command==="/siap"){
   if(!files?.length){await say(token,chat,"Tiada dokumen dalam kes ini.");return}
   const uncertain=files.map((x:any,i:number)=>x.needs_review?i+1:0).filter(Boolean);
   if(uncertain.length){await say(token,chat,"⚠️ Belum boleh jana PDF kerana kategori belum disahkan untuk fail #"+uncertain.join(", ")+".\nSemak /senarai kemudian guna /kategori NO KATEGORI supaya tidak tersalah susun dokumen pelanggan.");return}
   await say(token,chat,"⏳ Menjana PDF akhir untuk "+c.customer_name+"...");
   const result=await makeMergedPdf(c,files);
   const clean=safePdfText(c.customer_name).replace(/\s+/g,"_").slice(0,50)||"CUSTOMER";
   await telegramSendDocument(token,chat,result,clean+"_DOKUMEN_LENGKAP.pdf","✅ PDF selesai disusun mengikut kategori. Pastikan butiran pelanggan betul sebelum diserahkan kepada pihak lain.");
   await db.from("lead_hub_telegram_cases").update({state:"completed",completed_at:new Date().toISOString()}).eq("id",c.id);
   return;
  }
 }
 if(command==="/daftar"){
  const parts=arg.split("|").map(x=>x.trim());
  if(parts.length<4||parts[3].toUpperCase()!=="YA"){await say(token,chat,"Format: /daftar NAMA | 0123456789 | Proton e.MAS 5 | YA\nYA mengesahkan pelanggan membenarkan nombornya digunakan untuk urusan jualan.");return}
  const [name,rawPhone,model]=parts,phone=normalPhone(rawPhone);
  if(!phone||name.length<2||name.length>120||!model){await say(token,chat,"Semak nama (2–120 aksara), nombor Malaysia dan model.");return}
  const record={customer_name:name,phone_e164:phone,model:model.slice(0,100),source:"Telegram "+account.staff_code,consent_confirmed:true,created_by:account.id,...(account.role==="staff"?{assigned_id:account.id,stage:"new"}:{})};
  const {data,error}=await db.from("lead_hub_leads").upsert(record,{onConflict:"phone_e164",ignoreDuplicates:true}).select("id");
  if(error)throw error;
  await say(token,chat,data?.length?"✅ Lead "+name+" berjaya masuk FARIS LEAD HUB. Admin akan nampak pada dashboard, staf juga boleh Refresh.":"Nombor ini sudah wujud. Rekod lama dikekalkan supaya tidak ditindih.");return;
 }
 if(command==="/skrip"){
  const kind=arg.toLowerCase();
  if(!["intro","follow","price"].includes(kind)){await say(token,chat,"Pilih: /skrip intro, /skrip follow atau /skrip price");return}
  await db.from("lead_hub_telegram_links").update({selected_template:kind}).eq("telegram_user_id",id);
  await say(token,chat,"✅ Skrip WhatsApp dipilih: "+kind+". Mesej mengikut tetapan akaun dalam FARIS LEAD HUB.");return;
 }
 if(command==="/baru"||command==="/ambil"){
  if(command==="/ambil"){
   if(account.role==="admin"){await say(token,chat,"Admin gunakan panel untuk agihkan lead. Staf boleh /ambil.");return}
   const {data,error}=await db.rpc("lead_hub_claim_next",{_staff_id:account.id});
   if(error){await say(token,chat,"Tidak dapat ambil lead: "+error.message);return}
   if(!data){await say(token,chat,"Tiada lead belum diagih.");return}
  }
  let leadQuery=db.from("lead_hub_leads")
    .select("customer_name,phone_e164,model,stage,assigned_id").in("stage",["new","claimed"])
    .order("created_at",{ascending:false}).limit(5);
  if(account.role!=="admin")leadQuery=leadQuery.eq("assigned_id",account.id);
  const {data:leads,error}=await leadQuery;
  if(error)throw error;
  if(!leads?.length){await say(token,chat,"Tiada lead baharu ditugaskan pada ID anda. Admin boleh tambah dan agihkan nombor baharu melalui website.");return}
  await say(token,chat,"📲 "+leads.length+" lead baharu untuk "+account.display_name+". Skrip: "+link.selected_template+".");
  for(const lead of leads)await sendLead(token,chat,account,lead,link.selected_template);
  return;
 }
 await say(token,chat,"Arahan tidak dikenali. Taip /menu untuk senarai fungsi.");
}
async function controller(req:Request){
 const origin=req.headers.get("origin")||"";
 if(origin&&!originWhitelist.has(origin))return fail(req,"Origin tidak dibenarkan",403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":originWhitelist.has(origin)?origin:"","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token","Vary":"Origin"}});
 if(req.method!=="POST")return fail(req,"Only POST allowed",405);
 if(Number(req.headers.get("content-length")||0)>200000)return fail(req,"Request too large",413);
 const payload=await req.json().catch(()=>null);
 if(!payload||typeof payload!=="object")return fail(req,"Invalid payload");
 const secretHeader=req.headers.get("x-telegram-bot-api-secret-token");
 if(secretHeader){
  const conf=await config();
  if(!conf?.enabled||!conf.webhook_secret_hash||!(/^[A-Za-z0-9_-]{32,80}$/.test(secretHeader))||await sha(secretHeader)!==conf.webhook_secret_hash)return fail(req,"Forbidden",403);
  if(!Number.isSafeInteger(payload.update_id)||payload.update_id<0)return fail(req,"Invalid update",400);
  const {error:dedupe}=await db.from("lead_hub_telegram_updates").insert({update_id:payload.update_id});
  if(dedupe?.code==="23505")return out(req,{ok:true,duplicate:true});
  if(dedupe)throw dedupe;
  const job=(async()=>{let token="";try{
   token=await botToken(conf);
   await processUpdate(payload,conf,token);
  }catch(e){console.error("Telegram update failed:",String(e).slice(0,200));
   try{const chat=payload?.message?.chat?.id;if(chat&&token)await say(token,chat,"⚠️ Arahan tidak berjaya diproses. Cuba semula atau guna website FARIS LEAD HUB.");}catch{/* do not leak */}
  }})();
  // Telegram receives a quick acknowledgement while the document is processed server-side.
  if(typeof EdgeRuntime!=="undefined")EdgeRuntime.waitUntil(job);else await job;
  return out(req,{ok:true});
 }
 const actor=await adminAccount(req);if(!actor)return fail(req,"Sesi login tidak sah",401);
 const action=String(payload.action||"");
 if(action==="telegram_status"){
  const conf=await config(),{data:link}=await db.from("lead_hub_telegram_links").select("chat_id").eq("account_id",actor.id).maybeSingle();
  return out(req,{ok:true,connected:!!conf?.enabled,bot_username:conf?.bot_username||null,ai_enabled:!!conf?.ai_api_key_cipher,telegram_linked:!!link,ai_model:conf?.ai_model||"gpt-4.1-mini"});
 }
 if(action==="telegram_link_code"){
  const conf=await config();if(!conf?.enabled||!conf?.bot_username)return fail(req,"Admin perlu sambungkan bot Telegram dahulu");
  const code=randomHex(12).toUpperCase();
  const {error}=await db.from("lead_hub_telegram_link_codes").insert({code_hash:await sha(code),account_id:actor.id,expires_at:new Date(Date.now()+10*60*1000).toISOString()});
  if(error)throw error;
  return out(req,{ok:true,code,expires_in_minutes:10,url:"https://t.me/"+conf.bot_username+"?start="+code});
 }
 if(action==="telegram_unlink_self"){
  const {error}=await db.from("lead_hub_telegram_links").delete().eq("account_id",actor.id);
  if(error)throw error;return out(req,{ok:true});
 }
 if(actor.role!=="admin")return fail(req,"Hanya admin boleh ubah tetapan bot",403);
 if(action==="telegram_connect"){
  const token=String(payload.token||"").trim();
  if(!/^\d{7,12}:[A-Za-z0-9_-]{30,}$/.test(token))return fail(req,"Token bot tidak sah. Dapatkan daripada BotFather.");
  const me=await telegramCall(token,"getMe",{});
  if(!me?.is_bot||!me.username)return fail(req,"Token tidak merujuk kepada Telegram bot",400);
  const current=await config();
  if(current?.bot_id&&String(current.bot_id)!==String(me.id)&&current.enabled)
    return fail(req,"Putuskan sambungan bot lama dahulu sebelum menukar bot.",409);
  const webhookSecret=randomHex(32),protectedToken=await encrypt(token);
  const changes={bot_id:me.id,bot_username:me.username,bot_token_cipher:protectedToken.cipher,bot_token_iv:protectedToken.iv,webhook_secret_hash:await sha(webhookSecret),enabled:false,updated_at:new Date().toISOString()};
  const {error}=current
    ?await db.from("lead_hub_telegram_settings").update(changes).eq("id",1)
    :await db.from("lead_hub_telegram_settings").insert({id:1,...changes});
  if(error)throw error;
  try{
    await telegramCall(token,"setWebhook",{url:PROJECT_URL+"/functions/v1/lead-hub-telegram",secret_token:webhookSecret,allowed_updates:["message"],drop_pending_updates:false,max_connections:4});
  }catch(e){return fail(req,"Bot disimpan tetapi webhook gagal: "+String(e),502)}
  await db.from("lead_hub_telegram_settings").update({enabled:true}).eq("id",1);
  return out(req,{ok:true,bot_username:me.username,bot_url:"https://t.me/"+me.username});
 }
 if(action==="telegram_disconnect"){
  const conf=await config();if(!conf?.bot_token_cipher)return out(req,{ok:true});
  await db.from("lead_hub_telegram_settings").update({enabled:false,webhook_secret_hash:null}).eq("id",1);
  try{await telegramCall(await botToken(conf),"deleteWebhook",{drop_pending_updates:false})}catch(e){console.error("Webhook disconnect:",String(e).slice(0,80))}
  return out(req,{ok:true});
 }
 if(action==="telegram_set_ai"){
  const apiKey=String(payload.api_key||"").trim();
  if(!/^sk-[A-Za-z0-9_-]{18,}$/.test(apiKey))return fail(req,"OpenAI API key tidak sah");
  const protectedKey=await encrypt(apiKey);
  const current=await config();
  const changes={ai_api_key_cipher:protectedKey.cipher,ai_api_key_iv:protectedKey.iv,ai_model:"gpt-4.1-mini",updated_at:new Date().toISOString()};
  const {error}=current
    ?await db.from("lead_hub_telegram_settings").update(changes).eq("id",1)
    :await db.from("lead_hub_telegram_settings").insert({id:1,...changes});
  if(error)throw error;
  return out(req,{ok:true});
 }
 if(action==="telegram_disable_ai"){
  const {error}=await db.from("lead_hub_telegram_settings").update({ai_api_key_cipher:null,ai_api_key_iv:null}).eq("id",1);
  if(error)throw error;return out(req,{ok:true});
 }
 if(action==="telegram_unlink_account"){
  const staffId=String(payload.staff_id||"");
  if(!/^[a-f0-9-]{36}$/i.test(staffId))return fail(req,"ID staf tidak sah");
  const {error}=await db.from("lead_hub_telegram_links").delete().eq("account_id",staffId);
  if(error)throw error;return out(req,{ok:true});
 }
 return fail(req,"Unknown action",404);
}
Deno.serve(async(req)=>{try{return await controller(req)}catch(e){console.error("Telegram API error:",String(e).slice(0,200));return fail(req,"Ralat Telegram Hub. Sila cuba lagi.",500)}});