(() => {
'use strict';
const params = new URLSearchParams(location.search);
if (params.get('origin') !== 'staff') return;
const tool = params.get('tool');
if (!['COMPILER','VSO','APPLICATION'].includes(tool)) return;
const api = window.FARIS_CUSTOMER_WORKFLOW;
const $ = id => document.getElementById(id);
const section = document.createElement('section');
section.id = 'staffContextBanner';
section.className = 'staff-workflow-banner';
section.innerHTML = '<strong id="staffWorkflowName">Profil pelanggan</strong>'+
 '<form id="staffWorkflowLookup"><label>Nombor telefon pelanggan <input id="staffWorkflowPhone" inputmode="tel" required placeholder="Contoh 0123456789"></label> <button type="submit">Pautkan profil</button></form>'+
 '<p id="staffWorkflowStatus" role="status" aria-live="polite"></p>'+
 '<div class="staff-workflow-actions"><a id="staffWorkflowBack" href="/staff#customers">Kembali ke Lead Hub</a> <button id="staffWorkflowFiles" type="button" hidden>Buka dokumen pelanggan</button> <button id="staffWorkflowRetry" type="button" hidden>Cuba simpan semula</button></div>';
document.body.prepend(section);
const {vehicleVariants:lookups,match:findVariant,customerQuote}=window.VSO_VARIANTS;
const quoteFields = document.createElement('div');
quoteFields.className = 'vsoModeGrid';
quoteFields.innerHTML = '<label class="vsoField"><span>Deposit (RM)</span><input id="vsoDeposit" type="number" min="0" step="0.01"></label>'+
 '<label class="vsoField"><span>Rebat (RM)</span><input id="vsoRebate" type="number" min="0" step="0.01"></label>'+
 '<label class="vsoField"><span>Insurans (RM)</span><input id="vsoInsurance" type="number" min="0" step="0.01"></label>';
$('vsoLoan').closest('.vsoField').parentElement.insertAdjacentElement('afterend',quoteFields);
const ids = {
 customerName:'customer_name',vsoCustomer:'customer_name',vsoNric:'applicant_nric',
 vsoAddress:'applicant_permanent_address',vsoEmail:'applicant_email',vsoYear:'vehicle_year',
 vsoColor:'colour',vsoLoan:'loan_amount',vsoPeriod:'loan_term',vsoAccessoriesMode:'vso_accessories',
 vsoDeposit:'deposit',vsoRebate:'rebate_amount',vsoInsurance:'insurance_amount',
 application_applicant_name:'customer_name',application_financing_color:'colour',application_financing_term:'loan_term'
};
const phoneFields = ['customerPhone','vsoPhone','application_applicant_phone'];
for (const field of window.FARIS_APPLICATION_CORE.fields) {
 if (!['applicant_phone','financing_model'].includes(field.id)) ids['application_'+field.id] ??= field.id;
}
let flow, syncing = false, lookupGeneration = 0, loadingProfile = false;
const status = (message, error = false) => {
 $('staffWorkflowStatus').textContent = message;
 $('staffWorkflowStatus').classList.toggle('workflow-error',error);
 $('staffWorkflowRetry').hidden = !error || !flow?.dirty;
};
function setField(id, value, type = 'input') {
 const field = $(id);
 if (!field) return;
 if (field.type === 'checkbox') {
  if (field.checked === (value==='ACCESSORIES')) return;
  field.checked = value==='ACCESSORIES';
 } else {
  const next = value == null ? '' : String(value);
  if (field.value === next) return;
  field.value = next;
  if(id==='vsoInsurance')window.FARIS_VSO_GENERATOR?.refresh();
 }
 field.dispatchEvent(new Event(type,{bubbles:true}));
}
function render(values) {
 syncing = true;
 try {
  const variant = findVariant(values.model, values.variant);
  const model = variant ? variant.family+' '+variant.grade : [values.model,values.variant].filter(Boolean).join(' ');
  const selection = $('vsoModel');
  if (selection && !selection.querySelector('option[value=""]')) selection.prepend(new Option('Pilih model & varian',''));
  if (selection && selection.value !== (variant?.id ?? '')) setField('vsoModel',variant?.id,'change');
  for (const [id,key] of Object.entries(ids)) {
   let value = values[key];
   if (id === 'vsoAddress') value ||= values.applicant_current_address;
   if (id === 'vsoYear') value ||= variant?.year || '';
   if (id === 'vsoInsurance' && value == null) value = variant?.fees.insurance;
   if (id === 'vsoPeriod') {
    const match = String(value ?? '').match(/^(\d+)\s*(?:tahun)?$/i);
    value = match?.[1] ?? '';
   }
   if (id === 'application_financing_term' && /^\d+$/.test(String(value ?? ''))) value += ' tahun';
   if (id==='vsoPeriod' && value && !$(id).querySelector('option[value="'+value+'"]')) $(id).add(new Option(value+' tahun',value));
   setField(id,value);
  }
  for (const id of phoneFields) {
   setField(id,values.phone ? '0'+values.phone.slice(2) : '');
   if ($(id)) $(id).readOnly = true;
  }
  setField('application_financing_model',model);
  window.VSO_CENTER.refresh();
  window.FARIS_COMPILER?.customerNames?.(values);
  $('staffWorkflowName').textContent = values.customer_name+' · +'+values.phone;
  $('staffWorkflowFiles').hidden = false;
 } finally { syncing = false; }
}
function modelPatch(label, fromVso) {
 const option = fromVso ? lookups.find(v=>v.id===label) : findVariant(label);
 if (!option) return fromVso ? {} : {model:label,variant:''};
 return {model:option.family,variant:option.grade,vehicle_year:String(option.year)};
}
function accept(patch, recalculate = false) {
 if (!flow || syncing || !Object.keys(patch).length) return;
 if(recalculate) customerQuote(flow.data,patch);
 flow.queue(patch);
}
function handleField(event) {
 if (!flow || syncing) return;
 const {id, value, checked} = event.target;
 if (id === 'vsoModel') {
  if (event.type==='change') {
   const patch = modelPatch(value,true);
   if (Object.keys(patch).length) {
    accept(patch,true);
    render(flow.data);
   }
  }
  return;
 }
 if (id === 'application_financing_model') {
  if (event.type==='change') accept(modelPatch(value.trim(),false),true);
  return;
 }
 if (id === 'partyName') {
  const key = window.FARIS_COMPILER?.currentNameKey?.();
  if (key) accept({[key]:value});
  return;
 }
 const key = ids[id];
 if (!key) return;
 if (['vsoDeposit','vsoRebate','vsoInsurance','vsoLoan'].includes(id)) {
  if (value && (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value)>100000000)) return;
  if (event.type==='change') {
   accept({[key]:value===''?null:Number(value)},true);
   render(flow.data);
   if(id==='vsoInsurance')window.FARIS_VSO_GENERATOR?.refresh();
  } else if (id==='vsoLoan') {
   accept({[key]:value===''?null:Number(value)},true);
  }
  return;
 }
 let text = value;
 if (id==='vsoAccessoriesMode') text=checked?'ACCESSORIES':'NET';
 if (key==='loan_term') text = value.trim().replace(/^(\d+)\s+tahun$/i,'$1');
 accept({[key]:text});
}
document.addEventListener('input',handleField);
document.addEventListener('change',handleField);
async function start(selector, initial = {}) {
 const sequence = ++lookupGeneration;
 loadingProfile = true;
 status('Memuatkan profil…');
 let response;
 try { response = await api.fetchProfile(selector); }
 finally { if(sequence===lookupGeneration)loadingProfile=false; }
 if (sequence !== lookupGeneration) return;
 const {customer,account_id:accountId} = response;
 flow?.close();
 flow = api.create({customer,accountId,render,notify:status});
 render(flow.data,customer);
 const safeDraft = Object.fromEntries(Object.entries(initial).filter(([key,value])=>value && (key==='customer_name' ? !flow.data[key]||flow.data[key]==='Pelanggan' : flow.data[key]==null||flow.data[key]==='')));
 if (Object.keys(safeDraft).length) {
  accept(safeDraft,Object.hasOwn(safeDraft,'model'));
  render(flow.data);
 }
 $('staffWorkflowLookup').hidden = true;
 $('staffWorkflowBack').href = '/staff?customer='+encodeURIComponent(flow.id)+'#customers';
 params.set('customer',flow.id);
 history.replaceState(null,'','/?'+params+location.hash);
 status('Profil dipautkan. Maklumat disimpan automatik.');
 queueMicrotask(()=>window.FARIS_WORKSPACE_PROFILE?.trackInputs(window.FARIS_COMPILER?.pendingFiles?.()||[]).catch(()=>{}));
}
function linkProfile(selector,draft) {
 // The lookup must settle before document tools can use the optional profile.
 ready=start(selector,draft).catch(error=>{
  $('staffWorkflowLookup').hidden=false;
  status(error.status===403
   ? 'Profil belum dipautkan. Dokumen masih boleh dijana. Untuk simpan ke profil, daftar pelanggan baharu atau semak agihan pelanggan dengan admin.'
   : 'Carian profil gagal. '+error.message,true);
 });
}
$('staffWorkflowLookup').addEventListener('submit',e => {
 e.preventDefault();
 if(loadingProfile)return;
 const activeTool=document.querySelector('[data-main][aria-selected="true"]')?.dataset.main||tool;
 const phone = api.normalizePhone($('staffWorkflowPhone').value);
 if (!phone) return status('Semak nombor telefon pelanggan.',true);
 const activePhone=activeTool==='APPLICATION'?'application_applicant_phone':activeTool==='VSO'?'vsoPhone':'customerPhone';
 if ($(activePhone)?.value && api.normalizePhone($(activePhone).value)!==phone) {
  return status('Nombor dalam borang berbeza daripada nombor yang hendak dipautkan.',true);
 }
 const draft=Object.fromEntries(Object.entries(ids).filter(([id])=>activeTool==='APPLICATION'?id.startsWith('application_'):activeTool==='VSO'?id.startsWith('vso'):id==='customerName').map(([id,key])=>[key,$(id)?.value]));
 for (const key of ['vehicle_year','loan_term','vso_accessories','loan_amount','colour','deposit','rebate_amount','insurance_amount']) {
  if (activeTool==='VSO' && !document.getElementById(Object.keys(ids).find(id=>id.startsWith('vso')&&ids[id]===key))?.dataset.workflowEdited) delete draft[key];
 }
 const model=activeTool==='APPLICATION'?$('application_financing_model').value:'';
 if(activeTool==='VSO'&&$('vsoModel').dataset.workflowEdited)Object.assign(draft,modelPatch($('vsoModel').value,true));
 if(model) Object.assign(draft,modelPatch(model,false));
 linkProfile({phone},draft);
});
document.addEventListener('input',e=>{if(!syncing&&(e.target.id in ids||e.target.id==='vsoModel'))e.target.dataset.workflowEdited='1'});
document.addEventListener('change',e=>{
 if(!syncing&&!loadingProfile&&!flow&&phoneFields.includes(e.target.id)&&api.normalizePhone(e.target.value)){
  $('staffWorkflowPhone').value=e.target.value;
  $('staffWorkflowLookup').requestSubmit();
 }
});
$('staffWorkflowBack').addEventListener('click',async e=>{
 if(!flow?.dirty&&!window.FARIS_WORKSPACE_PROFILE.uploading)return;
 e.preventDefault();
 try{await window.FARIS_WORKSPACE_PROFILE.flush(); location.assign(e.currentTarget?.href || $('staffWorkflowBack').href);}
 catch{}
});
$('staffWorkflowRetry').addEventListener('click',()=>flow?.flush().catch(()=>{}));
$('staffWorkflowFiles').addEventListener('click',async ()=>{
 try{await window.FARIS_WORKSPACE_PROFILE.flush(); location.assign('/staff?customer='+encodeURIComponent(flow.id)+'&customer_tab=documents#customers');}
 catch{}
});
window.addEventListener('focus',()=>flow?.refresh());
window.addEventListener('storage',e=>{
 if(e.key==='faris_lead_hub_session_v2'&&!e.newValue&&flow){
  flow.close();
  location.replace('/staff#customers');
 }
});
const uploads = new Set();
async function saveFile(file,party,category){
 await ready;
 if(!flow)return null;
 const target=flow;
 const promise=target.upload(file,party,category);
 uploads.add(promise);
 try{
  const reply=await promise;
  if(target===flow)status('Disimpan dalam Dokumen Pelanggan · '+file.name);
  return reply;
 }catch(error){status('Simpanan '+file.name+' gagal. '+error.message,true);throw error;}
 finally{uploads.delete(promise);}
}
window.FARIS_WORKSPACE_PROFILE = {
 get active(){return !!flow;},
 get loading(){return loadingProfile;},
 get uploading(){return !!uploads.size;},
 get id(){return flow?.id;},
 async ensureFilesBelong(entries){
  await ready;
  if(flow&&entries.some(({metadata})=>metadata.customer_id!==flow.id))throw Error('Fail ini tidak dipautkan kepada profil yang sedang dibuka.');
 },
 async flush(){await ready;await flow?.flush();await Promise.all([...uploads]);},
 async saveFile(file,party,category){return saveFile(file,party,category);},
 async trackInputs(items){
  await ready;
  if (!flow) {if(items.some(item=>!item.profileFileId))status('Pautkan nombor pelanggan untuk simpan fail ini dalam profil.');return;}
  const results=await Promise.allSettled(items.map(async item=>{
   if(item.profileFileId){
    if(item.profileCustomerId!==flow.id)throw Error('Pautkan fail sedia ada melalui Dokumen Pelanggan sebelum menggabungkannya.');
    return;
   }
   if(!item.profileUpload)item.profileUpload=saveFile(item.file,item.party,item.manualCategory?item.category:'OTHER');
   try{
    const record=(await item.profileUpload)?.files?.[0];
    if(record){item.profileFileId=record.id;item.profileCustomerId=record.customer_id;}
   }
   finally{item.profileUpload=null;}
  }));
  const error=results.find(result=>result.status==='rejected');
  if(error)throw error.reason;
 },
 applyApplication(fields) {
  const patch={};
  for(const [key,value] of Object.entries(fields)) {
   if(!value||key==='applicant_phone')continue;
   if(key==='financing_model')Object.assign(patch,modelPatch(value,false));
   else patch[ids['application_'+key]||key] = key==='financing_term' ? value.replace(/^(\d+)\s+tahun$/i,'$1') : value;
  }
  accept(patch,Object.hasOwn(patch,'model'));
  if(flow)render(flow.data);
 },
 samePhone(phone){
  if(!flow||!phone)return true;
  const {phone:primary,additional_phones:additional}=flow.data,number=api.normalizePhone(phone);
  return number===primary||additional.includes(number);
 }
};
window.addEventListener('beforeunload',e=>{if(uploads.size){e.preventDefault();e.returnValue='';}});
let initialId=params.get('customer');
try {
 const raw=sessionStorage.getItem('faris_lead_handoff_v1');
 sessionStorage.removeItem('faris_lead_handoff_v1');
 if(raw){const data=JSON.parse(raw);if(!initialId&&Date.now()-data.created_at<600000)initialId=data.lead_id;}
}catch{}
let ready=Promise.resolve();
if(initialId){
 $('staffWorkflowLookup').hidden=true;
 linkProfile({lead_id:initialId});
}
if(tool==='APPLICATION')window.VSO_CENTER.openApplication();
else if(tool==='COMPILER')window.VSO_CENTER.openCompiler();
else window.VSO_CENTER.openVso();
})();
