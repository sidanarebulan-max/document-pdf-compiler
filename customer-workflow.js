(() => {
'use strict';
const sessionKey = 'faris_lead_hub_session_v2';
const endpoint = 'https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/lead-hub-customers';
const registry = new Set();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('faris-customer-workflow') : null;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const moneyKeys = new Set(['selling_price','deposit','loan_amount','otr_price','rebate_amount','insurance_amount']);
function normalizePhone(value) {
 let phone = String(value ?? '').replace(/[^0-9]/g, '');
 if (phone.startsWith('0')) phone = '6' + phone;
 else if (phone.startsWith('1')) phone = '60' + phone;
 return /^601[0-9]{8,9}$/.test(phone) ? phone : '';
}
function values(customer) {
 const {lead, profile} = customer;
 return {...profile.shared_fields, customer_name:lead.customer_name, phone:lead.phone_e164, additional_phones:customer.additional_phones||[],
  model:lead.model, variant:profile.variant, colour:profile.colour,
  selling_price:profile.selling_price, deposit:profile.deposit, loan_amount:profile.loan_amount};
}
async function fetchProfile(payload, retry = true) {
 const token = localStorage.getItem(sessionKey);
 if (!token) throw Error('Log masuk ke Lead Hub dahulu.');
 const response = await fetch(endpoint, {
  method:'POST', cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({action:'shared_profile',...payload})
 });
 if (response.status === 401 && retry && localStorage.getItem(sessionKey) === token) {
  await window.FARIS_INBOX_CLIENT.renewSession();
  return fetchProfile(payload, false);
 }
 const data = await response.json().catch(() => null);
 if (!response.ok || !data?.ok) {
  const error = Error(data?.error || 'Profil pelanggan tidak dapat dihubungi.');
  error.status = response.status;
  throw error;
 }
 return data;
}
function create({customer, accountId, render, notify}) {
 let snapshot = values(customer), pending = new Map(), inFlight, timer, closed = false;
 let refreshing = false, refreshRequested = false, writeVersion = 0;
 const id = customer.lead.id;
 const belongs = file => file.customer_id === id;
 const report = (message, error = false) => { if (!closed) notify(message, error); };
 function apply(customer) {
  snapshot = values(customer);
  render({...snapshot,...Object.fromEntries([...pending].map(([key, entry])=>[key,entry.value]))}, customer);
 }
 function queue(fields) {
  if (closed) return;
  for (const [key, raw] of Object.entries(fields)) {
   const text = String(raw ?? '').trim();
   if (key === 'customer_name' && !text) continue;
   if (moneyKeys.has(key) && text && (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text)>100000000)) {
    report('Masukkan jumlah RM yang sah.',true); continue;
   }
   const value = moneyKeys.has(key) ? (text ? Number(text) : null) : text;
   const before = pending.get(key)?.before ?? snapshot[key] ?? null;
   if (!inFlight && (value === before || (value === '' && before === null))) pending.delete(key);
   else pending.set(key, {value,before});
  }
  clearTimeout(timer);
  if (pending.size) {
   report('Menyimpan maklumat pelanggan…');
   timer = setTimeout(() => flush().catch(() => {}), 650);
  } else {
   report('Profil dipautkan.');
   if(refreshRequested)void refresh();
  }
 }
 async function flush() {
  clearTimeout(timer);
  if (closed) throw Error('Buka semula profil pelanggan.');
  while (inFlight) await inFlight;
  if (!pending.size) return;
  const batch = new Map(pending);
  writeVersion++;
  inFlight = (async () => {
   try {
    const {customer} = await fetchProfile({lead_id:id,account_id:accountId,
     changes:Object.fromEntries([...batch].map(([key, entry])=>[key,entry.value])),
     previous:Object.fromEntries([...batch].map(([key, entry])=>[key,entry.before]))
    });
    const current = values(customer);
    for (const [key, entry] of batch) {
     if (pending.get(key) === entry) pending.delete(key);
     else if (pending.has(key)) pending.get(key).before = current[key] ?? null;
    }
    if (closed) return;
    apply(customer);
    channel?.postMessage(id);
    report('Maklumat pelanggan disimpan.');
   } catch(error) {
    report(error.status === 409 ? 'Medan ini berubah di tempat lain. Muat semula profil untuk semak nilai terkini.' : error.message,true);
    throw error;
   } finally { inFlight = null; }
  })();
  await inFlight;
  if (pending.size) return flush();
  if(refreshRequested)void refresh();
 }
 async function refresh() {
  if(closed)return;
  refreshRequested=true;
  if(refreshing||pending.size||inFlight)return;
  refreshing=true;
  try {
   while(refreshRequested&&!closed&&!pending.size&&!inFlight){
    refreshRequested=false;
    const readVersion=writeVersion;
    try{
     const {customer}=await fetchProfile({lead_id:id,account_id:accountId});
     if(closed)return;
     // A reply to an older read must never replace the snapshot from a newer write.
     if(readVersion!==writeVersion||pending.size||inFlight)refreshRequested=true;
     else apply(customer);
    }catch(error){report(error.message,true);}
   }
  }finally{refreshing=false;}
 }
 const instance = {
  id, accountId, belongs, queue, flush, refresh,
  get data(){ return {...snapshot,...Object.fromEntries([...pending].map(([key,entry])=>[key,entry.value]))}; },
  get dirty(){ return !!(pending.size || inFlight); },
  async upload(file, party='HIRER', category='OTHER') {
   await flush();
   if(closed)throw Error('Buka semula profil pelanggan.');
   const result = await window.FARIS_INBOX_CLIENT.upload(file,{customer_id:id,account_id:accountId,party,category});
   if (!result.files?.length || result.files.some(f=>f.customer_id!==id)) throw Error('Fail belum dipautkan ke profil. Cuba semula.');
   channel?.postMessage(id);
   return result;
  },
  close(){ closed=true; clearTimeout(timer); pending.clear(); registry.delete(instance); }
 };
 registry.add(instance);
 return instance;
}
channel?.addEventListener('message', e => { for (const item of registry) if (item.id === e.data) item.refresh(); });
window.addEventListener('beforeunload', e => {
 if ([...registry].some(item=>item.dirty)) { e.preventDefault(); e.returnValue=''; }
});
window.FARIS_CUSTOMER_WORKFLOW = {
 create, values, normalizePhone, fetchProfile,
 notify(id){channel?.postMessage(id);},
 url(tool, id, suffix='') {
  const customer = idPattern.test(id ?? '') ? '&customer='+encodeURIComponent(id) : '';
  return '/?origin=staff&tool='+tool+customer+suffix;
 }
};
})();
