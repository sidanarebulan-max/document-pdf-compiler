(()=>{
'use strict';
const PROJECT_URL='https://qagsczjxzshjxmmxvkbq.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_PZQ34JHx40s6L_phboswUg_EVGvHchz';
const $=id=>document.getElementById(id);
const STATUSES={new:'Belum diambil',claimed:'Sudah diambil',contacted:'Dihubungi',follow_up:'Follow-up',interested:'Berminat',booked:'Booking',not_interested:'Tidak berminat'};
const MODELS=['Belum pasti','Proton e.MAS 7 PHEV','Proton e.MAS 7 EV','Proton e.MAS 5','Proton Saga','Proton X50','Proton X70','Proton S70','Proton X90'];
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalPhone=value=>{
 let p=String(value??'').trim().replace(/[^\d+]/g,'').replace(/^\+/,'');
 if(p.startsWith('0'))p='6'+p;
 else if(p.startsWith('1'))p='60'+p;
 return /^601\d{8,9}$/.test(p)?p:null;
};
let sb=null,currentUser=null,profile=null,leads=[],staffs=[],busy=false;
function showNotice(id,message,error=false){
 const el=$(id);el.textContent=message;el.classList.remove('hide');el.classList.toggle('error',error);
}
function setBusy(el,value){if(el)el.disabled=value}
function authView(){ $('appSection').classList.add('hide');$('authSection').classList.remove('hide');$('signoutBtn').classList.add('hide'); }
async function portalView(){
 const r=await sb.from('sales_staff_profiles').select('user_id,display_name,role,is_active').eq('user_id',currentUser.id).maybeSingle();
 if(r.error)throw r.error;
 if(!r.data||!r.data.is_active){
  await sb.auth.signOut();currentUser=null;profile=null;authView();
  showNotice('authNotice','Akaun wujud tetapi belum diluluskan sebagai staf. Minta admin luluskan e-mel anda dahulu.',true);return;
 }
 profile=r.data;
 $('authSection').classList.add('hide');$('appSection').classList.remove('hide');$('signoutBtn').classList.remove('hide');
 $('currentName').textContent=profile.display_name;$('currentRole').textContent=profile.role==='admin'?'ADMIN':'STAF';
 $('adminPanel').classList.toggle('hide',profile.role!=='admin');
 $('claimBtn').classList.toggle('hide',profile.role==='admin');
 $('appSubtitle').textContent=profile.role==='admin'?'Pantau semua lead dan agihkan kepada staf.':'Ambil lead seterusnya dan buka WhatsApp tanpa copy nombor.';
 await loadAll();
}
async function login(event){
 event.preventDefault();setBusy($('loginBtn'),true);$('authNotice').classList.add('hide');
 try{
  const {data,error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
  if(error)throw error;
  currentUser=data.user;await portalView();
 }catch(e){showNotice('authNotice','Log masuk gagal: '+e.message,true)}
 finally{setBusy($('loginBtn'),false)}
}
async function signup(event){
 event.preventDefault();setBusy($('signupBtn'),true);$('authNotice').classList.add('hide');
 try{
  const name=$('signupName').value.trim();
  const {data,error}=await sb.auth.signUp({email:$('signupEmail').value.trim(),password:$('signupPassword').value,options:{data:{display_name:name}}});
  if(error)throw error;
  if(data?.session){await sb.auth.signOut();}
  $('signupForm').reset();
  showNotice('authNotice','Pendaftaran diterima. Sila sahkan e-mel (jika diminta), kemudian hubungi admin supaya akaun anda diluluskan. Tiada akses lead sebelum kelulusan.');
 }catch(e){showNotice('authNotice','Daftar gagal: '+e.message,true)}
 finally{setBusy($('signupBtn'),false)}
}
function toggleAuth(){
 const isSignup=$('signupForm').classList.contains('hide');
 $('signupForm').classList.toggle('hide',!isSignup);$('loginForm').classList.toggle('hide',isSignup);
 $('authTitle').textContent=isSignup?'Daftar akaun staf':'Log masuk staf';
 $('toggleAuthBtn').textContent=isSignup?'Sudah ada akaun? Log masuk':'Belum ada akaun? Daftar';
 $('authNotice').classList.add('hide');
}
async function fetchRows(table,columns,sort){
 let all=[];
 for(let offset=0;offset<10000;offset+=500){
  const q=sb.from(table).select(columns).order(sort||'created_at',{ascending:false}).range(offset,offset+499);
  const {data,error}=await q;if(error)throw error;
  all.push(...data);if(data.length<500)break;
 }
 return all;
}
async function loadAll(){
 if(busy)return;busy=true;setBusy($('refreshBtn'),true);
 $('listMessage').textContent='Memuatkan senarai...';
 try{
  leads=await fetchRows('sales_leads','*','created_at');
  staffs=profile.role==='admin'?await fetchRows('sales_staff_profiles','user_id,display_name,role,is_active','created_at'):[profile];
  updateMetrics();renderLeads();renderRoster();
 }catch(e){
  $('listMessage').textContent='Gagal memuatkan lead: '+e.message;
  showNotice('appNotice','Ralat data: '+e.message,true);
 }finally{busy=false;setBusy($('refreshBtn'),false)}
}
function updateMetrics(){
 $('metricTotal').textContent=leads.length.toLocaleString('ms-MY');
 $('metricNew').textContent=leads.filter(l=>['new','claimed'].includes(l.stage)).length;
 $('metricFollow').textContent=leads.filter(l=>l.stage==='follow_up').length;
 $('metricBooked').textContent=leads.filter(l=>l.stage==='booked').length;
}
function messageText(lead){
 const customer=(lead.customer_name||'tuan/puan').trim();
 const staff=profile?.display_name||'staf Proton';
 const model=lead.model&&lead.model!=='Belum pasti'?lead.model:'kereta Proton';
 const selected=$('messageTemplate').value;
 if(selected==='follow')return `Assalamualaikum ${customer}, saya ${staff} daripada Proton. 😊\n\nSaya ingin buat susulan tentang ${model} yang kita pernah bincangkan.\n\nTuan/puan masih berminat untuk saya bantu semak pilihan yang sesuai?`;
 if(selected==='price')return `Assalamualaikum ${customer}, saya ${staff} daripada Proton. 😊\n\nSaya boleh bantu sediakan maklumat harga dan anggaran ansuran untuk ${model}.\n\nBoleh saya tahu anggaran deposit dan tempoh pinjaman yang tuan/puan mahukan?`;
 return `Assalamualaikum ${customer}, selamat pagi! 😊\n\nSaya ${staff} daripada Proton. Saya ingin berkongsi maklumat tentang ${model}.\n\nBoleh saya tahu, tuan/puan mencari kereta untuk kegunaan sendiri atau keluarga?`;
}
function whatsappUrl(lead){
 return 'https://wa.me/'+encodeURIComponent(lead.phone_e164)+'?text='+encodeURIComponent(messageText(lead));
}
function renderLeads(){
 const search=$('leadSearch').value.trim().toLowerCase();
 const status=$('stageFilter').value;
 const filtered=leads.filter(l=>(!status||l.stage===status)&&(!search||[l.customer_name,l.phone_e164,l.model,l.notes].some(v=>String(v||'').toLowerCase().includes(search))));
 $('listMessage').textContent=`Memaparkan ${filtered.length} daripada ${leads.length} lead yang dibenarkan.`;
 if(!filtered.length){$('leadList').innerHTML='<div class="empty">Tiada lead untuk dipaparkan. Staf boleh tekan “Ambil lead seterusnya” apabila admin sudah import nombor.</div>';return;}
 $('leadList').innerHTML=filtered.map(l=>{
  const statusOptions=Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${l.stage===k?'selected':''}>${esc(v)}</option>`).join('');
  const assignee=profile.role==='admin'?`<div class="adminassign"><label>Agih kepada staf<select data-assignee="${l.id}"><option value="">Belum diagih</option>${staffs.filter(s=>s.is_active).map(s=>`<option value="${s.user_id}" ${l.assigned_to===s.user_id?'selected':''}>${esc(s.display_name)} (${esc(s.role)})</option>`).join('')}</select></label></div>`:'';
  const wa=l.consent_confirmed?`<a class="wa" data-open="${l.id}" href="${esc(whatsappUrl(l))}" target="_blank" rel="noopener noreferrer">✆ Buka WhatsApp ↗</a>`:'<span class="muted small">Tiada pengesahan kebenaran untuk dihubungi</span>';
  const assigned=staffs.find(s=>s.user_id===l.assigned_to);
  return `<article class="lead" data-id="${l.id}">
   <div class="leadtop"><div><h3>${esc(l.customer_name)}</h3><div class="number">+${esc(l.phone_e164)}</div></div><span class="status">${esc(STATUSES[l.stage]||l.stage)}</span></div>
   <div class="leadmodel">🚘 ${esc(l.model||'Belum pasti')} · ${esc(l.source||'Manual')}</div>
   <div class="subtle">${assigned?'Staf: '+esc(assigned.display_name):profile.role==='admin'?'Belum diagih':'Diberikan kepada anda'} · Dibuat ${esc(new Date(l.created_at).toLocaleDateString('ms-MY'))}</div>
   <div class="leadcontrols"><label>Status<select data-stage>${statusOptions}</select></label><label>Tarikh susulan<input data-follow type="date" value="${esc(l.follow_up_at||'')}"></label></div>
   <textarea class="notes" data-notes placeholder="Catatan selepas hubungi pelanggan...">${esc(l.notes||'')}</textarea>
   <div class="leadbottom">${wa}<button class="secondary" data-save="${l.id}" type="button">Simpan status</button></div>
   ${assignee}
  </article>`;
 }).join('');
}
function renderRoster(){
 if(profile?.role!=='admin')return;
 $('staffRoster').textContent=staffs.length?staffs.map(s=>s.display_name+' ('+s.role+')').join(' · '):'Tiada staf diluluskan.';
}
async function claimNext(){
 setBusy($('claimBtn'),true);
 try{
  const {data,error}=await sb.rpc('sales_claim_next_lead');
  if(error)throw error;
  if(!data){showNotice('appNotice','Tiada lead baharu yang belum diagih. Minta admin tambah senarai nombor.');}
  else{showNotice('appNotice','Lead berjaya diambil. Nombor kini hanya ditugaskan kepada akaun anda.');await loadAll();}
 }catch(e){showNotice('appNotice','Gagal ambil lead: '+e.message,true)}
 finally{setBusy($('claimBtn'),false)}
}
async function saveLead(leadId,card){
 const changes={stage:card.querySelector('[data-stage]').value,notes:card.querySelector('[data-notes]').value.slice(0,3000),follow_up_at:card.querySelector('[data-follow]').value||null};
 const button=card.querySelector('[data-save]');setBusy(button,true);
 try{
  const {error}=await sb.from('sales_leads').update(changes).eq('id',leadId);
  if(error)throw error;
  showNotice('appNotice','Status pelanggan berjaya dikemas kini.');await loadAll();
 }catch(e){showNotice('appNotice','Gagal menyimpan: '+e.message,true)}
 finally{setBusy(button,false)}
}
async function assignLead(leadId,staffId){
 try{
  const {error}=await sb.rpc('sales_assign_lead',{_lead_id:leadId,_staff_id:staffId||null});
  if(error)throw error;
  showNotice('appNotice','Agihan staf dikemas kini.');await loadAll();
 }catch(e){showNotice('appNotice','Gagal agih lead: '+e.message,true)}
}
async function addLead(e){
 e.preventDefault();
 if(!profile||profile.role!=='admin'||!$('addConsent').checked)return;
 const phone=normalPhone($('addPhone').value);
 if(!phone){showNotice('appNotice','Nombor WhatsApp tidak sah. Contoh: 0123456789 / +60123456789.',true);return}
 const button=$('addLeadForm').querySelector('[type=submit]');setBusy(button,true);
 try{
  const {error}=await sb.from('sales_leads').insert({customer_name:$('addName').value.trim().slice(0,120),phone_e164:phone,model:$('addModel').value,source:'Manual Admin',consent_confirmed:true,created_by:currentUser.id});
  if(error)throw error;
  $('addLeadForm').reset();showNotice('appNotice','Lead baharu berjaya dimasukkan.');await loadAll();
 }catch(e){showNotice('appNotice','Gagal tambah lead (mungkin nombor telah wujud): '+e.message,true)}
 finally{setBusy(button,false)}
}
function importFileRows(wb){
 const ws=wb.Sheets[wb.SheetNames[0]];
 const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false});
 if(!rows.length)return [];
 const header=rows[0].map(x=>String(x).toLowerCase().trim());
 const findIndex=(terms)=>header.findIndex(h=>terms.some(t=>h.includes(t)));
 let phoneCol=findIndex(['whatsapp','telefon','phone','nombor','no hp','mobile','tel']);
 let nameCol=findIndex(['nama','name','customer','pelanggan','contact']);
 let modelCol=findIndex(['model','kereta','vehicle']);
 const hasHeader=phoneCol>=0||nameCol>=0||modelCol>=0;
 if(!hasHeader){phoneCol=rows[0].length===1?0:1;nameCol=rows[0].length===1?-1:0;modelCol=rows[0].length>2?2:-1;}
 if(phoneCol<0)phoneCol=rows[0].length===1?0:1;
 return rows.slice(hasHeader?1:0).map((r,i)=>({name:nameCol>=0?r[nameCol]:'Pelanggan '+(i+1),phone:r[phoneCol],model:modelCol>=0?r[modelCol]:'Belum pasti'}));
}
function importTextRows(input){
 return input.split(/\r?\n/).map((line,i)=>{
  const v=line.trim();if(!v)return null;
  const parts=v.includes('\t')?v.split('\t'):v.split(',');
  if(parts.length===1)return {name:'Pelanggan '+(i+1),phone:parts[0],model:'Belum pasti'};
  return {name:parts[0],phone:parts[1],model:parts.slice(2).join(',')||'Belum pasti'};
 }).filter(Boolean);
}
async function importLeads(){
 if(!profile||profile.role!=='admin')return;
 if(!$('importConsent').checked){showNotice('appNotice','Sahkan kebenaran untuk menghubungi nombor dalam senarai sebelum import.',true);return}
 const button=$('importBtn');setBusy(button,true);$('importResult').textContent='Membaca senarai...';
 try{
  const file=$('importFile').files[0];
  if(file&&file.size>5*1024*1024)throw new Error('Fail melebihi had 5MB.');
  let rows=[];
  if(file){if(!window.XLSX)throw new Error('Komponen Excel gagal dimuatkan.');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=importFileRows(wb);
  }else rows=importTextRows($('importText').value);
  if(!rows.length)throw new Error('Tiada nombor dimasukkan.');
  if(rows.length>3000)throw new Error('Maksimum 3,000 baris setiap import.');
  const valid=[],bad=[];const seen=new Set();
  rows.forEach((r,i)=>{
   const phone=normalPhone(r.phone);if(!phone){bad.push(i+1);return}
   if(seen.has(phone))return;seen.add(phone);
   valid.push({customer_name:String(r.name||'Pelanggan '+(i+1)).trim().slice(0,120)||'Pelanggan',phone_e164:phone,model:String(r.model||'Belum pasti').trim().slice(0,100)||'Belum pasti',source:file?'Import Excel / CSV':'Tampal Senarai',consent_confirmed:true,created_by:currentUser.id});
  });
  if(!valid.length)throw new Error('Tiada nombor WhatsApp sah. Semak format Malaysia: 01xxxxxxxx.');
  let inserted=0;
  for(let i=0;i<valid.length;i+=50){
   $('importResult').textContent=`Import ${Math.min(valid.length,i+50)} / ${valid.length}...`;
   const {data,error}=await sb.from('sales_leads').upsert(valid.slice(i,i+50),{onConflict:'phone_e164',ignoreDuplicates:true}).select('id');
   if(error)throw error;inserted+=data?.length||0;
  }
  $('importResult').textContent=`Siap: ${inserted} lead baharu, ${valid.length-inserted} pendua, ${bad.length} nombor tidak sah.`;
  $('importFile').value='';$('importText').value='';$('importConsent').checked=false;
  showNotice('appNotice','Import selesai. '+$('importResult').textContent);
  await loadAll();
 }catch(e){$('importResult').textContent='Ralat: '+e.message;showNotice('appNotice','Import gagal: '+e.message,true)}
 finally{setBusy(button,false)}
}
async function manageStaff(e){
 e.preventDefault();if(profile.role!=='admin')return;
 const button=$('staffForm').querySelector('[type=submit]');setBusy(button,true);
 try{
  const {error}=await sb.rpc('sales_manage_staff',{_email:$('staffEmail').value.trim(),_display_name:$('staffName').value.trim(),_role:$('staffRole').value,_active:true});
  if(error)throw error;
  $('staffForm').reset();showNotice('appNotice','Akaun staf berjaya diluluskan.');await loadAll();
 }catch(e){showNotice('appNotice','Gagal luluskan staf: '+e.message,true)}
 finally{setBusy(button,false)}
}
async function init(){
 if(!window.supabase?.createClient){showNotice('authNotice','Sambungan modul keselamatan gagal dimuatkan. Sila cuba refresh.',true);return}
 sb=window.supabase.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
 $('loginForm').addEventListener('submit',login);
 $('signupForm').addEventListener('submit',signup);
 $('toggleAuthBtn').addEventListener('click',toggleAuth);
 $('signoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();currentUser=null;profile=null;authView()});
 $('refreshBtn').addEventListener('click',loadAll);
 $('claimBtn').addEventListener('click',claimNext);
 $('addLeadForm').addEventListener('submit',addLead);
 $('staffForm').addEventListener('submit',manageStaff);
 $('importBtn').addEventListener('click',importLeads);
 $('leadSearch').addEventListener('input',renderLeads);
 $('stageFilter').addEventListener('change',renderLeads);
 $('messageTemplate').addEventListener('change',renderLeads);
 $('leadList').addEventListener('click',e=>{
  const btn=e.target.closest('[data-save]');if(btn){saveLead(btn.dataset.save,btn.closest('[data-id]'));return}
  const open=e.target.closest('[data-open]');
  if(open){const id=open.dataset.open;sb.from('sales_leads').update({last_opened_at:new Date().toISOString()}).eq('id',id).then(({error})=>{if(error)console.warn('Opened timestamp:',error.message)})}
 });
 $('leadList').addEventListener('change',e=>{
  const sel=e.target.closest('[data-assignee]');if(sel)assignLead(sel.dataset.assignee,sel.value);
 });
 try{
  const {data,error}=await sb.auth.getUser();
  if(error&&!String(error.message||'').toLowerCase().includes('auth session missing'))console.warn('Session:',error.message);
  if(data?.user){currentUser=data.user;await portalView()}else authView();
 }catch(e){authView();showNotice('authNotice','Sesi tidak dapat disahkan: '+e.message,true)}
}
document.addEventListener('DOMContentLoaded',init);
})();