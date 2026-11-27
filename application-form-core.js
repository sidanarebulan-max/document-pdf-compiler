(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FARIS_APPLICATION_CORE=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const sections=[
 {id:'applicant',title:'MAKLUMAT PEMOHON',aliases:['pemohon','butiran pemohon','maklumat diri','maklumat diri pemohon','butiran diri','butiran diri pemohon','maklumat peribadi','maklumat peribadi pemohon','personal details','applicant details'],fields:[
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
  ['business_scope','Skop syarikat : ',['skop syarikat','jenis perniagaan','nature of business','business scope']],
  ['income','Pendapatan bulanan : ',['pendapatan bulanan','gaji bulanan','pendapatan','gaji','monthly income']]
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
const identityAliases={
 name:['nama','nama penuh','nama seperti ic','nama dalam ic','nama ikut ic','nama seperti dalam ic','nama seperti di ic','nama seperti dalam mykad','nama seperti dalam kad pengenalan','nama mengikut kad pengenalan','name','full name','nama name'],
 nric:['ic','no ic','ic no','ic number','ic num','no i c','i c no','nombor ic','no kad pengenalan','nombor kad pengenalan','kad pengenalan','no mykad','mykad','no kp','nombor kp','nric','nric no','nric number','identity card number','id number'],
 phone:['no hp','hp','handphone','hp no','no handphone','no telefon','nombor telefon','telefon','no tel','tel','no telefon bimbit','nombor telefon bimbit','telefon bimbit','no whatsapp','nombor whatsapp','whatsapp','no ws','no wasap','no fon','no phone','phone','phone no','phone number','mobile','mobile no','mobile number']
};
const personLabels={applicant:['pemohon','pelanggan','customer','applicant'],spouse:['pasangan','suami','isteri','spouse'],reference:['rujukan','reference']};
const bySection=new Map(sections.map(s=>[s.id,new Map()]));
const allLabels=new Map(),qualifiedLabels=new Map();
for(const field of fields){
 const kind=field.id.slice(field.section.length+1),people=personLabels[field.section];
 const aliases=new Set(field.aliases.map(normalize));
 if(people&&identityAliases[kind]){
  for(const label of identityAliases[kind]){
   aliases.add(label);
   for(const person of people){
    qualifiedLabels.set(label+' '+person,field);
    qualifiedLabels.set(person+' '+label,field);
   }
  }
 }
 if(field.id==='employment_phone')for(const alias of ['tel','telefon','nombor telefon','no telefon pejabat','nombor telefon pejabat','office phone number'])aliases.add(alias);
 for(const label of aliases){
  bySection.get(field.section).set(label,field);
  if(!allLabels.has(label))allLabels.set(label,[]);
  allLabels.get(label).push(field);
 }
}
function fieldFor(label,section){
 const key=normalize(label.replace(/\s*\(\+?60\)\s*$/,'')),matches=allLabels.get(key);
 return qualifiedLabels.get(key)||bySection.get(section)?.get(key)||(matches?.length===1?matches[0]:undefined);
}
const labelPattern=[...new Set([...allLabels.keys(),...qualifiedLabels.keys()])]
 .sort((a,b)=>b.length-a.length).map(label=>label.replace(/ /g,'[ .()\\/\\-]*')).join('|');
const inlineField=new RegExp('(?:^|[\\s|;])(?:'+labelPattern+')(?:\\s*\\(\\+?60\\))?\\s*[:：=]','giu');
const boldLabel=new RegExp('(^|[\\s|;])\\*{1,2}(?=(?:'+labelPattern+')\\s*[:：=])','giu');
const spacedField=new RegExp('^('+labelPattern+')(?:\\s*[–—-]\\s*|\\s+)(\\S.*)$','iu');
function cleanValue(raw){return raw.trim().replace(/^\*{1,2}|\*{1,2}$/g,'').trim()}
function phoneValue(value){
 const phone=value.replace(/^https?:\/\/wa\.me\//i,'').replace(/[\s().\p{Pd}]/gu,'');
 if(!/^\+?\d+$/.test(phone))return '';
 const local=phone.replace(/^(?:\+?60|0060)0?/,'0');
 return /^(?:01\d{8,9}|0[3-9]\d{7,8})$/.test(local)?local:'';
}
function nricValue(value){
 if(!/^\d{6}[\s\p{Pd}]*\d{2}[\s\p{Pd}]*\d{4}$/u.test(value))return '';
 return value.replace(/\D/g,'');
}
function identityNumber(line){
 const phone=phoneValue(line),nric=nricValue(line);
 if(!nric)return phone?'phone':'';
 if(!phone||/^\d{6}[\s\p{Pd}]+\d{2}[\s\p{Pd}]+\d{4}$/u.test(line))return 'nric';
 const month=Number(nric.slice(2,4)),date=Number(nric.slice(4,6));
 return month<1||month>12||date<1||date>31?'phone':'';
}
const multiline=f=>/address|scope/.test(f.id);
function sectionFor(line){const clean=s=>normalize(s.replace(/\([^)]*\)/g,''));const n=clean(line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/,''));return sections.find(s=>[s.title,...s.aliases].some(a=>n===clean(a)))}
function parse(text){
 const values={},unparsed=[],conflicts=new Set(),unlabelled=new Map();let section='applicant',pending=null,contactScope='applicant';
 function put(field,raw){
  let value=cleanValue(raw.replace(/\s+/g,' '));
  if(field.id.endsWith('_phone'))value=phoneValue(value)||value;
  if(field.id.endsWith('_nric'))value=nricValue(value)||value;
  if(value&&values[field.id]&&values[field.id]!==value)conflicts.add(field.id);
  else if(value||!Object.hasOwn(values,field.id))values[field.id]=value;
 }
 function flush(){if(pending){put(pending.field,pending.parts.join(' '));pending=null}}
 function read(line){
  const heading=sectionFor(line.replace(/[:：]\s*$/,''));
  if(heading){flush();section=contactScope=heading.id;return}
  if(/^(?:application form|borang permohonan)(?:\s|$)/i.test(line)||/^terima kasih[!.]*$/i.test(line))return;
  if(/^(?:maklumat|butiran)\b|^(?:penjamin|guarantor)\s*(?:\([^)]*\))?\s*:?$/i.test(line)){flush();section=contactScope='unknown';unparsed.push(line);return}
  const rawPhone=phoneValue(line);
  const match=rawPhone?null:line.match(/^([^:：=\t]+?)\s*[:：=\t]+\s*(.*)$/);
  const exact=match?null:fieldFor(line,section);
  const spaced=match||exact?null:line.match(spacedField);
  const field=exact||((match||spaced)&&fieldFor((match||spaced)[1],section));
  if(field){
   flush();
   const label=normalize((match||spaced)?.[1]||line);
   // A named person starts their own block even when the pasted text omits its heading.
   if(field.id.endsWith('_name')&&personLabels[field.section]&&qualifiedLabels.get(label)===field)section=field.section;
   contactScope=field.section;
   pending={field,parts:[(match||spaced)?.[2]||'']};
   return;
  }
  const nameContinuation=pending?.field.id.endsWith('_name')&&/^(?:bin(?:ti)?|bte?|a\/[lp])\s+[\p{L}\p{M}.'’@\/ -]+$/iu.test(line);
  if(pending&&!match&&(!pending.parts.some(Boolean)||multiline(pending.field)||nameContinuation)){
   pending.parts.push(line);return;
  }
  flush();
  if(!match&&bySection.has(contactScope)){
   if(!unlabelled.has(contactScope))unlabelled.set(contactScope,[]);
   unlabelled.get(contactScope).push(line);
  }else unparsed.push(line);
 }
 function readInline(line){
  const hits=[...line.matchAll(inlineField)];
  if(hits.length>1&&hits[0].index===0){
   for(let i=0;i<hits.length;i++)read(line.slice(hits[i].index,hits[i+1]?.index).trim().replace(/[|;]\s*$/,'').trim());
  }else read(line);
 }
 const input=String(text||'').normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,'').replace(/\r\n?|[\u2028\u2029]/g,'\n');
 for(const source of input.split('\n')){
  const line=cleanValue(source.trim().replace(/^(?:[•▪●]\s*|-\s+|\d{1,2}[.)](?=\s|[\p{L}*])\s*)/u,''))
   .replace(/\*{1,2}(?=\s*[:：=])|(?<=[:：=])\*{1,2}/g,'').replace(boldLabel,'$1');
  if(!line)continue;
  const pieces=line.split(/\s*[|;]\s*/);
  if(pieces.length>1&&pieces.every(piece=>spacedField.test(piece)||fieldFor(piece.split(/[:：=\t]/,1)[0],section))){
   for(const piece of pieces)readInline(piece);
  }else readInline(line);
 }
 flush();
 for(const [scope,lines] of unlabelled){
  const identity=bySection.get(scope);
  const name=personLabels[scope]&&identity.get('nama'),nric=identity.get('ic'),phone=identity.get('no telefon');
  const numberKinds=lines.map(identityNumber);
  const phoneLines=numberKinds.filter(kind=>kind==='phone'),nricLines=numberKinds.filter(kind=>kind==='nric');
  const nameLines=lines.filter(line=>/^[\p{L}\p{M}][\p{L}\p{M}.'’@\/ -]{1,118}$/u.test(line)&&line.split(/\s+/).length>=2);
  const inferredName=name&&!values[name.id]&&lines.length===3&&nameLines.length===1&&phoneLines.length===1&&nricLines.length===1;
  for(const [index,line] of lines.entries()){
   if(nric&&numberKinds[index]==='nric')put(nric,line);
   else if(phone&&numberKinds[index]==='phone')put(phone,line);
   else if(inferredName&&line===nameLines[0])put(name,line);
   else unparsed.push(line);
  }
 }
 return {values,unparsed,conflicts:[...conflicts],count:Object.values(values).filter(Boolean).length};
}
// Baselines and reserved line counts follow the supplied two-page A4 form.
const plans=[[
 ['#applicant',111],...fields.filter(f=>f.section==='applicant').map((f,i)=>[f.id,[141.75,171.75,202.5,232.5,262.5,293.25,323.25,354,384,414,444.75,474.75,504.75,535.5,565.5][i]]),
 ['#employment',626.25],['employment_employer',656.25],['employment_address',687,2],['employment_phone',735.75],['employment_position',765.75],['employment_department',795.75]
],[
 ['employment_appointment',40.5],['employment_start_date',70.5],['employment_job_scope',101.25],['employment_business_scope',131.25],['employment_income',161.25],
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
return {sections,fields,normalize,phoneValue,nricValue,parse,buildPdf};
});
