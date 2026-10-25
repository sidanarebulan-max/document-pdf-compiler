// One living Telegram message per customer case.
// Shared by the Telegram intake endpoint and the local Codex completion endpoint.
const labels={
 VSO:"VSO",IC:"IC",IC_FRONT:"IC depan",IC_BACK:"IC belakang",BANK:"Penyata bank",
 PAYSLIP:"Slip gaji",LESEN:"Lesen",SIJIL:"Sijil",SIJIL_LAHIR:"Sijil lahir",
 SIJIL_NIKAH:"Sijil nikah",SURAT_KERJA:"Surat kerja",OTHER:"Dokumen lain"
};
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const tidy=s=>String(s||"").replace(/[\r\n\t]+/g," ").replace(/\s+/g," ").trim();
function statusOf(f){
 return f.classification_method==="codex_pending"?"⏳":f.needs_review?"⚠️":"✅";
}
export function formatCaseCard(record,files){
 const docs=[...(files||[])].sort((a,b)=>
  Number(a.telegram_message_id||Number.MAX_SAFE_INTEGER)-Number(b.telegram_message_id||Number.MAX_SAFE_INTEGER) ||
  String(a.created_at||"").localeCompare(String(b.created_at||"")));
 const pending=docs.filter(f=>f.classification_method==="codex_pending").length;
 const review=docs.filter(f=>f.classification_method!=="codex_pending"&&f.needs_review).length;
 const accepted=docs.length-pending-review;
 const counts=new Map();
 for(const f of docs){const name=labels[f.category]||f.category||"Lain";
  const key=f.party+" | "+name;counts.set(key,(counts.get(key)||0)+1);}
 const name=tidy(record.customer_name).slice(0,85);
 let body="📂 FARIS • RINGKASAN DOKUMEN\n"+
  "👤 "+name+"\n"+
  "🆔 Kes "+String(record.id||"").slice(0,8).toUpperCase()+
  "  •  📎 "+docs.length+"/50 fail\n"+
  "✅ Disahkan: "+accepted+"   ⏳ Imbas AI: "+pending+"   ⚠️ Semak: "+review+"\n"+
  "\n📚 KATEGORI\n"+
  ([...counts].map(([label,num])=>"• "+label+": "+num).join("\n")||"• Belum ada fail")+
  "\n\n📄 SENARAI FAIL\n";
 let displayed=0;
 for(let i=0;i<docs.length;i++){
  const f=docs[i];const group=String(f.party||"").replace("GUARANTOR","PENJAMIN").replace("HIRER","PEMINJAM");
  const line=(i+1)+". "+statusOf(f)+" ["+group+"] "+(labels[f.category]||f.category||"Lain")+
    " — "+tidy(f.original_name).slice(0,52)+"\n";
  if(body.length+line.length>3420)break;
  body+=line;displayed++;
 }
 if(displayed<docs.length)body+="… "+(docs.length-displayed)+" fail lagi (taip 'senarai' untuk lihat lengkap)\n";
 body+="\n"+(pending?"⏳ AI sedang membaca "+pending+" fail. Kad ini akan dikemas kini.\n":"")+
  (review?"⚠️ "+review+" fail memerlukan semakan kategori.\n":"")+
  "\nHantar fail lagi, atau taip 'senarai' / 'siapkan PDF'.";
 return body.slice(0,3850);
}
async function tg(token,method,payload){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),14000);
 try{
  const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify(payload),signal:ctl.signal
  });
  const out=await r.json();
  if(!r.ok||!out.ok){const e=new Error(String(out.description||"Telegram error "+r.status));
   e.retryAfter=Number(out.parameters?.retry_after||0);throw e;}
  return out.result;
 }finally{clearTimeout(timer)}
}
async function runCaseCard(db,token,caseId){
 for(let attempt=0;attempt<12;attempt++){
  const lease=crypto.randomUUID();
  const {data:claimed,error:claimError}=await db.rpc("lead_hub_case_card_claim",{
   _case_id:caseId,_lease_id:lease
  });
  if(claimError){console.warn("Card claim",claimError.message);return}
  const card=claimed?.[0];if(!card)return;
  // Coalesce simultaneous Telegram uploads and Codex replies into one edit.
  await pause(attempt===0?1700:1700);
  let messageId=Number(card.message_id||0),updated=false;
  try{
   const [{data:caseRow,error:ce},{data:files,error:fe}]=await Promise.all([
    db.from("lead_hub_telegram_cases").select("id,chat_id,customer_name")
     .eq("id",caseId).maybeSingle(),
    db.from("lead_hub_telegram_files")
     .select("original_name,category,party,needs_review,classification_method,telegram_message_id,created_at")
     .eq("case_id",caseId)
   ]);
   if(ce||fe)throw ce||fe;
   if(!caseRow||!files)return;
   const text=formatCaseCard(caseRow,files);
   if(messageId){
    try{
     await tg(token,"editMessageText",{
      chat_id:card.chat_id,message_id:messageId,text,
      link_preview_options:{is_disabled:true}
     });
    }catch(e){
     const why=String(e.message||e);
     if(why.includes("message is not modified")){/* same content, already up to date */}
     else if(why.includes("message to edit not found")||why.includes("message can't be edited")){
      const sent=await tg(token,"sendMessage",{
       chat_id:card.chat_id,text,link_preview_options:{is_disabled:true}
      });
      messageId=Number(sent.message_id);
     }else throw e;
    }
   }else{
    const sent=await tg(token,"sendMessage",{
     chat_id:card.chat_id,text,link_preview_options:{is_disabled:true}
    });
    messageId=Number(sent.message_id);
   }
   updated=true;
  }catch(e){
   console.warn("Card Telegram update",String(e).slice(0,110));
   // Keep the card dirty so a later refresh can retry. Do not flood the chat.
   const retry=Number(e.retryAfter||0);
   const {error:fe}=await db.rpc("lead_hub_case_card_finish",{
    _case_id:caseId,_lease_id:lease,_revision:0,_message_id:messageId||null
   });
   if(fe)console.warn("Card release",fe.message);
   if(attempt<2){await pause(retry>0?Math.min(retry*1000,9000):1800);continue}
   return;
  }
  if(updated){
   const {data:needsMore,error:finishError}=await db.rpc("lead_hub_case_card_finish",{
    _case_id:caseId,_lease_id:lease,_revision:card.revision,_message_id:messageId
   });
   if(finishError){console.warn("Card finalize",finishError.message);return}
   if(!needsMore)return;
  }
 }
}
export async function touchCaseCard(db,token,caseId){
 try{
  const {data:exists,error}=await db.rpc("lead_hub_case_card_touch",{_case_id:caseId});
  if(error||!exists){console.warn("Card touch",error?.message||"case missing");return}
  const task=runCaseCard(db,token,caseId).catch(e=>console.warn("Card task",String(e).slice(0,110)));
  if(typeof EdgeRuntime!=="undefined"&&EdgeRuntime.waitUntil)EdgeRuntime.waitUntil(task);
  else await task;
 }catch(e){console.warn("Card scheduling",String(e).slice(0,100))}
}
