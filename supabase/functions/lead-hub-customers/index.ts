import {createClient} from "npm:@supabase/supabase-js@2.57.4";
import {isId,validate,STATUSES} from "./validation.mjs";
import {insightsFilters} from "./insights.mjs";
const URL=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
if(!KEY)throw Error("Server configuration missing");
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(["https://document-pdf-compiler.vercel.app","https://document-pdf-compiler-makanaman.vercel.app","https://document-pdf-compiler-git-main-makanaman.vercel.app"]);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
function json(req:Request,value:unknown,status=200){const origin=req.headers.get("origin")||"";return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})}})}
async function account(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!/^[a-f0-9]{64}$/.test(token))return null;
 const {data:s,error}=await db.from("lead_hub_sessions").select("account_id").eq("token_hash",await hash(token)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();if(error)throw error;if(!s)return null;
 const {data:a,error:ae}=await db.from("lead_hub_accounts").select("id,role").eq("id",s.account_id).eq("active",true).maybeSingle();if(ae)throw ae;return a;
}
async function body(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error('JSON');let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24000){await reader.cancel();throw Error('JSON')}chunks.push(value)}}finally{reader.releaseLock()}
 const b=new Uint8Array(size);let at=0;for(const c of chunks){b.set(c,at);at+=c.length}const d=JSON.parse(new TextDecoder().decode(b));if(!d||Array.isArray(d)||typeof d!=="object")throw Error('JSON');return d;
}
async function handler(req:Request){
 const origin=req.headers.get("origin")||"";if(origin&&!ORIGINS.has(origin))return json(req,{ok:false,error:"Origin tidak dibenarkan."},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,content-type","Vary":"Origin"}});
 if(req.method!=="POST")return json(req,{ok:false,error:"Gunakan POST."},405);
 const a=await account(req);if(!a)return json(req,{ok:false,error:"Sesi tamat. Log masuk semula."},401);
 let b;try{b=await body(req)}catch{return json(req,{ok:false,error:"Permintaan JSON tidak sah atau terlalu besar."},400)}
 if(b.action==="insights"){
  let filters;try{filters=insightsFilters(b,STATUSES,isId)}catch(e){return json(req,{ok:false,error:e.message},400)}
  const {data,error}=await db.rpc("lead_hub_customer_insights",{_actor:a.id,...filters});if(error)throw error;
  return json(req,{ok:true,insights:data});
 }
 if(b.action==="list"){
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(b.offset)||0)));
  if(b.status&&!Object.hasOwn(STATUSES,b.status))return json(req,{ok:false,error:"Status tidak sah."},400);
  let q=db.rpc("lead_hub_customer_list",{_actor:a.id},{count:"exact"}).select("*").order("updated_at",{ascending:false}).order("id");
  if(b.status)q=q.eq("sales_status",b.status);
  if(b.staff_id){if(!isId(b.staff_id))return json(req,{ok:false,error:"Staff tidak sah."},400);q=q.eq("assigned_id",b.staff_id)}
  if(b.model)q=q.eq("model",String(b.model).slice(0,120));
  const search=String(b.search||"").trim().slice(0,100).replace(/[^\p{L}\p{N} @+.-]/gu,"");
  if(search){const digits=search.replace(/\D/g,"");q=q.or("customer_name.ilike.%"+search+"%,phone_e164.ilike.%"+(digits.length>=3?digits:search)+"%")}
  const {data,error,count}=await q.range(offset,offset+49);if(error)throw error;
  const {data:staff,error:se}=a.role==="admin"?await db.from("lead_hub_accounts").select("id,display_name,staff_code").eq("active",true).order("display_name"):{data:[],error:null};if(se)throw se;
  // Model filter options come from the actor's complete accessible list, not this page.
  const {data:models,error:me}=await db.rpc("lead_hub_customer_models",{_actor:a.id});if(me)throw me;
  return json(req,{ok:true,customers:data,total:count||0,next_offset:offset+(data?.length||0)<(count||0)?offset+(data?.length||0):null,staff,models});
 }
 if(!isId(b.lead_id))return json(req,{ok:false,error:"Customer tidak sah."},400);
 if(b.action==="get"||b.action==="timeline"){
  const {data,error}=await db.rpc(b.action==="get"?"lead_hub_customer_get":"lead_hub_customer_timeline",{_actor:a.id,_lead:b.lead_id,...(b.action==="timeline"?{_offset:Math.max(0,Math.min(100000,Math.floor(Number(b.offset)||0)))}:{})});if(error)throw error;
  return json(req,{ok:true,...(b.action==="get"?{customer:data}:data)});
 }
 if(b.action==="unlinked_files"){
  const {error}=await db.rpc("lead_hub_customer_get",{_actor:a.id,_lead:b.lead_id});if(error)throw error;
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(b.offset)||0)));
  let q=db.rpc("lead_hub_inbox_visible",{_actor:a.id},{count:"exact"}).select("id,original_name,byte_size,party,category,customer_name,created_at").is("customer_id",null).neq("state","uploading").order("created_at",{ascending:false}).order("id");
  const search=String(b.search||"").trim().slice(0,100);if(search)q=q.ilike("original_name","%"+search.replace(/[\\%_]/g,"\\$&")+"%");
  const {data,error:qe,count}=await q.range(offset,offset+49);if(qe)throw qe;
  return json(req,{ok:true,files:data,total:count||0,next_offset:offset+(data?.length||0)<(count||0)?offset+(data?.length||0):null});
 }
 if(!isId(b.operation_id))return json(req,{ok:false,error:"Operasi tidak sah. Refresh dan cuba lagi."},400);
 let values;try{values=validate(b.action,b.data)}catch(e){return json(req,{ok:false,error:e.message},400)}
 const {data,error}=await db.rpc("lead_hub_customer_write",{_actor:a.id,_lead:b.lead_id,_action:b.action,_data:values,_operation:b.operation_id});if(error)throw error;return json(req,{ok:true,...data});
}
Deno.serve(async req=>{try{return await handler(req)}catch(e){console.error("lead-hub-customers request failed",e?.code||e?.name||"Error");const code=e?.message==="PROFILE_CONFLICT"?"PROFILE_CONFLICT":e?.code;return json(req,{ok:false,error:code==="42501"?"Profil atau fail ini bukan di bawah akses anda. Refresh senarai.":code==="PROFILE_CONFLICT"?"Profil telah berubah. Refresh profil sebelum menyimpan semula.":"Urusan customer tidak berjaya. Semak maklumat, refresh dan cuba lagi."},code==="42501"?403:code==="PROFILE_CONFLICT"?409:400)}});
