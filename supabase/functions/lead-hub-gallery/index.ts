import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {MAX_FILE,MODELS,isId,metadata,imageInfo} from "./validation.mjs";
const ROOT=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
if(!KEY)throw Error("Server configuration missing");
const db=createClient(ROOT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET="lead-hub-gallery-private";
const ORIGINS=new Set(["https://document-pdf-compiler.vercel.app","https://document-pdf-compiler-makanaman.vercel.app","https://document-pdf-compiler-git-main-makanaman.vercel.app"]);
const FIELDS="id,model,title,original_name,mime_type,byte_size,created_at,updated_at";
class InputError extends Error {}
function json(req:Request,value:unknown,status=200){
 const origin=req.headers.get("origin")||"";
 return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})}});
}
async function account(req:Request){
 const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
 const hashed=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 const {data:s,error}=await db.from("lead_hub_sessions").select("account_id").eq("token_hash",hashed).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error)throw error;if(!s)return null;
 const {data:a,error:ae}=await db.from("lead_hub_accounts").select("id,role").eq("id",s.account_id).eq("active",true).maybeSingle();
 if(ae)throw ae;return a;
}
async function bytesLimited(req:Request,max:number){
 if(Number(req.headers.get("content-length")||0)>max)throw new InputError("Saiz permintaan terlalu besar.");
 const reader=req.body?.getReader();if(!reader)throw new InputError("Tiada kandungan.");
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new InputError("Saiz permintaan terlalu besar.")}chunks.push(value)}}finally{reader.releaseLock()}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out;
}
function checked<T>(fn:()=>T):T{try{return fn()}catch(e){throw new InputError(e.message)}}
async function handler(req:Request){
 const origin=req.headers.get("origin")||"";
 if(origin&&!ORIGINS.has(origin))return json(req,{ok:false,error:"Origin tidak dibenarkan."},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,content-type","Vary":"Origin"}});
 if(req.method!=="POST")return json(req,{ok:false,error:"Gunakan POST."},405);
 const a=await account(req);if(!a)return json(req,{ok:false,error:"Sesi tamat. Log masuk semula."},401);
 if(new URL(req.url).searchParams.get("action")==="upload"){
  if(a.role!=="admin")return json(req,{ok:false,error:"Hanya admin boleh upload gambar."},403);
  const raw=await bytesLimited(req,MAX_FILE+1024*1024);
  let form:FormData;try{form=await new Request(req.url,{method:"POST",headers:{"content-type":req.headers.get("content-type")||""},body:raw}).formData()}catch{throw new InputError("Format upload tidak sah.")}
  const file=form.get("file");if(!(file instanceof File)||form.getAll("file").length!==1)throw new InputError("Pilih satu gambar untuk setiap upload.");
  const bytes=new Uint8Array(await file.arrayBuffer()),info=checked(()=>imageInfo(file.name,bytes));
  const meta=checked(()=>metadata({model:form.get("model"),title:form.get("title")},info.original_name.replace(/\.[^.]+$/,'')));
  const id=crypto.randomUUID(),storage_path=a.id+"/"+id+"."+info.extension;
  const {error:ie}=await db.from("lead_hub_gallery").insert({id,...meta,original_name:info.original_name,mime_type:info.mime_type,byte_size:bytes.length,storage_path,uploaded_by:a.id});if(ie)throw ie;
  const {error:ue}=await db.storage.from(BUCKET).upload(storage_path,bytes,{contentType:info.mime_type,cacheControl:"60",upsert:false});
  if(ue){await db.from("lead_hub_gallery").delete().eq("id",id);throw ue}
  const {error:re}=await db.from("lead_hub_gallery").update({state:"ready"}).eq("id",id);
  if(re){await db.storage.from(BUCKET).remove([storage_path]);await db.from("lead_hub_gallery").delete().eq("id",id);throw re}
  return json(req,{ok:true,id});
 }
 const raw=await bytesLimited(req,8000);let body;
 try{body=JSON.parse(new TextDecoder().decode(raw));if(!body||Array.isArray(body)||typeof body!=="object")throw Error()}catch{throw new InputError("JSON tidak sah.")}
 if(body.action==="list"){
  if(body.model&&!MODELS.includes(body.model))throw new InputError("Kategori tidak sah.");
  const offset=Math.max(0,Math.min(100000,Math.floor(Number(body.offset)||0)));
  let q=db.from("lead_hub_gallery").select(FIELDS+",storage_path",{count:"exact"}).eq("state","ready").order("created_at",{ascending:false}).order("id");
  if(body.model)q=q.eq("model",body.model);
  const search=String(body.search||"").trim().slice(0,100);
  if(search)q=q.ilike("title","%"+search.replace(/[\\%_]/g,"\\$&")+"%");
  const [result,...totals]=await Promise.all([q.range(offset,offset+59),...MODELS.map(model=>db.from("lead_hub_gallery").select("id",{count:"exact",head:true}).eq("state","ready").eq("model",model))]);
  if(result.error)throw result.error;for(const t of totals)if(t.error)throw t.error;
  const items=result.data||[];
  const urls=items.length?await db.storage.from(BUCKET).createSignedUrls(items.map(f=>f.storage_path),1800):{data:[],error:null};if(urls.error)throw urls.error;
  if(urls.data?.some(x=>x.error))throw Error("Image signing failed");
  const files=items.map((f,i)=>{const {storage_path,...rest}=f;return {...rest,url:urls.data?.[i]?.signedUrl}});
  return json(req,{ok:true,files,total:result.count||0,counts:Object.fromEntries(MODELS.map((m,i)=>[m,totals[i].count||0])),next_offset:offset+files.length<(result.count||0)?offset+files.length:null});
 }
 if(!["download","edit","delete"].includes(body.action))return json(req,{ok:false,error:"Tindakan tidak dikenali."},404);
 if(["edit","delete"].includes(body.action)&&a.role!=="admin")return json(req,{ok:false,error:"Hanya admin boleh mengurus Gallery."},403);
 if(!isId(body.id))throw new InputError("Gambar tidak sah.");
 if(body.action==="delete"){
  if(body.confirmed!==true)throw new InputError("Sahkan pemadaman gambar dahulu.");
  // Keep the row until Storage confirms deletion; a failed attempt can be retried.
  const {data:file,error}=await db.from("lead_hub_gallery").update({state:"deleting"}).eq("id",body.id).in("state",["ready","deleting"]).select("id,storage_path").maybeSingle();
  if(error)throw error;if(!file)return json(req,{ok:false,error:"Gambar tidak ditemui."},404);
  const {error:se}=await db.storage.from(BUCKET).remove([file.storage_path]);
  if(se){await db.from("lead_hub_gallery").update({state:"ready"}).eq("id",file.id);throw se}
  const {error:de}=await db.from("lead_hub_gallery").delete().eq("id",file.id);if(de)throw de;
  return json(req,{ok:true});
 }
 const {data:file,error}=await db.from("lead_hub_gallery").select(FIELDS+",storage_path").eq("id",body.id).eq("state","ready").maybeSingle();
 if(error)throw error;if(!file)return json(req,{ok:false,error:"Gambar tidak ditemui. Refresh Gallery."},404);
 if(body.action==="edit"){
  const meta=checked(()=>metadata(body));
  const {data,error:ue}=await db.from("lead_hub_gallery").update({...meta,updated_at:new Date().toISOString()}).eq("id",file.id).eq("state","ready").select("id").maybeSingle();
  if(ue)throw ue;if(!data)return json(req,{ok:false,error:"Gambar telah berubah. Refresh Gallery."},409);
  return json(req,{ok:true});
 }
 const {data:link,error:le}=await db.storage.from(BUCKET).createSignedUrl(file.storage_path,60,{download:file.original_name});if(le)throw le;
 const {storage_path,...meta}=file;return json(req,{ok:true,file:meta,url:link.signedUrl});
}
Deno.serve(async req=>{try{return await handler(req)}catch(e){console.error("lead-hub-gallery request failed",e?.code||e?.name||"Error");return json(req,{ok:false,error:e instanceof InputError?e.message:"Gallery tidak dapat diproses. Refresh dan cuba lagi."},e instanceof InputError?400:500)}});
