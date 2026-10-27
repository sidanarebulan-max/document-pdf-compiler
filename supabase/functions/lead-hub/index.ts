import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
if (!SECRET) throw new Error("Server secret key is unavailable");
const db = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const ORIGINS = new Set([
  "https://document-pdf-compiler.vercel.app",
  "https://document-pdf-compiler-makanaman.vercel.app",
  "https://document-pdf-compiler-git-main-makanaman.vercel.app"
]);
const allowedStages = new Set(["new", "claimed", "contacted", "follow_up", "interested", "booked", "not_interested"]);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const coder = new TextEncoder();
const toHex = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) || []).map(s => parseInt(s,16)));
const randomHex = (n: number) => toHex(crypto.getRandomValues(new Uint8Array(n)));
function randomCode(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n*3));
  return Array.from(bytes.slice(0,n), b => alphabet[b % alphabet.length]).join("");
}
async function sha256(data: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", coder.encode(data))));
}
async function derive(pass: string,salt: string): Promise<string> {
  const material=await crypto.subtle.importKey("raw",coder.encode(pass),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:fromHex(salt),iterations:180000,hash:"SHA-256"},material,256);
  return toHex(new Uint8Array(bits));
}
function eqConstant(a: string,b: string): boolean {
  if (a.length!==b.length) return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;
}
function normalizePhone(v: unknown): string|null {
  let s=String(v??"").replace(/[^\d+]/g,"").replace(/^\+/,"");
  if(s.startsWith("0"))s="6"+s;
  else if(s.startsWith("1"))s="60"+s;
  return /^601\d{8,9}$/.test(s)?s:null;
}
function allowedOrigin(req:Request): string {
  const origin=req.headers.get("origin")||"";
  return ORIGINS.has(origin)?origin:"";
}
function response(req:Request,payload:unknown,status=200):Response {
  const origin=allowedOrigin(req);
  return new Response(JSON.stringify(payload),{
    status,headers:{"Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store","Vary":"Origin",
      ...(origin?{"Access-Control-Allow-Origin":origin}:{}),
      "X-Content-Type-Options":"nosniff"}
  });
}
function error(req:Request,message:string,status=400){return response(req,{ok:false,error:message},status)}
type Account={id:string;staff_code:string;display_name:string;role:string;active:boolean;pass_salt:string;pass_hash:string;failed_attempts:number;locked_until:string|null};
async function requireAccount(req:Request): Promise<Account|null> {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!/^[a-f0-9]{64}$/.test(token))return null;
  const hash=await sha256(token);
  const now=new Date().toISOString();
  const {data:session,error:se}=await db.from("lead_hub_sessions").select("account_id").eq("token_hash",hash).is("revoked_at",null).gt("expires_at",now).maybeSingle();
  if(se||!session)return null;
  const {data:account,error:ae}=await db.from("lead_hub_accounts").select("id,staff_code,display_name,role,active").eq("id",session.account_id).maybeSingle();
  if(ae||!account?.active)return null;
  return account as Account;
}
function profile(a:Account){return {id:a.id,staff_code:a.staff_code,display_name:a.display_name,role:a.role};}
async function listLeads(a:Account) {
  const found=[];
  for(let offset=0;offset<10000;offset+=500){
    let query=db.from("lead_hub_leads").select("id,customer_name,phone_e164,model,source,stage,notes,assigned_id,created_at,follow_up_at,last_opened_at,consent_confirmed,pm_confirmed_at,pm_confirmed_by").order("created_at",{ascending:false}).range(offset,offset+499);
    if(a.role!=="admin")query=query.eq("assigned_id",a.id);
    const {data,error}=await query;if(error)throw error;
    found.push(...data);if(data.length<500)break;
  }
  return found;
}
async function listAssignmentHistory() {
  // Basic shared-number data is team-visible. Working notes remain owner-only.
  const found=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from("lead_hub_assignment_history")
      .select("id,lead_id,assignee_name,assignee_code,event_type,assigned_at,recorded_at,lead:lead_hub_leads!lead_id(id,customer_name,phone_e164,model,consent_confirmed,assigned_id,stage)")
      .order("recorded_at",{ascending:false}).order("id",{ascending:false})
      .range(offset,offset+499);
    if(error)throw error;
    found.push(...data);if(data.length<500)break;
  }
  return found;
}
async function myConfirmedContacts(a:Account){
  const found=new Map();
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from("lead_hub_lead_activity")
      .select("lead_id,created_at,lead:lead_hub_leads!lead_id(id,customer_name,phone_e164,model,consent_confirmed,assigned_id,stage)")
      .eq("actor_id",a.id).eq("event_type","pm_confirmed")
      .order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
    if(error)throw error;
    for(const event of data||[]){if(event.lead&&!found.has(event.lead_id))found.set(event.lead_id,{...event.lead,pm_confirmed_at:event.created_at,shared_history:true})}
    if(data.length<500)break;
  }
  return [...found.values()];
}
async function handler(req:Request):Promise<Response> {
  const origin=req.headers.get("origin");
  if(origin&&!ORIGINS.has(origin))return error(req,"Origin tidak dibenarkan",403);
  if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:{
      ...(allowedOrigin(req)?{"Access-Control-Allow-Origin":allowedOrigin(req)}:{}),
      "Access-Control-Allow-Methods":"POST, GET, OPTIONS",
      "Access-Control-Allow-Headers":"authorization, content-type",
      "Access-Control-Max-Age":"3600","Vary":"Origin"
    }});
  }
  if(req.method==="GET")return response(req,{ok:true,service:"lead-hub",version:7});
  if(req.method!=="POST")return error(req,"Kaedah tidak dibenarkan",405);
  if(Number(req.headers.get("content-length")||0)>200000)return error(req,"Permintaan terlalu besar",413);
  let body:Record<string,any>;
  try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Invalid");}
  catch{return error(req,"Format permintaan tidak sah",400)}
  const action=String(body.action||"");
  if(action==="login"){
    const code=String(body.id||"").trim().toUpperCase().slice(0,40);
    const pass=String(body.passcode||"").trim().toUpperCase().slice(0,100);
    if(!code||!pass)return error(req,"Masukkan ID dan passcode",400);
    const {data:a,error:e}=await db.from("lead_hub_accounts").select("*").eq("staff_code",code).maybeSingle();
    if(e)throw e;
    const generic="ID atau passcode tidak tepat";
    if(!a||!a.active)return error(req,generic,401);
    if(a.locked_until&&Date.parse(a.locked_until)>Date.now())return error(req,"Terlalu banyak cubaan. Cuba semula selepas 15 minit.",429);
    const actual=await derive(pass,a.pass_salt);
    if(!eqConstant(actual,a.pass_hash)){
      const failures=Number(a.failed_attempts||0)+1;
      const locked=failures>=5?new Date(Date.now()+15*60*1000).toISOString():null;
      await db.from("lead_hub_accounts").update({failed_attempts:failures>=5?0:failures,locked_until:locked}).eq("id",a.id);
      return error(req,failures>=5?"Terlalu banyak cubaan. Akaun dikunci 15 minit.":generic,401);
    }
    const token=randomHex(32);
    const deviceToken=randomHex(32);
    const expires=new Date(Date.now()+30*24*60*60*1000).toISOString();
    const deviceExpires=new Date(Date.now()+365*24*60*60*1000).toISOString();
    const previousDevice=String(body.previous_device_token||"");
    if(/^[a-f0-9]{64}$/.test(previousDevice)){
      await db.from("lead_hub_trusted_devices").delete()
        .eq("token_hash",await sha256(previousDevice)).eq("account_id",a.id);
    }
    const {error:ie}=await db.from("lead_hub_sessions").insert({token_hash:await sha256(token),account_id:a.id,expires_at:expires});
    if(ie)throw ie;
    const {error:de}=await db.from("lead_hub_trusted_devices").insert({
      token_hash:await sha256(deviceToken),account_id:a.id,expires_at:deviceExpires
    });
    if(de)throw de;
    await db.from("lead_hub_accounts").update({failed_attempts:0,locked_until:null}).eq("id",a.id);
    return response(req,{ok:true,token,expires_at:expires,device_token:deviceToken,
      device_expires_at:deviceExpires,user:profile(a)});
  }
  if(action==="resume_device"){
    const deviceToken=String(body.device_token||"").trim();
    if(!/^[a-f0-9]{64}$/.test(deviceToken))return error(req,"Peranti belum dipercayai",401);
    const hash=await sha256(deviceToken),now=new Date().toISOString();
    const {data:device,error:de}=await db.from("lead_hub_trusted_devices")
      .select("account_id").eq("token_hash",hash).is("revoked_at",null)
      .gt("expires_at",now).maybeSingle();
    if(de||!device)return error(req,"Sesi peranti telah tamat atau dibatalkan",401);
    const {data:account,error:ae}=await db.from("lead_hub_accounts")
      .select("id,staff_code,display_name,role,active").eq("id",device.account_id).maybeSingle();
    if(ae||!account?.active)return error(req,"Akaun tidak aktif",401);
    const token=randomHex(32),expires=new Date(Date.now()+30*24*60*60*1000).toISOString();
    const deviceExpires=new Date(Date.now()+365*24*60*60*1000).toISOString();
    const {error:ie}=await db.from("lead_hub_sessions").insert({
      token_hash:await sha256(token),account_id:account.id,expires_at:expires
    });
    if(ie)throw ie;
    const {error:renewErr}=await db.from("lead_hub_trusted_devices")
      .update({last_used_at:now,expires_at:deviceExpires})
      .eq("token_hash",hash).eq("account_id",account.id).is("revoked_at",null);
    if(renewErr)throw renewErr;
    return response(req,{ok:true,token,expires_at:expires,user:profile(account)});
  }
  const a=await requireAccount(req);
  if(!a)return error(req,"Sesi tamat atau akses tidak dibenarkan. Sila log masuk semula.",401);
  if(action==="me")return response(req,{ok:true,user:profile(a)});
  if(action==="remember_device"){
    // Upgrade a valid already-authenticated browser without requesting a second passcode.
    const deviceToken=randomHex(32);
    const expires=new Date(Date.now()+365*24*60*60*1000).toISOString();
    const {error:de}=await db.from("lead_hub_trusted_devices").insert({
      token_hash:await sha256(deviceToken),account_id:a.id,expires_at:expires
    });
    if(de)throw de;
    return response(req,{ok:true,device_token:deviceToken,device_expires_at:expires});
  }
  if(action==="get_message_templates"){
    const {data,error}=await db.from("lead_hub_message_templates")
      .select("scope,account_id,template_key,body")
      .or("scope.eq.team,account_id.eq."+a.id);
    if(error)throw error;
    const team:Record<string,string>={};
    const personal:Record<string,string>={};
    for(const item of data||[]){
      if(item.scope==="team")team[item.template_key]=item.body;
      else if(item.scope==="personal"&&item.account_id===a.id)personal[item.template_key]=item.body;
    }
    return response(req,{ok:true,team,personal});
  }
  if(action==="save_message_template"||action==="reset_message_template"){
    const kind=String(body.template_key||"");
    const scope=String(body.scope||"personal");
    if(!["intro","follow","price"].includes(kind))return error(req,"Jenis skrip tidak sah");
    if(!["team","personal"].includes(scope))return error(req,"Skop tetapan tidak sah");
    if(scope==="team"&&a.role!=="admin")return error(req,"Hanya admin boleh ubah mesej untuk semua staf",403);
    const owner=scope==="team"?null:a.id;
    let query=db.from("lead_hub_message_templates")
      .select("id").eq("scope",scope).eq("template_key",kind);
    query=owner===null?query.is("account_id",null):query.eq("account_id",owner);
    const {data:existing,error:lookupError}=await query.maybeSingle();
    if(lookupError)throw lookupError;
    if(action==="reset_message_template"){
      if(existing){
        const {error}=await db.from("lead_hub_message_templates").delete().eq("id",existing.id);
        if(error)throw error;
      }
      return response(req,{ok:true,deleted:Boolean(existing)});
    }
    const message=String(body.message||"").replace(/\r\n/g,"\n").trim();
    if(!message||message.length>2500)return error(req,"Mesej mesti antara 1 dan 2,500 aksara",400);
    if(existing){
      const {error}=await db.from("lead_hub_message_templates")
        .update({body:message,updated_at:new Date().toISOString()}).eq("id",existing.id);
      if(error)throw error;
    }else{
      const {error}=await db.from("lead_hub_message_templates")
        .insert({scope,account_id:owner,template_key:kind,body:message});
      if(error)throw error;
    }
    return response(req,{ok:true});
  }
  if(action==="logout"){
    const token=String(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    await db.from("lead_hub_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",await sha256(token));
    const deviceToken=String(body.device_token||"");
    if(/^[a-f0-9]{64}$/.test(deviceToken)){
      await db.from("lead_hub_trusted_devices").update({revoked_at:new Date().toISOString()})
        .eq("token_hash",await sha256(deviceToken)).eq("account_id",a.id);
    }
    return response(req,{ok:true});
  }
  if(action==="list"){
    const leads=await listLeads(a);
    const assignment_history=await listAssignmentHistory();
    const my_pm=await myConfirmedContacts(a);
    const validIds=new Set(leads.map((x:any)=>x.id));
    let historyQuery=db.from("lead_hub_lead_activity")
      .select("id,lead_id,actor_id,event_type,stage_before,stage_after,created_at")
      .order("created_at",{ascending:false}).limit(250);
    if(a.role!=="admin")historyQuery=historyQuery.eq("actor_id",a.id);
    const {data:activity,error:activityErr}=await historyQuery;
    if(activityErr)throw activityErr;
    // Detailed PM activity stays scoped; the separate assignment history is shared.
    const history=(activity||[]).filter((ev:any)=>validIds.has(ev.lead_id)).slice(0,100);
    const {data:activity_log,error:logError}=await db.from("lead_hub_lead_activity")
      .select("id,lead_id,actor_id,actor_name,actor_code,event_type,stage_before,stage_after,created_at,actor:lead_hub_accounts!actor_id(display_name,staff_code),lead:lead_hub_leads!lead_id(id,customer_name,phone_e164,model)")
      .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(250);
    if(logError)throw logError;
    if(a.role!=="admin"){
      const {count,error}=await db.from("lead_hub_leads").select("id",{head:true,count:"exact"})
        .is("assigned_id",null).eq("stage","new").eq("consent_confirmed",true);
      if(error)throw error;
      return response(req,{ok:true,leads,history,assignment_history,my_pm,activity_log,staff:[profile(a)],available_count:count||0});
    }
    const {data:staff,error}=await db.from("lead_hub_accounts").select("id,staff_code,display_name,role,active,created_at").order("created_at",{ascending:true});
    if(error)throw error;
    return response(req,{ok:true,leads,history,assignment_history,my_pm,activity_log,staff,available_count:leads.filter(x=>!x.assigned_id&&x.stage==="new").length});
  }
  if(action==="open_shared"||action==="confirm_shared_pm"){
    const id=String(body.lead_id||""),operation=String(body.operation_id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id)||!/^[a-f0-9-]{36}$/i.test(operation))return error(req,"Rekod atau operasi tidak sah",400);
    const {data:lead,error:lookupError}=await db.from("lead_hub_leads").select("id,consent_confirmed").eq("id",id).maybeSingle();
    if(lookupError)throw lookupError;
    const {data:shared,error:shareError}=await db.from("lead_hub_assignment_history").select("id").eq("lead_id",id).limit(1);
    if(shareError)throw shareError;
    if(!lead||!shared?.length)return error(req,"Nombor tiada dalam Sejarah Nombor",403);
    if(!lead.consent_confirmed)return error(req,"Kebenaran pelanggan belum disahkan",400);
    const {data,error:contactError}=await db.rpc("lead_hub_contact_shared",{_actor:a.id,_lead:id,_event:action==="open_shared"?"whatsapp_opened":"pm_confirmed",_operation:operation});
    if(contactError)throw contactError;
    return response(req,{ok:true,...data});
  }
  if(action==="claim"){
    if(a.role!=="staff")return error(req,"Hanya staf boleh mengambil lead",403);
    const {data,error}=await db.rpc("lead_hub_claim_next",{_staff_id:a.id});
    if(error)return error(req,error.message,400);
    return response(req,{ok:true,lead_id:data||null});
  }
  if(action==="confirm_pm"){
    const id=String(body.lead_id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return error(req,"Rekod tidak sah",400);
    let query=db.from("lead_hub_leads")
      .select("id,stage,assigned_id,consent_confirmed,pm_confirmed_at").eq("id",id);
    if(a.role!=="admin")query=query.eq("assigned_id",a.id);
    const {data:lead,error:lookup}=await query.maybeSingle();
    if(lookup)throw lookup;
    if(!lead)return error(req,"Lead bukan milik anda",403);
    if(!lead.consent_confirmed)return error(req,"Kebenaran pelanggan belum disahkan",400);
    if(lead.pm_confirmed_at)return response(req,{ok:true,already_confirmed:true,pm_confirmed_at:lead.pm_confirmed_at});
    const at=new Date().toISOString();
    const stage=["new","claimed"].includes(lead.stage)?"contacted":lead.stage;
    let update=db.from("lead_hub_leads").update({
      pm_confirmed_at:at,pm_confirmed_by:a.id,stage,updated_at:at
    }).eq("id",id).eq("stage",lead.stage).is("pm_confirmed_at",null);
    if(a.role!=="admin")update=update.eq("assigned_id",a.id);
    const {data:updated,error:ue}=await update.select("id,pm_confirmed_at").maybeSingle();
    if(ue)throw ue;
    if(!updated)return error(req,"Status telah berubah. Refresh dan cuba semula.",409);
    const {error:activityError}=await db.from("lead_hub_lead_activity").insert({
      lead_id:id,actor_id:a.id,event_type:"pm_confirmed",stage_before:lead.stage,stage_after:stage
    });
    if(activityError)console.error("PM confirmation audit failed:",activityError.message);
    return response(req,{ok:true,pm_confirmed_at:at});
  }
  if(action==="save_lead"){
    const id=String(body.lead_id||"");
    const stage=String(body.stage||"");
    if(!/^[a-f0-9-]{36}$/i.test(id)||!allowedStages.has(stage))return error(req,"Rekod atau status tidak sah");
    if(a.role!=="admin"&&stage==="new")return error(req,"Hanya admin boleh menetapkan lead baharu",403);
    const notes=String(body.notes||"").slice(0,3000);
    const follow=body.follow_up_at?String(body.follow_up_at):null;
    if(follow&&!/^\d{4}-\d{2}-\d{2}$/.test(follow))return error(req,"Tarikh susulan tidak sah");
    const {error:saveError}=await db.rpc("lead_hub_customer_save_whatsapp",{_actor:a.id,_lead:id,_stage:stage,_notes:notes,_follow:follow});
    if(saveError){if(saveError.code==="42501")return error(req,"Lead bukan milik anda",403);throw saveError}
    return response(req,{ok:true});
  }
  if(action==="opened"){
    const id=String(body.lead_id||"");
    if(!/^[a-f0-9-]{36}$/i.test(id))return error(req,"Rekod tidak sah");
    let q=db.from("lead_hub_leads").update({last_opened_at:new Date().toISOString()}).eq("id",id);
    if(a.role!=="admin")q=q.eq("assigned_id",a.id);
    const {data,error:openedError}=await q.select("id").maybeSingle();
    if(openedError)throw openedError;
    if(!data)return error(req,"Lead bukan milik anda",403);
    const {error:auditError}=await db.from("lead_hub_lead_activity").insert({
      lead_id:id,actor_id:a.id,event_type:"whatsapp_opened"
    });
    if(auditError)console.error("WhatsApp opened audit failed:",auditError.message);
    // Opening a draft is not proof that WhatsApp message was delivered.
    return response(req,{ok:true});
  }
  if(a.role!=="admin")return error(req,"Hanya admin dibenarkan",403);
  if(action==="change_my_credentials"||action==="change_my_passcode"){
    // Existing administrator proves knowledge of the current passcode before changing identity.
    // Both ID and passcode are optional individually, but at least one must change.
    const old=String(body.old_passcode||"").trim().toUpperCase();
    const newId=action==="change_my_passcode"?a.staff_code:
      String(body.new_staff_id||a.staff_code).trim().toUpperCase();
    const fresh=String(body.new_passcode||"").trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9-]{3,19}$/.test(newId))
      return error(req,"ID Admin mesti 4 hingga 20 aksara, bermula dengan huruf, hanya huruf/nombor/sengkang",400);
    if(fresh&&(!/^[A-Z0-9-]{10,32}$/.test(fresh)||!/[A-Z]/.test(fresh)||!/[0-9]/.test(fresh)))
      return error(req,"Passcode baharu mesti 10–32 aksara, termasuk huruf dan nombor",400);
    if(newId===a.staff_code&&!fresh)
      return error(req,"Ubah ID atau isi passcode baharu untuk menyimpan",400);
    if(fresh===old)
      return error(req,"Passcode baharu mesti berbeza daripada passcode lama",400);
    if(!old)return error(req,"Masukkan passcode semasa untuk pengesahan",400);
    const {data:mine,error:me}=await db.from("lead_hub_accounts")
      .select("staff_code,pass_salt,pass_hash").eq("id",a.id).eq("role","admin").single();
    if(me||!mine)throw me||new Error("Akaun admin tidak ditemukan");
    if(!eqConstant(await derive(old,mine.pass_salt),mine.pass_hash))
      return error(req,"Passcode semasa tidak tepat",403);
    const changes:Record<string,any>={failed_attempts:0,locked_until:null};
    if(newId!==mine.staff_code)changes.staff_code=newId;
    if(fresh){
      const salt=randomHex(16);
      changes.pass_salt=salt;
      changes.pass_hash=await derive(fresh,salt);
    }
    const {data:updated,error:pe}=await db.from("lead_hub_accounts")
      .update(changes).eq("id",a.id).eq("pass_hash",mine.pass_hash)
      .select("staff_code").maybeSingle();
    if(pe?.code==="23505")return error(req,"ID Admin ini sudah digunakan. Pilih ID lain.",409);
    if(pe)throw pe;
    if(!updated)return error(req,"Butiran akaun telah berubah. Refresh dan cuba lagi.",409);
    // Revoke sessions on other devices but preserve the active verified session.
    const currentToken=String(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    const {error:se}=await db.from("lead_hub_sessions")
      .delete().eq("account_id",a.id).neq("token_hash",await sha256(currentToken));
    if(se)console.error("Other session revocation:",se.message);
    // Password/identity changes revoke remembered browsers across all devices.
    // This browser receives a fresh trusted credential only after current-pass verification.
    const {error:revoke}=await db.from("lead_hub_trusted_devices").delete().eq("account_id",a.id);
    if(revoke)throw revoke;
    const newDeviceToken=randomHex(32);
    const {error:trustErr}=await db.from("lead_hub_trusted_devices").insert({
      token_hash:await sha256(newDeviceToken),account_id:a.id,
      expires_at:new Date(Date.now()+365*24*60*60*1000).toISOString()
    });
    if(trustErr)throw trustErr;
    return response(req,{ok:true,staff_code:updated.staff_code,
      id_changed:updated.staff_code!==mine.staff_code,passcode_changed:Boolean(fresh),
      device_token:newDeviceToken});
  }
  if(action==="create_staff"){
    const name=String(body.name||"").trim().slice(0,100);
    if(name.length<2)return error(req,"Masukkan nama staf",400);
    const customId=String(body.custom_staff_id||"").trim().toUpperCase();
    if(customId&&!/^[A-Z][A-Z0-9-]{3,19}$/.test(customId))return error(req,"ID pilihan mesti 4–20 aksara huruf, nombor atau sengkang",400);
    if(customId==="FARIS-ADMIN")return error(req,"ID ini sudah digunakan",409);
    const customPass=String(body.custom_passcode||"").trim().toUpperCase();
    if(customPass&&(!/^[A-Z0-9-]{10,32}$/.test(customPass)||!/[A-Z]/.test(customPass)||!/[0-9]/.test(customPass)))
      return error(req,"Passcode pilihan mesti 10–32 aksara, dengan huruf dan nombor",400);
    const passcode=customPass||randomCode(5)+"-"+randomCode(5);
    const salt=randomHex(16), hash=await derive(passcode,salt);
    for(let attempts=0;attempts<4;attempts++){
      const staffId=customId||("STF-"+randomCode(7));
      const {data,error}=await db.from("lead_hub_accounts").insert({staff_code:staffId,display_name:name,role:"staff",pass_salt:salt,pass_hash:hash}).select("id").single();
      if(!error)return response(req,{ok:true,staff:{id:data.id,staff_code:staffId,display_name:name,role:"staff",active:true},passcode});
      if(error.code!=="23505")throw error;
      if(customId)return error(req,"ID pilihan sudah wujud. Pilih ID lain.",409);
    }
    return error(req,"ID baharu tidak dapat dijana. Cuba lagi.",500);
  }
  if(action==="reset_passcode"){
    const id=String(body.staff_id||"");
    if(id===a.id)return error(req,"Admin tidak boleh reset diri sendiri melalui panel staf",403);
    const {data:target}=await db.from("lead_hub_accounts").select("id,role").eq("id",id).maybeSingle();
    if(!target||target.role!=="staff")return error(req,"Staf tidak wujud",404);
    const passcode=randomCode(5)+"-"+randomCode(5),salt=randomHex(16);
    const {error}=await db.from("lead_hub_accounts").update({pass_salt:salt,pass_hash:await derive(passcode,salt),failed_attempts:0,locked_until:null}).eq("id",id);
    if(error)throw error;
    await db.from("lead_hub_sessions").delete().eq("account_id",id);
    await db.from("lead_hub_trusted_devices").delete().eq("account_id",id);
    return response(req,{ok:true,passcode});
  }
  if(action==="set_staff_active"){
    const id=String(body.staff_id||"");
    const active=body.active===true;
    if(id===a.id)return error(req,"Tidak boleh ubah akaun sendiri",403);
    const {data,error}=await db.from("lead_hub_accounts").update({active}).eq("id",id).eq("role","staff").select("id");
    if(error)throw error;if(!data?.length)return error(req,"Staf tidak wujud",404);
    if(!active){
      await db.from("lead_hub_sessions").delete().eq("account_id",id);
      await db.from("lead_hub_trusted_devices").delete().eq("account_id",id);
    }
    return response(req,{ok:true});
  }
  if(action==="import"){
    if(!body.consent_confirmed)return error(req,"Sahkan nombor boleh dihubungi",400);
    if(!Array.isArray(body.leads)||!body.leads.length||body.leads.length>100)return error(req,"Senarai mesti 1 hingga 100 baris",400);
    const unique=new Map<string,any>();
    for(const row of body.leads){
      const phone=normalizePhone(row.phone_e164||row.phone);
      if(!phone)continue;
      unique.set(phone,{
        phone_e164:phone,customer_name:String(row.customer_name||row.name||"Pelanggan").trim().slice(0,120)||"Pelanggan",
        model:String(row.model||"Belum pasti").trim().slice(0,100)||"Belum pasti",
        source:String(row.source||"Import").slice(0,80),consent_confirmed:true,created_by:a.id
      });
    }
    if(!unique.size)return error(req,"Nombor tidak sah",400);
    // Auto-agih nombor baharu kepada staf aktif. Lead pendua tidak diusik.
    // Jika tiada staf aktif, nombor masuk barisan yang boleh diambil manual.
    const autoAssign=body.auto_assign!==false;
    const agents: Array<{id:string;load:number}> = [];
    if(autoAssign){
      const {data:active,error:ae}=await db.from("lead_hub_accounts")
        .select("id").eq("role","staff").eq("active",true).order("created_at",{ascending:true});
      if(ae)throw ae;
      for(const agent of active||[]){
        const {count,error:ce}=await db.from("lead_hub_leads")
          .select("id",{count:"exact",head:true}).eq("assigned_id",agent.id)
          .in("stage",["new","claimed","contacted","follow_up","interested"]);
        if(ce)throw ce;
        agents.push({id:agent.id,load:count||0});
      }
    }
    const records=[...unique.values()].map(row=>{
      if(!agents.length)return row;
      agents.sort((x,y)=>x.load-y.load||x.id.localeCompare(y.id));
      const chosen=agents[0];chosen.load++;
      return {...row,assigned_id:chosen.id,stage:"new"};
    });
    const {data,error}=await db.from("lead_hub_leads")
      .upsert(records,{onConflict:"phone_e164",ignoreDuplicates:true})
      .select("id,assigned_id");
    if(error)throw error;
    const inserted=data?.length||0;
    const auto_assigned=(data||[]).filter(x=>!!x.assigned_id).length;
    return response(req,{ok:true,inserted,duplicates:unique.size-inserted,
      invalid:body.leads.length-unique.size,auto_assigned,pending:inserted-auto_assigned});
  }
  if(action==="assign"){
    const leadId=String(body.lead_id||"");
    const staffId=body.staff_id?String(body.staff_id):null;
    if(!/^[a-f0-9-]{36}$/i.test(leadId))return error(req,"Lead tidak sah");
    if(staffId){
      const {data:t}=await db.from("lead_hub_accounts").select("id").eq("id",staffId).eq("active",true).eq("role","staff").maybeSingle();
      if(!t)return error(req,"Staf tidak aktif",400);
    }
    const {data:lead}=await db.from("lead_hub_leads").select("stage").eq("id",leadId).maybeSingle();
    if(!lead)return error(req,"Lead tidak wujud",404);
    const stage=staffId?(["new","claimed"].includes(lead.stage)?"claimed":lead.stage):"new";
    const {error}=await db.from("lead_hub_leads").update({assigned_id:staffId,stage,updated_at:new Date().toISOString()}).eq("id",leadId);
    if(error)throw error;
    return response(req,{ok:true});
  }
  return error(req,"Tindakan tidak dikenali",404);
}
Deno.serve(async(req)=>{
 try{return await handler(req);}
 catch(e){console.error("lead-hub:",e);return error(req,"Sistem mengalami gangguan. Cuba semula.",500)}
});
