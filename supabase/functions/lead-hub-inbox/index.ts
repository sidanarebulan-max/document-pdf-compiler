import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { MAX_BODY, MAX_FILE, isId, assignment, fileInfo } from "./validation.mjs";
const URL=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default;
if(!KEY)throw Error("Server configuration missing");
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET="lead-hub-inbox-private";
const ORIGINS=new Set(["https://document-pdf-compiler.vercel.app","https://document-pdf-compiler-makanaman.vercel.app","https://document-pdf-compiler-git-main-makanaman.vercel.app"]);
const fields="id,owner_id,uploaded_by,original_name,mime_type,byte_size,source,state,customer_name,customer_phone,party,category,created_at,updated_at";
const hex=(bytes:Uint8Array)=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const hash=async(s:string|Uint8Array)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s)));
function json(req:Request,value:unknown,status=200){
 const origin=req.headers.get("origin")||"";
 return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Vary":"Origin",...(ORIGINS.has(origin)?{"Access-Control-Allow-Origin":origin}:{})}});
}
async function account(req:Request,upload=false){
 let accountId=null,viaKey=false;
 const uploadKey=req.headers.get("x-faris-upload-key")||"";
 if(upload&&/^[a-f0-9]{64}$/.test(uploadKey)){
  const {data,error}=await db.from("lead_hub_inbox_upload_keys").select("account_id").eq("token_hash",await hash(uploadKey)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error)throw error;
  accountId=data?.account_id;viaKey=true;
 }else{
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const {data,error}=await db.from("lead_hub_sessions").select("account_id").eq("token_hash",await hash(token)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(error)throw error;accountId=data?.account_id;
 }
 if(!accountId)return null;
 const {data,error}=await db.from("lead_hub_accounts").select("id,display_name,staff_code,role").eq("id",accountId).eq("active",true).maybeSingle();
 if(error)throw error;
 return data?{...data,viaKey}:null;
}
async function bytesLimited(req:Request,max:number){
 if(Number(req.headers.get("content-length")||0)>max)throw Error("Permintaan melebihi had saiz.");
 const reader=req.body?.getReader();if(!reader)throw Error("Tiada kandungan fail.");
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error("Permintaan melebihi had saiz.")}chunks.push(value)}}finally{reader.releaseLock()}
 const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out;
}
function owned(query:any,a:any){return a.role==="admin"?query:query.eq("owner_id",a.id)}
async function receive(req:Request,a:any){
 const {count,error:rateError}=await db.from("lead_hub_inbox_files").select("id",{count:"exact",head:true}).eq("uploaded_by",a.id).gte("created_at",new Date(Date.now()-86400000).toISOString());
 if(rateError)throw rateError;
 if((count||0)>=500)return json(req,{ok:false,error:"Had 500 fail sehari telah dicapai. Cuba semula kemudian."},429);
 const raw=await bytesLimited(req,MAX_BODY);
 const form=await new Request(req.url,{method:"POST",headers:{"content-type":req.headers.get("content-type")||""},body:raw}).formData();
 const files=[...form.getAll("file"),...form.getAll("files")].filter(x=>x instanceof File) as File[];
 if(!files.length||files.length>10)return json(req,{ok:false,error:"Sertakan 1–10 fail dalam medan file atau files."},400);
 if(files.some(f=>f.size>MAX_FILE)||files.reduce((n,f)=>n+f.size,0)>MAX_FILE)return json(req,{ok:false,error:"Jumlah fail dalam satu penghantaran maksimum 20 MB."},413);
 const checked=[];
 for(const f of files){const bytes=new Uint8Array(await f.arrayBuffer());checked.push({bytes,info:fileInfo(f.name,bytes)})}
 const saved=[];
 for(const {bytes,info} of checked){
  const id=crypto.randomUUID(),path=a.id+"/"+id+"."+info.extension;
  const {error:insertError}=await db.from("lead_hub_inbox_files").insert({id,owner_id:a.id,uploaded_by:a.id,storage_path:path,original_name:info.name,mime_type:info.mime,byte_size:bytes.length,sha256:await hash(bytes),source:a.viaKey?"ios_shortcut":"web_upload",state:"uploading"});
  if(insertError)throw insertError;
  const {error:uploadError}=await db.storage.from(BUCKET).upload(path,bytes,{contentType:info.mime,upsert:false});
  if(uploadError){await db.from("lead_hub_inbox_files").delete().eq("id",id);throw uploadError}
  const {error:readyError}=await db.from("lead_hub_inbox_files").update({state:"inbox"}).eq("id",id);
  if(readyError){await db.storage.from(BUCKET).remove([path]);await db.from("lead_hub_inbox_files").delete().eq("id",id);throw readyError}
  saved.push({id,name:info.name,size:bytes.length});
 }
 return json(req,{ok:true,files:saved,open_url:"https://document-pdf-compiler.vercel.app/staff.html#docs"});
}
async function handler(req:Request){
 const origin=req.headers.get("origin")||"";
 if(origin&&!ORIGINS.has(origin))return json(req,{ok:false,error:"Origin tidak dibenarkan."},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type,authorization,x-faris-upload-key","Vary":"Origin"}});
 if(req.method!=="POST")return json(req,{ok:false,error:"Gunakan POST."},405);
 const isReceive=new globalThis.URL(req.url).searchParams.get("action")==="receive";
 const a=await account(req,isReceive);
 if(!a)return json(req,{ok:false,error:"Sesi atau kunci iPhone tidak sah. Log masuk semula atau jana kunci baharu."},401);
 if(isReceive)return receive(req,a);
 const raw=await bytesLimited(req,16000);
 let body;try{body=JSON.parse(new TextDecoder().decode(raw))}catch{return json(req,{ok:false,error:"JSON tidak sah."},400)}
 if(body.action==="me")return json(req,{ok:true,user:{id:a.id,role:a.role,display_name:a.display_name,staff_code:a.staff_code}});
 if(body.action==="list"){
  const offset=Math.max(0,Math.min(100000,Number(body.offset)||0));
  let query=db.from("lead_hub_inbox_files").select(fields,{count:"exact"}).neq("state","uploading").order("created_at",{ascending:false}).order("id");
  if(a.role!=="admin"||body.team!==true)query=query.eq("owner_id",a.id);
  if(["inbox","assigned"].includes(body.state))query=query.eq("state",body.state);
  const search=String(body.search||"").trim().slice(0,100);
  if(search)query=query.ilike("original_name","%"+search.replace(/[\\%_]/g,"\\$&")+"%");
  const {data,error,count}=await query.range(offset,offset+49);if(error)throw error;
  const {data:staff,error:staffError}=a.role==="admin"?await db.from("lead_hub_accounts").select("id,display_name,staff_code").eq("active",true).eq("role","staff").order("display_name"):{data:[],error:null};
  if(staffError)throw staffError;
  return json(req,{ok:true,files:data,total:count||0,next_offset:offset+(data?.length||0)<(count||0)?offset+(data?.length||0):null,staff});
 }
 if(body.action==="download"){
  if(!isId(body.id))return json(req,{ok:false,error:"Fail tidak sah."},400);
  const {data:file,error}=await owned(db.from("lead_hub_inbox_files").select(fields+",storage_path").eq("id",body.id).neq("state","uploading"),a).maybeSingle();
  if(error)throw error;if(!file)return json(req,{ok:false,error:"Fail tidak ditemui atau bukan milik anda."},404);
  const {data,error:signedError}=await db.storage.from(BUCKET).createSignedUrl(file.storage_path,60,{download:file.original_name});
  if(signedError)throw signedError;
  const {storage_path,...metadata}=file;
  return json(req,{ok:true,file:metadata,url:data.signedUrl});
 }
 if(body.action==="delete"){
  if(!isId(body.id)||body.confirmed!==true)return json(req,{ok:false,error:"Sahkan pemadaman fail dahulu."},400);
  const {data:removed,error}=await owned(db.from("lead_hub_inbox_files").delete().eq("id",body.id).neq("state","uploading"),a).select("*").maybeSingle();
  if(error)throw error;if(!removed)return json(req,{ok:false,error:"Fail tidak ditemui atau bukan milik anda."},404);
  const {error:storageError}=await db.storage.from(BUCKET).remove([removed.storage_path]);
  if(storageError){await db.from("lead_hub_inbox_files").insert(removed);throw storageError}
  return json(req,{ok:true});
 }
 if(body.action==="assign"){
  const values=assignment(body),{ids,...metadata}=values;
  const target=body.owner_id?String(body.owner_id):null;
  if(target&&target!==a.id){
   if(a.role!=="admin")return json(req,{ok:false,error:"Hanya admin boleh agihkan kepada staf lain."},403);
   const {data:staff}=await db.from("lead_hub_accounts").select("id").eq("id",target).eq("active",true).eq("role","staff").maybeSingle();
   if(!staff)return json(req,{ok:false,error:"Staf tidak aktif."},400);
  }
  const {data:current,error:lookupError}=await owned(db.from("lead_hub_inbox_files").select("id").in("id",ids).neq("state","uploading"),a);
  if(lookupError)throw lookupError;
  if(current?.length!==ids.length)return json(req,{ok:false,error:"Sebahagian fail tidak ditemui atau akses telah berubah."},403);
  const {data,error}=await db.rpc("lead_hub_inbox_assign",{_actor:a.id,_ids:ids,_customer:metadata.customer_name,_phone:metadata.customer_phone,_party:metadata.party,_category:metadata.category,_target:target});
  if(error)throw error;if(data?.length!==ids.length)return json(req,{ok:false,error:"Agihan berubah. Refresh dan semak semula."},409);
  return json(req,{ok:true,ids:data});
 }
 if(body.action==="key_status"){
  const {data,error}=await db.from("lead_hub_inbox_upload_keys").select("id,prefix,created_at,expires_at").eq("account_id",a.id).is("revoked_at",null).gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1);
  if(error)throw error;return json(req,{ok:true,key:data?.[0]||null});
 }
 if(body.action==="create_key"){
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const {error:revokeError}=await db.from("lead_hub_inbox_upload_keys").update({revoked_at:new Date().toISOString()}).eq("account_id",a.id).is("revoked_at",null);if(revokeError)throw revokeError;
  const expires_at=new Date(Date.now()+90*86400000).toISOString();
  const {data,error}=await db.from("lead_hub_inbox_upload_keys").insert({account_id:a.id,token_hash:await hash(token),prefix:token.slice(0,8),expires_at}).select("id,prefix,expires_at").single();
  if(error)throw error;return json(req,{ok:true,key:token,record:data});
 }
 if(body.action==="revoke_key"){
  const {error}=await db.from("lead_hub_inbox_upload_keys").update({revoked_at:new Date().toISOString()}).eq("account_id",a.id).is("revoked_at",null);if(error)throw error;return json(req,{ok:true});
 }
 return json(req,{ok:false,error:"Tindakan tidak dikenali."},404);
}
Deno.serve(async(req)=>{try{return await handler(req)}catch(e){console.error("lead-hub-inbox request failed",e?.code||e?.name||"Error");return json(req,{ok:false,error:e instanceof Error&&/fail|saiz|pelanggan|kategori|Bahagian|JSON|Pilih|Nombor|Format|Kandungan/.test(e.message)?e.message:"Simpanan fail tidak berjaya. Cuba lagi; semak senarai sebelum menghantar semula."},400)}});
