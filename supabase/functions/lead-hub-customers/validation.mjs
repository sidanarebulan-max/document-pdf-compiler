export const STATUSES={new:'Lead baharu',contacted:'Dihubungi',interested:'Berminat',documents:'Mengumpul dokumen',bank_submitted:'Permohonan bank',approved:'Diluluskan',delivery:'Urusan serahan',delivered:'Kereta diserahkan',on_hold:'Tangguh',cancelled:'Tidak diteruskan'};
export const BANK_STATUSES={draft:'Belum dihantar',submitted:'Dihantar ke bank',review:'Dalam semakan',documents:'Bank minta dokumen',approved:'Diluluskan',rejected:'Ditolak',cancelled:'Dibatalkan'};
export const isId=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v||''));
const text=(v,max,label,required=false)=>{const s=String(v??'').trim();if(s.length>max||(required&&!s))throw Error(label+' tidak sah.');return s};
const date=v=>{if(!v)return null;const s=String(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Tarikh tidak sah.');return s};
const time=v=>{if(!v)return null;if(typeof v!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v))throw Error('Masa tidak sah.');return v};
const malaysiaStamp=v=>{
 if(!v)return null;
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v))throw Error('Tarikh dan masa tidak sah.');
 return date(v.slice(0,10))+'T'+time(v.slice(11))+':00+08:00';
};
const stamp=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Refresh profil sebelum menyimpan.');return v};
const months=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isInteger(n)||n<1||n>120)throw Error('Tempoh mestilah 1 hingga 120 bulan.');return n};
const money=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>.0001)throw Error('Jumlah wang mesti positif dengan maksimum dua titik perpuluhan.');return n};
const manualSources=new Set(['Walk-in','Rujukan','Panggilan telefon','Media sosial','Lain-lain']);
function requiredPhone(value){
 const phone=typeof value==='string'&&/^\+?[0-9 ().-]+$/.test(value.trim())?normalPhone(value):null;
 if(!phone)throw Error('Masukkan nombor telefon bimbit Malaysia yang sah.');
 return phone;
}
function phoneList(values,primary){
 if(!Array.isArray(values)||values.length>12)throw Error('Masukkan maksimum lima nombor tambahan.');
 return [...new Set(values.map(requiredPhone).filter(phone=>phone!==primary))].sort();
}
export function validate(action,d={}){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Maklumat tidak sah.');
 if(action==='create_customer'){
  const phone=requiredPhone(d.phone);
  if(typeof d.customer_name!=='string')throw Error('Nama pelanggan tidak sah.');
  if(!manualSources.has(d.source))throw Error('Pilih sumber pelanggan.');
  if(d.model!=null&&typeof d.model!=='string')throw Error('Model kereta tidak sah.');
  return {customer_name:text(d.customer_name,120,'Nama pelanggan',true),phone_e164:phone,source:d.source,model:text(d.model,100,'Model kereta')};
 }
 if(action==='save_phones'){
  const primary=requiredPhone(d.primary),previousPrimary=requiredPhone(d.previous_primary);
  if(typeof d.consent!=='boolean'||typeof d.keep_previous!=='boolean')throw Error('Pilihan nombor telefon tidak sah.');
  const additional=phoneList(d.additional,primary),previousAdditional=phoneList(d.previous_additional,previousPrimary);
  if(d.keep_previous&&primary!==previousPrimary&&!additional.includes(previousPrimary))additional.push(previousPrimary);
  if(additional.length>5||previousAdditional.length>5)throw Error('Masukkan maksimum lima nombor tambahan.');
  return {_primary:primary,_additional:additional.sort(),_previous_primary:previousPrimary,_previous_additional:previousAdditional,_consent:d.consent};
 }
 if(action==='save_profile'){
  if(!Object.hasOwn(STATUSES,d.sales_status)||!['none','pending','paid','refunded'].includes(d.booking_status))throw Error('Status tidak sah.');
  if(!Number.isInteger(d.expected_revision)||d.expected_revision<0||!Number.isFinite(Date.parse(d.expected_lead_updated_at)))throw Error('Refresh profil sebelum menyimpan.');
  const flags={};for(const key of ['lou_received','trade_in'])if(Object.hasOwn(d,key)){if(typeof d[key]!=='boolean')throw Error('Tanda LOU / Trade In tidak sah.');flags[key]=d[key]}
  const x={...flags,...(Object.hasOwn(d,'colour')?{colour:text(d.colour,80,'Warna kereta')}:{}),customer_name:text(d.customer_name,120,'Nama',true),model:text(d.model,120,'Model'),variant:text(d.variant,120,'Varian'),sales_status:d.sales_status,next_action:text(d.next_action,500,'Tindakan seterusnya'),closure_reason:text(d.closure_reason,1000,'Sebab'),guarantor_required:d.guarantor_required===true,booking_status:d.booking_status,follow_up_at:date(d.follow_up_at),booking_amount:money(d.booking_amount),selling_price:money(d.selling_price),deposit:money(d.deposit),loan_amount:money(d.loan_amount),expected_revision:d.expected_revision,expected_lead_updated_at:d.expected_lead_updated_at};
  for(const key of ['lead_received_at','delivered_at','follow_up_due_at'])if(Object.hasOwn(d,key))x[key]=malaysiaStamp(d[key]);
  if(x.follow_up_due_at&&x.follow_up_due_at.slice(0,10)!==x.follow_up_at)throw Error('Tarikh reminder tidak sepadan.');
  if(['on_hold','cancelled'].includes(x.sales_status)&&!x.closure_reason)throw Error('Isi sebab tangguh atau tidak diteruskan.');return x;
 }
 if(action==='add_note')return {note:text(d.note,4000,'Nota',true)};
 if(action==='save_bank'){
  if(!Object.hasOwn(BANK_STATUSES,d.status)||d.id&&!isId(d.id))throw Error('Maklumat bank tidak sah.');
  const bank={id:d.id||null,bank_name:text(d.bank_name,100,'Nama bank',true),status:d.status,amount:money(d.amount),notes:text(d.notes,2000,'Nota bank'),submitted_at:date(d.submitted_at)};
  if(Object.hasOwn(d,'officer_name')){
   const submittedTime=time(d.submitted_time),due=malaysiaStamp(d.follow_up_due_at);
   const rate=money(d.approved_rate);
   if(rate!==null&&rate>100)throw Error('Kadar mesti antara 0% dan 100%.');
   Object.assign(bank,{submitted_time:submittedTime,officer_name:text(d.officer_name,120,'Nama pegawai'),officer_phone:text(d.officer_phone,40,'Telefon pegawai'),
    term_months:months(d.term_months),approved_amount:money(d.approved_amount),approved_rate:rate,approved_term_months:months(d.approved_term_months),
    selected:d.selected===true,follow_up_due_at:due,next_action:text(d.next_action,500,'Tindakan bank')});
   if(d.id)bank.expected_updated_at=stamp(d.expected_updated_at);
  }
  return bank;
 }
 if(action==='record_contact')return {note:text(d.note,500,'Catatan')};
 if(action==='complete_follow_up'){
  const note=text(d.note,500,'Catatan');
  if(d.id){if(!isId(d.id))throw Error('Bank tidak sah.');return {id:d.id,expected_updated_at:stamp(d.expected_updated_at),note}}
  if(!Number.isInteger(d.expected_revision)||d.expected_revision<0)throw Error('Refresh profil sebelum menyimpan.');
  return {expected_revision:d.expected_revision,expected_lead_updated_at:stamp(d.expected_lead_updated_at),note};
 }
 if(['delete_bank','unlink_file'].includes(action)){if(!isId(d.id))throw Error('Rekod tidak sah.');return {id:d.id}}
 if(action==='checklist'){
  if(!['HIRER','GUARANTOR'].includes(d.party)||!['IC','LESEN','PAYSLIP','BANK'].includes(d.category)||!['auto','missing','received','replace','not_required'].includes(d.status))throw Error('Checklist tidak sah.');return {party:d.party,category:d.category,status:d.status};
 }
 if(action==='link_files'){
  if(!Array.isArray(d.ids))throw Error('Pilih fail dahulu.');const ids=[...new Set(d.ids)];
  const normal=['AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER'],rebate=['AUTO','IC_FRONT','IC_BACK','LESEN','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH','OTHER'];
  if(ids.length<1||ids.length>30||!ids.every(isId)||!['HIRER','GUARANTOR','REBATE'].includes(d.party)||!(d.party==='REBATE'?rebate:normal).includes(d.category))throw Error('Pilih 1–30 fail dengan bahagian dan kategori yang sah.');return {ids,party:d.party,category:d.category};
 }
 throw Error('Tindakan tidak dikenali.');
}

export function normalPhone(value){
 let phone=String(value??'').replace(/[^0-9]/g,'');
 if(phone.startsWith('0'))phone='6'+phone;
 else if(phone.startsWith('1'))phone='60'+phone;
 return /^601[0-9]{8,9}$/.test(phone)?phone:null;
}
const sharedText={
 customer_name:120,model:120,variant:120,colour:80,vehicle_year:4,loan_term:120,
 vso_accessories:8,guarantor_name:120,guarantor_nric:40,guarantor_phone:40,
 guarantor_address:2000,guarantor_note:500,rebate_name:120,tradein_name:120,
 applicant_nric:300,applicant_email:300,applicant_permanent_address:2000,applicant_current_address:2000,
 applicant_residence_years:300,applicant_home:300,applicant_race:300,applicant_religion:300,
 applicant_marital:300,applicant_education:300,applicant_graduation:300,applicant_children:300,applicant_mother:300,
 employment_employer:300,employment_address:2000,employment_phone:300,employment_position:300,
 employment_department:300,employment_appointment:300,employment_start_date:300,
 employment_job_scope:2000,employment_business_scope:2000,employment_income:300,
 spouse_name:300,spouse_nric:300,spouse_phone:300,spouse_employer:300,spouse_position:300,spouse_income:300,
 reference_name:300,reference_address:2000,reference_phone:300,reference_relation:300
};
const sharedMoney=new Set(['selling_price','deposit','loan_amount','otr_price','rebate_amount','insurance_amount']);
export function sharedPatch(value,previous=false){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Maklumat profil tidak sah.');
 const fields={};
 for(const [key,raw] of Object.entries(value)){
  if(sharedMoney.has(key)){
   const amount=money(raw);
   // Canonical strings for JSON-only money match PostgREST and numeric profile values by value in SQL.
   fields[key]=amount;
  }else if(Object.hasOwn(sharedText,key)){
   if(previous&&raw===null){fields[key]=null;continue}
   if(typeof raw!=='string')throw Error('Maklumat profil tidak sah.');
   fields[key]=text(raw,sharedText[key],key,key==='customer_name'&&!previous);
  }else throw Error('Medan profil tidak sah.');
 }
 return fields;
}
