(()=>{
'use strict';
const ROOT='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/',SESSION='faris_lead_hub_session_v2';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUSES={new:'Lead baharu',contacted:'Dihubungi',interested:'Berminat',documents:'Mengumpul dokumen',bank_submitted:'Permohonan bank',approved:'Loan Lulus – Tunggu Delivery',delivery:'Persiapan Delivery',delivered:'Dah Delivery',on_hold:'Tangguh',cancelled:'Tidak diteruskan'};
const BANKS={draft:'Belum dihantar',submitted:'Dihantar ke bank',review:'Dalam semakan',documents:'Bank minta dokumen',approved:'Diluluskan',rejected:'Ditolak',cancelled:'Dibatalkan'};
const PARTIES={HIRER:'Pemohon',GUARANTOR:'Penjamin',REBATE:'COP Rebate',TRADEIN:'Trade In'},CATS={AUTO:'Semak kategori',VSO:'VSO',IC:'Kad pengenalan',LESEN:'Lesen',PAYSLIP:'Slip gaji',BANK:'Penyata bank',OTHER:'Lain-lain',IC_FRONT:'IC hadapan',IC_BACK:'IC belakang',SURAT_KERJA:'Surat kerja',SIJIL_LAHIR:'Sijil lahir',SIJIL_NIKAH:'Sijil nikah',EAUTO:'E-Auto',GERAN:'Geran kereta'};
const WA={new:'Belum diambil',claimed:'Sudah diambil',contacted:'Dihubungi',follow_up:'Follow-up',interested:'Berminat',booked:'Booking',not_interested:'Tidak berminat'};
const when=v=>v?new Date(v).toLocaleString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const day=v=>v?new Date(v.slice(0,10)+'T12:00:00+08:00').toLocaleDateString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric'}):'Belum ditetapkan';
const money=v=>v===null||v===undefined||v===''?'—':'RM '+Number(v).toLocaleString('ms-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
let user=null,epoch=0,listing=0,opening=0,rows=[],next=null,customer=null,tab='summary',selected=new Set(),busy=false,dirty=false,editRevision=0,editStamp='';
let sharedFlow=null;
const catalogue=window.FARIS_CUSTOMER_CATALOGUE;
const sharedProfileFields={cpName:'customer_name',cpModel:'model',cpVariant:'variant',cpColour:'colour'};
function mountSharedProfile(){
 const details=$('customerSharedDetails'), finance=$('customerSharedFinance');
 const financeFields=[
  ['selling_price','Harga jualan (RM)'],['otr_price','Harga OTR (RM)'],['insurance_amount','Insurans (RM)'],
  ['rebate_amount','Rebat (RM)'],['deposit','Deposit (RM)'],['loan_amount','Jumlah loan dipohon (RM)']
 ];
 function add(host,key,label,type='text',max=300){
  const wrap=document.createElement('label');wrap.textContent=label;
  const field=document.createElement(max===2000?'textarea':'input');field.id='shared_'+key;
  if(field.tagName==='INPUT')field.type=type;
  if(type==='number'){field.min='0';field.max='100000000';field.step='0.01'}else field.maxLength=max;
  wrap.append(field);host.append(wrap);sharedProfileFields[field.id]=key;
 }
 for(const [key,label] of financeFields)add(finance,key,label,'number');
 add(finance,'loan_term','Tempoh pinjaman (tahun)');
 add(finance,'vehicle_year','Tahun kenderaan','text',4);
 for(const f of window.FARIS_APPLICATION_CORE.fields){
  if(['applicant_name','applicant_phone','financing_model','financing_color','financing_term'].includes(f.id))continue;
  const label=f.label.replace(/\s*:\s*$/,'');
  const prefix={employment:'Kerja',spouse:'Pasangan',reference:'Rujukan'}[f.section];
  add(details,f.id,prefix ? prefix+' · '+label : label,'text',/address|scope/.test(f.id)?2000:300);
 }
 for(const [key,label,max] of [
  ['guarantor_name','Nama penjamin',120],['guarantor_nric','IC penjamin',40],['guarantor_phone','Telefon penjamin',40],
  ['guarantor_address','Alamat penjamin',2000],['guarantor_note','Catatan penjamin',500],
  ['rebate_name','Nama untuk dokumen rebat',120],['tradein_name','Nama pemilik trade-in',120]
 ])add(details,key,label,'text',max);
}
function attachSharedProfile(){
 const runtime=window.FARIS_CUSTOMER_WORKFLOW;
 if(!runtime||!customer)return;
 sharedFlow?.close();
 sharedFlow=runtime.create({customer,accountId:user.id,
  render(data, latest){
   if(customer?.lead.id!==latest.lead.id)return;
   customer=latest;
   editRevision=latest.profile.revision;
   editStamp=latest.lead.updated_at;
   renderSharedValues(data);
   // Preserve unsaved sales-status fields while refreshing names, figures and dates.
   renderProfile(false);
  },
  notify(message,error){
   const status=$('customerWorkflowStatus');
   status.textContent=message;
   status.classList.toggle('error',error);
  }
 });
 renderSharedValues(sharedFlow.data);
 $('customerWorkflowStatus').textContent='Maklumat yang dikongsi disimpan automatik.';
}
function renderSharedValues(data){
 renderVehicleChoices(data.model,data.variant,data.colour);
 for(const [id,key] of Object.entries(sharedProfileFields)){
  const field=$(id);
  if(field&&field!==document.activeElement&&!['cpModel','cpVariant','cpColour'].includes(id))field.value=data[key]??'';
 }
}
async function leaveForTool(tool,suffix=''){
 if(!customer||busy)return;
 try{
  await sharedFlow?.flush();
  const target=window.FARIS_CUSTOMER_WORKFLOW?.url(tool,customer.lead.id,suffix);
  if(target)location.assign(target);
 }catch(error){notice(error.message,true)}
}
let historyRows=[],historyNext=null,historyLoaded=false,historySeq=0,linkHandoff=null;
const historyPages=new Map();
let salesEventDates=new Map();
let pickerRows=[],pickerNext=null,pickerSelected=new Set(),pickerSeq=0,pickerMeta=null,previewFile=null,previewUrl=null,previewSeq=0;
const operations=new Map();
function notice(text,error=false){$('customersNotice').textContent=text;$('customersNotice').classList.remove('hide');$('customersNotice').classList.toggle('error',error)}
async function request(action,payload={},service='lead-hub-customers',retried=false){
 const token=localStorage.getItem(SESSION);if(!token)throw Error('Log masuk dahulu untuk membuka profil customer.');
 const r=await fetch(ROOT+service,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),keepalive:service==='lead-hub'&&action==='opened'});
 if(r.status===401&&!retried){if(localStorage.getItem(SESSION)!==token)throw Error('Akaun telah berubah. Buka semula profil.');await window.FARIS_INBOX_CLIENT.renewSession();return request(action,payload,service,true)}
 const d=await r.json().catch(()=>null);if(!r.ok||!d?.ok){const error=Error(d?.error||'Profil tidak dapat dihubungi. Cuba lagi.');error.status=r.status;throw error}return d;
}
async function mutate(action,data,lead=customer?.lead.id){
 const key=JSON.stringify([lead,action,data]);if(!operations.has(key))operations.set(key,crypto.randomUUID());
 const d=await request(action,{lead_id:lead,data,operation_id:operations.get(key)});operations.delete(key);return d;
}
function busyState(on){busy=on;document.querySelectorAll('#customerDetail button,#customerDetail input,#customerDetail select,#customerDetail textarea,#customerCaseDialog button,#customerCaseDialog input,#customerCaseDialog select,#customerCaseDialog textarea,#customerBankDialog button,#customerBankDialog input,#customerBankDialog select,#customerBankDialog textarea,#customerActionDialog button,#customerActionDialog input').forEach(n=>n.disabled=on);$('customersRefresh').disabled=on;if(!on)selection()}
const insightCore=window.FARIS_INSIGHTS;
const countNumber=n=>Math.max(0,Number(n)||0).toLocaleString('ms-MY');
const BUCKETS={lou:'LOU',delivered:'DAH DELIVERY',pending:'PENDING',trade_in:'TRADE IN'};
function exactFilter(id){const value=$(id).value;return value===''?null:JSON.parse(value)}
function insightFilters(){
 const tracking=$('customerDateBasis').value;
 return {...(tracking?{tracking:true,basis:tracking,bank:$('customersBank').value,bank_status:$('customersBankStatus').value,
  bank_from:$('customersBankFrom').value,bank_to:$('customersBankTo').value,follow:$('customersFollow').value}:{}),search:$('customersSearch').value,status:$('customersStatus').value,model:exactFilter('customersModel'),variant:exactFilter('customersVariant'),colour:exactFilter('customersColour'),bucket:$('customersBucket').value,staff_id:user?.role==='admin'?$('customersStaff').value:'',from:$('customerInsightsFrom').value,to:$('customerInsightsTo').value,group:$('customerInsightsGroup').value}}
function insightBars(title,data,total,kind,labels={}){
 return '<section class="insights-panel"><h4>'+esc(title)+'</h4>'+(data.length?'<ul class="insights-bars">'+data.map(x=>{
  const n=Number(x.value)||0,pct=total?Math.max(0,Math.min(100,n/total*100)):0;
  const attr=kind==='vehicle'?'data-insight-model="'+esc(JSON.stringify(x.model))+'" data-insight-variant="'+esc(JSON.stringify(x.variant))+'"':kind==='colour'?'data-insight-colour="'+esc(JSON.stringify(x.key))+'"':'data-insight-status="'+esc(x.label)+'"';
  return '<li><button type="button" class="insights-drill" '+attr+'><span>'+esc(labels[x.label]||x.label)+'</span><b>'+countNumber(n)+'</b><span class="insights-track"><span style="width:'+pct.toFixed(2)+'%"></span></span></button></li>';
 }).join('')+'</ul>':'<p class="insights-empty">Tiada data untuk tapisan ini.</p>')+'</section>';
}
function renderInsights(d,filters){
 const stats=d.stats||{},total=Number(d.total)||0;
 const cards=[['LOU',stats.lou,'LOU diterima, belum diserahkan','lou'],['DAH DELIVERY',stats.delivered,'Kereta telah diserahkan','delivered'],['PENDING',stats.pending,'Aktif, belum LOU / Deliver','pending'],['TRADE IN',stats.trade_in,'Profil ditanda Trade In','trade_in']];
 $('customerInsightsResult').innerHTML='<div class="insights-kpis">'+cards.map(([label,value,hint,key])=>'<button type="button" class="insights-kpi '+key+'" data-insight-bucket="'+key+'" aria-pressed="'+String(filters.bucket===key)+'"><span>'+label+'</span><strong>'+countNumber(value)+'</strong><small>'+esc(hint)+'</small><small class="insights-kpi-link">Lihat senarai →</small></button>').join('')+'</div>'+
 '<details class="customer-mobile-fold" data-customer-fold="analysis"><summary>Pecahan jualan</summary><div class="insights-meta"><span>Jumlah dalam tapisan <b>'+countNumber(stats.total)+'</b></span><span>Tangguh <b>'+countNumber(stats.on_hold)+'</b></span><span>Tidak diteruskan <b>'+countNumber(stats.cancelled)+'</b></span><span>'+esc(filters.from||'Awal rekod')+' → '+esc(filters.to||'Terkini')+' · Waktu Malaysia</span></div>'+
 '<p class="muted small insights-help">Tekan model / varian, warna atau status untuk lihat senarai pelanggan di bawah.</p><div class="insights-breakdowns">'+insightBars('Model & varian',d.vehicles||[],total,'vehicle')+insightBars('Warna kereta',d.colours||[],total,'colour')+insightBars('Status jualan',d.statuses||[],total,'status',STATUSES)+'</div></details>';
 $('customerInsightsContext').textContent='Dikemas kini '+when(d.generated_at)+' · '+countNumber(total)+' pelanggan dalam senarai'+(filters.bucket?' · '+BUCKETS[filters.bucket]:'')+'. Kotak angka ikut tapisan di bawah; pilih kotak lain untuk tukar kategori.';
 window.FARIS_CUSTOMER_LAYOUT?.sync($('customersDirectory'));
 renderFilterSummary(filters);
}
function renderFilterSummary(filters){
 const labels=[];for(const id of ['customersModel','customersVariant','customersColour','customersStatus','customersStaff','customersFollow','customersBank','customersBankStatus'])if($(id).value)labels.push($(id).selectedOptions[0]?.textContent||'');
 if(filters.bank_from||filters.bank_to)labels.push('Bank submit '+(filters.bank_from||'awal rekod')+' → '+(filters.bank_to||'terkini'));
 if(filters.bucket)labels.unshift(BUCKETS[filters.bucket]);if(filters.search)labels.push('Carian: '+filters.search);
 $('customerActiveFilters').textContent=labels.length?'Senarai: '+labels.join(' · '):'Senarai semua pelanggan dalam tempoh dipilih.';
 $('customersClearFilters').disabled=!labels.length&&!filters.from&&!filters.to&&(!filters.basis||filters.basis==='received');
}
function fillDashboardOptions(options){
 for(const [id,items] of [
  ['customersModel',(options.models||[]).map(x=>[JSON.stringify(x.model),x.model||'Model belum dipilih'])],
  ['customersVariant',(options.variants||[]).map(x=>[JSON.stringify(x.value),x.label])],
  ['customersColour',(options.colours||[]).map(x=>[JSON.stringify(x.value),x.label])],
  ['customersBank',(options.banks||[]).map(x=>[x.value,x.label])],
  ['customersStaff',(options.staff||[]).map(x=>[x.id,x.display_name+' ('+x.staff_code+')'])]
 ]){
  const node=$(id),previous=node.value,label=node.selectedOptions[0]?.textContent||previous,first=node.options[0].outerHTML;
  if(previous&&!items.some(([v])=>v===previous))items.push([previous,label]);
  node.innerHTML=first+items.map(([v,t])=>'<option value="'+esc(v)+'">'+esc(t)+'</option>').join('');node.value=previous;
 }
}
async function loadInsights(){return directory()}
function insightPreset(){const range=insightCore.preset($('customerInsightsPeriod').value);$('customerInsightsFrom').value=range.from;$('customerInsightsTo').value=range.to}
function renderDirectory(){
 $('customersList').innerHTML=rows.length?rows.map(r=>'<article class="customer-list-row"><div class="customer-row-identity"><button type="button" class="customer-name-open" data-customer-open="'+esc(r.id)+'">'+esc(r.customer_name)+'</button><small>'+esc(r.phone_e164)+'</small></div><div class="customer-row-vehicle"><small class="customer-label">Model / Varian / Warna</small><b>'+esc(r.model||'Belum dipilih')+'</b><small class="customer-vehicle-details">'+esc(r.variant||'Varian belum diisi')+' · '+esc(r.colour||'Warna belum diisi')+'</small>'+mobileFollow(r)+'</div><div class="customer-row-status"><small class="customer-label">Status</small><button type="button" class="customer-status" data-customer-status-open="'+esc(r.id)+'" aria-haspopup="dialog" aria-controls="customerCaseDialog">'+esc(caseStage(r))+' ↗</button><small>'+(r.trade_in?'Trade In':'')+'</small>'+bankSummary(r)+'</div><div class="customer-row-follow"><small class="customer-label">Follow-up</small><b>'+esc(r.follow_up_due_at?when(r.follow_up_due_at):day(r.follow_up_at))+'</b><small>'+esc(r.next_action||'Belum ditetapkan')+'</small></div><div class="customer-row-updated"><span>Terakhir Dikemas Kini</span><time datetime="'+esc(r.updated_at||'')+'">'+esc(when(r.updated_at))+'</time><small>Waktu Malaysia</small></div><button class="customer-row-action '+(linkHandoff?'primary':'secondary')+'" type="button" '+(linkHandoff?'data-customer-link-target':'data-customer-open')+'="'+esc(r.id)+'">'+(linkHandoff?'Pautkan '+linkHandoff.ids.length+' Fail':'Lihat Profil')+'</button></article>').join(''):'<div class="empty">Tiada customer dalam tapisan ini. Tukar tapisan atau tempoh.</div>';
 $('customersMore').classList.toggle('hide',next===null);
 $('customersLinkBanner').classList.toggle('hide',!linkHandoff);if(linkHandoff)$('customersLinkMessage').textContent='Pilih customer untuk pautkan '+linkHandoff.ids.length+' fail · '+PARTIES[linkHandoff.party]+' / '+CATS[linkHandoff.category]+'.';
}
async function directory(append=false){
 if(!user)return;const gen=epoch,id=++listing,filters=insightFilters(),stamp=JSON.stringify(filters),host=$('customerInsightsResult');
 if(!insightCore.validRange(filters.from,filters.to)){rows=[];next=null;renderDirectory();$('customersTotal').textContent='Semak julat tarikh.';host.innerHTML='<p class="insights-error" role="alert">Semak tarikh mula dan akhir.</p>';host.setAttribute('aria-busy','false');$('customersList').setAttribute('aria-busy','false');$('customersMore').disabled=false;return}
 $('customersList').setAttribute('aria-busy','true');$('customersMore').disabled=true;
 if(!append){rows=[];next=null;renderDirectory();$('customersTotal').textContent='Memuatkan pelanggan…';host.setAttribute('aria-busy','true');host.innerHTML='<p class="insights-empty">Memuatkan kiraan dan senarai pelanggan…</p>'}
 try{
  const d=await request('dashboard',{...filters,offset:append?next||0:0});if(gen!==epoch||id!==listing)return;
  if(stamp!==JSON.stringify(insightFilters())){rows=[];next=null;renderDirectory();$('customersTotal').textContent='Tapisan berubah. Tekan Cari / Lihat insight.';host.innerHTML='<p class="insights-empty">Tapisan berubah. Tekan Cari / Lihat insight untuk kemas kini.</p>';return}
  rows=append?[...new Map([...rows,...d.customers].map(r=>[r.id,r])).values()]:d.customers;next=d.next_offset;
  fillDashboardOptions(d.options||{});if(d.reminders)renderReminders(d.reminders);renderInsights(d.insights,filters);$('customersTotal').textContent=rows.length+' daripada '+d.total+' pelanggan sepadan';renderDirectory();
 }catch(e){if(gen===epoch&&id===listing){if(!append){rows=[];next=null;renderDirectory();$('customersTotal').textContent='Senarai belum tersedia.';host.innerHTML='<p class="insights-error" role="alert">'+esc(e.message)+'</p>'}notice(e.message,true)}}
 finally{if(gen===epoch&&id===listing){host.setAttribute('aria-busy','false');$('customersList').setAttribute('aria-busy','false');$('customersMore').disabled=false}}
}
let whatsappTrendListing=0;
function whatsappTrendFilters(){const range=insightCore.calendarWeek($('whatsappWeekDate').value);return range?{from:range.from,to:range.to,group:'day'}:null}
function whatsappWeekControls(){
 const range=insightCore.calendarWeek($('whatsappWeekDate').value);
 $('whatsappWeekRange').textContent=range?insightCore.bucketLabel(range.from)+' – '+insightCore.bucketLabel(range.to):'Pilih tarikh yang sah';
 $('whatsappWeekPrevious').disabled=!range||!insightCore.calendarWeek(range.from,-1);
 $('whatsappWeekNext').disabled=!range||!insightCore.calendarWeek(range.from,1);
}
function whatsappTrendPreset(){$('whatsappWeekDate').value=insightCore.localDate();whatsappWeekControls()}
function whatsappShiftWeek(offset){const range=insightCore.calendarWeek($('whatsappWeekDate').value,offset);if(!range)return;$('whatsappWeekDate').value=range.from;loadWhatsappTrend()}
function renderWhatsappTrend(d,filters){
 const trend=insightCore.weekRows(d.trend,insightCore.calendarWeek(filters.from)),max=Math.max(1,...trend.map(x=>Number(x.total)||0));
 $('whatsappTrendResult').innerHTML='<section class="insights-panel insights-trend"><div class="insights-panel-title"><h3 id="whatsappTrendTitle">Jumlah harian · 7 hari</h3><span>Isnin–Ahad</span></div><div class="insights-trend-scroll"><table><caption class="sr-only">Jumlah harian dan status semasa lead bagi minggu '+esc(filters.from)+' hingga '+esc(filters.to)+'</caption><thead><tr><th>Tarikh</th><th>Jumlah</th><th>LOU</th><th>Deliver</th><th>Pending</th><th>Trade In</th><th class="insights-trend-bar-cell">Trend</th></tr></thead><tbody>'+trend.map(x=>'<tr><th scope="row">'+esc(insightCore.bucketLabel(x.bucket))+'</th><td>'+countNumber(x.total)+'</td><td>'+countNumber(x.lou)+'</td><td>'+countNumber(x.delivered)+'</td><td>'+countNumber(x.pending)+'</td><td>'+countNumber(x.trade_in)+'</td><td class="insights-trend-bar-cell"><div class="insights-track"><span style="width:'+Math.min(100,Math.max(0,(Number(x.total)||0)/max*100)).toFixed(2)+'%"></span></div></td></tr>').join('')+'</tbody></table></div></section>';
 $('whatsappTrendContext').textContent='Dikemas kini '+when(d.generated_at)+' · Waktu Malaysia. Status semasa mengikut tarikh lead masuk.';
}
async function loadWhatsappTrend(){
 if(!user)return;
 const gen=epoch,id=++whatsappTrendListing,filters=whatsappTrendFilters(),host=$('whatsappTrendResult');
 $('whatsappTrendContext').textContent='';whatsappWeekControls();
 if(!filters){host.innerHTML='<p class="insights-error" role="alert">Pilih tarikh dalam minggu yang sah.</p>';host.setAttribute('aria-busy','false');return}
 host.setAttribute('aria-busy','true');host.innerHTML='<p class="insights-empty">Memuatkan trend lead masuk…</p>';
 try{
  const d=await request('dashboard',{...filters,search:'',status:'',model:null,variant:null,colour:null,bucket:'',staff_id:'',offset:0});
  if(gen!==epoch||id!==whatsappTrendListing)return;
  renderWhatsappTrend(d.insights,filters);
 }catch(e){if(gen===epoch&&id===whatsappTrendListing)host.innerHTML='<p class="insights-error" role="alert">'+esc(e.message)+'</p>'}
 finally{if(gen===epoch&&id===whatsappTrendListing)host.setAttribute('aria-busy','false')}
}
function showTab(value){tab=['summary','documents','banks','history'].includes(value)?value:'summary';document.querySelectorAll('[data-customer-panel]').forEach(n=>n.classList.toggle('hide',n.dataset.customerPanel!==tab));document.querySelectorAll('[data-customer-tab]').forEach(n=>{if(n.dataset.customerTab===tab)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});if(tab==='history'&&!historyLoaded)loadHistory()}
function caseStage(profile){
 if(profile.sales_status==='delivered')return STATUSES.delivered;
 if(['approved','delivery'].includes(profile.sales_status))return STATUSES[profile.sales_status];
 if(['on_hold','cancelled'].includes(profile.sales_status))return STATUSES[profile.sales_status];
 if(profile.lou_received)return 'LOU diterima';
 return STATUSES[profile.sales_status]||profile.sales_status;
}
const SALES_STEPS=[
 ['new','Lead baharu'],
 ['contacted','Dihubungi'],
 ['interested','Berminat'],
 ['documents','Dokumen'],
 ['bank_submitted','Permohonan bank'],
 ['approved','Loan lulus'],
 ['delivery','Persiapan delivery'],
 ['delivered','Dah Delivery']
];
const timelineDate=new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric'});
const timelineTime=new Intl.DateTimeFormat('ms-MY',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function recordSalesDates(dates,events){
 for(const {event_type,created_at,details} of events){
  if(event_type!=='profile_updated'||!Number.isFinite(Date.parse(created_at)))continue;
  const {before,after}=details||{};
  if(after?.sales_status&&before?.sales_status!==after.sales_status&&!dates.has(after.sales_status))dates.set(after.sales_status,created_at);
  if(after?.lou_received===true&&before?.lou_received!==true&&!dates.has('lou'))dates.set('lou',created_at);
 }
}
function timelineDateMarkup(stamp,className){
 const date=new Date(stamp);
 if(!stamp||!Number.isFinite(date.getTime()))return '';
 return '<time class="'+className+'" datetime="'+date.toISOString()+'"><span>'+
  esc(timelineDate.format(date))+'</span> <span>'+esc(timelineTime.format(date))+'</span></time>';
}
function salesTimeline(profile,lead,dates){
 const status=profile.sales_status;
 const active=SALES_STEPS.findIndex(([key])=>key===status);
 const state=['on_hold','cancelled'].includes(status)?status:'';
 return {
  position:active<0?(STATUSES[status]||'Tahap belum ditetapkan'):
   'Tahap '+(active+1)+' daripada '+SALES_STEPS.length+' · '+STATUSES[status],
  state,
  lou:profile.lou_received===true,
  louAt:dates.get('lou'),
  stoppedAt:state&&dates.get(status),
  steps:SALES_STEPS.map(([key,label],index)=>({
   label,state:index===active?'current':index<active?'past':'pending',
   stamp:index<=active||state?(
    key==='new'?profile.lead_received_at||lead.created_at||dates.get(key):
     key==='delivered'?profile.delivered_at||dates.get(key):dates.get(key)
   ):undefined
  }))
 };
}
function renderSalesTimeline(profile,lead,dates){
 const timeline=salesTimeline(profile,lead,dates);
 $('customerSalesTimeline').dataset.state=timeline.state;
 const position=$('customerTimelinePosition');
 if(position.textContent!==timeline.position)position.textContent=timeline.position;
 const lou=$('customerTimelineLou');
 lou.hidden=!timeline.lou;
 lou.innerHTML=timeline.lou?'LOU diterima'+timelineDateMarkup(timeline.louAt,'customer-timeline-stamp'):'';
 const activeAt=timeline.stoppedAt||timeline.steps.find(step=>step.state==='current')?.stamp;
 $('customerTimelineCurrentDate').innerHTML=timelineDateMarkup(activeAt,'customer-timeline-stamp');
 $('customerTimelineSteps').innerHTML=timeline.steps.map(({label,state,stamp})=>{
  const current=state==='current'?' aria-current="step"':'';
  const marker=state==='past'?'✓':'';
  return '<li class="customer-timeline-step" data-state="'+state+'"'+current+
   '><span class="customer-timeline-marker" aria-hidden="true">'+marker+
   '</span><span class="customer-timeline-label">'+esc(label)+'</span>'+
   timelineDateMarkup(stamp,'customer-timeline-stamp')+'</li>';
 }).join('');
 const datedSteps=timeline.steps.filter(step=>step.stamp);
 $('customerTimelineDates').hidden=!datedSteps.length;
 $('customerTimelineDateList').innerHTML=datedSteps.map(({label,stamp})=>'<li><span>'+esc(label)+'</span>'+
  timelineDateMarkup(stamp,'customer-timeline-stamp')+'</li>').join('');
}
function caseReasonRequired(){const required=['on_hold','cancelled'].includes($('customerCaseStatus').value);$('customerCaseReason').required=required;$('customerCaseReasonLabel').textContent=required?'Sebab (wajib)':'Catatan sebab tangguh / tidak diteruskan';}
function openCaseStatus(){
 if(!customer||busy)return;
 if(dirty){notice('Simpan perubahan profil dahulu sebelum menukar status kes.',true);showTab('summary');$('customerProfileForm').scrollIntoView({block:'start'});return}
 const p=customer.profile;$('customerCaseStatus').value=p.sales_status;$('customerCaseReason').value=p.closure_reason||'';$('customerCaseLou').checked=p.lou_received===true;$('customerCaseTradeIn').checked=p.trade_in===true;
 $('customerCaseFeedback').textContent='';caseReasonRequired();$('customerCaseDialog').showModal();
}
function caseStatusValues(){return {...profileValues(),sales_status:$('customerCaseStatus').value,closure_reason:$('customerCaseReason').value.trim(),lou_received:$('customerCaseLou').checked,trade_in:$('customerCaseTradeIn').checked}}
function referenceFilesMarkup(files){
 return files.length?files.map(f=>'<article class="customer-file"><label><input type="checkbox" data-customer-file="'+esc(f.id)+'" '+(selected.has(f.id)?'checked':'')+'><span><b>'+esc(f.original_name)+'</b><small>'+(f.byte_size/1048576).toFixed(2)+' MB · '+esc(when(f.created_at))+'</small></span></label><div class="customer-row-actions"><button type="button" class="secondary" data-customer-preview="'+esc(f.id)+'">Pratonton</button><button type="button" class="secondary" data-customer-download="'+esc(f.id)+'">Download</button><button type="button" class="secondary" data-customer-unlink="'+esc(f.id)+'">Nyahpaut</button></div></article>').join(''):'<div class="empty">Belum ada dokumen rujukan. Upload dokumen lengkap atau dokumen sokongan di sini.</div>';
}
function renderProfile(fill=true){
 const {lead:l,profile:p,staff}=customer;
 renderSalesTimeline(p,l,salesEventDates);
 $('customerName').textContent=l.customer_name;$('customerIdentity').textContent=l.phone_e164+' · '+(l.model||'Model belum dipilih')+(p.variant?' / '+p.variant:'');$('customerOwner').textContent='Staff urus: '+(staff?staff.display_name+' ('+staff.staff_code+')':'Belum diagih');$('customerStatusBadge').textContent=STATUSES[p.sales_status]||p.sales_status;
 $('customerNextAction').innerHTML='<b>Tindakan seterusnya</b>'+esc(p.next_action||'Belum ditetapkan')+'<br>Follow-up: '+esc(profileFollowStamp(l,p)?when(p.follow_up_due_at):day(l.follow_up_at));
 $('customerFinishFollow').classList.toggle('hide',!l.follow_up_at);$('customerRescheduleFollow').classList.toggle('hide',!l.follow_up_at);
 renderBanks(customer.banks||[]);
 const wa=$('customerWhatsapp');wa.setAttribute('aria-disabled',String(!l.consent_confirmed));if(l.consent_confirmed)wa.href='https://wa.me/'+l.phone_e164;else wa.removeAttribute('href');
 if(fill){renderVehicleChoices(l.model,p.variant,p.colour);for(const [id,value] of Object.entries({cpName:l.customer_name,cpPhone:l.phone_e164,cpStatus:p.sales_status,cpFollow:l.follow_up_at,cpFollowTime:profileFollowStamp(l,p).slice(11),cpReceived:malaysiaInput(p.lead_received_at),cpDelivered:p.sales_status==='delivered'?malaysiaInput(p.delivered_at):'',cpNext:p.next_action,cpReason:p.closure_reason}))$(id).value=value??'';$('cpGuarantor').checked=p.guarantor_required;$('cpLou').checked=p.lou_received===true;$('cpTradeIn').checked=p.trade_in===true;editRevision=p.revision;editStamp=l.updated_at;dirty=false;reasonRequired();toggleDelivered()}
 $('customerLastUpdated').innerHTML='<span>Terakhir Dikemas Kini</span><time datetime="'+esc(customer.tracking?.updated_at||p.updated_at||l.updated_at||'')+'">'+esc(when(customer.tracking?.updated_at||p.updated_at||l.updated_at))+'</time><small>Waktu Malaysia</small>';
 $('customerSourceInfo').textContent='Sumber: '+(l.source||'—')+'\nLead diterima: '+when(p.lead_received_at||l.created_at)+'\nRekod dimasukkan: '+when(l.created_at)+
 '\nKemas kini terakhir: '+when(customer.tracking?.updated_at||p.updated_at||l.updated_at)+(customer.tracking?.updated_by?' · '+customer.tracking.updated_by:'')+
 '\nHubungan terakhir: '+when(p.last_contacted_at||l.pm_confirmed_at)+'\nTarikh serahan: '+when(p.delivered_at)+'\nStatus WhatsApp: '+(WA[l.stage]||l.stage)+(l.pm_confirmed_at?' · PM disahkan '+when(l.pm_confirmed_at):'');
 $('customerLegacyNotes').textContent=l.notes?'Catatan WhatsApp semasa:\n'+l.notes:'Belum ada catatan WhatsApp.';
 $('customerDocCount').textContent=customer.files.length;
 selected=new Set([...selected].filter(id=>customer.files.some(f=>f.id===id)));
 $('customerFiles').innerHTML=referenceFilesMarkup(customer.files);

 $('customerNotes').innerHTML=customer.notes.length?customer.notes.map(n=>'<article class="customer-note"><small>'+esc(n.actor_name+' ('+n.actor_code+') · '+when(n.created_at))+'</small><p>'+esc(n.details.note)+'</p></article>').join(''):'<p class="customer-note-empty">Belum ada nota profil. Catatan WhatsApp sedia ada boleh dilihat dalam Ringkasan.</p>';
 if(customer.notes.length===100)$('customerNotes').insertAdjacentHTML('beforeend','<p class="small muted">100 nota terkini dipaparkan. Nota terdahulu kekal dalam Sejarah.</p>');selection();
}
function selection(){$('customerSelectedCount').textContent=selected.size+' fail dipilih';$('customerOpenCompiler').disabled=busy||!selected.size}
function reasonRequired(){$('cpReason').required=['on_hold','cancelled'].includes($('cpStatus').value)}
async function open(id){
 if(!user||busy)return;
 try{await sharedFlow?.flush()}catch(error){notice(error.message,true);return}
 if(dirty&&!confirm('Buka customer lain dan tinggalkan perubahan profil yang belum disimpan?'))return;
 sharedFlow?.close();sharedFlow=null;
 const gen=epoch,seq=++opening;customer=null;window.FARIS_NAV.show('customers',{scroll:false});dirty=false;selected.clear();resetHistory();$('customerTimelineDates').open=false;$('customerDetail').classList.add('hide');$('customersDirectory').classList.add('hide');notice('Memuatkan profil customer…');
 try{const d=await request('get',{lead_id:id});if(gen!==epoch||seq!==opening)return;customer=d.customer;$('customerDetail').classList.remove('hide');$('customersNotice').classList.add('hide');renderProfile();attachSharedProfile();showTab('summary');loadSalesDates();$('workspace-customers').scrollIntoView({block:'start'});return true}
 catch(e){if(gen===epoch&&seq===opening){notice(e.message,true);$('customersDirectory').classList.remove('hide')}}
}
async function refreshProfile(force=false){
 if(!customer||!user)return;const gen=epoch,id=customer.lead.id,seq=++opening;
 let d;try{d=await request('get',{lead_id:id})}catch(e){if(gen===epoch&&customer?.lead.id===id&&e.status===403)forgetCustomer();throw e}if(gen!==epoch||seq!==opening||customer?.lead.id!==id)return;customer=d.customer;resetHistory();renderProfile(force||!dirty);if(sharedFlow&&!sharedFlow.dirty){sharedFlow.close();sharedFlow=null;attachSharedProfile()}if(tab==='history')loadHistory();loadSalesDates();
}
function profileValues(){
 const p=customer?.profile||{};
 const date=$('cpFollow').value,time=$('cpFollowTime').value;
 const timestamps={};
 if(customer?.lead){
  const fields=[['lead_received_at',$('cpReceived').value,p.lead_received_at],['delivered_at',$('cpDelivered').value,p.delivered_at]];
  for(const [key,value,old] of fields)if(value!==malaysiaInput(old))timestamps[key]=value||null;
  const next=date&&time?date+'T'+time:'';
  if(next!==profileFollowStamp(customer.lead,p)||(!next&&p.follow_up_due_at))timestamps.follow_up_due_at=next||null;
 }
 return {...timestamps,customer_name:$('cpName').value.trim(),model:$('cpModel').value.trim(),variant:$('cpVariant').value.trim(),colour:$('cpColour').value.trim(),sales_status:$('cpStatus').value,follow_up_at:$('cpFollow').value||null,next_action:$('cpNext').value.trim(),closure_reason:$('cpReason').value.trim(),guarantor_required:$('cpGuarantor').checked,lou_received:$('cpLou').checked,trade_in:$('cpTradeIn').checked,booking_status:p.booking_status||'none',booking_amount:p.booking_amount??null,selling_price:p.selling_price??null,deposit:p.deposit??null,loan_amount:p.loan_amount??null,expected_revision:editRevision,expected_lead_updated_at:editStamp};
}
async function runWrite(action,data,success,button=null){
 if(busy||!customer)return false;const gen=epoch,id=customer.lead.id;busyState(true);if(button)button.disabled=true;
 try{
  await sharedFlow?.flush();
  if(action==='save_profile'&&sharedFlow){
   data={...data,expected_revision:editRevision,expected_lead_updated_at:editStamp,
    selling_price:customer.profile.selling_price??null,deposit:customer.profile.deposit??null,loan_amount:customer.profile.loan_amount??null};
  }
  await mutate(action,data,id);if(gen!==epoch||customer?.lead.id!==id)return false;if(action==='save_profile')dirty=false;await refreshProfile();if(gen!==epoch)return false;notice(success);return true}
 catch(e){if(gen===epoch){notice(e.message,true);if(e.status===403){try{await refreshProfile()}catch{}}}return false}finally{if(gen===epoch){busyState(false);if(button)button.disabled=false}}
}
async function upload(){
 const files=[...$('customerUpload').files];if(!customer||busy||!files.length)return;
 const gen=epoch,id=customer.lead.id,party='HIRER',category='OTHER';let saved=0,linked=0;busyState(true);
 try{for(const file of files){if(gen!==epoch||customer?.lead.id!==id)return;if(file.size>20*1048576)throw Error(file.name+' melebihi 20 MB.');notice('Menyimpan '+(saved+1)+' / '+files.length+': '+file.name);if(window.FARIS_CUSTOMER_WORKFLOW&&sharedFlow){await sharedFlow.upload(file,party,category);saved++;linked++}
   else{const d=await window.FARIS_INBOX_CLIENT.upload(file);saved++;if(gen!==epoch)return;await mutate('link_files',{ids:d.files.map(f=>f.id),party,category},id);linked++}}
  if(gen===epoch)notice(linked+' dokumen disimpan dan dipautkan kepada customer.');
 }catch(e){if(gen===epoch)notice(linked+' fail dipautkan. '+(saved>linked?'Fail yang sudah diupload kekal dalam Fail Masuk. ':'')+e.message,true)}
 finally{if(gen===epoch){$('customerUpload').value='';busyState(false);try{await refreshProfile()}catch(e){notice(e.message,true)}}}
}
const fieldNames={lou_received:'LOU diterima',trade_in:'Trade In',sales_status:'Status jualan',colour:'Warna kereta',lead_received_at:'Lead diterima',delivered_at:'Serahan sebenar',follow_up_due_at:'Tarikh dan masa reminder',variant:'Varian',next_action:'Tindakan seterusnya',closure_reason:'Sebab',guarantor_required:'Perlu penjamin',booking_status:'Status booking',booking_amount:'Jumlah booking',selling_price:'Harga jualan',deposit:'Deposit',loan_amount:'Jumlah pinjaman',customer_name:'Nama',model:'Model',follow_up_at:'Follow-up'};
function displayField(key,value){if(value===null||value===undefined||value==='')return '—';if(['booking_amount','selling_price','deposit','loan_amount','amount','approved_amount'].includes(key))return money(value);if(key==='sales_status')return STATUSES[value]||value;if(key==='status')return BANKS[value]||value;if(key==='booking_status')return {none:'Belum booking',pending:'Belum dibayar',paid:'Dibayar',refunded:'Dipulangkan'}[value]||value;if(typeof value==='boolean')return value?'Ya':'Tidak';if(key==='follow_up_at')return day(value);if(['lead_received_at','delivered_at','follow_up_due_at'].includes(key))return when(value);return String(value)}
function historyDetail(event){
 const d=event.details||{};
 if(event.event_type==='shared_fields_updated')return '<p>Maklumat pelanggan dikemas kini.</p>';
 if(event.event_type==='profile_updated')return '<ul>'+Object.entries(fieldNames).filter(([k])=>JSON.stringify(d.before?.[k])!==JSON.stringify(d.after?.[k])).map(([k,label])=>'<li>'+label+': '+esc(displayField(k,d.before?.[k]))+' → '+esc(displayField(k,d.after?.[k]))+'</li>').join('')+'</ul>';
 if(event.event_type==='follow_up_completed'||event.event_type==='contact_recorded')return '<p>'+esc([d.bank,d.task,d.note].filter(Boolean).join(' · '))+'</p>';
 if(event.event_type==='note_added')return '<p>'+esc(d.note)+'</p>';
 if(event.event_type==='bank_updated'||event.event_type==='bank_removed'){
  const bank=d.after||d.before;
  const changed={...fieldNames,bank_name:'Bank',status:'Status bank',submitted_at:'Tarikh submit',submitted_time:'Masa submit',amount:'Jumlah dipohon',
   term_months:'Tempoh dipohon',approved_amount:'Jumlah lulus',approved_rate:'Kadar lulus',approved_term_months:'Tempoh lulus',
   officer_name:'Nama pegawai',officer_phone:'Telefon pegawai',selected:'Bank pilihan pelanggan',notes:'Catatan'};
  return '<p><b>'+esc(bank?.bank_name||'Bank')+'</b>'+ (d.previous_selected?' · Pilihan sebelumnya '+esc(d.previous_selected):'')+'</p><ul>'+
   Object.entries(changed).filter(([k])=>(d.before?.[k]??null)!==(d.after?.[k]??null))
    .map(([k,label])=>'<li>'+esc(label)+' · '+esc(displayField(k,d.before?.[k]))+' → '+esc(displayField(k,d.after?.[k]))+'</li>').join('')+'</ul>';
 }
 if(event.event_type==='documents_linked')return '<p>'+esc(PARTIES[d.party]+' / '+CATS[d.category])+'\n'+esc((d.files||[]).map(f=>f.name).join('\n'))+'</p>';
 if(event.event_type==='document_unlinked')return '<p>'+esc(d.name)+' · Fail asal kekal dalam Fail Masuk.</p>';
 if(event.event_type==='checklist_updated')return '<p>'+esc(PARTIES[d.party]+' / '+CATS[d.category])+': '+esc(({auto:'Automatik ikut fail',missing:'Belum diterima',received:'Diterima / disemak',replace:'Perlu ganti',not_required:'Tidak diperlukan'})[d.after]||d.after)+'</p>';
 if(['claimed','assigned','legacy_assignment'].includes(event.event_type))return '<p>Penerima: '+esc(d.assignee_name+' ('+d.assignee_code+')')+(event.event_type==='legacy_assignment'?'\nTarikh claim asal tidak direkodkan. Masa ini ialah masa rekod sejarah dimasukkan.':'')+'</p>';
 if(event.event_type==='status_updated')return '<p>Status WhatsApp: '+esc(WA[d.stage_before]||d.stage_before)+' → '+esc(WA[d.stage_after]||d.stage_after)+'</p>';
 if(event.event_type==='whatsapp_details_updated')return '<p>'+esc(d.note_changed?'Catatan sebelum: '+(d.notes_before||'—')+'\nCatatan selepas: '+(d.notes_after||'—'):'')+'\nFollow-up: '+esc(day(d.follow_up_before))+' → '+esc(day(d.follow_up_after))+'</p>';
 if(event.event_type==='lead_created')return '<p>Sumber: '+esc(d.source||'—')+'</p>';return '';
}
function renderHistory(){const labels={shared_fields_updated:'Maklumat pelanggan diselaraskan',profile_updated:'Profil dikemas kini',note_added:'Nota ditambah',bank_updated:'Permohonan bank dikemas kini',bank_removed:'Rekod bank dipadam',follow_up_completed:'Follow-up selesai',contact_recorded:'Pelanggan dihubungi',documents_linked:'Dokumen dipautkan / dikategorikan',document_unlinked:'Dokumen dinyahpaut',checklist_updated:'Checklist dokumen dikemas kini',claimed:'Nombor diclaim',assigned:'Customer diagihkan',legacy_assignment:'Rekod agihan lama',pm_confirmed:'PM disahkan oleh staff',whatsapp_opened:'WhatsApp dibuka',status_updated:'Status WhatsApp berubah',whatsapp_details_updated:'Catatan / follow-up WhatsApp berubah',lead_created:'Lead diwujudkan'};
 $('customerHistory').innerHTML=historyRows.length?historyRows.map(e=>'<article class="customer-history-item"><b>'+esc(labels[e.event_type]||e.event_type)+'</b><br><small>'+esc(when(e.created_at))+' · '+esc(e.actor_name?e.actor_name+' ('+e.actor_code+')':'Rekod sistem')+'</small>'+historyDetail(e)+'</article>').join(''):'<div class="empty">Belum ada sejarah untuk customer ini.</div>';$('customerHistoryMore').classList.toggle('hide',historyNext===null);
}
function resetHistory(){
 historySeq++;historyRows=[];historyNext=null;historyLoaded=false;historyPages.clear();salesEventDates=new Map();
 $('customerHistory').textContent='';
 $('customerHistoryMore').classList.add('hide');
 $('customerHistoryMore').disabled=false;
 $('customerTimelineError').hidden=true;
}
function getHistoryPage(id,offset){
 if(!historyPages.has(offset)){
  const seq=historySeq;
  historyPages.set(offset,request('timeline',{lead_id:id,offset}).catch(error=>{
   if(seq===historySeq)historyPages.delete(offset);
   throw error;
  }));
 }
 return historyPages.get(offset);
}
async function loadHistory(append=false){
 if(!customer||$('customerHistoryMore').disabled||append&&historyNext===null)return;
 const seq=historySeq,id=customer.lead.id;
 $('customerHistoryMore').disabled=true;
 if(!append)$('customerHistory').textContent='Memuatkan sejarah pelanggan…';
 try{
  const page=await getHistoryPage(id,append?historyNext:0);
  if(seq!==historySeq)return;
  historyRows=append?[...historyRows,...page.events]:page.events;
  historyNext=page.next_offset;historyLoaded=true;renderHistory();
 }catch(error){
  if(seq!==historySeq)return;
  if(error.status===403)forgetCustomer();
  else if(append)notice(error.message,true);
  else $('customerHistory').textContent=error.message;
 }finally{if(seq===historySeq)$('customerHistoryMore').disabled=false}
}
async function loadSalesDates(){
 const seq=historySeq,id=customer.lead.id;
 let offset=0;
 try{
  for(;;){
   const {profile,lead}=customer;
   const timeline=salesTimeline(profile,lead,salesEventDates);
   const hasMissingDates=timeline.steps.some(step=>(timeline.state||step.state!=='pending')&&!step.stamp)||
    timeline.lou&&!timeline.louAt||timeline.state&&!timeline.stoppedAt;
   if(!hasMissingDates)return;
   const page=await getHistoryPage(id,offset);
   if(seq!==historySeq)return;
   recordSalesDates(salesEventDates,page.events);
   renderSalesTimeline(customer.profile,customer.lead,salesEventDates);
   if(page.next_offset===null||page.next_offset<=offset)return;
   offset=page.next_offset;
  }
 }catch(error){
  if(seq!==historySeq)return;
  if(error.status===403)forgetCustomer();
  else $('customerTimelineError').hidden=false;
 }
}
async function loadPicker(append=false){
 if(!customer)return;const gen=epoch,id=customer.lead.id,seq=++pickerSeq;$('customerInboxLink').disabled=true;$('customerInboxMore').disabled=true;
 try{const d=await request('unlinked_files',{lead_id:id,search:$('customerInboxSearch').value,offset:append?pickerNext||0:0});if(gen!==epoch||seq!==pickerSeq||customer?.lead.id!==id)return;pickerRows=append?[...pickerRows,...d.files]:d.files;pickerNext=d.next_offset;if(!append)pickerSelected.clear();$('customerInboxList').innerHTML=pickerRows.length?pickerRows.map(f=>'<label><input type="checkbox" data-customer-inbox="'+esc(f.id)+'"><span>'+esc(f.original_name)+'<small>'+(f.byte_size/1048576).toFixed(2)+' MB'+(f.customer_name?' · Catatan lama: '+esc(f.customer_name):'')+'</small></span></label>').join(''):'<p class="customer-note-empty">Tiada fail yang belum dipautkan dalam paparan ini.</p>';
  $('customerInboxList').querySelectorAll('input').forEach(n=>n.checked=pickerSelected.has(n.dataset.customerInbox));$('customerInboxMore').classList.toggle('hide',pickerNext===null);$('customerInboxStatus').textContent=d.total+' fail tersedia · '+pickerSelected.size+' dipilih';
 }catch(e){if(gen===epoch&&seq===pickerSeq)$('customerInboxStatus').textContent=e.message}finally{if(gen===epoch&&seq===pickerSeq){$('customerInboxLink').disabled=false;$('customerInboxMore').disabled=false}}
}
function pickInbox(){if(!customer||busy)return;pickerMeta={party:'HIRER',category:'OTHER'};pickerRows=[];pickerNext=null;pickerSelected.clear();$('customerInboxSearch').value='';$('customerInboxList').innerHTML='';$('customerInboxDialog').showModal();loadPicker()}
function clearPreview(){previewSeq++;previewFile=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('customerPreviewBody').innerHTML='';$('customerPreviewTitle').textContent='Pratonton dokumen'}
async function preview(id){
 if(!customer)return;clearPreview();const gen=epoch,seq=previewSeq,leadId=customer.lead.id;const f=customer.files.find(f=>f.id===id);if(!f)return;$('customerPreviewTitle').textContent=f.original_name;$('customerPreviewStatus').textContent='Memuatkan fail asal…';$('customerPreviewDownload').disabled=true;$('customerPreview').showModal();
 try{const d=await window.FARIS_INBOX_CLIENT.file(id);if(gen!==epoch||seq!==previewSeq||customer?.lead.id!==leadId)return;previewFile=d.file;previewUrl=URL.createObjectURL(d.file);const type=d.file.type;
  if(type==='application/pdf'){const frame=document.createElement('iframe');frame.title='Pratonton '+f.original_name;frame.src=previewUrl;$('customerPreviewBody').append(frame)}
  else if(type.startsWith('image/')){const img=document.createElement('img');img.alt=f.original_name;img.src=previewUrl;img.onerror=()=>{if(seq===previewSeq)$('customerPreviewStatus').textContent='Format gambar ini tidak boleh dipratonton pada peranti ini. Download fail asal untuk membukanya.'};$('customerPreviewBody').append(img)}
  else if(type==='text/plain'){const pre=document.createElement('pre');pre.textContent=await d.file.text();if(gen!==epoch||seq!==previewSeq)return;$('customerPreviewBody').append(pre)}
  else $('customerPreviewBody').textContent='Pratonton untuk format ini belum tersedia. Download untuk buka dalam aplikasi dokumen.';
  $('customerPreviewStatus').textContent='Fail asal kekal disimpan.';$('customerPreviewDownload').disabled=false;
 }catch(e){if(gen===epoch&&seq===previewSeq)$('customerPreviewStatus').textContent=e.message}
}
function saveFile(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function download(id,button){const gen=epoch;button.disabled=true;try{const d=await window.FARIS_INBOX_CLIENT.file(id);if(gen===epoch)saveFile(d.file)}catch(e){if(gen===epoch)notice(e.message,true)}finally{button.disabled=false}}
function compiler(){if(!customer||!selected.size||busy)return;const files=customer.files.filter(f=>selected.has(f.id));if(files.length>30||files.reduce((n,f)=>n+f.byte_size,0)>80*1048576)return notice('Pilih maksimum 30 fail dan 80 MB sekali untuk Compiler.',true);sessionStorage.setItem('faris_inbox_compiler_v1',JSON.stringify({ids:[...selected],account_id:user.id,created_at:Date.now()}));leaveForTool('COMPILER','&inbox=1')}
function forgetCustomer(){
 sharedFlow?.close();sharedFlow=null;
 opening++;customer=null;dirty=false;selected.clear();resetHistory();
 for(const id of ['customerPreview','customerInboxDialog','customerCaseDialog','customerBankDialog','customerActionDialog'])if($(id).open)$(id).close();clearPreview();
 for(const id of ['customerFiles','customerHistory','customerNotes','customerName','customerIdentity','customerOwner','customerNextAction','customerSourceInfo','customerLastUpdated','customerLegacyNotes'])$(id).textContent='';
 $('customerProfileForm').reset();$('customerCaseForm').reset();$('customerCaseFeedback').textContent='';$('customerNoteForm').reset();$('customerWhatsapp').removeAttribute('href');$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');directory();
}
function reset(){
 sharedFlow?.close();sharedFlow=null;epoch++;whatsappTrendListing++;$('whatsappTrendResult').innerHTML='';$('whatsappTrendResult').setAttribute('aria-busy','false');$('whatsappTrendContext').textContent='';$('whatsappTrendForm').reset();whatsappTrendPreset();$('customerInsightsResult').innerHTML='';$('customerInsightsContext').textContent='';listing++;opening++;pickerSeq++;user=null;customer=null;rows=[];next=null;resetHistory();selected.clear();pickerRows=[];pickerSelected.clear();operations.clear();linkHandoff=null;busy=false;dirty=false;
 for(const id of ['customerPreview','customerInboxDialog','customerCaseDialog','customerBankDialog','customerActionDialog'])if($(id).open)$(id).close();clearPreview();$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');$('customersList').innerHTML='';$('customerFiles').innerHTML='';$('customerHistory').innerHTML='';$('customerNotes').innerHTML='';$('customerInboxList').innerHTML='';$('customerName').textContent='';$('customerIdentity').textContent='';$('customerOwner').textContent='';$('customerNextAction').textContent='';$('customerSourceInfo').textContent='';$('customerLastUpdated').textContent='';$('customerLegacyNotes').textContent='';$('customerWhatsapp').removeAttribute('href');$('customerProfileForm').reset();$('customerCaseForm').reset();$('customerCaseFeedback').textContent='';$('customerNoteForm').reset();$('customersFilterForm').reset();$('customerDateBasis').value='received';$('customerReminders').open=false;$('customerReminderItems').replaceChildren();$('customerReminderCounts').textContent='';$('customerBankList').replaceChildren();$('customerBankForm').reset();$('customerActionForm').reset();$('customerActiveFilters').textContent='';$('customersTotal').textContent='';$('customerUpload').value='';$('customersNotice').classList.add('hide');$('customersLinkBanner').classList.add('hide');$('customersRefresh').disabled=false;busyState(false)}
const malaysiaFormDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function malaysiaInput(value){
 if(!value)return '';
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 const parts=Object.fromEntries(malaysiaFormDate.formatToParts(date).map(({type,value})=>[type,value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
}
function profileFollowStamp(lead,profile){
 const stamp=malaysiaInput(profile.follow_up_due_at);
 return stamp&&stamp.slice(0,10)===lead.follow_up_at?stamp:'';
}
function fillCatalogueSelect(id,placeholder,choices,saved=''){
 const field=$(id);
 const selected=saved??'';
 const options=[['',placeholder],...catalogue.optionsWithSaved(choices,selected)];
 if(field.options.length!==options.length||options.some(([value,label],index)=>{
  const current=field.options[index];
  return current.value!==value||current.text!==label;
 })){
  field.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
 }
 if(field.value!==selected)field.value=selected;
}
function renderVehicleChoices(model='',variant='',colour=''){
 const vehicle=catalogue.vehicleFor(model);
 fillCatalogueSelect('cpModel','Pilih model',catalogue.vehicles.map(item=>[item.model,item.name]),model);
 fillCatalogueSelect('cpVariant',model?'Pilih varian':'Pilih model dahulu',vehicle?.variants||[],variant);
 fillCatalogueSelect('cpColour',model?'Pilih warna':'Pilih model dahulu',vehicle?.colours||[],colour);
}
function changeCustomerModel(){
 const previous=sharedFlow?.data.model??customer?.lead.model??'';
 const patch=catalogue.selectionAfterModelChange(previous,$('cpModel').value,$('cpVariant').value,$('cpColour').value);
 renderVehicleChoices(patch.model,patch.variant,patch.colour);
 if(sharedFlow)sharedFlow.queue(window.VSO_VARIANTS?.customerQuote(sharedFlow.data,patch)||patch);
}
function toggleDelivered(){
 $('customerDeliveredField').classList.toggle('hide',$('cpStatus').value!=='delivered');
}
function mobileFollow(row){
 if(!row.follow_up_at)return '';
 return '<small class="customer-mobile-follow">Follow-up · '+esc(row.follow_up_due_at?when(row.follow_up_due_at):day(row.follow_up_at))+'</small>';
}
function bankSummary(row){
 if(row.bank_count===undefined)return '';
 const n=Number(row.bank_count)||0;
 const label=n?n+' bank · '+Number(row.bank_processing)+' diproses · '+Number(row.bank_approved)+' lulus':'Tambah bank';
 return '<button type="button" class="customer-bank-summary'+(n?'':' no-banks')+'" data-customer-open="'+esc(row.id)+'" data-profile-target="banks">'+esc(label)+'</button>';
}
function renderReminders(queue){
 $('customerReminderCounts').textContent=countNumber(queue.today)+' hari ini · '+countNumber(queue.overdue)+' terlepas';
 const items=queue.items||[];
 $('customerReminderItems').innerHTML=items.length?
  '<ul class="customer-reminder-list">'+items.map(item=>'<li><button type="button" class="secondary" data-customer-open="'+esc(item.id)+'"'+
   (item.bank_id?' data-profile-target="banks" data-bank-target="'+esc(item.bank_id)+'"':'')+'><b>'+esc(item.customer_name+(item.bank_name?' · '+item.bank_name:''))+'</b> · '+
   esc(item.next_action||'Follow-up')+' · '+esc(item.due_at?when(item.due_at):day(item.due_date))+(item.staff_name?' · '+esc(item.staff_name):'')+'</button></li>').join('')+'</ul>'+
   (items.length===50?'<p class="muted small">50 reminder terawal. Guna tapisan Hari ini atau Terlepas untuk semak senarai penuh pelanggan.</p>':''):
  '<p class="muted small">Tiada reminder hari ini atau terlepas.</p>';
}
async function openLinkedCustomer(button){
 const id=button.dataset.customerOpen,gen=epoch;
 if(!await open(id))return;
 if(gen!==epoch||customer?.lead.id!==id)return;
 if(button.dataset.profileTarget)showTab(button.dataset.profileTarget);
 if(button.dataset.bankTarget)document.getElementById('customer-bank-'+button.dataset.bankTarget)?.scrollIntoView({block:'center'});
}
const bankFields={
 cbName:'bank_name',cbStatus:'status',cbOfficer:'officer_name',cbPhone:'officer_phone',cbSubmitted:'submitted_at',cbSubmittedTime:'submitted_time',
 cbAmount:'amount',cbTerm:'term_months',cbApprovedAmount:'approved_amount',cbRate:'approved_rate',cbApprovedTerm:'approved_term_months',
 cbDue:'follow_up_due_at',cbNext:'next_action',cbNotes:'notes'
};
let editingBank=null,trackingAction=null;
function renderBanks(banks){
 $('customerBankCount').textContent=banks.length;
 $('customerBankList').innerHTML=banks.length?banks.map(bank=>{
  const submitted=[bank.submitted_at?day(bank.submitted_at):'',bank.submitted_time?bank.submitted_time.slice(0,5)+' MYT':''].filter(Boolean).join(' · ');
  const offer=[bank.approved_amount==null?'':money(bank.approved_amount),bank.approved_rate==null?'':bank.approved_rate+'%',bank.approved_term_months?bank.approved_term_months+' bulan':''].filter(Boolean);
  const lines=submitted?['Submit · '+submitted]:[];
  if(bank.officer_name||bank.officer_phone)lines.push('Pegawai · '+[bank.officer_name,bank.officer_phone].filter(Boolean).join(' · '));
  if(bank.amount!=null||bank.term_months)lines.push('Dipohon · '+[bank.amount!=null?money(bank.amount):'',bank.term_months?bank.term_months+' bulan':''].filter(Boolean).join(' · '));
  if(offer.length)lines.push('Lulus · '+offer.join(' · '));
  if(['submitted','review','documents','approved','rejected'].includes(bank.status)&&bank.amount!=null&&customer?.profile.loan_amount!=null&&Number(bank.amount)!==Number(customer.profile.loan_amount)){
   lines.push('Loan dalam profil kini '+money(customer.profile.loan_amount)+' · Jumlah rekod bank '+money(bank.amount));
  }
  if(bank.next_action||bank.follow_up_due_at)lines.push([bank.next_action,bank.follow_up_due_at?when(bank.follow_up_due_at):''].filter(Boolean).join(' · '));
  if(bank.notes)lines.push(bank.notes);
  return '<article class="customer-bank" id="customer-bank-'+esc(bank.id)+'"><h4>'+esc(bank.bank_name)+'</h4><div class="customer-bank-meta"><span class="customer-status">'+esc(BANKS[bank.status]||bank.status)+'</span>'+
    (bank.selected?'<span class="customer-status">Bank pilihan pelanggan</span>':'')+'</div><p>'+esc(lines.join('\n'))+'</p>'+
    '<small>Kemas kini '+esc(when(bank.updated_at))+'</small><div class="customer-tracking-actions">'+
    '<button type="button" class="secondary" data-bank-edit="'+esc(bank.id)+'">Edit bank</button>'+
    (bank.follow_up_due_at?'<button type="button" class="secondary" data-bank-edit="'+esc(bank.id)+'" data-reschedule-bank>Jadual semula</button><button type="button" class="secondary" data-bank-finish="'+esc(bank.id)+'">Selesai follow-up</button>':'')+'</div></article>';
 }).join(''):'<p class="muted small">Belum ada permohonan bank.</p>';
}
function showBankEditor(bank=null,reschedule=false){
 if(!customer||busy)return;
 editingBank=bank;
 $('customerBankForm').reset();
 fillCatalogueSelect('cbName','Pilih nama bank',catalogue.banks,bank?.bank_name);
 for(const [id,key] of Object.entries(bankFields)){
  let value=bank?.[key]??'';
  if(key==='status')value=value||'draft';
  if(key==='amount'&&!bank)value=sharedFlow?.data.loan_amount??customer.profile.loan_amount??'';
  if(key==='term_months'&&!bank){
   const years=String(sharedFlow?.data.loan_term??customer.profile.shared_fields?.loan_term??'').match(/^([1-9]|10)(?:\s*tahun)?$/i);
   if(years)value=Number(years[1])*12;
  }
  if(key==='follow_up_due_at')value=malaysiaInput(value);
  if(key==='submitted_time')value=value.slice(0,5);
  $(id).value=value;
 }
 $('cbSelected').checked=bank?.selected===true;
 const loan=sharedFlow?.data.loan_amount??customer.profile.loan_amount;
 const selling=sharedFlow?.data.selling_price??customer.profile.selling_price;
 const car=[customer.lead.model,customer.profile.variant,customer.profile.colour].filter(Boolean).join(' · ');
 $('customerBankQuote').textContent=[car,selling==null?'':'Harga jualan: '+money(selling),loan==null?'':'Loan dipohon: '+money(loan)].filter(Boolean).join(' · ');
 $('customerBankTitle').textContent=bank?'Edit '+bank.bank_name:'Tambah bank';
 $('customerBankFeedback').textContent='';
 $('customerBankOptional').open=reschedule||!!bank&&(bank.selected===true||Object.values(bankFields).some(key=>!['bank_name','status'].includes(key)&&bank[key]!==null&&bank[key]!==undefined&&bank[key]!==''));
 $('customerBankDialog').showModal();
 if(reschedule)$('cbDue').focus();
}
function showTrackingAction(action,bank=null){
 if(!customer||busy)return;
 if(dirty){notice('Simpan perubahan profil dahulu.',true);return}
 trackingAction={action,bank};
 $('customerActionForm').reset();
 $('customerActionTitle').textContent=action==='record_contact'?'Catat pelanggan dihubungi':bank?'Selesai follow-up '+bank.bank_name:'Selesai follow-up';
 $('customerActionFeedback').textContent='';
 $('customerActionDialog').showModal();
}
function bindTracking(){
 for(const id of ['customersBankStatus','cbStatus'])$(id).insertAdjacentHTML('beforeend',Object.entries(BANKS).map(([k,label])=>'<option value="'+k+'">'+label+'</option>').join(''));
 for(const id of ['customerDateBasis','customersFollow','customersBank','customersBankStatus'])$(id).addEventListener('change',()=>directory());
 $('customerReminders').addEventListener('click',e=>{
  const button=e.target.closest('[data-tracking-filter]');if(!button)return;
  $('customersFilterForm').reset();$('customerDateBasis').value='received';$('customerInsightsPeriod').value='all';insightPreset();
  $('customersFollow').value=button.dataset.trackingFilter;
  directory().then(()=>{if(user&&!customer)$('customerListHeading').scrollIntoView({block:'start',behavior:'smooth'})});
 });
 $('cpModel').addEventListener('change',changeCustomerModel);
 $('cpStatus').addEventListener('change',toggleDelivered);
 $('customerAddBank').addEventListener('click',()=>showBankEditor());
 $('customerBankClose').addEventListener('click',()=>$('customerBankDialog').close());
 $('customerBankDialog').addEventListener('close',()=>{editingBank=null;$('customerBankForm').reset()});
 $('customerBankList').addEventListener('click',e=>{
  const button=e.target.closest('[data-bank-edit],[data-bank-finish]');if(!button)return;
  const bank=customer?.banks?.find(b=>b.id===(button.dataset.bankEdit||button.dataset.bankFinish));if(!bank)return;
  if(button.dataset.bankEdit)showBankEditor(bank,button.hasAttribute('data-reschedule-bank'));else showTrackingAction('complete_follow_up',bank);
 });
 $('customerBankForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!customer||busy)return;
  const data=Object.fromEntries(Object.entries(bankFields).map(([id,key])=>[key,$(id).value.trim()]));
  data.selected=$('cbSelected').checked;
  if(editingBank){data.id=editingBank.id;data.expected_updated_at=editingBank.updated_at}
  if(await runWrite('save_bank',data,'Permohonan bank disimpan.'))$('customerBankDialog').close();
  else $('customerBankFeedback').textContent=$('customersNotice').textContent;
 });
 $('customerRecordContact').addEventListener('click',()=>showTrackingAction('record_contact'));
 $('customerFinishFollow').addEventListener('click',()=>showTrackingAction('complete_follow_up'));
 $('customerRescheduleFollow').addEventListener('click',()=>{$('cpFollow').focus();$('cpFollow').scrollIntoView({block:'center'})});
 $('customerActionClose').addEventListener('click',()=>$('customerActionDialog').close());
 $('customerActionDialog').addEventListener('close',()=>{trackingAction=null;$('customerActionForm').reset()});
 $('customerActionForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!trackingAction||!customer||busy)return;
  const {action,bank}=trackingAction;
  const data={note:$('customerActionNote').value};
  if(action==='complete_follow_up')Object.assign(data,bank?{id:bank.id,expected_updated_at:bank.updated_at}:
   {expected_revision:customer.profile.revision,expected_lead_updated_at:customer.lead.updated_at});
  if(await runWrite(action,data,action==='record_contact'?'Hubungan direkodkan.':'Follow-up ditandakan selesai.'))$('customerActionDialog').close();
  else $('customerActionFeedback').textContent=$('customersNotice').textContent;
 });
}
window.FARIS_CUSTOMERS={onLogin(account){reset();user=account;$('customersStaff').classList.toggle('hide',user.role!=='admin')},onLogout:reset,onWhatsappShow:loadWhatsappTrend,onShow(){const params=new URLSearchParams(location.search),target=params.get('customer');if(target&&/^[a-f0-9-]{36}$/i.test(target)){const requestedTab=params.get('customer_tab');params.delete('customer');params.delete('customer_tab');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);open(target).then(()=>{if(customer?.lead.id===target&&requestedTab==='documents')showTab('documents')});return}if(customer){const gen=epoch;Promise.resolve(sharedFlow?.flush()).then(()=>refreshProfile()).catch(e=>{if(gen===epoch)notice(e.message,true)})}else directory()},open,
 linkFromInbox(data){if(!user||busy||!data.ids?.length)return;linkHandoff=data;sharedFlow?.flush().then(()=>{if(!customer){sharedFlow?.close();sharedFlow=null}}).catch(e=>notice(e.message,true));customer=null;dirty=false;$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');window.FARIS_NAV.show('customers');renderDirectory()}};
document.addEventListener('DOMContentLoaded',()=>{
 if(window.FARIS_CUSTOMER_WORKFLOW&&window.FARIS_APPLICATION_CORE)mountSharedProfile();
 insightPreset();whatsappTrendPreset();bindTracking();
 document.querySelectorAll('[data-customer-tool]').forEach(button=>button.addEventListener('click',()=>leaveForTool(button.dataset.customerTool)));
 for(const id of Object.keys(sharedProfileFields)){
  if(id==='cpModel')continue;
  const key=sharedProfileFields[id];
  const financial=['selling_price','otr_price','insurance_amount','rebate_amount','deposit','loan_amount'].includes(key);
  if(!financial&&!['variant','colour'].includes(key))$(id)?.addEventListener('input',e=>sharedFlow?.queue({[key]:e.target.value}));
  else {
   const save=e=>{
    if(!sharedFlow||!e.target.validity.valid)return;
    const value=financial?(e.target.value===''?null:Number(e.target.value)):e.target.value.trim();
    const patch={[key]:value};
    sharedFlow.queue(window.VSO_VARIANTS?.customerQuote(sharedFlow.data,patch)||patch);
    renderSharedValues(sharedFlow.data);
   };
   $(id)?.addEventListener('change',save);
  }
 }
 window.addEventListener('focus',()=>sharedFlow?.refresh());
 $('whatsappTrendForm').addEventListener('submit',e=>{e.preventDefault();loadWhatsappTrend()});
 $('whatsappWeekDate').addEventListener('change',loadWhatsappTrend);
 $('whatsappWeekPrevious').addEventListener('click',()=>whatsappShiftWeek(-1));
 $('whatsappWeekNext').addEventListener('click',()=>whatsappShiftWeek(1));
 $('whatsappWeekCurrent').addEventListener('click',()=>{whatsappTrendPreset();loadWhatsappTrend()});
 $('customersClearFilters').addEventListener('click',()=>{
  $('customersFilterForm').reset();$('customerDateBasis').value='received';$('customerInsightsPeriod').value='all';insightPreset();directory();
 });
 $('customerInsightsResult').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-insight-bucket')){$('customersBucket').value=$('customersBucket').value===b.dataset.insightBucket?'':b.dataset.insightBucket}else if(b.hasAttribute('data-insight-model')){$('customersModel').value=b.dataset.insightModel;const v=$('customersVariant');if(![...v.options].some(o=>o.value===b.dataset.insightVariant))v.add(new Option(JSON.parse(b.dataset.insightVariant)||'Varian belum diisi',b.dataset.insightVariant));v.value=b.dataset.insightVariant}else if(b.hasAttribute('data-insight-colour')){$('customersColour').value=b.dataset.insightColour}else if(b.hasAttribute('data-insight-status')){$('customersStatus').value=b.dataset.insightStatus}else return;directory().then(()=>{if(user)$('customerListHeading').scrollIntoView({behavior:'smooth',block:'start'})})});
 $('customerInsightsForm').addEventListener('submit',e=>{e.preventDefault();loadInsights()});
 $('customerInsightsPeriod').addEventListener('change',()=>{if($('customerInsightsPeriod').value!=='custom'){insightPreset();loadInsights()}});
 for(const id of ['customerInsightsFrom','customerInsightsTo'])$(id).addEventListener('change',()=>{$('customerInsightsPeriod').value='custom';loadInsights()});
 $('customerInsightsGroup').addEventListener('change',loadInsights);

 for(const id of ['customersStatus','cpStatus','customerCaseStatus'])$(id).insertAdjacentHTML('beforeend',Object.entries(STATUSES).map(([v,label])=>'<option value="'+v+'">'+label+'</option>').join(''));

 document.addEventListener('click',e=>{const b=e.target.closest('[data-customer-open]');if(b)openLinkedCustomer(b)});
 $('customersFilterForm').addEventListener('submit',e=>{e.preventDefault();directory()});for(const id of ['customersStatus','customersVariant','customersColour','customersBucket','customersStaff'])$(id).addEventListener('change',()=>directory());$('customersModel').addEventListener('change',()=>{$('customersVariant').value='';$('customersColour').value='';directory()});$('customersMore').addEventListener('click',()=>directory(true));
 $('customersRefresh').addEventListener('click',async()=>{if(busy)return;try{if(customer){if((dirty||sharedFlow?.dirty)&&!confirm('Buang perubahan belum disimpan dan refresh profil?'))return;sharedFlow?.close();sharedFlow=null;await refreshProfile(true);attachSharedProfile()}else await directory()}catch(e){notice(e.message,true)}});
 $('customerBack').addEventListener('click',async()=>{if(busy||dirty&&!confirm('Tinggalkan perubahan profil yang belum disimpan?'))return;try{await sharedFlow?.flush()}catch(error){notice(error.message,true);return}sharedFlow?.close();sharedFlow=null;opening++;customer=null;dirty=false;resetHistory();$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');directory()});
 $('customersLinkCancel').addEventListener('click',()=>{linkHandoff=null;renderDirectory()});
 $('customersList').addEventListener('click',async e=>{const b=e.target.closest('[data-customer-link-target]');if(!b||!linkHandoff||busy)return;const handoff=linkHandoff,gen=epoch;b.disabled=true;busy=true;try{await mutate('link_files',{ids:handoff.ids,party:handoff.party,category:handoff.category},b.dataset.customerLinkTarget);if(gen!==epoch)return;linkHandoff=null;$('customersLinkBanner').classList.add('hide');busy=false;await open(b.dataset.customerLinkTarget);showTab('documents');notice('Fail telah dipautkan kepada profil customer.');window.FARIS_INBOX?.onShow?.()}catch(err){if(gen===epoch)notice(err.message,true)}finally{if(gen===epoch){busy=false;b.disabled=false}}});
 document.querySelectorAll('[data-customer-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.customerTab)));
 document.addEventListener('invalid',e=>{if(e.target.form?.id==='customerProfileForm'){const panel=e.target.closest('[data-customer-panel]');if(panel)showTab(panel.dataset.customerPanel)}},true);
 document.addEventListener('input',e=>{if(customer&&(e.target.form?.id==='customerProfileForm')&&(!sharedFlow||!sharedProfileFields[e.target.id]))dirty=true});$('cpStatus').addEventListener('change',reasonRequired);
 $('customerProfileForm').addEventListener('submit',e=>{e.preventDefault();if($('cpFollowTime').value&&!$('cpFollow').value){notice('Pilih tarikh untuk masa follow-up.',true);$('cpFollow').focus();return}runWrite('save_profile',profileValues(),'Profil customer disimpan.')});
 $('customerNoteForm').addEventListener('submit',async e=>{e.preventDefault();if(await runWrite('add_note',{note:$('customerNote').value.trim()},'Nota ditambah ke profil dan sejarah.'))$('customerNote').value=''});
 $('customerStatusBadge').addEventListener('click',openCaseStatus);
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-customer-status-open]');if(!b||busy)return;const gen=epoch,id=b.dataset.customerStatusOpen;await open(id);if(gen===epoch&&customer?.lead.id===id)openCaseStatus()});
 $('customerCaseClose').addEventListener('click',()=>$('customerCaseDialog').close());$('customerCaseCancel').addEventListener('click',()=>$('customerCaseDialog').close());$('customerCaseStatus').addEventListener('change',caseReasonRequired);
 $('customerCaseForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!customer||busy)return;
  const gen=epoch,id=customer.lead.id;$('customerCaseFeedback').textContent='Menyimpan status…';
  if(await runWrite('save_profile',caseStatusValues(),'Status kes dikemas kini dan direkodkan dalam Sejarah.')){if(gen===epoch&&customer?.lead.id===id)$('customerCaseDialog').close()}
  else if(gen===epoch&&customer?.lead.id===id)$('customerCaseFeedback').textContent=$('customersNotice').textContent||'Status belum disimpan. Cuba lagi.';
 });
 $('customerUploadButton').addEventListener('click',()=>$('customerUpload').click());$('customerUpload').addEventListener('change',upload);$('customerPickInbox').addEventListener('click',pickInbox);$('customerOpenCompiler').addEventListener('click',compiler);
 $('customerFiles').addEventListener('change',e=>{const id=e.target.dataset.customerFile;if(id){e.target.checked?selected.add(id):selected.delete(id);selection()}});
 $('customerFiles').addEventListener('click',e=>{const p=e.target.closest('[data-customer-preview]'),d=e.target.closest('[data-customer-download]'),u=e.target.closest('[data-customer-unlink]');if(p)preview(p.dataset.customerPreview);if(d)download(d.dataset.customerDownload,d);if(u&&confirm('Nyahpaut fail daripada customer ini? Fail asal kekal dalam Fail Masuk.'))runWrite('unlink_file',{id:u.dataset.customerUnlink},'Fail dinyahpaut. Fail asal kekal dalam Fail Masuk.')});
 $('customerHistoryMore').addEventListener('click',()=>loadHistory(true));
 $('customerInboxSearchForm').addEventListener('submit',e=>{e.preventDefault();loadPicker()});$('customerInboxMore').addEventListener('click',()=>loadPicker(true));$('customerInboxClose').addEventListener('click',()=>$('customerInboxDialog').close());$('customerInboxDialog').addEventListener('close',()=>{pickerSeq++;pickerSelected.clear();$('customerInboxList').innerHTML=''});
 $('customerInboxList').addEventListener('change',e=>{const id=e.target.dataset.customerInbox;if(id){e.target.checked?pickerSelected.add(id):pickerSelected.delete(id);$('customerInboxStatus').textContent=pickerSelected.size+' fail dipilih'}});
 $('customerInboxLink').addEventListener('click',async()=>{if(!pickerSelected.size||busy)return;$('customerInboxLink').disabled=true;try{if(await runWrite('link_files',{ids:[...pickerSelected],...pickerMeta},'Fail dipautkan kepada profil customer.'))$('customerInboxDialog').close()}finally{$('customerInboxLink').disabled=false}});
 $('customerPreviewClose').addEventListener('click',()=>$('customerPreview').close());$('customerPreview').addEventListener('close',clearPreview);$('customerPreviewDownload').addEventListener('click',()=>{if(previewFile&&user)saveFile(previewFile)});
 $('customerWhatsapp').addEventListener('click',e=>{if(!customer?.lead.consent_confirmed){e.preventDefault();return}const gen=epoch;request('opened',{lead_id:customer.lead.id},'lead-hub').catch(err=>{if(gen===epoch)notice(err.message,true)})});
});
})();
