(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FARIS_APPLICATION_CORE=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const sections=[
 {id:'applicant',title:'MAKLUMAT PEMOHON',aliases:['pemohon','butiran pemohon','maklumat peribadi','personal details','applicant details'],fields:[
  ['name','Nama : ',['nama','nama penuh','nama pemohon','full name','applicant name']],
  ['nric','I/C No : ',['i c no','ic','no ic','no kad pengenalan','kad pengenalan','nric','ic no','no kp']],
  ['permanent_address','Alamat Tetap : ',['alamat tetap','permanent address','alamat']],
  ['current_address','Alamat Tempat Tinggal Terkini: ',['alamat tempat tinggal terkini','alamat terkini','alamat semasa','current address','alamat tempat tinggal']],
  ['residence_years','Tempoh menetap : ',['tempoh menetap','tempoh tinggal','duration of stay']],
  ['home','Rumah : ',['rumah','status rumah','jenis rumah','home ownership']],
  ['phone','No HP: ',['no hp','no telefon','no tel','telefon','phone','mobile','no handphone']],
  ['email','Email : ',['email','e mail','emel']],
  ['race','Bangsa : ',['bangsa','race']],
  ['religion','Agama : ',['agama','religion']],
  ['marital','Taraf perkahwinan : ',['taraf perkahwinan','status perkahwinan','marital status']],
  ['education','Latar belakang pendidikan tertinggi : ',['latar belakang pendidikan tertinggi','pendidikan tertinggi','pendidikan','highest education']],
  ['graduation','Tarikh Graduasi : ',['tarikh graduasi','tahun graduasi','graduation date']],
  ['children','Bil anak : ',['bil anak','bilangan anak','jumlah anak','no of children']],
  ['mother','Nama ibu : ',['nama ibu','nama ibu kandung','mother name']]
 ]},
 {id:'employment',title:'MAKLUMAT PEKERJAAN',aliases:['pekerjaan','butiran pekerjaan','maklumat majikan','employment details','employment'],fields:[
  ['employer','Nama Majikan (nama syarikat) : ',['nama majikan nama syarikat','nama majikan','nama syarikat','majikan','employer','company name']],
  ['address','Alamat tempat kerja: ',['alamat tempat kerja','alamat kerja','alamat majikan','alamat syarikat','alamat','work address']],
  ['phone','No Tel : ',['no tel','no telefon','no hp','telefon pejabat','office phone','phone']],
  ['position','Jawatan : ',['jawatan','position','designation']],
  ['department','Department : ',['department','jabatan','bahagian']],
  ['appointment','Lantikan : ',['lantikan','status lantikan','status pekerjaan','jenis pekerjaan','employment status']],
  ['start_date','Tarikh Mula Kerja : ',['tarikh mula kerja','tarikh mula bekerja','mula kerja','employment date','start date']],
  ['job_scope','Skop kerja : ',['skop kerja','job scope','nature of work']],
  ['business_scope','Skop syarikat : ',['skop syarikat','jenis perniagaan','nature of business','business scope']]
 ]},
 {id:'spouse',title:'MAKLUMAT PASANGAN (jika berkahwin)',aliases:['maklumat pasangan','pasangan','butiran pasangan','spouse details','spouse'],fields:[
  ['name','Nama : ',['nama','nama pasangan','nama penuh','spouse name']],
  ['nric','I/C No : ',['i c no','ic','no ic','nric','ic no','no kad pengenalan']],
  ['phone','No HP : ',['no hp','no telefon','no tel','phone','mobile']],
  ['employer','Majikan pasangan : ',['majikan pasangan','nama majikan','majikan','employer']],
  ['position','Jawatan : ',['jawatan','position','designation']],
  ['income','Pendapatan bulanan : ',['pendapatan bulanan','gaji bulanan','pendapatan','gaji','monthly income']]
 ]},
 {id:'reference',title:'RUJUKAN (Mak/ayah/adik beradik/keluarga terdekat)',aliases:['rujukan','maklumat rujukan','butiran rujukan','reference','reference details'],fields:[
  ['name','Nama : ',['nama','nama rujukan','nama penuh','reference name']],
  ['address','Alamat : ',['alamat','alamat rujukan','address']],
  ['phone','No HP : ',['no hp','no tel','no telefon','phone','mobile']],
  ['relation','Hubungan : ',['hubungan','relationship']]
 ]},
 {id:'financing',title:'MAKLUMAT PEMBIAYAAN',aliases:['pembiayaan','maklumat pinjaman','pinjaman','butiran pembiayaan','financing details','financing','maklumat kenderaan'],fields:[
  ['model','Model kereta : ',['model kereta','model kenderaan','model','car model']],
  ['color','Warna kereta : ',['warna kereta','warna kenderaan','warna','colour','color']],
  ['term','Tempoh pinjaman : ',['tempoh pinjaman','tempoh pembiayaan','loan tenure','loan term']]
 ]}
];
const fields=sections.flatMap(s=>s.fields.map(([id,label,aliases])=>({id:s.id+'_'+id,section:s.id,label,aliases})));
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function sectionFor(line){const clean=s=>normalize(s.replace(/\([^)]*\)/g,''));const n=clean(line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/,''));return sections.find(s=>[s.title,...s.aliases].some(a=>n===clean(a)))}
function parse(text){
 const values={},unparsed=[],conflicts=[];let section='applicant',pending=null;
 function flush(){if(!pending)return;const value=pending.parts.join(' ').replace(/\s+/g,' ').trim();if(values[pending.field.id]&&values[pending.field.id]!==value){conflicts.push(pending.field.id)}else values[pending.field.id]=value;pending=null}
 for(const source of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
  const line=source.trim().replace(/^[-*•]\s*/,'').replace(/^\d+[.)]\s*/,'');if(!line)continue;
  const heading=sectionFor(line.replace(/[:：]\s*$/,''));if(heading){flush();section=heading.id;continue}
  if(/^(?:application form|borang permohonan)(?:\s|$)/i.test(line))continue;
  const match=line.match(/^([^:：\t]+)\s*[:：\t]+\s*(.*)$/);
  if(match){
   flush();const label=normalize(match[1]),local=fields.filter(f=>f.section===section&&f.aliases.some(a=>normalize(a)===label));
   const global=fields.filter(f=>f.aliases.some(a=>normalize(a)===label));const field=local[0]||(global.length===1?global[0]:null);
   if(field){pending={field,parts:[match[2]]};continue}
   unparsed.push(line);continue;
  }
  if(/^(?:maklumat|butiran)\b/i.test(line)){flush();section='unknown';unparsed.push(line);continue}
  const label=normalize(line),field=fields.find(f=>f.section===section&&f.aliases.some(a=>normalize(a)===label));
  if(field){flush();pending={field,parts:[]};continue}
  if(pending)pending.parts.push(line);else unparsed.push(line);
 }
 flush();return {values,unparsed,conflicts:[...new Set(conflicts)],count:Object.values(values).filter(Boolean).length};
}
// Baselines and reserved line counts follow the supplied two-page A4 form.
const plans=[[
 ['#applicant',111],...fields.filter(f=>f.section==='applicant').map((f,i)=>[f.id,[141.75,171.75,202.5,232.5,262.5,293.25,323.25,354,384,414,444.75,474.75,504.75,535.5,565.5][i]]),
 ['#employment',626.25],['employment_employer',656.25],['employment_address',687,2],['employment_phone',735.75],['employment_position',765.75],['employment_department',795.75]
],[
 ['employment_appointment',40.5],['employment_start_date',70.5],['employment_job_scope',101.25],['employment_business_scope',131.25],
 ['#spouse',192],...fields.filter(f=>f.section==='spouse').map((f,i)=>[f.id,[222,252.75,282.75,313.5,343.5,373.5][i]]),
 ['#reference',434.25],...fields.filter(f=>f.section==='reference').map((f,i)=>[f.id,[464.25,495,525,555.75][i]]),
 ['#financing',615.75],...fields.filter(f=>f.section==='financing').map((f,i)=>[f.id,[646.5,676.5,707.25][i]])
]];
function wrap(text,font,size,width){
 const lines=[];let line='';for(const word of String(text).split(/\s+/)){
  if(font.widthOfTextAtSize((line?line+' ':'')+word,size)<=width){line+=(line?' ':'')+word;continue}
  if(line){lines.push(line);line=''}
  for(const c of word){if(line&&font.widthOfTextAtSize(line+c,size)>width){lines.push(line);line=''}line+=c}
 }if(line||!lines.length)lines.push(line);return lines;
}
async function buildPdf({PDFLib,fontkit,fontBytes,titleBytes,values}){
 const doc=await PDFLib.PDFDocument.create();doc.registerFontkit(fontkit);
 const font=await doc.embedFont(fontBytes,{subset:true}),title=await doc.embedPng(titleBytes),supported=new Set(font.getCharacterSet());
 const all=fields.map(f=>f.label+String(values[f.id]||'')).join(' ')+sections.map(s=>s.title).join(' ');
 const missing=[...new Set([...all].filter(c=>!supported.has(c.codePointAt(0))&&!/\s/.test(c)))];
 if(missing.length)throw Error('Aksara ini belum disokong oleh font borang: '+missing.join(' ')+' . Semak ejaan sebelum jana.');
 for(let p=0;p<plans.length;p++){
  let page=doc.addPage([595.5,841.92]),shift=0;
  if(p===0)page.drawImage(title,{x:27.75,y:841.92-56,width:235.25,height:30.5});
  for(const [id,anchor,reserved=1] of plans[p]){
   const heading=id.startsWith('#'),field=fields.find(f=>f.id===id);
   const text=heading?sections.find(s=>s.id===id.slice(1)).title:field.label+String(values[id]||'').replace(/\s+/g,' ').trim();
   const lines=wrap(text,font,12,540);let baseline=anchor+shift;
   for(let j=0;j<Math.max(lines.length,reserved);j++){
    if(baseline>813.9){page=doc.addPage([595.5,841.92]);baseline=40.5}
    if(j<lines.length)page.drawText(lines[j],{x:27.75,y:841.92-baseline,size:12,font,color:PDFLib.rgb(0,0,0)});
    if(j+1<Math.max(lines.length,reserved))baseline+=18;
   }
   shift=baseline-anchor-(reserved-1)*18;
  }
 }
 doc.setTitle('Application Form');doc.setAuthor('FARIS R+PROTON');doc.setCreator('FARIS Application Form Generator');
 return {bytes:await doc.save(),pages:doc.getPageCount()};
}
return {sections,fields,normalize,parse,buildPdf};
});
