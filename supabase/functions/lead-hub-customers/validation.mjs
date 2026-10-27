export const STATUSES={new:'Lead baharu',contacted:'Dihubungi',interested:'Berminat',documents:'Mengumpul dokumen',bank_submitted:'Permohonan bank',approved:'Diluluskan',delivery:'Urusan serahan',delivered:'Kereta diserahkan',on_hold:'Tangguh',cancelled:'Tidak diteruskan'};
export const BANK_STATUSES={draft:'Belum dihantar',submitted:'Dihantar ke bank',documents:'Bank minta dokumen',approved:'Diluluskan',rejected:'Ditolak',cancelled:'Dibatalkan'};
export const isId=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(v||''));
const text=(v,max,label,required=false)=>{const s=String(v??'').trim();if(s.length>max||(required&&!s))throw Error(label+' tidak sah.');return s};
const date=v=>{if(!v)return null;const s=String(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Tarikh tidak sah.');return s};
const money=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>.0001)throw Error('Jumlah wang mesti positif dengan maksimum dua titik perpuluhan.');return n};
export function validate(action,d={}){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('Maklumat tidak sah.');
 if(action==='save_profile'){
  if(!Object.hasOwn(STATUSES,d.sales_status)||!['none','pending','paid','refunded'].includes(d.booking_status))throw Error('Status tidak sah.');
  if(!Number.isInteger(d.expected_revision)||d.expected_revision<0||!Number.isFinite(Date.parse(d.expected_lead_updated_at)))throw Error('Refresh profil sebelum menyimpan.');
  const x={customer_name:text(d.customer_name,120,'Nama',true),model:text(d.model,120,'Model'),variant:text(d.variant,120,'Varian'),sales_status:d.sales_status,next_action:text(d.next_action,500,'Tindakan seterusnya'),closure_reason:text(d.closure_reason,1000,'Sebab'),guarantor_required:d.guarantor_required===true,booking_status:d.booking_status,follow_up_at:date(d.follow_up_at),booking_amount:money(d.booking_amount),selling_price:money(d.selling_price),deposit:money(d.deposit),loan_amount:money(d.loan_amount),expected_revision:d.expected_revision,expected_lead_updated_at:d.expected_lead_updated_at};
  if(['on_hold','cancelled'].includes(x.sales_status)&&!x.closure_reason)throw Error('Isi sebab tangguh atau tidak diteruskan.');return x;
 }
 if(action==='add_note')return {note:text(d.note,4000,'Nota',true)};
 if(action==='save_bank'){
  if(!Object.hasOwn(BANK_STATUSES,d.status)||d.id&&!isId(d.id))throw Error('Maklumat bank tidak sah.');
  return {id:d.id||null,bank_name:text(d.bank_name,100,'Nama bank',true),status:d.status,amount:money(d.amount),notes:text(d.notes,2000,'Nota bank'),submitted_at:date(d.submitted_at)};
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
