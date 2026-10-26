export const MAX_FILE=20*1024*1024;
export const MAX_BODY=22*1024*1024;
export const PARTIES=new Set(['HIRER','GUARANTOR','REBATE']);
const NORMAL=new Set(['AUTO','VSO','IC','LESEN','PAYSLIP','BANK','OTHER']);
const REBATE=new Set(['AUTO','IC_FRONT','IC_BACK','LESEN','SURAT_KERJA','SIJIL_LAHIR','SIJIL_NIKAH','OTHER']);
export const isId=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value||''));
export function assignment(body){
 const ids=[...new Set(body.ids||[])];
 if(!ids.length||ids.length>30||!ids.every(isId))throw Error('Pilih 1–30 fail yang sah.');
 const customer_name=String(body.customer_name||'').trim();
 if(customer_name.length<2||customer_name.length>120)throw Error('Isi nama pelanggan (2–120 aksara).');
 const party=String(body.party||'HIRER'),category=String(body.category||'AUTO');
 if(!PARTIES.has(party)||!(party==='REBATE'?REBATE:NORMAL).has(category))throw Error('Bahagian atau kategori tidak sepadan.');
 let phone=String(body.customer_phone||'').replace(/[^\d+]/g,'').replace(/^\+/,'');
 if(phone.startsWith('0'))phone='6'+phone;
 if(phone&&!/^601\d{8,9}$/.test(phone))throw Error('Nombor pelanggan tidak sah.');
 return {ids,customer_name,customer_phone:phone,party,category};
}
export function fileInfo(name,bytes){
 if(!bytes.length||bytes.length>MAX_FILE)throw Error('Setiap fail mesti antara 1 bait dan 20 MB.');
 const filename=String(name||'').replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,180);
 const ext=filename.split('.').pop().toLowerCase();
 const types={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',txt:'text/plain'};
 if(!types[ext])throw Error('Format fail tidak disokong: '+filename);
 const ascii=(start,n)=>String.fromCharCode(...bytes.slice(start,start+n));
 const prefix=[...bytes.slice(0,8)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const valid=ext==='pdf'?ascii(0,1024).includes('%PDF-'):
  ['jpg','jpeg'].includes(ext)?prefix.startsWith('ffd8ff'):
  ext==='png'?prefix==='89504e470d0a1a0a':
  ext==='webp'?ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP':
  ['heic','heif'].includes(ext)?ascii(4,4)==='ftyp':
  ['docx','xlsx'].includes(ext)?prefix.startsWith('504b0304'):
  ext==='xls'?prefix==='d0cf11e0a1b11ae1':ext==='txt';
 if(!valid)throw Error('Kandungan fail tidak sepadan dengan format: '+filename);
 return {name:filename,mime:types[ext],extension:ext};
}
