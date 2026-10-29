(()=>{
'use strict';
const ROOT='https://qagsczjxzshjxmmxvkbq.supabase.co/functions/v1/',SESSION='faris_lead_hub_session_v2';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATUSES={new:'Lead baharu',contacted:'Dihubungi',interested:'Berminat',documents:'Mengumpul dokumen',bank_submitted:'Permohonan bank',approved:'Diluluskan',delivery:'Urusan serahan',delivered:'Kereta diserahkan',on_hold:'Tangguh',cancelled:'Tidak diteruskan'};
const BANKS={draft:'Belum dihantar',submitted:'Dihantar ke bank',documents:'Bank minta dokumen',approved:'Diluluskan',rejected:'Ditolak',cancelled:'Dibatalkan'};
const PARTIES={HIRER:'Pemohon',GUARANTOR:'Penjamin',REBATE:'COP Rebate'},CATS={AUTO:'Semak kategori',VSO:'VSO',IC:'Kad pengenalan',LESEN:'Lesen',PAYSLIP:'Slip gaji',BANK:'Penyata bank',OTHER:'Lain-lain',IC_FRONT:'IC hadapan',IC_BACK:'IC belakang',SURAT_KERJA:'Surat kerja',SIJIL_LAHIR:'Sijil lahir',SIJIL_NIKAH:'Sijil nikah'};
const WA={new:'Belum diambil',claimed:'Sudah diambil',contacted:'Dihubungi',follow_up:'Follow-up',interested:'Berminat',booked:'Booking',not_interested:'Tidak berminat'};
const when=v=>v?new Date(v).toLocaleString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const day=v=>v?new Date(v.slice(0,10)+'T12:00:00+08:00').toLocaleDateString('ms-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short',year:'numeric'}):'Belum ditetapkan';
const money=v=>v===null||v===undefined||v===''?'—':'RM '+Number(v).toLocaleString('ms-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
let user=null,epoch=0,listing=0,opening=0,rows=[],next=null,customer=null,tab='summary',selected=new Set(),busy=false,dirty=false,editRevision=0,editStamp='',bankId=null;
let historyRows=[],historyNext=null,historyLoaded=false,historySeq=0,linkHandoff=null;
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
function busyState(on){busy=on;document.querySelectorAll('#customerDetail button,#customerDetail input,#customerDetail select,#customerDetail textarea,#customerCaseDialog button,#customerCaseDialog input,#customerCaseDialog select,#customerCaseDialog textarea').forEach(n=>n.disabled=on);$('customersRefresh').disabled=on;if(!on)selection()}
const insightCore=window.FARIS_INSIGHTS;
const countNumber=n=>Math.max(0,Number(n)||0).toLocaleString('ms-MY');
const BUCKETS={lou:'LOU',delivered:'DELIVER',pending:'PENDING',trade_in:'TRADE IN'};
function exactFilter(id){const value=$(id).value;return value===''?null:JSON.parse(value)}
function insightFilters(){return {search:$('customersSearch').value,status:$('customersStatus').value,model:exactFilter('customersModel'),variant:exactFilter('customersVariant'),colour:exactFilter('customersColour'),bucket:$('customersBucket').value,staff_id:user?.role==='admin'?$('customersStaff').value:'',from:$('customerInsightsFrom').value,to:$('customerInsightsTo').value,group:$('customerInsightsGroup').value}}
function insightBars(title,data,total,kind,labels={}){
 return '<section class="insights-panel"><h4>'+esc(title)+'</h4>'+(data.length?'<ul class="insights-bars">'+data.map(x=>{
  const n=Number(x.value)||0,pct=total?Math.max(0,Math.min(100,n/total*100)):0;
  const attr=kind==='vehicle'?'data-insight-model="'+esc(JSON.stringify(x.model))+'" data-insight-variant="'+esc(JSON.stringify(x.variant))+'"':kind==='colour'?'data-insight-colour="'+esc(JSON.stringify(x.key))+'"':'data-insight-status="'+esc(x.label)+'"';
  return '<li><button type="button" class="insights-drill" '+attr+'><span>'+esc(labels[x.label]||x.label)+'</span><b>'+countNumber(n)+'</b><span class="insights-track"><span style="width:'+pct.toFixed(2)+'%"></span></span></button></li>';
 }).join('')+'</ul>':'<p class="insights-empty">Tiada data untuk tapisan ini.</p>')+'</section>';
}
function renderInsights(d,filters){
 const stats=d.stats||{},total=Number(d.total)||0;
 const cards=[['LOU',stats.lou,'LOU diterima, belum diserahkan','lou'],['DELIVER',stats.delivered,'Kereta telah diserahkan','delivered'],['PENDING',stats.pending,'Aktif, belum LOU / Deliver','pending'],['TRADE IN',stats.trade_in,'Profil ditanda Trade In','trade_in']];
 const trend=d.trend||[],max=Math.max(1,...trend.map(x=>Number(x.total)||0));
 $('customerInsightsResult').innerHTML='<div class="insights-kpis">'+cards.map(([label,value,hint,key])=>'<button type="button" class="insights-kpi '+key+'" data-insight-bucket="'+key+'" aria-pressed="'+String(filters.bucket===key)+'"><span>'+label+'</span><strong>'+countNumber(value)+'</strong><small>'+esc(hint)+'</small><small class="insights-kpi-link">Lihat senarai →</small></button>').join('')+'</div>'+
 '<div class="insights-meta"><span>Jumlah dalam tapisan <b>'+countNumber(stats.total)+'</b></span><span>Tangguh <b>'+countNumber(stats.on_hold)+'</b></span><span>Tidak diteruskan <b>'+countNumber(stats.cancelled)+'</b></span><span>'+esc(filters.from||'Awal rekod')+' → '+esc(filters.to||'Terkini')+' · Waktu Malaysia</span></div>'+
 '<section class="insights-panel insights-trend"><div class="insights-panel-title"><h4>Trend lead masuk</h4><span>Ikut kategori dan tapisan dipilih</span></div>'+(trend.length?'<div class="insights-trend-scroll"><table><caption class="sr-only">Trend status semasa kumpulan lead masuk</caption><thead><tr><th>Tempoh</th><th>Jumlah</th><th>LOU</th><th>Deliver</th><th>Pending</th><th>Trade In</th><th class="insights-trend-bar-cell">Trend</th></tr></thead><tbody>'+trend.map(x=>'<tr><th>'+esc(insightCore.bucketLabel(x.bucket,filters.group))+'</th><td>'+countNumber(x.total)+'</td><td>'+countNumber(x.lou)+'</td><td>'+countNumber(x.delivered)+'</td><td>'+countNumber(x.pending)+'</td><td>'+countNumber(x.trade_in)+'</td><td class="insights-trend-bar-cell"><div class="insights-track"><span style="width:'+Math.min(100,Math.max(0,(Number(x.total)||0)/max*100)).toFixed(2)+'%"></span></div></td></tr>').join('')+'</tbody></table></div>':'<p class="insights-empty">Tiada lead dalam tapisan ini. Cuba tempoh atau tapisan lain.</p>')+'</section>'+
 '<p class="muted small insights-help">Tekan model / varian, warna atau status untuk lihat senarai pelanggan di bawah.</p><div class="insights-breakdowns">'+insightBars('Model & varian',d.vehicles||[],total,'vehicle')+insightBars('Warna kereta',d.colours||[],total,'colour')+insightBars('Status jualan',d.statuses||[],total,'status',STATUSES)+'</div>';
 $('customerInsightsContext').textContent='Dikemas kini '+when(d.generated_at)+' · '+countNumber(total)+' pelanggan dalam senarai'+(filters.bucket?' · '+BUCKETS[filters.bucket]:'')+'. Kotak angka ikut tapisan di bawah; pilih kotak lain untuk tukar kategori.';
 renderFilterSummary(filters);
}
function renderFilterSummary(filters){
 const labels=[];for(const id of ['customersModel','customersVariant','customersColour','customersStatus','customersStaff'])if($(id).value)labels.push($(id).selectedOptions[0]?.textContent||'');
 if(filters.bucket)labels.unshift(BUCKETS[filters.bucket]);if(filters.search)labels.push('Carian: '+filters.search);
 $('customerActiveFilters').textContent=labels.length?'Senarai: '+labels.join(' · '):'Senarai semua pelanggan dalam tempoh dipilih.';
 $('customersClearFilters').disabled=!labels.length;
}
function fillDashboardOptions(options){
 for(const [id,items] of [
  ['customersModel',(options.models||[]).map(x=>[JSON.stringify(x.model),x.model||'Model belum dipilih'])],
  ['customersVariant',(options.variants||[]).map(x=>[JSON.stringify(x.value),x.label])],
  ['customersColour',(options.colours||[]).map(x=>[JSON.stringify(x.value),x.label])],
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
 $('customersList').innerHTML=rows.length?rows.map(r=>'<article class="customer-list-row"><div><b>'+esc(r.customer_name)+'</b><small>'+esc(r.phone_e164)+'</small></div><div><small class="customer-label">Model / Varian / Warna</small><b>'+esc(r.model||'Belum dipilih')+'</b><small>'+esc(r.variant||'Varian belum diisi')+' · '+esc(r.colour||'Warna belum diisi')+'</small></div><div><small class="customer-label">Status</small><button type="button" class="customer-status" data-customer-status-open="'+esc(r.id)+'" aria-haspopup="dialog" aria-controls="customerCaseDialog">'+esc(caseStage(r))+' ↗</button><small>'+(r.trade_in?'Trade In':'')+'</small></div><div><small class="customer-label">Staff urus</small><b>'+esc(r.staff_name||'Belum diagih')+'</b><small>'+esc(r.staff_code||'')+'</small></div><div><small class="customer-label">Follow-up</small><b>'+esc(day(r.follow_up_at))+'</b><small>'+esc(r.next_action||'Belum ditetapkan')+'</small></div><button class="'+(linkHandoff?'primary':'secondary')+'" type="button" '+(linkHandoff?'data-customer-link-target':'data-customer-open')+'="'+esc(r.id)+'">'+(linkHandoff?'Pautkan '+linkHandoff.ids.length+' Fail':'Lihat Profil')+'</button></article>').join(''):'<div class="empty">Tiada customer dalam tapisan ini. Tukar tapisan atau tempoh.</div>';
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
  fillDashboardOptions(d.options||{});renderInsights(d.insights,filters);$('customersTotal').textContent=rows.length+' daripada '+d.total+' pelanggan sepadan';renderDirectory();
 }catch(e){if(gen===epoch&&id===listing){if(!append){rows=[];next=null;renderDirectory();$('customersTotal').textContent='Senarai belum tersedia.';host.innerHTML='<p class="insights-error" role="alert">'+esc(e.message)+'</p>'}notice(e.message,true)}}
 finally{if(gen===epoch&&id===listing){host.setAttribute('aria-busy','false');$('customersList').setAttribute('aria-busy','false');$('customersMore').disabled=false}}
}
function showTab(value){tab=value;document.querySelectorAll('[data-customer-panel]').forEach(n=>n.classList.toggle('hide',n.dataset.customerPanel!==tab));document.querySelectorAll('[data-customer-tab]').forEach(n=>{if(n.dataset.customerTab===tab)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});if(tab==='history'&&!historyLoaded)loadHistory()}
function caseStage(profile){
 if(profile.sales_status==='delivered')return 'DELIVER · Kereta diserahkan';
 if(['on_hold','cancelled'].includes(profile.sales_status))return STATUSES[profile.sales_status];
 if(profile.lou_received)return 'LOU diterima';
 return STATUSES[profile.sales_status]||profile.sales_status;
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
 $('customerName').textContent=l.customer_name;$('customerIdentity').textContent=l.phone_e164+' · '+(l.model||'Model belum dipilih')+(p.variant?' / '+p.variant:'');$('customerOwner').textContent='Staff urus: '+(staff?staff.display_name+' ('+staff.staff_code+')':'Belum diagih');$('customerStatusBadge').textContent=STATUSES[p.sales_status]||p.sales_status;
 $('customerNextAction').innerHTML='<b>Tindakan seterusnya</b>'+esc(p.next_action||'Belum ditetapkan')+'<br>Follow-up: '+esc(day(l.follow_up_at));
 const wa=$('customerWhatsapp');wa.setAttribute('aria-disabled',String(!l.consent_confirmed));if(l.consent_confirmed)wa.href='https://wa.me/'+l.phone_e164;else wa.removeAttribute('href');
 if(fill){for(const [id,value] of Object.entries({cpName:l.customer_name,cpPhone:l.phone_e164,cpModel:l.model,cpVariant:p.variant,cpColour:p.colour||'',cpStatus:p.sales_status,cpFollow:l.follow_up_at,cpNext:p.next_action,cpReason:p.closure_reason,cpBooking:p.booking_status,cpBookingAmount:p.booking_amount,cpPrice:p.selling_price,cpDeposit:p.deposit,cpLoan:p.loan_amount}))$(id).value=value??'';$('cpGuarantor').checked=p.guarantor_required;$('cpLou').checked=p.lou_received===true;$('cpTradeIn').checked=p.trade_in===true;editRevision=p.revision;editStamp=l.updated_at;dirty=false;reasonRequired()}
 $('customerSourceInfo').textContent='Sumber: '+(l.source||'—')+'\nLead diwujudkan: '+when(l.created_at)+'\nStatus WhatsApp: '+(WA[l.stage]||l.stage)+(l.pm_confirmed_at?' · PM disahkan '+when(l.pm_confirmed_at):'');
 $('customerLegacyNotes').textContent=l.notes?'Catatan WhatsApp semasa:\n'+l.notes:'Belum ada catatan WhatsApp.';
 $('customerDocCount').textContent=customer.files.length;
 selected=new Set([...selected].filter(id=>customer.files.some(f=>f.id===id)));
 $('customerFiles').innerHTML=referenceFilesMarkup(customer.files);
 $('customerBanks').innerHTML=customer.banks.length?customer.banks.map(b=>'<article class="customer-bank"><h4>'+esc(b.bank_name)+' · '+esc(BANKS[b.status]||b.status)+'</h4><p>Jumlah: '+esc(money(b.amount))+'\nTarikh dihantar: '+esc(day(b.submitted_at))+(b.notes?'\n'+esc(b.notes):'')+'</p><div class="customer-row-actions"><button type="button" class="secondary" data-bank-edit="'+esc(b.id)+'">Edit Bank</button><button type="button" class="secondary" data-bank-delete="'+esc(b.id)+'">Padam Rekod Bank</button></div></article>').join(''):'<p class="customer-note-empty">Belum ada permohonan bank direkodkan.</p>';
 $('customerFollowSummary').textContent='Follow-up: '+day(l.follow_up_at)+'\nTindakan seterusnya: '+(p.next_action||'Belum ditetapkan');
 $('customerNotes').innerHTML=customer.notes.length?customer.notes.map(n=>'<article class="customer-note"><small>'+esc(n.actor_name+' ('+n.actor_code+') · '+when(n.created_at))+'</small><p>'+esc(n.details.note)+'</p></article>').join(''):'<p class="customer-note-empty">Belum ada nota profil. Catatan WhatsApp sedia ada boleh dilihat dalam Ringkasan.</p>';
 if(customer.notes.length===100)$('customerNotes').insertAdjacentHTML('beforeend','<p class="small muted">100 nota terkini dipaparkan. Nota terdahulu kekal dalam Sejarah.</p>');selection();
}
function selection(){$('customerSelectedCount').textContent=selected.size+' fail dipilih';$('customerOpenCompiler').disabled=busy||!selected.size}
function reasonRequired(){$('cpReason').required=['on_hold','cancelled'].includes($('cpStatus').value)}
async function open(id){
 if(!user||busy)return;if(dirty&&!confirm('Buka customer lain dan tinggalkan perubahan profil yang belum disimpan?'))return;
 const gen=epoch,seq=++opening;customer=null;window.FARIS_NAV.show('customers',{scroll:false});dirty=false;selected.clear();historySeq++;historyRows=[];historyNext=null;historyLoaded=false;resetBank();$('customerDetail').classList.add('hide');$('customersDirectory').classList.add('hide');notice('Memuatkan profil customer…');
 try{const d=await request('get',{lead_id:id});if(gen!==epoch||seq!==opening)return;customer=d.customer;$('customerDetail').classList.remove('hide');$('customersNotice').classList.add('hide');renderProfile();showTab('summary');$('workspace-customers').scrollIntoView({block:'start'})}
 catch(e){if(gen===epoch&&seq===opening){notice(e.message,true);$('customersDirectory').classList.remove('hide')}}
}
async function refreshProfile(force=false){
 if(!customer||!user)return;const gen=epoch,id=customer.lead.id,seq=++opening;
 let d;try{d=await request('get',{lead_id:id})}catch(e){if(gen===epoch&&customer?.lead.id===id&&e.status===403)forgetCustomer();throw e}if(gen!==epoch||seq!==opening||customer?.lead.id!==id)return;customer=d.customer;renderProfile(force||!dirty);historyLoaded=false;historyRows=[];historyNext=null;historySeq++;if(tab==='history')loadHistory();
}
function profileValues(){return {customer_name:$('cpName').value.trim(),model:$('cpModel').value.trim(),variant:$('cpVariant').value.trim(),colour:$('cpColour').value.trim(),sales_status:$('cpStatus').value,follow_up_at:$('cpFollow').value||null,next_action:$('cpNext').value.trim(),closure_reason:$('cpReason').value.trim(),guarantor_required:$('cpGuarantor').checked,lou_received:$('cpLou').checked,trade_in:$('cpTradeIn').checked,booking_status:$('cpBooking').value,booking_amount:$('cpBookingAmount').value||null,selling_price:$('cpPrice').value||null,deposit:$('cpDeposit').value||null,loan_amount:$('cpLoan').value||null,expected_revision:editRevision,expected_lead_updated_at:editStamp}}
async function runWrite(action,data,success,button=null){
 if(busy||!customer)return false;const gen=epoch,id=customer.lead.id;busyState(true);if(button)button.disabled=true;
 try{await mutate(action,data,id);if(gen!==epoch||customer?.lead.id!==id)return false;if(action==='save_profile')dirty=false;await refreshProfile();if(gen!==epoch)return false;notice(success);return true}
 catch(e){if(gen===epoch){notice(e.message,true);if(e.status===403){try{await refreshProfile()}catch{}}}return false}finally{if(gen===epoch){busyState(false);if(button)button.disabled=false}}
}
async function upload(){
 const files=[...$('customerUpload').files];if(!customer||busy||!files.length)return;
 const gen=epoch,id=customer.lead.id,party='HIRER',category='OTHER';let saved=0,linked=0;busyState(true);
 try{for(const file of files){if(gen!==epoch||customer?.lead.id!==id)return;if(file.size>20*1048576)throw Error(file.name+' melebihi 20 MB.');notice('Menyimpan '+(saved+1)+' / '+files.length+': '+file.name);const d=await window.FARIS_INBOX_CLIENT.upload(file);saved++;if(gen!==epoch)return;await mutate('link_files',{ids:d.files.map(f=>f.id),party,category},id);linked++}
  if(gen===epoch)notice(linked+' dokumen disimpan dan dipautkan kepada customer.');
 }catch(e){if(gen===epoch)notice(linked+' fail dipautkan. '+(saved>linked?'Fail yang sudah diupload kekal dalam Fail Masuk. ':'')+e.message,true)}
 finally{if(gen===epoch){$('customerUpload').value='';busyState(false);try{await refreshProfile()}catch(e){notice(e.message,true)}}}
}
function resetBank(){bankId=null;$('customerBankForm').reset();$('customerBankFormTitle').textContent='Tambah permohonan bank';$('customerBankCancel').classList.add('hide')}
function editBank(id){const b=customer?.banks.find(x=>x.id===id);if(!b)return;bankId=id;$('cbName').value=b.bank_name;$('cbStatus').value=b.status;$('cbAmount').value=b.amount??'';$('cbDate').value=b.submitted_at||'';$('cbNotes').value=b.notes;$('customerBankFormTitle').textContent='Edit permohonan bank';$('customerBankCancel').classList.remove('hide');$('cbName').focus()}
async function loadHistory(append=false){
 if(!customer)return;const gen=epoch,id=customer.lead.id,seq=++historySeq;$('customerHistoryMore').disabled=true;if(!append)$('customerHistory').textContent='Memuatkan sejarah…';
 try{const d=await request('timeline',{lead_id:id,offset:append?historyNext||0:0});if(gen!==epoch||id!==customer?.lead.id||seq!==historySeq)return;historyRows=append?[...new Map([...historyRows,...d.events].map(e=>[e.key,e])).values()]:d.events;historyNext=d.next_offset;historyLoaded=true;renderHistory()}
 catch(e){if(gen===epoch&&seq===historySeq){$('customerHistory').textContent=e.message;historyLoaded=false}}finally{if(gen===epoch&&seq===historySeq)$('customerHistoryMore').disabled=false}
}
const fieldNames={lou_received:'LOU diterima',trade_in:'Trade In',sales_status:'Status jualan',colour:'Warna kereta',variant:'Varian',next_action:'Tindakan seterusnya',closure_reason:'Sebab',guarantor_required:'Perlu penjamin',booking_status:'Status booking',booking_amount:'Jumlah booking',selling_price:'Harga jualan',deposit:'Deposit',loan_amount:'Jumlah pinjaman',customer_name:'Nama',model:'Model',follow_up_at:'Follow-up'};
function displayField(key,value){if(value===null||value===undefined||value==='')return '—';if(['booking_amount','selling_price','deposit','loan_amount','amount'].includes(key))return money(value);if(key==='sales_status')return STATUSES[value]||value;if(key==='status')return BANKS[value]||value;if(key==='booking_status')return {none:'Belum booking',pending:'Belum dibayar',paid:'Dibayar',refunded:'Dipulangkan'}[value]||value;if(typeof value==='boolean')return value?'Ya':'Tidak';if(key==='follow_up_at')return day(value);return String(value)}
function historyDetail(event){
 const d=event.details||{};
 if(event.event_type==='profile_updated')return '<ul>'+Object.entries(fieldNames).filter(([k])=>JSON.stringify(d.before?.[k])!==JSON.stringify(d.after?.[k])).map(([k,label])=>'<li>'+label+': '+esc(displayField(k,d.before?.[k]))+' → '+esc(displayField(k,d.after?.[k]))+'</li>').join('')+'</ul>';
 if(event.event_type==='note_added')return '<p>'+esc(d.note)+'</p>';
 if(event.event_type==='bank_updated'||event.event_type==='bank_removed')return '<p>'+esc((d.after||d.before)?.bank_name||'Bank')+' · '+esc(BANKS[d.before?.status]||'Tiada rekod')+' → '+esc(event.event_type==='bank_removed'?'Rekod dipadam':BANKS[d.after?.status]||'')+'\nJumlah: '+esc(money((d.after||d.before)?.amount))+((d.after||d.before)?.notes?'\n'+esc((d.after||d.before).notes):'')+'</p>';
 if(event.event_type==='documents_linked')return '<p>'+esc(PARTIES[d.party]+' / '+CATS[d.category])+'\n'+esc((d.files||[]).map(f=>f.name).join('\n'))+'</p>';
 if(event.event_type==='document_unlinked')return '<p>'+esc(d.name)+' · Fail asal kekal dalam Fail Masuk.</p>';
 if(event.event_type==='checklist_updated')return '<p>'+esc(PARTIES[d.party]+' / '+CATS[d.category])+': '+esc(({auto:'Automatik ikut fail',missing:'Belum diterima',received:'Diterima / disemak',replace:'Perlu ganti',not_required:'Tidak diperlukan'})[d.after]||d.after)+'</p>';
 if(['claimed','assigned','legacy_assignment'].includes(event.event_type))return '<p>Penerima: '+esc(d.assignee_name+' ('+d.assignee_code+')')+(event.event_type==='legacy_assignment'?'\nTarikh claim asal tidak direkodkan. Masa ini ialah masa rekod sejarah dimasukkan.':'')+'</p>';
 if(event.event_type==='status_updated')return '<p>Status WhatsApp: '+esc(WA[d.stage_before]||d.stage_before)+' → '+esc(WA[d.stage_after]||d.stage_after)+'</p>';
 if(event.event_type==='whatsapp_details_updated')return '<p>'+esc(d.note_changed?'Catatan sebelum: '+(d.notes_before||'—')+'\nCatatan selepas: '+(d.notes_after||'—'):'')+'\nFollow-up: '+esc(day(d.follow_up_before))+' → '+esc(day(d.follow_up_after))+'</p>';
 if(event.event_type==='lead_created')return '<p>Sumber: '+esc(d.source||'—')+'</p>';return '';
}
function renderHistory(){const labels={profile_updated:'Profil dikemas kini',note_added:'Nota ditambah',bank_updated:'Permohonan bank dikemas kini',bank_removed:'Rekod bank dipadam',documents_linked:'Dokumen dipautkan / dikategorikan',document_unlinked:'Dokumen dinyahpaut',checklist_updated:'Checklist dokumen dikemas kini',claimed:'Nombor diclaim',assigned:'Customer diagihkan',legacy_assignment:'Rekod agihan lama',pm_confirmed:'PM disahkan oleh staff',whatsapp_opened:'WhatsApp dibuka',status_updated:'Status WhatsApp berubah',whatsapp_details_updated:'Catatan / follow-up WhatsApp berubah',lead_created:'Lead diwujudkan'};
 $('customerHistory').innerHTML=historyRows.length?historyRows.map(e=>'<article class="customer-history-item"><b>'+esc(labels[e.event_type]||e.event_type)+'</b><br><small>'+esc(when(e.created_at))+' · '+esc(e.actor_name?e.actor_name+' ('+e.actor_code+')':'Rekod sistem')+'</small>'+historyDetail(e)+'</article>').join(''):'<div class="empty">Belum ada sejarah untuk customer ini.</div>';$('customerHistoryMore').classList.toggle('hide',historyNext===null);
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
function compiler(){if(!customer||!selected.size||busy)return;const files=customer.files.filter(f=>selected.has(f.id));if(files.length>30||files.reduce((n,f)=>n+f.byte_size,0)>80*1048576)return notice('Pilih maksimum 30 fail dan 80 MB sekali untuk Compiler.',true);sessionStorage.setItem('faris_inbox_compiler_v1',JSON.stringify({ids:[...selected],account_id:user.id,created_at:Date.now()}));location.assign('/?tool=COMPILER&origin=staff&inbox=1')}
function forgetCustomer(){
 opening++;historySeq++;customer=null;dirty=false;selected.clear();historyRows=[];historyNext=null;historyLoaded=false;bankId=null;
 for(const id of ['customerPreview','customerInboxDialog','customerCaseDialog'])if($(id).open)$(id).close();clearPreview();
 for(const id of ['customerFiles','customerHistory','customerNotes','customerBanks','customerName','customerIdentity','customerOwner','customerNextAction','customerSourceInfo','customerLegacyNotes','customerFollowSummary'])$(id).textContent='';
 $('customerProfileForm').reset();$('customerCaseForm').reset();$('customerCaseFeedback').textContent='';$('customerNoteForm').reset();resetBank();$('customerWhatsapp').removeAttribute('href');$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');directory();
}
function reset(){epoch++;$('customerInsightsResult').innerHTML='';$('customerInsightsContext').textContent='';listing++;opening++;historySeq++;pickerSeq++;user=null;customer=null;rows=[];next=null;historyRows=[];historyNext=null;historyLoaded=false;selected.clear();pickerRows=[];pickerSelected.clear();operations.clear();linkHandoff=null;busy=false;dirty=false;bankId=null;
 for(const id of ['customerPreview','customerInboxDialog','customerCaseDialog'])if($(id).open)$(id).close();clearPreview();$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');$('customersList').innerHTML='';$('customerFiles').innerHTML='';$('customerHistory').innerHTML='';$('customerNotes').innerHTML='';$('customerBanks').innerHTML='';$('customerInboxList').innerHTML='';$('customerName').textContent='';$('customerIdentity').textContent='';$('customerOwner').textContent='';$('customerNextAction').textContent='';$('customerSourceInfo').textContent='';$('customerLegacyNotes').textContent='';$('customerFollowSummary').textContent='';$('customerWhatsapp').removeAttribute('href');$('customerProfileForm').reset();$('customerCaseForm').reset();$('customerCaseFeedback').textContent='';$('customerNoteForm').reset();resetBank();$('customersFilterForm').reset();$('customerActiveFilters').textContent='';$('customersTotal').textContent='';$('customerUpload').value='';$('customersNotice').classList.add('hide');$('customersLinkBanner').classList.add('hide');$('customersRefresh').disabled=false;busyState(false)}
window.FARIS_CUSTOMERS={onLogin(account){reset();user=account;$('customersStaff').classList.toggle('hide',user.role!=='admin')},onLogout:reset,onShow(){const params=new URLSearchParams(location.search),target=params.get('customer');if(target&&/^[a-f0-9-]{36}$/i.test(target)){const requestedTab=params.get('customer_tab');params.delete('customer');params.delete('customer_tab');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);open(target).then(()=>{if(customer?.lead.id===target&&requestedTab==='documents')showTab('documents')});return}if(customer){const gen=epoch;refreshProfile().catch(e=>{if(gen===epoch)notice(e.message,true)})}else directory()},open,
 linkFromInbox(data){if(!user||busy||!data.ids?.length)return;linkHandoff=data;customer=null;dirty=false;$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');window.FARIS_NAV.show('customers');renderDirectory()}};
document.addEventListener('DOMContentLoaded',()=>{
 insightPreset();
 $('customersClearFilters').addEventListener('click',()=>{$('customersFilterForm').reset();directory()});
 $('customerInsightsResult').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-insight-bucket')){$('customersBucket').value=$('customersBucket').value===b.dataset.insightBucket?'':b.dataset.insightBucket}else if(b.hasAttribute('data-insight-model')){$('customersModel').value=b.dataset.insightModel;const v=$('customersVariant');if(![...v.options].some(o=>o.value===b.dataset.insightVariant))v.add(new Option(JSON.parse(b.dataset.insightVariant)||'Varian belum diisi',b.dataset.insightVariant));v.value=b.dataset.insightVariant}else if(b.hasAttribute('data-insight-colour')){$('customersColour').value=b.dataset.insightColour}else if(b.hasAttribute('data-insight-status')){$('customersStatus').value=b.dataset.insightStatus}else return;directory().then(()=>{if(user)$('customerListHeading').scrollIntoView({behavior:'smooth',block:'start'})})});
 $('customerInsightsForm').addEventListener('submit',e=>{e.preventDefault();loadInsights()});
 $('customerInsightsPeriod').addEventListener('change',()=>{if($('customerInsightsPeriod').value!=='custom'){insightPreset();loadInsights()}});
 for(const id of ['customerInsightsFrom','customerInsightsTo'])$(id).addEventListener('change',()=>{$('customerInsightsPeriod').value='custom';loadInsights()});
 $('customerInsightsGroup').addEventListener('change',loadInsights);

 for(const id of ['customersStatus','cpStatus','customerCaseStatus'])$(id).insertAdjacentHTML('beforeend',Object.entries(STATUSES).map(([v,label])=>'<option value="'+v+'">'+label+'</option>').join(''));
 $('cbStatus').innerHTML=Object.entries(BANKS).map(([v,label])=>'<option value="'+v+'">'+label+'</option>').join('');
 document.addEventListener('click',e=>{const b=e.target.closest('[data-customer-open]');if(b)open(b.dataset.customerOpen)});
 $('customersFilterForm').addEventListener('submit',e=>{e.preventDefault();directory()});for(const id of ['customersStatus','customersVariant','customersColour','customersBucket','customersStaff'])$(id).addEventListener('change',()=>directory());$('customersModel').addEventListener('change',()=>{$('customersVariant').value='';directory()});$('customersMore').addEventListener('click',()=>directory(true));
 $('customersRefresh').addEventListener('click',async()=>{if(busy)return;try{if(customer){if(dirty&&!confirm('Buang perubahan belum disimpan dan refresh profil?'))return;await refreshProfile(true)}else await directory()}catch(e){notice(e.message,true)}});
 $('customerBack').addEventListener('click',()=>{if(busy||dirty&&!confirm('Tinggalkan perubahan profil yang belum disimpan?'))return;opening++;customer=null;dirty=false;historySeq++;$('customerDetail').classList.add('hide');$('customersDirectory').classList.remove('hide');directory()});
 $('customersLinkCancel').addEventListener('click',()=>{linkHandoff=null;renderDirectory()});
 $('customersList').addEventListener('click',async e=>{const b=e.target.closest('[data-customer-link-target]');if(!b||!linkHandoff||busy)return;const handoff=linkHandoff,gen=epoch;b.disabled=true;busy=true;try{await mutate('link_files',{ids:handoff.ids,party:handoff.party,category:handoff.category},b.dataset.customerLinkTarget);if(gen!==epoch)return;linkHandoff=null;$('customersLinkBanner').classList.add('hide');busy=false;await open(b.dataset.customerLinkTarget);showTab('documents');notice('Fail telah dipautkan kepada profil customer.');window.FARIS_INBOX?.onShow?.()}catch(err){if(gen===epoch)notice(err.message,true)}finally{if(gen===epoch){busy=false;b.disabled=false}}});
 document.querySelectorAll('[data-customer-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.customerTab)));
 document.addEventListener('invalid',e=>{if(e.target.form?.id==='customerProfileForm'){const panel=e.target.closest('[data-customer-panel]');if(panel)showTab(panel.dataset.customerPanel)}},true);
 document.addEventListener('input',e=>{if(customer&&(e.target.form?.id==='customerProfileForm'))dirty=true});$('cpStatus').addEventListener('change',reasonRequired);
 $('customerProfileForm').addEventListener('submit',e=>{e.preventDefault();runWrite('save_profile',profileValues(),'Profil customer disimpan.')});
 $('customerNoteForm').addEventListener('submit',async e=>{e.preventDefault();if(await runWrite('add_note',{note:$('customerNote').value.trim()},'Nota ditambah ke profil dan sejarah.'))$('customerNote').value=''});
 $('customerEditFollow').addEventListener('click',()=>{showTab('summary');$('cpFollow').focus()});
 $('customerBankForm').addEventListener('submit',async e=>{e.preventDefault();const data={id:bankId,bank_name:$('cbName').value.trim(),status:$('cbStatus').value,amount:$('cbAmount').value||null,submitted_at:$('cbDate').value||null,notes:$('cbNotes').value.trim()};if(await runWrite('save_bank',data,'Permohonan bank disimpan.'))resetBank()});$('customerBankCancel').addEventListener('click',resetBank);
 $('customerBanks').addEventListener('click',async e=>{const edit=e.target.closest('[data-bank-edit]'),del=e.target.closest('[data-bank-delete]');if(edit)editBank(edit.dataset.bankEdit);if(del&&confirm('Padam rekod bank ini? Rekod perubahan kekal dalam Sejarah.'))await runWrite('delete_bank',{id:del.dataset.bankDelete},'Rekod bank dipadam.')});
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
