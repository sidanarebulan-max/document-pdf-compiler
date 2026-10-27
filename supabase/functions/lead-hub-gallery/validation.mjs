export const MAX_FILE=20*1024*1024;
export const MODELS=['emas7_phev','emas7_ev','emas5'];
export const isId=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(String(value||''));
export function metadata(body,fallback=''){
 const model=String(body.model||'');
 const title=String(body.title||fallback).trim();
 if(!MODELS.includes(model))throw Error('Pilih kategori kereta yang sah.');
 if(!title||title.length>120)throw Error('Tajuk gambar mesti antara 1–120 aksara.');
 return {model,title};
}
export function imageInfo(name,bytes){
 if(!bytes.length||bytes.length>MAX_FILE)throw Error('Setiap gambar maksimum 20 MB dan tidak boleh kosong.');
 const original_name=String(name||'').replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,180);
 const ext=original_name.split('.').pop().toLowerCase();
 const ascii=(start,n)=>String.fromCharCode(...bytes.slice(start,start+n));
 const prefix=[...bytes.slice(0,8)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const mime_type=['jpg','jpeg'].includes(ext)&&prefix.startsWith('ffd8ff')?'image/jpeg':ext==='png'&&prefix==='89504e470d0a1a0a'?'image/png':ext==='webp'&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'?'image/webp':null;
 if(!mime_type)throw Error('Format gambar tidak sah. Gunakan JPG, PNG atau WebP.');
 return {original_name,mime_type,extension:ext==='jpeg'?'jpg':ext};
}
